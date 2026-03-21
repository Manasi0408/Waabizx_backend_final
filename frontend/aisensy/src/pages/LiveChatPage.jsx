import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import { getActiveChats, getRequestingChats, getManagerRequesting, getAgentRequesting, getIntervenedChats, getMessages, acceptChat, assignChatToAgent, interveneChat, sendMessage as sendChatMessage } from "../api/chatApi";
import AgentSidebar from "../components/AgentSidebar";
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
  const selectedProject = useMemo(() => {
    const fromState = location?.state?.project;
    if (fromState) return fromState;
    try {
      const raw = localStorage.getItem("selectedProject");
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }, [location?.state?.project]);

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

  const [insertOpen, setInsertOpen] = useState(false);
  const insertPopoverRef = useRef(null);
  const [insertLoading, setInsertLoading] = useState(false);
  const [insertError, setInsertError] = useState("");
  const [insertCannedOptions, setInsertCannedOptions] = useState([]);
  const [insertTemplateOptions, setInsertTemplateOptions] = useState([]);
  const insertLoadedRef = useRef(false);

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
          return {
            id: `meta_${t.id}`,
            label: String(t?.name || "Meta Template"),
            insertValue: String(bodyText),
            kind: "template",
            templateName: String(t?.name || ""),
            templateLanguage: String(t?.language?.code || "en_US"),
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

  const sendInsertItem = async (opt) => {
    const item = typeof opt === "string" ? { kind: "canned", insertValue: opt } : (opt || {});
    const text = String(item.insertValue || "").trim();
    if (!selectedChat?.id || !text || sending) return;

    setInsertOpen(false);
    setInsertError("");
    setSending(true);

    try {
      // Templates must be sent using Meta-approved template API.
      if (item.kind === "template") {
        const payload = {
          conversation_id: selectedChat.id,
          templateName: item.templateName,
          templateLanguage: item.templateLanguage || "en_US",
          templateParams: [],
          displayText: text,
        };

        const res = await axios.post("/chat/send-template", payload);
        const data = res?.data;
        const list = Array.isArray(data?.messages) ? data.messages : null;
        setMessageText("");
        setMessages(list && list.length > 0 ? list : []);
      } else {
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

  const tabCount = conversations.length;

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Intervention popup for admin when agent clicks Intervene */}
      {interventionAlert && isManager && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[9999] px-6 py-4 bg-teal-700 text-white rounded-lg shadow-lg flex items-center gap-3 min-w-[320px] max-w-md">
          <span className="font-semibold shrink-0">Intervention</span>
          <span>
            <strong>{interventionAlert.agentName}</strong> intervened
            {interventionAlert.dateTime && (
              <> at {new Date(interventionAlert.dateTime).toLocaleString()}</>
            )}
            {interventionAlert.phone && <> (phone: {interventionAlert.phone})</>}.
          </span>
          <button
            type="button"
            onClick={() => setInterventionAlert(null)}
            className="ml-auto p-1 rounded hover:bg-teal-600"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      <AgentSidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <div className="bg-teal-900 text-white flex items-center gap-4 px-4 py-3 flex-shrink-0">
          <div className="flex flex-col flex-shrink-0 max-w-[240px] min-w-0">
            <span className="text-xs font-semibold text-white truncate">
              {selectedAgent?.name || selectedAgent?.email || currentUserName || currentUserEmail || "—"}
            </span>
            <span className="text-xs font-medium text-teal-100/90 truncate">
              {selectedProject?.project_name ? selectedProject.project_name : "Project: —"}
            </span>
          </div>
          <div className="flex-1 min-w-0 max-w-md mx-auto">
            <div className="relative w-full">
              <input
                type="text"
                placeholder="Search name or mobile number"
                className="w-full bg-teal-800 border border-teal-700 rounded-lg pl-10 pr-16 py-2.5 text-sm text-white placeholder-teal-300 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded hover:bg-teal-700">
                <svg className="w-4 h-4 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {agentsList.slice(0, 7).map((a) => {
              const name = a?.name || a?.email || "";
              const initial = name ? String(name).trim().slice(0, 2).toUpperCase() : "?";
              const isSelected = selectedAgent && (selectedAgent.id === a.id || (selectedAgent.email && selectedAgent.email === a.email));
              return (
                <button
                  key={a.id ?? a.email ?? initial}
                  type="button"
                  onClick={() => setSelectedAgent(a)}
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 border-2 transition-colors ${
                    isSelected ? "bg-teal-600 border-white ring-2 ring-white" : "bg-teal-700 border-teal-900 text-teal-100 hover:bg-teal-600"
                  }`}
                  title={name || "Agent"}
                >
                  {initial}
                </button>
              );
            })}
            <button className="p-2 rounded-full hover:bg-teal-800" type="button">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 flex min-h-0">
          <div className="w-80 bg-gray-100 border-r border-gray-200 flex flex-col flex-shrink-0">
            <div className="flex bg-gray-200/80 p-1 gap-0.5 flex-shrink-0">
              <button
                onClick={() => setTab("active")}
                className={`flex-1 py-2.5 text-xs font-semibold transition-colors rounded ${
                  tab === "active" ? "bg-teal-700 text-white" : "text-teal-800 bg-transparent hover:bg-gray-300/50"
                }`}
              >
                ACTIVE {tab === "active" ? `(${tabCount})` : ""}
              </button>
              <button
                onClick={() => setTab("requesting")}
                className={`flex-1 py-2.5 text-xs font-semibold transition-colors rounded ${
                  tab === "requesting" ? "bg-teal-700 text-white" : "text-teal-800 bg-transparent hover:bg-gray-300/50"
                }`}
              >
                REQUESTING {tab === "requesting" ? `(${tabCount})` : ""}
              </button>
              <button
                onClick={() => setTab("intervened")}
                className={`flex-1 py-2.5 text-xs font-semibold transition-colors rounded ${
                  tab === "intervened" ? "bg-teal-700 text-white" : "text-teal-800 bg-transparent hover:bg-gray-300/50"
                }`}
              >
                INTERVENED {tab === "intervened" ? `(${tabCount})` : ""}
              </button>
            </div>
            <div className="flex-1 overflow-y-auto bg-white">
              {loadingChats ? (
                <div className="p-4 text-center text-gray-500 text-sm">Loading chats...</div>
              ) : conversations.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-sm">
                  No {tab} chats.
                </div>
              ) : (
                (conversations || []).map((conv) => {
                  const isSelected = selectedChat?.id === conv.id;
                  const displayName = conv.customer_name || conv.phone || "Unknown";
                  return (
                    <div
                      key={conv.id}
                      onClick={() => handleSelectChat(conv)}
                      className={`w-full flex flex-col gap-2 p-3 text-left border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${
                        isSelected ? "bg-teal-50 border-l-4 border-l-teal-600" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center text-sm font-semibold flex-shrink-0">
                          {getInitial(displayName)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-gray-900 truncate">{displayName}</p>
                          <p className="text-xs text-gray-500 truncate">{conv.last_message || "—"}</p>
                        </div>
                        {conv.unread_count > 0 && (
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-teal-600 text-white text-xs flex items-center justify-center">
                            {conv.unread_count > 9 ? "9+" : conv.unread_count}
                          </span>
                        )}
                      </div>
                      {tab === "requesting" && isAgent && (
                        <button
                          type="button"
                          onClick={(e) => handleAcceptChat(e, conv)}
                          className="w-full py-1.5 px-2 text-xs font-semibold rounded bg-teal-600 text-white hover:bg-teal-700"
                        >
                          Accept chat
                        </button>
                      )}
                      {tab === "requesting" && isManager && (
                        <button
                          type="button"
                          onClick={(e) => handleAssignChat(e, conv)}
                          className="w-full py-1.5 px-2 text-xs font-semibold rounded bg-indigo-600 text-white hover:bg-indigo-700"
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

          <div className="flex-1 flex flex-col min-w-0 bg-[#f0f2f5] relative">
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%23025f4b%22%3E%3Cpath d=%22M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z%22/%3E%3C/svg%3E')] bg-repeat bg-center" style={{ backgroundSize: "120px" }} />
            <div className="flex-1 overflow-y-auto p-4 relative z-10">
              {error && (
                <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {error}
                </div>
              )}
              {!selectedChat ? (
                <div className="flex items-center justify-center h-full text-gray-500">
                  Select a conversation to view messages
                </div>
              ) : (
                <>
                  <div className="text-center text-xs text-gray-500 mb-4">
                    {selectedChat.last_message_time
                      ? `Last message · ${formatTime(selectedChat.last_message_time)}`
                      : "No messages yet"}
                  </div>
                  {loadingMessages ? (
                    <div className="text-center text-gray-500 py-8">Loading messages...</div>
                  ) : (
                    messages.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex ${msg.sender === "agent" ? "justify-end" : "justify-start"} mb-3`}
                      >
                        <div className={`flex items-end gap-2 max-w-[75%] ${msg.sender === "agent" ? "flex-row-reverse" : ""}`}>
                          {msg.sender === "customer" && (
                            <div className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-semibold flex-shrink-0">
                              {getInitial(selectedChat.customer_name || selectedChat.phone)}
                            </div>
                          )}
                          {msg.sender === "agent" && (
                            <div className="w-8 h-8 rounded-full bg-teal-800 text-white flex items-center justify-center text-xs font-semibold flex-shrink-0">
                              A
                            </div>
                          )}
                          <div
                            className={`rounded-2xl px-4 py-2 ${
                              msg.sender === "agent"
                                ? "bg-teal-800 text-white rounded-bl-md"
                                : "bg-teal-100 text-gray-800 rounded-br-md"
                            }`}
                          >
                            <p className="text-sm">{msg.message}</p>
                            {msg.created_at && (
                              <p className="text-xs opacity-75 mt-1">{formatTime(msg.created_at)}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>
            {selectedChat && (
              <div className="p-4 border-t border-gray-200 bg-white flex gap-2 relative z-10 justify-center items-center flex-wrap">
                <form onSubmit={handleSendMessage} className="flex flex-col gap-2 flex-1 min-w-[200px] max-w-xl">
                  {isIntervened && (
                    <div className="flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => setInsertOpen((v) => !v)}
                        disabled={insertLoading || sending}
                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
                      className="absolute bottom-full right-4 mb-2 w-[360px] max-w-[92vw] bg-white border border-gray-200 rounded-xl shadow-xl z-[1000] overflow-hidden"
                    >
                      <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold text-gray-900">Send quick message</div>
                        <button
                          type="button"
                          className="p-1 rounded hover:bg-gray-200 text-gray-600"
                          onClick={() => setInsertOpen(false)}
                          aria-label="Close"
                        >
                          ×
                        </button>
                      </div>

                      <div className="max-h-[320px] overflow-y-auto">
                        {insertLoading && (
                          <div className="px-3 py-4 text-sm text-gray-500">Loading...</div>
                        )}

                        {!insertLoading && insertError && (
                          <div className="px-3 py-2 text-xs text-red-600 border-b border-gray-100">{insertError}</div>
                        )}

                        {!insertLoading && (
                          <>
                            <div className="px-3 py-2">
                              <div className="text-xs font-semibold text-gray-500 mb-2">Canned Messages</div>
                              {insertCannedOptions.length === 0 ? (
                                <div className="text-xs text-gray-500">No canned messages.</div>
                              ) : (
                                <div className="space-y-1">
                                  {insertCannedOptions.map((opt) => {
                                    const preview = String(opt.insertValue || "").trim();
                                    const previewText = preview.length > 48 ? `${preview.slice(0, 48)}...` : preview;
                                    return (
                                      <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => sendInsertItem(opt)}
                                        disabled={sending}
                                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 border border-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
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

                            <div className="px-3 py-2">
                              <div className="text-xs font-semibold text-gray-500 mb-2">Approved Templates</div>
                              {insertTemplateOptions.length === 0 ? (
                                <div className="text-xs text-gray-500">No approved templates.</div>
                              ) : (
                                <div className="space-y-1">
                                  {insertTemplateOptions.map((opt) => {
                                    const preview = String(opt.insertValue || "").trim();
                                    const previewText = preview.length > 48 ? `${preview.slice(0, 48)}...` : preview;
                                    return (
                                      <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => sendInsertItem(opt)}
                                        disabled={sending}
                                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 border border-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
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
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
                      disabled={sending}
                    />
                    <button
                      type="submit"
                      disabled={!messageText.trim() || sending}
                      className="px-5 py-2 rounded-lg bg-teal-600 text-white font-medium text-sm hover:bg-teal-700 disabled:opacity-50"
                    >
                      {sending ? "Sending..." : "Send"}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          <div className="w-80 bg-white border-l border-gray-200 flex flex-col overflow-y-auto flex-shrink-0">
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-800">Chat Profile</h3>
            </div>
            {selectedChat ? (
              <>
                <div className="p-4 flex flex-col items-center">
                  <div className="w-20 h-20 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center text-2xl font-bold mb-2">
                    {getInitial(selectedChat.customer_name || selectedChat.phone)}
                  </div>
                  <p className="font-semibold text-gray-900">{selectedChat.customer_name || selectedChat.phone}</p>
                  <p className="text-teal-600 font-semibold text-sm">+{selectedChat.phone}</p>
                </div>
                <div className="px-4 pb-4 space-y-2 text-sm">
                  {[
                    { label: "Status", value: "Active" },
                    { label: "Last Active", value: formatTime(selectedChat.last_message_time) },
                    { label: "Session Messages", value: String(messages.length) },
                    { label: "Unread", value: String(selectedChat.unread_count ?? 0) },
                    { label: "Source", value: "WhatsApp" },
                  ].map((row, i) => (
                    <div key={i} className="flex justify-between py-1.5 border-b border-gray-100">
                      <span className="text-gray-500">{row.label}</span>
                      <span className="text-gray-800 font-medium">{row.value}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
                    <span className="text-gray-500">Opted In</span>
                    <button
                      role="switch"
                      aria-checked={optedIn}
                      onClick={() => setOptedIn(!optedIn)}
                      className={`relative w-10 h-6 rounded-full transition-colors ${optedIn ? "bg-teal-500" : "bg-gray-300"}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${optedIn ? "left-5" : "left-1"}`} />
                    </button>
                  </div>
                </div>
                {["Payments", "Campaigns", "Attributes"].map((title) => {
                  const key = title.toLowerCase();
                  const isOpen = openSections[key];
                  return (
                    <div key={title} className="border-t border-gray-200">
                      <button
                        onClick={() => toggleSection(key)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-medium text-gray-800 hover:bg-gray-50"
                      >
                        {title}
                        <svg className={`w-5 h-5 text-gray-500 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-3 text-sm text-gray-500">No {title.toLowerCase()} data.</div>
                      )}
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="p-4 text-center text-gray-500 text-sm">Select a chat to view profile.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default LiveChatPage;
