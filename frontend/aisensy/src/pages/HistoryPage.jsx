import React, { useMemo, useState, useEffect, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import axios from "../api/axios";
import { getInboxList, getContactMessages } from "../services/inboxService";

const iconClass = "w-5 h-5 flex-shrink-0";

const navIcons = {
  dashboard: (
    <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  ),
  liveChat: (
    <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  history: (
    <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  manage: (
    <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

const navItems = [
  { to: "/agent-dashboard", label: "Dashboard", icon: navIcons.dashboard },
  { to: "/live-chat", label: "Live Chat", icon: navIcons.liveChat },
  { to: "/campaign-reports", label: "History", icon: navIcons.history },
  { to: "/manage", label: "Manage", icon: navIcons.manage },
];

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
    const raw = selectedContact?.whatsappOptInAt;
    return !!raw;
  }, [selectedContact?.whatsappOptInAt]);

  useEffect(() => {
    // Keep the toggle reflecting contact's current opt-in value
    setOptedIn(computedOptedIn);
  }, [computedOptedIn]);

  const toggleSection = (key) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Narrow left sidebar - icon-only nav (no search, no contact list) */}
      <div className="w-16 bg-teal-900 text-white flex flex-col flex-shrink-0 items-center py-4">
        <button className="p-2 rounded-lg hover:bg-teal-800 mb-4">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="w-8 h-8 rounded flex items-center justify-center bg-teal-700 mb-6">
          <svg className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M13 3L4 14h6l-2 7 9-11h-6l2-7z" />
          </svg>
        </div>
        <nav className="flex-1 flex flex-col items-center gap-1 w-full px-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                state={selectedProject ? { project: selectedProject } : undefined}
                className={`w-full flex flex-col items-center justify-center gap-1 py-3 px-2 rounded-lg transition-colors ${
                  isActive ? "bg-teal-700 text-white" : "text-teal-100 hover:bg-teal-800 hover:text-white"
                }`}
                title={item.label}
              >
                {item.icon}
                <span className="text-[10px] leading-tight text-center">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto pt-4 border-t border-teal-800 w-full flex justify-center">
          <div className="w-10 h-10 rounded-full bg-teal-700 flex items-center justify-center text-sm font-semibold cursor-pointer" title="Profile">
            V
          </div>
        </div>
      </div>

      {/* Main content: top bar + history list panel + center + right */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar - agent name, project name, search in center, agent avatars, arrow (like LiveChatPage) */}
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
          {/* History contact list - same as admin Inbox */}
          <div className="w-80 bg-gray-100 border-r border-gray-200 flex flex-col flex-shrink-0">
            <div className="flex-1 overflow-y-auto bg-white min-h-0">
              {loadingInbox ? (
                <div className="p-4 text-center text-sm text-gray-500">Loading...</div>
              ) : inboxList.length === 0 ? (
                <div className="p-4 text-center text-sm text-gray-500">No conversations</div>
              ) : (
                inboxList.map((item) => {
                  const id = item.contactId || item.phone;
                  const isSelected = selectedContact && (selectedContact.phone === item.phone || selectedContact.contactId === item.contactId);
                  return (
                    <button
                      key={id || item.phone}
                      type="button"
                      onClick={() => setSelectedContact({
                        id: item.contactId || item.phone,
                        contactId: item.contactId,
                        phone: item.phone,
                        name: item.name || item.phone,
                        lastMessage: item.lastMessage,
                      })}
                      className={`w-full flex items-center gap-3 p-3 text-left border-b border-gray-100 hover:bg-gray-50 ${
                        isSelected ? "bg-teal-50 border-l-4 border-l-teal-600" : ""
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center text-sm font-semibold flex-shrink-0">
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
            <div className="p-3 text-center text-xs text-gray-500 border-t border-gray-200 bg-gray-50 flex-shrink-0">
              {inboxList.length} conversation{inboxList.length !== 1 ? "s" : ""}
            </div>
          </div>

          {/* Chat header + messages - same data as admin Inbox */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="bg-teal-800 text-white flex items-center justify-between px-4 py-3 flex-shrink-0">
              <div className="flex items-center gap-3">
                <span className="font-semibold">
                  {selectedContact ? `${selectedContact.name || selectedContact.phone} (${selectedContact.phone})` : "Select a conversation"}
                </span>
              </div>
              <span className="text-sm font-medium">Chat Profile</span>
            </div>

            <div className="flex-1 flex min-h-0">
              <div className="flex-1 flex flex-col min-w-0 bg-[#e5ddd5] relative overflow-hidden">
                <div className="absolute inset-0 opacity-30 pointer-events-none" style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Cg fill='%23999' fill-opacity='0.15'%3E%3Cpath d='M30 5L5 20v20l25 15 25-15V20L30 5z'/%3E%3C/g%3E%3C/svg%3E")`,
                  backgroundSize: "60px 60px",
                }} />
                <div className="flex-1 overflow-y-auto p-4 relative z-10">
                  {!selectedContact ? (
                    <div className="flex items-center justify-center h-full text-gray-500 text-sm">Select a conversation to view messages</div>
                  ) : loadingMessages ? (
                    <div className="flex items-center justify-center h-full text-gray-500 text-sm">Loading messages...</div>
                  ) : messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-gray-500 text-sm">No messages yet</div>
                  ) : (
                    messages.map((msg) => {
                      const isOutgoing = msg.type === "outgoing";
                      const content = msg.content || msg.message || "";
                      const sentAt = msg.sentAt || msg.createdAt || msg.timestamp;
                      return (
                        <div
                          key={msg.id || `${sentAt}-${content.slice(0, 20)}`}
                          className={`flex ${isOutgoing ? "justify-end" : "justify-start"} mb-3`}
                        >
                          <div className={`flex items-end gap-2 max-w-[75%] ${isOutgoing ? "flex-row-reverse" : ""}`}>
                            {!isOutgoing && (
                              <div className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center text-xs font-semibold flex-shrink-0">
                                {getInitial(selectedContact.name || selectedContact.phone)}
                              </div>
                            )}
                            <div
                              className={`rounded-2xl px-4 py-2 ${
                                isOutgoing
                                  ? "bg-teal-600 text-white rounded-bl-md"
                                  : "bg-white text-gray-800 rounded-br-md shadow-sm"
                              }`}
                            >
                              <p className="text-sm whitespace-pre-wrap break-words">{content}</p>
                              {sentAt && (
                                <p className={`text-xs mt-1 ${isOutgoing ? "text-teal-100" : "text-gray-500"}`}>
                                  {formatMessageTime(sentAt)}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right panel - Chat Profile */}
              <div className="w-80 bg-white border-l border-gray-200 flex flex-col overflow-y-auto flex-shrink-0">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-800">Chat Profile</h3>
                </div>
                {selectedContact ? (
                  <>
                    <div className="p-4 flex flex-col items-center">
                      <div className="w-20 h-20 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center text-2xl font-bold mb-2">
                        {getInitial(selectedContact.name || selectedContact.phone)}
                      </div>
                      <p className="font-semibold text-gray-900">{selectedContact.name || selectedContact.phone}</p>
                      <p className="text-teal-600 font-semibold text-sm">{selectedContact.phone}</p>
                    </div>
                <div className="px-4 pb-4 space-y-2 text-sm">
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
                    <div key={i} className="flex justify-between py-1.5 border-b border-gray-100 gap-3">
                      <span className="text-gray-500 shrink-0">{row.label}</span>
                      <span className="text-gray-800 font-medium text-right min-w-0 truncate">{row.value}</span>
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
                {["Payments", "Campaigns", "Attributes", "Tags"].map((title) => {
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
                        <div className="px-4 pb-3 text-sm text-gray-500">
                          No {title.toLowerCase()} data.
                        </div>
                      )}
                    </div>
                  );
                })}
                  </>
                ) : (
                  <div className="p-4 text-center text-sm text-gray-500">Select a conversation</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HistoryPage;
