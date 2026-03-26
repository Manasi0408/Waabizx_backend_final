import React, { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import { getActiveChats, getRequestingChats, getManagerRequesting, getAgentRequesting, getIntervenedChats, getMessages, acceptChat, assignChatToAgent, sendMessage as sendChatMessage } from "../api/chatApi";
import AgentSidebar from "../components/AgentSidebar";
import AgentTopbar from "../components/AgentTopbar";
import { initializeSocket, onSocketEvent, offSocketEvent } from "../services/socketService";
import axios from "../api/axios";

function formatTime(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString() + ", " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getInitial(nameOrPhone) {
  if (!nameOrPhone) return "?";
  const s = String(nameOrPhone).trim();
  if (s.length === 0) return "?";
  return s.charAt(0).toUpperCase();
}

function LiveChatPage() {
  const location = useLocation();

  const [role, setRole] = useState(null);
  const [tab, setTab] = useState("active");
  const [conversations, setConversations] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState(null);
  const [optedIn, setOptedIn] = useState(true);
  const [openSections, setOpenSections] = useState({ payments: false, campaigns: false, attributes: false });
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUserName, setCurrentUserName] = useState("");
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [agentsList, setAgentsList] = useState([]);
  const [selectedAgent, setSelectedAgentState] = useState(null);
  const [interventionAlert, setInterventionAlert] = useState(null);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [insertOpen, setInsertOpen] = useState(false);
  const insertPopoverRef = useRef(null);
  const [insertLoading, setInsertLoading] = useState(false);
  const [insertError, setInsertError] = useState("");
  const [insertCannedOptions, setInsertCannedOptions] = useState([]);
  const [insertTemplateOptions, setInsertTemplateOptions] = useState([]);
  const insertLoadedRef = useRef(false);
  const chatScrollRef = useRef(null);
  const messagesEndRef = useRef(null);

  const setSelectedAgent = useCallback((agent) => {
    setSelectedAgentState(agent);
    try {
      if (agent) localStorage.setItem("selectedAgent", JSON.stringify(agent));
      else localStorage.removeItem("selectedAgent");
    } catch (e) {}
  }, []);

  // Determine logged-in role, user id, and name from localStorage
  useEffect(() => {
    let detectedRole = null;
    let userId = null;
    let userName = "";
    let userEmail = "";
    try {
      const storedRole = localStorage.getItem("role");
      if (storedRole) {
        detectedRole = String(storedRole);
      }
      const rawUser = localStorage.getItem("user");
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        if (parsed) {
          if (!detectedRole && parsed.role) detectedRole = String(parsed.role);
          userId = parsed.id ?? parsed._id ?? null;
          userName = parsed.name ?? parsed.email ?? "";
          userEmail = parsed.email ?? "";
        }
      }
    } catch (e) {}
    setRole(detectedRole);
    setCurrentUserId(userId);
    setCurrentUserName(userName);
    setCurrentUserEmail(userEmail);
  }, []);

  // Initialize selected agent: from location.state, else localStorage, else self when role is agent
  useEffect(() => {
    const fromState = location?.state?.agent;
    if (fromState && fromState.id) {
      setSelectedAgentState(fromState);
      try {
        localStorage.setItem("selectedAgent", JSON.stringify(fromState));
      } catch (e) {}
      return;
    }
    try {
      const raw = localStorage.getItem("selectedAgent");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.id || parsed.name || parsed.email)) {
          setSelectedAgentState(parsed);
          return;
        }
      }
    } catch (e) {}
    const roleLower = (role || "").toLowerCase();
    if (roleLower === "agent" && currentUserId != null) {
      const self = {
        id: currentUserId,
        name: currentUserName || undefined,
        email: currentUserEmail || undefined,
      };
      setSelectedAgentState(self);
      try {
        localStorage.setItem("selectedAgent", JSON.stringify(self));
      } catch (e) {}
    } else {
      setSelectedAgentState(null);
    }
  }, [location?.state?.agent, role, currentUserId, currentUserName, currentUserEmail]);

  // Fetch agents list for selector (admin/manager)
  useEffect(() => {
    let cancelled = false;
    const fetchAgents = async () => {
      try {
        const res = await axios.get("/auth/agents");
        const list = res.data?.agents || [];
        if (!cancelled) setAgentsList(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!cancelled) setAgentsList([]);
      }
    };
    fetchAgents();
    return () => { cancelled = true; };
  }, []);

  const roleLower = (role || "").toLowerCase();
  const isAgent = roleLower === "agent";
  const isManager = roleLower === "manager" || roleLower === "admin";

  // 1️⃣ Initialize Socket.IO once for the agent (similar to socket.js in example)
  useEffect(() => {
    const token = localStorage.getItem("token") || undefined;
    let userId = undefined;
    try {
      const rawUser = localStorage.getItem("user");
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        userId = parsed?.id || parsed?._id;
      }
    } catch (e) {}

    const socket = initializeSocket(userId, token);
    console.log("LiveChatPage: socket instance", !!socket ? "initialized" : "not initialized");
  }, []);

  // Load API based on tab – URL stays /live-chat, data changes internally
  useEffect(() => {
    let cancelled = false;
    setLoadingChats(true);
    setError(null);
    setSelectedChat(null);
    setConversations([]);

    const fetchByTab = async () => {
      try {
        let data = [];
        if (tab === "active") {
          data = await getActiveChats();
        } else if (tab === "requesting") {
          if (isManager) {
            data = await getManagerRequesting();
          } else if (isAgent && currentUserId) {
            data = await getAgentRequesting(currentUserId);
          } else {
            data = await getRequestingChats();
          }
        } else if (tab === "intervened") {
          data = await getIntervenedChats();
        }
        const list = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
        if (!cancelled) setConversations(list);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load chats");
          setConversations([]);
        }
      } finally {
        if (!cancelled) setLoadingChats(false);
      }
    };

    fetchByTab();
    return () => { cancelled = true; };
  }, [tab, isManager, isAgent, currentUserId]);

  const loadMessages = useCallback(async (conversationId) => {
    if (!conversationId) return;
    setLoadingMessages(true);
    setError(null);
    try {
      const data = await getMessages(conversationId);
      const list = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
      setMessages(list);
    } catch (err) {
      setError(err.message || "Failed to load messages");
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (selectedChat) {
      loadMessages(selectedChat.id);
    } else {
      setMessages([]);
    }
  }, [selectedChat, loadMessages]);

  const loadChats = useCallback(async () => {
    setLoadingChats(true);
    setError(null);
    try {
      let data = [];
      if (tab === "active") data = await getActiveChats();
      else if (tab === "requesting") {
        if (isManager) data = await getManagerRequesting();
        else if (isAgent && currentUserId) data = await getAgentRequesting(currentUserId);
        else data = await getRequestingChats();
      } else if (tab === "intervened") data = await getIntervenedChats();
      const list = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
      setConversations(list);
    } catch (err) {
      setError(err.message || "Failed to load chats");
      setConversations([]);
    } finally {
      setLoadingChats(false);
    }
  }, [tab, isManager, isAgent, currentUserId]);

  // 2️⃣ Listen for real-time "new-message" events (Manager Inbox + Agent)
  useEffect(() => {
    const handler = (data) => {
      try {
        // Payload: { conversationId, phone, message } from webhook (manager) or extended for agent
        const convId = data.conversation_id ?? data.conversationId;
        if (convId && (tab === "requesting" && (isManager || isAgent))) {
          loadChats();
        }

        // If this message belongs to the currently open conversation, append it
        if (selectedChat && (data.conversation_id === selectedChat.id || data.conversationId === selectedChat.id)) {
          setMessages((prev) => [
            ...prev,
            {
              id: data.id,
              message: data.message || data.text || "",
              sender: data.sender || (data.direction === "outbound" ? "agent" : "customer"),
              created_at: data.created_at || data.timestamp || new Date().toISOString(),
            },
          ]);
        }

        // Also update left-panel conversations: last_message, time, unread_count
        if (data.conversation_id || data.conversationId) {
          const convId = data.conversation_id || data.conversationId;
          setConversations((prev) =>
            (prev || []).map((c) => {
              if (c.id !== convId) return c;
              const isFromCustomer =
                (data.sender && String(data.sender).toLowerCase() === "customer") ||
                data.direction === "inbound";
              return {
                ...c,
                last_message: data.message || data.text || c.last_message,
                last_message_time: data.created_at || data.timestamp || c.last_message_time,
                unread_count:
                  selectedChat && selectedChat.id === convId
                    ? c.unread_count || 0
                    : isFromCustomer
                    ? (c.unread_count || 0) + 1
                    : c.unread_count,
              };
            })
          );
        }
      } catch (e) {
        console.error("LiveChatPage: error handling new-message event", e);
      }
    };

    onSocketEvent("new-message", handler);
    const handleIntervention = (data) => {
      setInterventionAlert(data);
      setTimeout(() => setInterventionAlert(null), 6000);
    };
    onSocketEvent("intervention", handleIntervention);
    return () => {
      offSocketEvent("new-message", handler);
      offSocketEvent("intervention", handleIntervention);
    };
  }, [selectedChat, tab, isManager, isAgent, loadChats]);

  // Poll like AiSensy: refresh conversation list and messages so new messages appear in active/requesting/intervened
  useEffect(() => {
    const POLL_MS = 5000;
    const refreshList = async () => {
      try {
        let data = [];
        if (tab === "active") data = await getActiveChats();
        else if (tab === "requesting") {
          if (isManager) data = await getManagerRequesting();
          else if (isAgent && currentUserId) data = await getAgentRequesting(currentUserId);
          else data = await getRequestingChats();
        } else if (tab === "intervened") data = await getIntervenedChats();
        const list = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
        setConversations(list);
        setSelectedChat((prev) => {
          if (!prev) return prev;
          const updated = list.find((c) => c.id === prev.id);
          return updated || prev;
        });
      } catch (_) {}
    };
    const refreshMessages = async () => {
      if (!selectedChat) return;
      try {
        const data = await getMessages(selectedChat.id);
        const list = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
        setMessages(list);
      } catch (_) {}
    };
    const tick = () => {
      refreshList();
      refreshMessages();
    };
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [tab, selectedChat, isManager, isAgent, currentUserId]);

  const handleSelectChat = (chat) => {
    setSelectedChat(chat);
  };

  const handleAcceptChat = async (e, conv) => {
    e.stopPropagation();
    if (!isAgent) return;
    try {
      await acceptChat(conv.id);
      setTab("active");
      const data = await getActiveChats();
      const list = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
      setConversations(list);
      const updated = list.find((c) => c.id === conv.id);
      if (updated) setSelectedChat(updated);
    } catch (err) {
      setError(err.message || "Failed to accept chat");
    }
  };

  const handleAssignChat = async (e, conv) => {
    e.stopPropagation();
    if (!isManager) return;
    try {
      const input = window.prompt("Enter Agent ID to assign this chat to:", "");
      if (!input) return;
      const agentId = Number(input);
      if (!agentId || Number.isNaN(agentId)) {
        alert("Please enter a valid numeric agent ID.");
        return;
      }
      const result = await assignChatToAgent(conv.id, agentId);
      if (result && result.success !== false) {
        // After assigning, reload manager requesting list (assigned chat moves to agent)
        const data = isManager ? await getManagerRequesting() : await getRequestingChats();
        const list = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
        setConversations(list);
        // If this chat was selected, clear selection
        if (selectedChat && selectedChat.id === conv.id) {
          setSelectedChat(null);
        }
      } else {
        setError(result?.message || result?.error || "Failed to assign chat");
      }
    } catch (err) {
      setError(err.message || "Failed to assign chat");
    }
  };

  const toggleSection = (key) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isIntervened =
    tab === "intervened" || (selectedChat && String(selectedChat.status || "").toLowerCase() === "intervened");

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!selectedChat?.id || !messageText.trim() || sending) return;
    const text = messageText.trim();
    setSending(true);
    setError(null);
    try {
      const data = await sendChatMessage(selectedChat.id, text);
      setMessageText("");
      const list = Array.isArray(data?.messages) ? data.messages : null;
      if (list && list.length > 0) {
        setMessages(list);
      } else {
        const msgData = await getMessages(selectedChat.id);
        const fallback = Array.isArray(msgData) ? msgData : (msgData && Array.isArray(msgData.data) ? msgData.data : []);
        setMessages(fallback);
      }
    } catch (err) {
      const msg = err?.message || err?.data?.error || "Failed to send message";
      setError(msg);
      console.error("Send message error:", err);
    } finally {
      setSending(false);
    }
  };

  const loadInsertOptions = async () => {
    if (!isIntervened || insertLoadedRef.current) return;
    setInsertLoading(true);
    setInsertError("");

    try {
      const [cannedRes, localTemplatesRes, metaTemplatesRes] = await Promise.all([
        axios.get("/canned-messages"),
        axios.get("/templates", { params: { page: 1, limit: 200, status: "approved" } }),
        axios.get("/templates/meta"),
      ]);

      const cannedMessages = Array.isArray(cannedRes?.data?.messages)
        ? cannedRes.data.messages
        : [];

      setInsertCannedOptions(
        cannedMessages.map((m) => {
          const type = String(m.type || "TEXT").toUpperCase();
          const val = String(m.text || "");
          const insertValue =
            type === "TEXT"
              ? val
              : type === "IMAGE"
                ? `[image:${val.trim() || "image"}]`
                : `[file:${val.trim() || "file"}]`;

          return {
            id: String(m.id),
            label: `${m.name} (${type})`,
            insertValue,
            kind: "canned",
          };
        })
      );

      const localTemplates = Array.isArray(localTemplatesRes?.data?.templates)
        ? localTemplatesRes.data.templates
        : [];

      // Extra safety: only include approved templates in the UI.
      const localApprovedTemplates = localTemplates.filter(
        (t) => String(t?.status || "").toLowerCase() === "approved"
      );

      const localOptions = localApprovedTemplates.map((t) => ({
        id: `local_${t.id}`,
        label: String(t?.name || "Template"),
        insertValue: String(t?.content || ""),
        kind: "template",
        templateName: String(t?.name || ""),
        templateLanguage: "en_US",
      }));

      const metaTemplates = Array.isArray(metaTemplatesRes?.data?.templates)
        ? metaTemplatesRes.data.templates
        : [];

      const metaOptions = metaTemplates
        .filter((t) => String(t?.metaStatus || t?.status || "").toUpperCase() === "APPROVED")
        .map((t) => {
          const body = t?.components?.find((c) => String(c?.type || "").toUpperCase() === "BODY");
          const bodyText = body?.text || t?.name || "";
          const sampleParams = Array.isArray(body?.example?.body_text)
            ? (Array.isArray(body.example.body_text[0]) ? body.example.body_text[0] : [])
            : [];
          return {
            id: `meta_${t.id}`,
            label: String(t?.name || "Meta Template"),
            insertValue: String(bodyText),
            kind: "template",
            templateName: String(t?.name || ""),
            templateLanguage: String(t?.language?.code || "en_US"),
            templateParams: sampleParams.map((p) => String(p ?? "")),
          };
        });

      setInsertTemplateOptions([...localOptions, ...metaOptions]);
      insertLoadedRef.current = true;
    } catch (e) {
      setInsertError(e?.response?.data?.message || e?.message || "Failed to load inserts");
    } finally {
      setInsertLoading(false);
    }
  };

  // Resolve template placeholders like {{1}}, {{2}} using current chat values.
  const resolveTemplatePlaceholders = (rawText, chat) => {
    const text = String(rawText || "");
    if (!text.includes("{{")) return text;

    const phone = String(chat?.phone || "").trim();
    const normalizedPhone = phone.replace(/^\+/, "");
    const customerName = String(chat?.customer_name || chat?.name || "").trim();
    const email = String(chat?.email || "").trim();

    const defaultName =
      customerName && customerName !== phone ? customerName : (normalizedPhone || "Customer");

    const valueMap = {
      1: defaultName,
      2: normalizedPhone || defaultName,
      3: email || defaultName,
      4: normalizedPhone ? normalizedPhone.slice(-4) : defaultName,
    };

    return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (full, idxRaw) => {
      const idx = Number(idxRaw);
      if (!Number.isFinite(idx)) return full;
      const mapped = valueMap[idx];
      if (mapped && String(mapped).trim()) return String(mapped);
      return defaultName;
    });
  };

  const sendInsertItem = async (opt) => {
    const item = typeof opt === "string" ? { kind: "canned", insertValue: opt } : (opt || {});
    const rawText = String(item.insertValue || "").trim();
    const resolvedText = resolveTemplatePlaceholders(rawText, selectedChat);
    if (!selectedChat?.id || !resolvedText || sending) return;

    setInsertOpen(false);
    setInsertError("");
    setSending(true);

    try {
      // Match /inbox behavior: Quick Insert (including template bodies) sends as normal text.
      const data = await sendChatMessage(selectedChat.id, resolvedText);
      setMessageText("");
      const list = Array.isArray(data?.messages) ? data.messages : null;
      if (list && list.length > 0) {
        setMessages(list);
      } else {
        const msgData = await getMessages(selectedChat.id);
        const fallback = Array.isArray(msgData) ? msgData : (msgData && Array.isArray(msgData.data) ? msgData.data : []);
        setMessages(fallback);
      }
    } catch (err) {
      const msg = err?.message || err?.data?.error || "Failed to send message";
      setError(msg);
      console.error("Send insert message error:", err);
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (!insertOpen) return;
    const onDocMouseDown = (e) => {
      const el = insertPopoverRef.current;
      if (!el) return;
      if (!el.contains(e.target)) setInsertOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [insertOpen]);

  useEffect(() => {
    if (!isIntervened) return;
    loadInsertOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIntervened]);

  // Keep chat pinned to latest message like /inbox.
  useEffect(() => {
    if (!selectedChat) return;
    const scroller = chatScrollRef.current;
    if (!scroller) return;

    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "auto", block: "end" });
      return;
    }

    scroller.scrollTop = scroller.scrollHeight;
  }, [selectedChat, messages, loadingMessages]);

  const tabCount = conversations.length;

  return (
    <div className="h-screen flex flex-row bg-gray-50 overflow-hidden">
      {interventionAlert && isManager && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] motion-enter min-w-[280px] max-w-lg rounded-2xl border border-sky-200/80 bg-white/95 backdrop-blur-md px-5 py-4 shadow-2xl shadow-sky-900/15 ring-1 ring-sky-400/25 flex flex-wrap items-center gap-3 text-sm">
          <span className="font-bold text-sky-700 shrink-0 text-xs uppercase tracking-wider">Intervention</span>
          <span className="text-gray-700 flex-1 min-w-[200px]">
            <strong className="text-gray-900">{interventionAlert.agentName}</strong> intervened
            {interventionAlert.dateTime && (
              <> at {new Date(interventionAlert.dateTime).toLocaleString()}</>
            )}
            {interventionAlert.phone && <> (phone: {interventionAlert.phone})</>}.
          </span>
          <button
            type="button"
            onClick={() => setInterventionAlert(null)}
            className="shrink-0 w-9 h-9 rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition border border-transparent hover:border-gray-200"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      <AgentSidebar open={sidebarOpen} />

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <AgentTopbar onMenuClick={() => setSidebarOpen((o) => !o)} />

        <div className="shrink-0 z-10 border-b border-gray-200/80 bg-gradient-to-r from-white/95 via-sky-50/50 to-white/95 backdrop-blur-md px-3 md:px-5 py-2.5 md:py-3 shadow-sm shadow-gray-200/30">
          <div className="flex flex-wrap items-center gap-3 max-w-[2000px] mx-auto">
            <div className="hidden lg:flex items-center gap-2 shrink-0 text-xs font-semibold text-sky-800">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
              Live Chat
            </div>
            <div className="flex-1 min-w-[180px] max-w-xl mx-auto w-full">
              <div className="relative w-full">
                <input
                  type="text"
                  placeholder="Search name or mobile number"
                  className="w-full bg-white/95 border-2 border-gray-200/90 rounded-xl pl-10 pr-12 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400/40 focus:border-sky-500 transition"
                />
                <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-sky-600 hover:bg-sky-50 transition"
                  aria-label="Filter"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0 max-w-full overflow-x-auto pb-0.5 md:pb-0 [scrollbar-width:thin]">
              {agentsList.slice(0, 7).map((a) => {
                const name = a?.name || a?.email || "";
                const initial = name ? String(name).trim().slice(0, 2).toUpperCase() : "?";
                const isAgentSelected =
                  selectedAgent && (selectedAgent.id === a.id || (selectedAgent.email && selectedAgent.email === a.email));
                return (
                  <button
                    key={a.id ?? a.email ?? initial}
                    type="button"
                    onClick={() => setSelectedAgent(a)}
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 border-2 transition-all duration-200 ${
                      isAgentSelected
                        ? "bg-gradient-to-br from-sky-500 to-blue-700 border-white text-white shadow-lg shadow-sky-500/40 ring-2 ring-sky-300/50 scale-105"
                        : "bg-white border-gray-200 text-sky-800 hover:border-sky-300 hover:shadow-md"
                    }`}
                    title={name || "Agent"}
                  >
                    {initial}
                  </button>
                );
              })}
              <button
                type="button"
                className="p-2 rounded-xl text-sky-600 hover:bg-sky-50 border border-transparent hover:border-sky-200 transition"
                aria-label="More"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 flex min-h-0 relative overflow-hidden bg-gradient-to-b from-sky-50/80 via-white to-sky-100/40">
          <div className="pointer-events-none absolute inset-0 overflow-hidden z-0" aria-hidden>
            <div className="absolute -top-24 right-1/4 w-72 h-72 bg-sky-400/25 motion-page-blob" />
            <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-blue-400/20 motion-page-blob motion-page-blob--b" />
          </div>

          <div className="relative z-[1] flex flex-1 min-h-0 min-w-0">
          <div className="w-80 flex flex-col flex-shrink-0 min-h-0 bg-white/90 backdrop-blur-sm border-r border-gray-200/80 shadow-sm shadow-gray-200/20">
            <div className="flex p-1.5 gap-1 flex-shrink-0 bg-gradient-to-b from-gray-100/90 to-gray-50/80 border-b border-gray-200/60">
              <button
                type="button"
                onClick={() => setTab("active")}
                className={`flex-1 py-2.5 text-[10px] sm:text-xs font-bold uppercase tracking-wide transition-all duration-200 rounded-lg ${
                  tab === "active"
                    ? "bg-gradient-to-r from-sky-600 to-blue-700 text-white shadow-md shadow-sky-600/25 ring-1 ring-sky-400/30"
                    : "text-sky-900/80 hover:bg-white/70"
                }`}
              >
                Active {tab === "active" ? ` (${tabCount})` : ""}
              </button>
              <button
                type="button"
                onClick={() => setTab("requesting")}
                className={`flex-1 py-2.5 text-[10px] sm:text-xs font-bold uppercase tracking-wide transition-all duration-200 rounded-lg ${
                  tab === "requesting"
                    ? "bg-gradient-to-r from-sky-600 to-blue-700 text-white shadow-md shadow-sky-600/25 ring-1 ring-sky-400/30"
                    : "text-sky-900/80 hover:bg-white/70"
                }`}
              >
                Requesting {tab === "requesting" ? ` (${tabCount})` : ""}
              </button>
              <button
                type="button"
                onClick={() => setTab("intervened")}
                className={`flex-1 py-2.5 text-[10px] sm:text-xs font-bold uppercase tracking-wide transition-all duration-200 rounded-lg ${
                  tab === "intervened"
                    ? "bg-gradient-to-r from-sky-600 to-blue-700 text-white shadow-md shadow-sky-600/25 ring-1 ring-sky-400/30"
                    : "text-sky-900/80 hover:bg-white/70"
                }`}
              >
                Intervened {tab === "intervened" ? ` (${tabCount})` : ""}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0 bg-white/50">
              {loadingChats ? (
                <div className="p-8 flex flex-col items-center justify-center gap-3 text-gray-500 text-sm motion-enter">
                  <div className="h-8 w-8 rounded-full border-2 border-sky-200 border-t-sky-600 animate-spin" />
                  Loading chats…
                </div>
              ) : conversations.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm motion-enter">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-600">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  No {tab} chats.
                </div>
              ) : (
                (conversations || []).map((conv) => {
                  const isConvSelected = selectedChat?.id === conv.id;
                  const displayName = conv.customer_name || conv.phone || "Unknown";
                  return (
                    <div
                      key={conv.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectChat(conv)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleSelectChat(conv);
                        }
                      }}
                      className={`w-full flex flex-col gap-2 p-3 text-left border-b border-gray-100/90 cursor-pointer transition-all duration-200 motion-card-rich ${
                        isConvSelected
                          ? "bg-gradient-to-r from-sky-50 to-white border-l-4 border-l-sky-600 shadow-inner"
                          : "hover:bg-sky-50/60"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-100 to-sky-200 text-sky-800 flex items-center justify-center text-sm font-bold flex-shrink-0 ring-2 ring-white shadow-sm">
                          {getInitial(displayName)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-gray-900 truncate">{displayName}</p>
                          <p className="text-xs text-gray-500 truncate">{conv.last_message || "—"}</p>
                        </div>
                        {conv.unread_count > 0 && (
                          <span className="flex-shrink-0 min-w-[1.25rem] h-5 px-1 rounded-full bg-gradient-to-r from-sky-600 to-blue-600 text-white text-[10px] font-bold flex items-center justify-center shadow-md">
                            {conv.unread_count > 9 ? "9+" : conv.unread_count}
                          </span>
                        )}
                      </div>
                      {tab === "requesting" && isAgent && (
                        <button
                          type="button"
                          onClick={(e) => handleAcceptChat(e, conv)}
                          className="w-full py-2 px-2 text-xs font-bold rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 text-white shadow-md shadow-sky-600/20 hover:from-sky-500 hover:to-blue-500 transition"
                        >
                          Accept chat
                        </button>
                      )}
                      {tab === "requesting" && isManager && (
                        <button
                          type="button"
                          onClick={(e) => handleAssignChat(e, conv)}
                          className="w-full py-2 px-2 text-xs font-bold rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-600/20 hover:from-violet-500 hover:to-indigo-500 transition"
                        >
                          Assign to agent
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col min-w-0 min-h-0 relative bg-white/40 backdrop-blur-[2px] border-x border-gray-200/60">
            <div className="absolute inset-0 opacity-[0.04] pointer-events-none bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%230ea5e9%22%3E%3Cpath d=%22M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z%22/%3E%3C/svg%3E')] bg-repeat bg-center" style={{ backgroundSize: "100px" }} />
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto min-h-0 p-4 relative z-10">
              {error && (
                <div className="mb-3 motion-enter p-4 bg-red-50 border border-red-200/90 rounded-xl text-red-700 text-sm shadow-sm ring-1 ring-red-100/50">
                  {error}
                </div>
              )}
              {!selectedChat ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-gray-500 motion-enter px-4">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-100 to-sky-200 text-sky-600 shadow-inner ring-2 ring-white">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-gray-600">Select a conversation</p>
                  <p className="text-xs text-gray-400 mt-1 text-center max-w-xs">Choose a chat from the list to view messages</p>
                </div>
              ) : (
                <>
                  <div className="flex justify-center mb-4">
                    <span className="text-xs font-medium text-sky-700/80 px-3 py-1.5 rounded-full bg-sky-50/80 border border-sky-100/80 max-w-md text-center">
                      {selectedChat.last_message_time
                        ? `Last message · ${formatTime(selectedChat.last_message_time)}`
                        : "No messages yet"}
                    </span>
                  </div>
                  {loadingMessages ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-500 text-sm gap-3">
                      <div className="h-8 w-8 rounded-full border-2 border-sky-200 border-t-sky-600 animate-spin" />
                      Loading messages…
                    </div>
                  ) : (
                    messages.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex ${msg.sender === "agent" ? "justify-end" : "justify-start"} mb-3 motion-enter`}
                      >
                        <div className={`flex items-end gap-2 max-w-[75%] ${msg.sender === "agent" ? "flex-row-reverse" : ""}`}>
                          {msg.sender === "customer" && (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-md ring-2 ring-white">
                              {getInitial(selectedChat.customer_name || selectedChat.phone)}
                            </div>
                          )}
                          {msg.sender === "agent" && (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-700 to-slate-800 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-md ring-2 ring-white">
                              A
                            </div>
                          )}
                          <div
                            className={`rounded-2xl px-4 py-2.5 shadow-md ${
                              msg.sender === "agent"
                                ? "bg-gradient-to-br from-sky-700 to-slate-800 text-white rounded-bl-md ring-1 ring-sky-600/30"
                                : "bg-white text-gray-800 rounded-br-md border border-sky-100/90 ring-1 ring-gray-100/80"
                            }`}
                          >
                            <p className="text-sm leading-relaxed">{msg.message}</p>
                            {msg.created_at && (
                              <p className={`text-[10px] mt-1.5 ${msg.sender === "agent" ? "text-sky-200" : "text-gray-400"}`}>
                                {formatTime(msg.created_at)}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>
            {selectedChat && (
              <div className="p-4 border-t border-gray-200/80 bg-white/95 backdrop-blur-md flex gap-2 relative z-10 justify-center items-center flex-wrap shadow-[0_-4px_24px_-4px_rgba(14,165,233,0.08)]">
                <form onSubmit={handleSendMessage} className="flex flex-col gap-2 flex-1 min-w-[200px] max-w-xl relative">
                  {isIntervened && (
                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => setInsertOpen((v) => !v)}
                        disabled={insertLoading || sending}
                        className="inline-flex items-center gap-2 px-3 py-2 bg-white border-2 border-gray-200/90 rounded-xl text-xs font-bold text-sky-800 hover:bg-sky-50 hover:border-sky-200 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
                        title="Insert canned messages / templates"
                      >
                        <span className="text-base leading-none">📋</span>
                        Insert
                      </button>
                    </div>
                  )}

                  {isIntervened && insertOpen && (
                    <div
                      ref={insertPopoverRef}
                      className="motion-pop absolute bottom-full right-0 sm:right-4 mb-2 w-[360px] max-w-[92vw] bg-white border border-gray-100/90 rounded-2xl shadow-2xl shadow-sky-900/15 z-[1000] overflow-hidden ring-1 ring-black/5"
                    >
                      <div className="px-4 py-3 bg-gradient-to-r from-slate-50 to-sky-50/60 border-b border-gray-100 flex items-center justify-between gap-2">
                        <div className="text-sm font-bold text-gray-900">Send quick message</div>
                        <button
                          type="button"
                          className="w-8 h-8 rounded-xl hover:bg-white text-gray-500 hover:text-gray-900 transition border border-transparent hover:border-gray-200"
                          onClick={() => setInsertOpen(false)}
                          aria-label="Close"
                        >
                          ×
                        </button>
                      </div>

                      <div className="max-h-[320px] overflow-y-auto">
                        {insertLoading && (
                          <div className="px-4 py-6 flex items-center gap-2 text-sm text-gray-500">
                            <div className="h-5 w-5 rounded-full border-2 border-sky-200 border-t-sky-600 animate-spin" />
                            Loading…
                          </div>
                        )}

                        {!insertLoading && insertError && (
                          <div className="px-4 py-2 text-xs text-red-600 border-b border-red-100 bg-red-50/50">{insertError}</div>
                        )}

                        {!insertLoading && (
                          <>
                            <div className="px-4 py-3">
                              <div className="text-xs font-bold text-sky-700 uppercase tracking-wide mb-2">Canned Messages</div>
                              {insertCannedOptions.length === 0 ? (
                                <div className="text-xs text-gray-500">No canned messages.</div>
                              ) : (
                                <div className="space-y-1.5">
                                  {insertCannedOptions.map((opt) => {
                                    const preview = String(opt.insertValue || "").trim();
                                    const previewText = preview.length > 48 ? `${preview.slice(0, 48)}...` : preview;
                                    return (
                                      <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => sendInsertItem(opt)}
                                        disabled={sending}
                                        className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-sky-50/80 border-2 border-gray-100 hover:border-sky-200/80 disabled:opacity-50 disabled:cursor-not-allowed transition"
                                      >
                                        <div className="text-sm font-semibold text-gray-900 truncate">{opt.label}</div>
                                        <div className="text-xs text-gray-500 truncate mt-0.5">{previewText || "—"}</div>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            <div className="border-t border-gray-100" />

                            <div className="px-4 py-3">
                              <div className="text-xs font-bold text-sky-700 uppercase tracking-wide mb-2">Approved Templates</div>
                              {insertTemplateOptions.length === 0 ? (
                                <div className="text-xs text-gray-500">No approved templates.</div>
                              ) : (
                                <div className="space-y-1.5">
                                  {insertTemplateOptions.map((opt) => {
                                    const preview = String(opt.insertValue || "").trim();
                                    const previewText = preview.length > 48 ? `${preview.slice(0, 48)}...` : preview;
                                    return (
                                      <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => sendInsertItem(opt)}
                                        disabled={sending}
                                        className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-sky-50/80 border-2 border-gray-100 hover:border-sky-200/80 disabled:opacity-50 disabled:cursor-not-allowed transition"
                                      >
                                        <div className="text-sm font-semibold text-gray-900 truncate">{opt.label}</div>
                                        <div className="text-xs text-gray-500 truncate mt-0.5">{previewText || "—"}</div>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      placeholder="Type a message..."
                      className="flex-1 px-4 py-2.5 border-2 border-gray-200/90 rounded-xl bg-white/90 focus:ring-2 focus:ring-sky-400/40 focus:border-sky-500 outline-none transition shadow-sm"
                      disabled={sending}
                    />
                    <button
                      type="submit"
                      disabled={!messageText.trim() || sending}
                      className="relative overflow-hidden px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-blue-700 text-white font-semibold text-sm shadow-lg shadow-sky-600/25 hover:from-sky-500 hover:to-blue-600 disabled:opacity-50 transition-all"
                    >
                      <span className="relative z-10">{sending ? "Sending…" : "Send"}</span>
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          <div className="w-80 flex flex-col overflow-y-auto flex-shrink-0 min-h-0 bg-white/90 backdrop-blur-sm border-l border-gray-200/80 shadow-sm">
            <div className="p-4 border-b border-gray-200/80 bg-gradient-to-r from-slate-50/80 to-sky-50/40">
              <h3 className="font-bold text-gray-900 tracking-tight">Chat Profile</h3>
              <p className="text-xs text-sky-700/80 mt-0.5">Contact details</p>
            </div>
            {selectedChat ? (
              <>
                <div className="p-4 flex flex-col items-center border-b border-gray-100/80">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-sky-400 to-blue-700 text-white flex items-center justify-center text-2xl font-bold mb-3 shadow-lg shadow-sky-500/30 ring-4 ring-sky-100">
                    {getInitial(selectedChat.customer_name || selectedChat.phone)}
                  </div>
                  <p className="font-bold text-gray-900 text-center">{selectedChat.customer_name || selectedChat.phone}</p>
                  <p className="text-sky-600 font-semibold text-sm mt-1">+{selectedChat.phone}</p>
                </div>
                <div className="px-4 pb-4 space-y-0 text-sm">
                  {[
                    { label: "Status", value: "Active" },
                    { label: "Last Active", value: formatTime(selectedChat.last_message_time) },
                    { label: "Session Messages", value: String(messages.length) },
                    { label: "Unread", value: String(selectedChat.unread_count ?? 0) },
                    { label: "Source", value: "WhatsApp" },
                  ].map((row, i) => (
                    <div key={i} className="flex justify-between py-2.5 border-b border-gray-100/90">
                      <span className="text-gray-500 text-xs font-medium">{row.label}</span>
                      <span className="text-gray-900 font-semibold text-xs text-right">{row.value}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center py-2.5 border-b border-gray-100/90">
                    <span className="text-gray-500 text-xs font-medium">Opted In</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={optedIn}
                      onClick={() => setOptedIn(!optedIn)}
                      className={`relative w-11 h-6 rounded-full transition-colors shadow-inner ${optedIn ? "bg-gradient-to-r from-sky-500 to-blue-600" : "bg-gray-300"}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-transform ${optedIn ? "left-6" : "left-1"}`} />
                    </button>
                  </div>
                </div>
                {["Payments", "Campaigns", "Attributes"].map((title) => {
                  const key = title.toLowerCase();
                  const isOpen = openSections[key];
                  return (
                    <div key={title} className="border-t border-gray-200/80">
                      <button
                        type="button"
                        onClick={() => toggleSection(key)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-bold text-gray-800 hover:bg-sky-50/50 transition"
                      >
                        {title}
                        <svg className={`w-5 h-5 text-sky-600 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-3 text-sm text-gray-500 motion-enter">No {title.toLowerCase()} data.</div>
                      )}
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="p-6 text-center text-gray-500 text-sm motion-enter">
                <p>Select a chat to view profile.</p>
              </div>
            )}
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default LiveChatPage;
