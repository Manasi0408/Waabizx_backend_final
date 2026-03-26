import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import axios from "../api/axios";
import { getInboxList, getContactMessages } from "../services/inboxService";
import AgentSidebar from "../components/AgentSidebar";
import AgentTopbar from "../components/AgentTopbar";

function formatMessageTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getInitial(nameOrPhone) {
  if (!nameOrPhone) return "?";
  const s = String(nameOrPhone).trim();
  return s.length ? s.charAt(0).toUpperCase() : "?";
}

function formatDateTime(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function HistoryPage() {
  const location = useLocation();

  const [inboxList, setInboxList] = useState([]);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [selectedContact, setSelectedContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [optedIn, setOptedIn] = useState(true);
  const [openSections, setOpenSections] = useState({ payments: false, campaigns: false, attributes: false, tags: false });
  const [role, setRole] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUserName, setCurrentUserName] = useState("");
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [agentsList, setAgentsList] = useState([]);
  const [selectedAgent, setSelectedAgentState] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const chatScrollRef = useRef(null);
  const messagesEndRef = useRef(null);

  const setSelectedAgent = useCallback((agent) => {
    setSelectedAgentState(agent);
    try {
      if (agent) localStorage.setItem("selectedAgent", JSON.stringify(agent));
      else localStorage.removeItem("selectedAgent");
    } catch (e) {}
  }, []);

  useEffect(() => {
    try {
      const rawUser = localStorage.getItem("user");
      const storedRole = localStorage.getItem("role");
      if (storedRole) setRole(String(storedRole));
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        if (parsed) {
          if (!storedRole && parsed.role) setRole(String(parsed.role));
          setCurrentUserId(parsed.id ?? parsed._id ?? null);
          setCurrentUserName(parsed.name ?? parsed.email ?? "");
          setCurrentUserEmail(parsed.email ?? "");
        }
      }
    } catch (e) {}
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

  // Fetch agents list for selector
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

  const fetchInboxList = useCallback(async () => {
    setLoadingInbox(true);
    try {
      const data = await getInboxList();
      const list = Array.isArray(data) ? data : [];
      setInboxList(list);
      setSelectedContact((prev) => {
        if (list.length > 0 && !prev) {
          const first = list[0];
          return {
            id: first.contactId || first.phone,
            contactId: first.contactId,
            phone: first.phone,
            name: first.name || first.phone,
            lastMessage: first.lastMessage,
          };
        }
        return prev;
      });
    } catch (e) {
      console.error("History fetchInboxList error:", e);
      setInboxList([]);
    } finally {
      setLoadingInbox(false);
    }
  }, []);

  useEffect(() => {
    fetchInboxList();
  }, [fetchInboxList]);

  const fetchMessages = useCallback(async (phone) => {
    if (!phone) return;
    setLoadingMessages(true);
    try {
      const data = await getContactMessages(phone);
      setMessages(data.messages || []);
    } catch (e) {
      console.error("History getContactMessages error:", e);
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (selectedContact?.phone) {
      fetchMessages(selectedContact.phone);
    } else {
      setMessages([]);
    }
  }, [selectedContact?.phone, fetchMessages]);

  const selectedContactFromList = useMemo(() => {
    if (!selectedContact?.phone) return null;
    return inboxList.find((c) => c.phone === selectedContact.phone) || null;
  }, [inboxList, selectedContact?.phone]);

  const computedOptedIn = useMemo(() => {
    return !!selectedContactFromList?.whatsappOptInAt;
  }, [selectedContactFromList?.whatsappOptInAt]);

  useEffect(() => {
    // Keep the toggle reflecting contact's current opt-in value
    setOptedIn(computedOptedIn);
  }, [computedOptedIn]);

  // Always scroll to the bottom when opening a chat (read-only history).
  useEffect(() => {
    if (!selectedContact?.phone) return;
    if (loadingMessages) return;
    if (!messagesEndRef.current) return;

    // Use auto so it feels immediate when you switch chats.
    messagesEndRef.current.scrollIntoView({ behavior: "auto", block: "end" });
  }, [selectedContact?.phone, loadingMessages, messages.length]);

  const toggleSection = (key) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="h-screen flex flex-row bg-gray-50 overflow-hidden">
      <AgentSidebar open={sidebarOpen} />

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <AgentTopbar onMenuClick={() => setSidebarOpen((o) => !o)} />

        <div className="shrink-0 z-10 border-b border-gray-200/80 bg-gradient-to-r from-white/95 via-sky-50/50 to-white/95 backdrop-blur-md px-3 md:px-5 py-2.5 md:py-3 shadow-sm shadow-gray-200/30">
          <div className="flex flex-wrap items-center gap-3 max-w-[2000px] mx-auto">
            <div className="hidden lg:flex items-center gap-2 shrink-0 text-xs font-semibold text-sky-800">
              <svg className="w-4 h-4 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Campaign history
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
              <div className="px-3 py-2 border-b border-gray-200/80 bg-gradient-to-r from-slate-50/90 to-sky-50/40 flex-shrink-0">
                <p className="text-xs font-bold text-sky-800 uppercase tracking-wide">Conversations</p>
                <p className="text-[11px] text-gray-500">Message history</p>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0 bg-white/50">
                {loadingInbox ? (
                  <div className="p-8 flex flex-col items-center justify-center gap-3 text-gray-500 text-sm motion-enter">
                    <div className="h-8 w-8 rounded-full border-2 border-sky-200 border-t-sky-600 animate-spin" />
                    Loading…
                  </div>
                ) : inboxList.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 text-sm motion-enter">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-600">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    No conversations
                  </div>
                ) : (
                  inboxList.map((item) => {
                    const id = item.contactId || item.phone;
                    const isConvSelected =
                      selectedContact && (selectedContact.phone === item.phone || selectedContact.contactId === item.contactId);
                    return (
                      <button
                        key={id || item.phone}
                        type="button"
                        onClick={() =>
                          setSelectedContact({
                            id: item.contactId || item.phone,
                            contactId: item.contactId,
                            phone: item.phone,
                            name: item.name || item.phone,
                            lastMessage: item.lastMessage,
                          })
                        }
                        className={`w-full flex items-center gap-3 p-3 text-left border-b border-gray-100/90 transition-all duration-200 motion-card-rich ${
                          isConvSelected
                            ? "bg-gradient-to-r from-sky-50 to-white border-l-4 border-l-sky-600 shadow-inner"
                            : "hover:bg-sky-50/60"
                        }`}
                      >
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-100 to-sky-200 text-sky-800 flex items-center justify-center text-sm font-bold flex-shrink-0 ring-2 ring-white shadow-sm">
                          {getInitial(item.name || item.phone)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-gray-900 truncate text-sm">{item.name || item.phone}</p>
                          <p className="text-xs text-gray-500 truncate">{item.lastMessage || "—"}</p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
              <div className="p-3 text-center text-xs font-medium text-sky-800/80 border-t border-gray-200/80 bg-gradient-to-r from-sky-50/50 to-white/80 flex-shrink-0">
                {inboxList.length} conversation{inboxList.length !== 1 ? "s" : ""}
              </div>
            </div>

            <div className="flex-1 flex flex-col min-w-0 min-h-0">
              <div className="shrink-0 z-10 border-b border-gray-200/80 bg-white/90 backdrop-blur-md px-4 py-3 flex items-center justify-between gap-3 shadow-sm">
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-gray-900 truncate block">
                    {selectedContact
                      ? `${selectedContact.name || selectedContact.phone} (${selectedContact.phone})`
                      : "Select a conversation"}
                  </span>
                  {selectedContact && (
                    <span className="text-xs text-sky-700/80 font-medium">Read-only history</span>
                  )}
                </div>
                <span className="text-[10px] font-bold text-sky-600 uppercase tracking-wider shrink-0 hidden sm:inline">
                  Profile →
                </span>
              </div>

              <div className="flex-1 flex min-h-0">
                <div className="flex-1 flex flex-col min-w-0 min-h-0 relative bg-white/40 backdrop-blur-[2px] border-x border-gray-200/60">
                  <div
                    className="absolute inset-0 opacity-[0.04] pointer-events-none bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%230ea5e9%22%3E%3Cpath d=%22M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z%22/%3E%3C/svg%3E')] bg-repeat bg-center"
                    style={{ backgroundSize: "100px" }}
                  />
                  <div ref={chatScrollRef} className="flex-1 overflow-y-auto min-h-0 p-4 relative z-10">
                    {!selectedContact ? (
                      <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-gray-500 motion-enter px-4">
                        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-100 to-sky-200 text-sky-600 shadow-inner ring-2 ring-white">
                          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <p className="text-sm font-medium text-gray-600">Select a conversation</p>
                        <p className="text-xs text-gray-400 mt-1 text-center max-w-xs">Choose a contact to view past messages</p>
                      </div>
                    ) : loadingMessages ? (
                      <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-gray-500 text-sm gap-3">
                        <div className="h-8 w-8 rounded-full border-2 border-sky-200 border-t-sky-600 animate-spin" />
                        Loading messages…
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-gray-500 text-sm motion-enter">
                        No messages yet
                      </div>
                    ) : (
                      messages.map((msg) => {
                        const isOutgoing = msg.type === "outgoing";
                        const content = msg.content || msg.message || "";
                        const sentAt = msg.sentAt || msg.createdAt || msg.timestamp;
                        return (
                          <div
                            key={msg.id || `${sentAt}-${content.slice(0, 20)}`}
                            className={`flex ${isOutgoing ? "justify-end" : "justify-start"} mb-3 motion-enter`}
                          >
                            <div className={`flex items-end gap-2 max-w-[75%] ${isOutgoing ? "flex-row-reverse" : ""}`}>
                              {!isOutgoing && (
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-blue-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-md ring-2 ring-white">
                                  {getInitial(selectedContact.name || selectedContact.phone)}
                                </div>
                              )}
                              <div
                                className={`rounded-2xl px-4 py-2.5 shadow-md ${
                                  isOutgoing
                                    ? "bg-gradient-to-br from-sky-700 to-slate-800 text-white rounded-bl-md ring-1 ring-sky-600/30"
                                    : "bg-white text-gray-800 rounded-br-md border border-sky-100/90 ring-1 ring-gray-100/80"
                                }`}
                              >
                                <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{content}</p>
                                {sentAt && (
                                  <p className={`text-[10px] mt-1.5 ${isOutgoing ? "text-sky-200" : "text-gray-400"}`}>
                                    {formatMessageTime(sentAt)}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                    {selectedContact?.phone && messages.length > 0 && <div ref={messagesEndRef} />}
                  </div>
                </div>

                <div className="w-80 flex flex-col overflow-y-auto flex-shrink-0 min-h-0 bg-white/90 backdrop-blur-sm border-l border-gray-200/80 shadow-sm">
                  <div className="p-4 border-b border-gray-200/80 bg-gradient-to-r from-slate-50/80 to-sky-50/40">
                    <h3 className="font-bold text-gray-900 tracking-tight">Chat Profile</h3>
                    <p className="text-xs text-sky-700/80 mt-0.5">History details</p>
                  </div>
                  {selectedContact ? (
                    <>
                      <div className="p-4 flex flex-col items-center border-b border-gray-100/80">
                        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-sky-400 to-blue-700 text-white flex items-center justify-center text-2xl font-bold mb-3 shadow-lg shadow-sky-500/30 ring-4 ring-sky-100">
                          {getInitial(selectedContact.name || selectedContact.phone)}
                        </div>
                        <p className="font-bold text-gray-900 text-center">{selectedContact.name || selectedContact.phone}</p>
                        <p className="text-sky-600 font-semibold text-sm mt-1">{selectedContact.phone}</p>
                      </div>
                      <div className="px-4 pb-4 space-y-0 text-sm">
                        {[
                          { label: "Status", value: selectedContact?.status || "—" },
                          { label: "Email", value: selectedContact?.email || "—" },
                          { label: "Last message", value: selectedContactFromList?.lastMessage || "—" },
                          { label: "Last message time", value: formatDateTime(selectedContactFromList?.lastMessageTime) },
                          { label: "Unread", value: String(selectedContactFromList?.unreadCount ?? "—") },
                          { label: "First message", value: messages.length ? (messages[0]?.content || messages[0]?.message || "—") : "—" },
                          {
                            label: "First message time",
                            value: messages.length
                              ? formatDateTime(messages[0]?.sentAt || messages[0]?.createdAt || messages[0]?.timestamp)
                              : "—",
                          },
                          {
                            label: "Last active",
                            value: messages.length
                              ? formatDateTime(
                                  messages[messages.length - 1]?.sentAt ||
                                    messages[messages.length - 1]?.createdAt ||
                                    messages[messages.length - 1]?.timestamp
                                )
                              : formatDateTime(selectedContactFromList?.lastMessageTime),
                          },
                        ].map((row, i) => (
                          <div key={i} className="flex justify-between py-2.5 border-b border-gray-100/90 gap-3">
                            <span className="text-gray-500 text-xs font-medium shrink-0">{row.label}</span>
                            <span className="text-gray-900 font-semibold text-xs text-right min-w-0 truncate">{row.value}</span>
                          </div>
                        ))}
                        <div className="flex justify-between items-center py-2.5 border-b border-gray-100/90">
                          <span className="text-gray-500 text-xs font-medium">Opted In</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={optedIn}
                            onClick={() => setOptedIn(!optedIn)}
                            className={`relative w-11 h-6 rounded-full transition-colors shadow-inner ${
                              optedIn ? "bg-gradient-to-r from-sky-500 to-blue-600" : "bg-gray-300"
                            }`}
                          >
                            <span
                              className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-transform ${
                                optedIn ? "left-6" : "left-1"
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                      {["Payments", "Campaigns", "Attributes", "Tags"].map((title) => {
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
                              <svg
                                className={`w-5 h-5 text-sky-600 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            {isOpen && (
                              <div className="px-4 pb-3 text-sm text-gray-500 motion-enter">
                                No {title.toLowerCase()} data.
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    <div className="p-6 text-center text-gray-500 text-sm motion-enter">
                      <p>Select a conversation</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HistoryPage;
