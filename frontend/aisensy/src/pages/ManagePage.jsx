import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import axios from "../api/axios";
import TemplateMessagesPage from "./TemplateMessagesPage";
import ManageAnalyticsPage from "./ManageAnalyticsPage";
import CannedMessagesPage from "./CannedMessagesPage";
import OptinManagementPage from "./OptinManagementPage";
import MainSidebarNav from "../components/MainSidebarNav";

function agentAvatarGradient(id) {
  const palettes = [
    "from-sky-500 via-sky-600 to-blue-900",
    "from-teal-500 via-cyan-600 to-sky-900",
    "from-indigo-500 via-violet-600 to-blue-900",
    "from-blue-500 via-sky-500 to-cyan-800",
    "from-sky-600 via-blue-700 to-indigo-900",
  ];
  let h = 0;
  const s = String(id ?? "");
  for (let i = 0; i < s.length; i += 1) h += s.charCodeAt(i) * (i + 1);
  return palettes[Math.abs(h) % palettes.length];
}

function ManagePage() {
  const location = useLocation();
  const navigate = useNavigate();
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

  const currentRole = (() => {
    try {
      const storedRole = String(localStorage.getItem("role") || "").toLowerCase();
      if (storedRole) return storedRole;
      const raw = localStorage.getItem("user");
      const u = raw ? JSON.parse(raw) : null;
      return String(u?.role || "").toLowerCase();
    } catch (e) {
      return "";
    }
  })();

  const [activeSub, setActiveSub] = useState(currentRole === "agent" ? "canned" : "agents");
  const [search, setSearch] = useState("");

  const [agents, setAgents] = useState([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [agentsError, setAgentsError] = useState("");
  const [roleUpdatingId, setRoleUpdatingId] = useState(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [roleToast, setRoleToast] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "",
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editAgent, setEditAgent] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", email: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  useEffect(() => {
    // Agents should only be able to manage canned messages.
    if (currentRole === "agent" && activeSub !== "canned") setActiveSub("canned");
  }, [currentRole, activeSub]);

  const fetchAgents = async () => {
    setAgentsError("");
    setLoadingAgents(true);
    try {
      const res = await axios.get("/auth/agents");
      setAgents(res.data?.agents || []);
    } catch (e) {
      setAgentsError(e?.response?.data?.message || e?.message || "Failed to load agents");
    } finally {
      setLoadingAgents(false);
    }
  };

  useEffect(() => {
    if (activeSub === "agents") fetchAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSub]);

  const handleAccessLevelChange = async (agent, nextRoleRaw) => {
    const agentId = agent?.id;
    const nextRole = String(nextRoleRaw || "").toLowerCase().trim();
    const currentRole = String(agent?.role || "agent").toLowerCase().trim();

    if (!agentId) return;
    if (!["agent", "admin"].includes(nextRole)) return;
    if (nextRole === currentRole) return;

    try {
      setRoleUpdatingId(agentId);
      setRoleToast("");
      setAgentsError("");

      await axios.put(`/auth/agents/${agentId}`, { role: nextRole });
      await fetchAgents();

      setRoleToast(`Successfully changed access level of agent ${agent?.name || "agent"}.`);
      setTimeout(() => setRoleToast(""), 3500);
    } catch (e) {
      setAgentsError(e?.response?.data?.message || e?.message || "Failed to change access level");
    } finally {
      setRoleUpdatingId(null);
    }
  };

  const filteredAgents = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    if (!q) return agents;
    return agents.filter((a) => {
      const name = String(a?.name || "").toLowerCase();
      const email = String(a?.email || "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [agents, search]);

  const onCreateAgent = async () => {
    setCreateError("");
    const name = String(createForm.name || "").trim();
    const email = String(createForm.email || "").trim();
    const password = String(createForm.password || "").trim();
    const role = String(createForm.role || "").trim().toLowerCase();
    if (!name || !email || !password || !role) {
      setCreateError("Name, email, password and role are required.");
      return;
    }
    if (!["agent", "admin"].includes(role)) {
      setCreateError("Role must be agent or admin.");
      return;
    }

    setCreating(true);
    try {
      await axios.post("/auth/register", {
        name,
        email,
        password,
        role,
      });
      setCreateOpen(false);
      setCreateForm({ name: "", email: "", password: "", role: "" });
      await fetchAgents();
    } catch (e) {
      setCreateError(e?.response?.data?.message || e?.message || "Failed to create agent");
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (agent, nextStatusRaw) => {
    const agentId = agent?.id;
    const nextStatus = String(nextStatusRaw || "").toLowerCase().trim();
    const currentStatus = String(agent?.status || "active").toLowerCase().trim();
    if (!agentId) return;
    if (!["active", "inactive"].includes(nextStatus)) return;
    if (nextStatus === currentStatus) return;

    try {
      setStatusUpdatingId(agentId);
      setRoleToast("");
      setAgentsError("");
      await axios.put(`/auth/agents/${agentId}`, { status: nextStatus });
      await fetchAgents();
      setRoleToast(`Status updated for ${agent?.name || "agent"}.`);
      setTimeout(() => setRoleToast(""), 3500);
    } catch (e) {
      setAgentsError(e?.response?.data?.message || e?.message || "Failed to update status");
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handleDeleteAgent = async (agent) => {
    const agentId = agent?.id;
    if (!agentId) return;
    const ok = window.confirm(`Delete ${agent?.name || "this agent"}?`);
    if (!ok) return;

    try {
      setDeletingId(agentId);
      setAgentsError("");
      await axios.delete(`/auth/agents/${agentId}`);
      await fetchAgents();
      setRoleToast(`Deleted ${agent?.name || "agent"} successfully.`);
      setTimeout(() => setRoleToast(""), 3500);
    } catch (e) {
      setAgentsError(e?.response?.data?.message || e?.message || "Failed to delete agent");
    } finally {
      setDeletingId(null);
    }
  };

  const manageMenu = [
    { id: "template", label: "Template Message" },
    { id: "canned", label: "Canned Message" },
    { id: "optin", label: "Opt-in Management" },
    { id: "agents", label: "Agents" },
    { id: "analytics", label: "Analytics" },
  ].filter((item) => {
    if (currentRole === "agent") return item.id === "canned";
    return true;
  });

  const user = (() => {
    try {
      const raw = localStorage.getItem("user");
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  })();
  const userName = user?.name || "User";
  const userInitial = (userName || "U").charAt(0).toUpperCase();

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Top header - same style as Dashboard */}
      <header className="motion-header-enter shrink-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-4 md:px-8 py-3.5 md:py-4 flex justify-between items-center shadow-sm shadow-gray-200/50">
        <div className="flex items-center gap-4 min-w-0">
          <Link to="/dashboard" className="flex items-center gap-3 transition-all duration-300 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] shrink-0">
            <div className="w-10 h-10 bg-gradient-to-br from-sky-500 via-sky-600 to-blue-900 rounded-xl flex items-center justify-center shadow-lg shadow-sky-500/30 ring-2 ring-white">
              <span className="text-white font-bold text-lg">W</span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent hidden sm:block">
              Waabizx
            </h1>
          </Link>
          <span className="text-gray-300 hidden md:block shrink-0">|</span>
          <h2 className="text-lg font-semibold text-sky-700 hidden md:block tracking-tight">Manage</h2>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 flex items-center justify-center cursor-pointer shadow-md shadow-sky-500/35 hover:shadow-lg hover:ring-2 ring-sky-300/60 hover:scale-[1.03] transition-all duration-200 focus:outline-none"
          >
            <span className="text-white font-semibold text-sm">{userInitial}</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
      {/* Dashboard-style compact left sidebar */}
      <aside className="bg-sky-950 text-white border-r border-sky-900 w-20 shrink-0 h-full flex flex-col overflow-hidden">
        <MainSidebarNav />
      </aside>

      {/* Page content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <div className="flex flex-1 min-h-0 min-w-0">
          {/* Left manage menu */}
          <aside className="w-64 shrink-0 border-r border-gray-200/80 bg-white/95 backdrop-blur-sm flex flex-col min-h-0 overflow-y-auto shadow-sm shadow-gray-200/20 z-[1]">
            <div className="px-4 pt-4 pb-3 border-b border-gray-100/90 bg-gradient-to-r from-white to-sky-50/30">
              <h1 className="text-lg font-bold text-gray-900 tracking-tight">Manage</h1>
            </div>
            <nav className="p-3">
              <div className="manage-menu-stagger space-y-1">
                {manageMenu.map((item) => {
                  const isActive = activeSub === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveSub(item.id)}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs transition-all duration-300 ease-out active:scale-[0.98] hover:translate-x-1 hover:shadow-sm ${
                        isActive ? "bg-sky-50 text-sky-800 font-semibold shadow-sm ring-1 ring-sky-100/80" : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </nav>
          </aside>

          {/* Right content */}
          <main className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-sky-50/90 via-white to-sky-100/50">
            <div className="pointer-events-none absolute inset-0 overflow-hidden z-0" aria-hidden>
              <div className="absolute -top-24 -right-16 w-[18rem] h-[18rem] bg-sky-400/25 motion-page-blob" />
              <div className="absolute top-1/2 -left-20 w-[16rem] h-[16rem] bg-blue-400/20 motion-page-blob motion-page-blob--b" />
            </div>
            <div className="relative z-[1] min-h-full">
            {activeSub === "template" ? (
              <TemplateMessagesPage />
            ) : activeSub === "optin" ? (
              <OptinManagementPage />
            ) : activeSub === "analytics" ? (
              <ManageAnalyticsPage />
            ) : activeSub === "canned" ? (
              <CannedMessagesPage />
            ) : activeSub !== "agents" ? (
              <div className="p-6 md:p-8 motion-enter">
                <div className="motion-hover-lift bg-white/95 backdrop-blur-sm border border-gray-100/90 rounded-2xl p-8 shadow-lg shadow-gray-200/40 ring-1 ring-gray-100/80 max-w-lg">
                  <h2 className="text-lg font-bold text-gray-900 mb-2 tracking-tight">Coming soon</h2>
                  <p className="text-gray-600 text-sm leading-relaxed">This section will be available next.</p>
                </div>
              </div>
            ) : (
              <div className="p-6 md:p-8">
                <div className="motion-enter motion-delay-1 motion-hover-lift bg-white/95 backdrop-blur-sm border border-gray-100/90 rounded-2xl p-6 md:p-7 shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80 hover:shadow-xl hover:border-sky-100/60 transition-all duration-300">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 tracking-tight">Agents</h2>
                      <p className="text-sm text-gray-600 mt-1">You can add members with varying access level to manage your business.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setCreateError("");
                        setCreateOpen(true);
                      }}
                      className="group relative shrink-0 overflow-hidden inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-sky-600 via-sky-500 to-blue-600 shadow-lg shadow-sky-600/30 hover:shadow-xl hover:shadow-sky-500/35 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
                    >
                      <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/15 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" aria-hidden />
                      <span className="relative text-lg leading-none">+</span>
                      <span className="relative">Add Agent</span>
                    </button>
                  </div>

                  <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
                    <div className="flex-1 relative">
                      <svg className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by Agent Name or Email"
                        className="w-full border-2 border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm bg-gray-50/80 hover:bg-white focus:outline-none focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 transition-all shadow-sm"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={fetchAgents}
                      className="px-4 py-2.5 bg-white border-2 border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-sky-50/80 hover:border-sky-200/70 transition-all duration-200 active:scale-[0.98]"
                    >
                      Refresh
                    </button>
                  </div>

                  {agentsError && (
                    <div className="motion-enter mt-4 p-4 bg-red-50 border border-red-200/90 rounded-xl text-sm text-red-700 shadow-sm ring-1 ring-red-100/50">
                      {agentsError}
                    </div>
                  )}
                  {roleToast && (
                    <div className="motion-enter mt-4 p-4 bg-emerald-50 border border-emerald-200/90 rounded-xl text-sm text-emerald-800 shadow-sm ring-1 ring-emerald-100/50">
                      {roleToast}
                    </div>
                  )}

                  <div className="mt-6">
                    {loadingAgents ? (
                      <div className="py-12 text-center motion-enter">
                        <div className="inline-block h-9 w-9 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600" />
                        <p className="mt-3 text-gray-600 text-sm">Loading agents...</p>
                      </div>
                    ) : filteredAgents.length === 0 ? (
                      <div className="py-10 text-center text-gray-500 text-sm motion-enter">No agents found.</div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 md:gap-7 motion-stagger-children">
                        {filteredAgents.map((a) => {
                          const name = a?.name || "Agent";
                          const email = a?.email || "";
                          const initial = String(name).trim().charAt(0).toUpperCase();
                          const status = (a?.status || "active").toString().toLowerCase();
                          const isActiveStatus = status === "active";
                          const canOpenAgentWorkspace = isActiveStatus && currentRole !== "admin";
                          const avatarGrad = agentAvatarGradient(a.id);
                          return (
                            <div
                              key={a.id}
                              role="button"
                              tabIndex={canOpenAgentWorkspace ? 0 : -1}
                              onClick={() => {
                                if (!canOpenAgentWorkspace) return;
                                navigate("/agent", {
                                  state: selectedProject ? { project: selectedProject, agent: a } : { agent: a },
                                });
                              }}
                              onKeyDown={(e) => {
                                if (!canOpenAgentWorkspace) return;
                                if (e.key !== "Enter") return;
                                navigate("/agent", {
                                  state: selectedProject ? { project: selectedProject, agent: a } : { agent: a },
                                });
                              }}
                              className={`group relative motion-card-rich overflow-hidden rounded-2xl border border-gray-200/80 backdrop-blur-md shadow-lg shadow-gray-200/40 ring-1 ring-gray-100/80 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-sky-50/50 ${
                                canOpenAgentWorkspace
                                  ? "bg-white/95 cursor-pointer motion-hover-lift hover:border-sky-300/60 hover:shadow-2xl hover:shadow-sky-500/15 hover:-translate-y-1"
                                  : "bg-gray-100/70 cursor-not-allowed opacity-75"
                              }`}
                            >
                              <div
                                className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-sky-400 via-blue-500 to-cyan-400 z-[5]"
                                aria-hidden
                              />
                              <span
                                className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-sky-400/20 blur-2xl transition-all duration-500 group-hover:bg-sky-400/30"
                                aria-hidden
                              />
                              <span
                                className="pointer-events-none absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-blue-500/15 blur-2xl transition-all duration-500 group-hover:bg-blue-500/25"
                                aria-hidden
                              />
                              <span
                                className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white via-white to-sky-50/30 opacity-100 transition-all duration-500 group-hover:via-sky-50/40 group-hover:to-sky-100/50 z-0"
                                aria-hidden
                              />
                              <span className="motion-card-shine pointer-events-none absolute inset-0 overflow-hidden rounded-2xl z-[2]" aria-hidden>
                                <span className="motion-card-shine__beam absolute inset-0" />
                              </span>

                              <div className="relative z-[3] p-5 pt-6">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-center gap-4 min-w-0 flex-1">
                                    <div
                                      className={`motion-avatar-breathe relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${avatarGrad} text-lg font-bold text-white shadow-lg shadow-sky-900/25 ring-4 ring-white/90 transition-transform duration-300 group-hover:scale-[1.04] group-hover:shadow-xl group-hover:shadow-sky-600/20`}
                                    >
                                      {initial}
                                      <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-white shadow-sm">
                                        <span
                                          className={`h-2.5 w-2.5 rounded-full ${isActiveStatus ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]" : "bg-gray-300"}`}
                                        />
                                      </span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="truncate text-base font-bold tracking-tight text-gray-900 transition-colors duration-300 group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-sky-800 group-hover:to-blue-800 group-hover:bg-clip-text">
                                          {name}
                                        </h3>
                                        <select
                                          value={String(a?.role || "agent").toLowerCase()}
                                          disabled={roleUpdatingId === a.id || deletingId === a.id}
                                          onClick={(e) => e.stopPropagation()}
                                          onChange={(e) => {
                                            e.stopPropagation();
                                            handleAccessLevelChange(a, e.target.value);
                                          }}
                                          className="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-700 ring-1 ring-sky-200/80 focus:outline-none focus:ring-2 focus:ring-sky-400/45"
                                          title="Access level"
                                        >
                                          <option value="agent">Agent</option>
                                          <option value="admin">Admin</option>
                                        </select>
                                      </div>
                                      <p className="mt-1 truncate text-sm text-gray-500 transition-colors group-hover:text-gray-600">{email}</p>
                                      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                                        {String(a?.role || "agent").toLowerCase() === "admin" ? "Admin" : "Agent"}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-2">
                                    <button
                                      className="group/edit rounded-xl border border-gray-100 bg-white/80 p-2.5 text-gray-400 shadow-sm transition-all duration-200 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-600 hover:shadow-md active:scale-95"
                                      title="Edit"
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditAgent(a);
                                        setEditForm({ name: a?.name || "", email: a?.email || "" });
                                        setEditError("");
                                        setEditOpen(true);
                                      }}
                                    >
                                      <svg
                                        className="h-4 w-4 transition-transform duration-300 group-hover/edit:scale-110 group-hover/edit:-rotate-6"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                    </button>
                                    {currentRole === "admin" && (
                                      <button
                                        className="rounded-xl border border-red-100 bg-white/80 p-2.5 text-red-400 shadow-sm transition-all duration-200 hover:border-red-200 hover:bg-red-50 hover:text-red-600 hover:shadow-md active:scale-95 disabled:opacity-60"
                                        title="Delete"
                                        type="button"
                                        disabled={deletingId === a.id}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteAgent(a);
                                        }}
                                      >
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-7 0h8m-1-2a1 1 0 00-1-1h-2a1 1 0 00-1 1l-.2 1h4.4l-.2-1z" />
                                        </svg>
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <div className="mt-5 grid grid-cols-2 gap-3">
                                  <div className="rounded-xl border border-gray-100/90 bg-gradient-to-br from-gray-50/90 to-white px-3 py-2.5 shadow-sm transition-all duration-300 group-hover:border-sky-200/60 group-hover:shadow-md">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Login</div>
                                    <div className="mt-1 truncate text-xs font-semibold text-gray-800">{email || "—"}</div>
                                  </div>
                                  <div className="rounded-xl border border-gray-100/90 bg-gradient-to-br from-gray-50/90 to-white px-3 py-2.5 shadow-sm transition-all duration-300 group-hover:border-sky-200/60 group-hover:shadow-md">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Status</div>
                                    <div className="mt-1.5">
                                      <select
                                        value={isActiveStatus ? "active" : "inactive"}
                                        disabled={statusUpdatingId === a.id || deletingId === a.id}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => {
                                          e.stopPropagation();
                                          handleStatusChange(a, e.target.value);
                                        }}
                                        className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 focus:outline-none focus:ring-2 focus:ring-sky-400/45 ${
                                          isActiveStatus
                                            ? "bg-emerald-50 text-emerald-800 ring-emerald-200/90"
                                            : "bg-gray-100 text-gray-600 ring-gray-200/80"
                                        }`}
                                      >
                                        <option value="active">Active</option>
                                        <option value="inactive">Not Active</option>
                                      </select>
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-4 flex items-center justify-between border-t border-gray-100/80 pt-4 text-xs">
                                  <span className="font-medium text-gray-400 transition-colors group-hover:text-sky-600/80">
                                    {!isActiveStatus
                                      ? "Not active - cannot open"
                                      : currentRole === "admin"
                                      ? "Admin cannot open agent workspace"
                                      : "Open agent workspace"}
                                  </span>
                                  <span className="flex items-center gap-1 font-semibold text-sky-600 opacity-70 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-100">
                                    {canOpenAgentWorkspace ? "Continue" : "Locked"}
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                    </svg>
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            </div>
          </main>
        </div>
      </div>
      </div>

      {/* Create Agent Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => (!creating ? setCreateOpen(false) : null)}
            aria-hidden
          />
          <div className="motion-pop relative w-full max-w-lg bg-white rounded-2xl shadow-2xl shadow-gray-900/15 border border-gray-100/90 ring-1 ring-black/5 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 via-sky-50/50 to-sky-50/30 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 tracking-tight">Add Agent</h3>
              <button
                type="button"
                className="p-2 rounded-xl hover:bg-white/80 text-gray-500 hover:text-gray-800 transition-all active:scale-95"
                onClick={() => (!creating ? setCreateOpen(false) : null)}
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 md:p-6 bg-gradient-to-b from-white to-sky-50/20">
              {createError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200/90 rounded-xl text-sm text-red-700 ring-1 ring-red-100/50">
                  {createError}
                </div>
              )}

              <div className="space-y-4 rounded-2xl border border-gray-100/90 bg-white p-4 shadow-sm ring-1 ring-gray-100/70">
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Name</label>
                  <input
                    value={createForm.name}
                    onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 bg-gray-50/80 hover:bg-white transition-all"
                    placeholder="Agent name"
                    disabled={creating}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Email</label>
                  <input
                    value={createForm.email}
                    onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 bg-gray-50/80 hover:bg-white transition-all"
                    placeholder="agent@example.com"
                    disabled={creating}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Role</label>
                  <select
                    value={createForm.role}
                    onChange={(e) => setCreateForm((p) => ({ ...p, role: e.target.value }))}
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 bg-gray-50/80 hover:bg-white transition-all"
                    disabled={creating}
                  >
                    <option value="">Select role</option>
                    <option value="agent">Agent</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Password</label>
                  <input
                    type="password"
                    value={createForm.password}
                    onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 bg-gray-50/80 hover:bg-white transition-all"
                    placeholder="Minimum 6 characters"
                    disabled={creating}
                  />
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold border-2 border-gray-200 text-gray-700 hover:bg-gray-50 transition-all active:scale-[0.98]"
                  onClick={() => setCreateOpen(false)}
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onCreateAgent}
                  disabled={creating}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-sky-600 to-sky-700 hover:from-sky-700 hover:to-sky-800 text-white shadow-md shadow-sky-600/25 disabled:opacity-60 transition-all active:scale-[0.98]"
                >
                  {creating ? "Creating..." : "Create Agent"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Agent Modal */}
      {editOpen && editAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setEditOpen(false)}
            aria-hidden
          />
          <div className="motion-pop relative w-full max-w-lg bg-white rounded-2xl shadow-2xl shadow-gray-900/15 border border-gray-100/90 ring-1 ring-black/5 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 via-sky-50/50 to-sky-50/30 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 tracking-tight">Edit Agent</h3>
              <button
                type="button"
                className="p-2 rounded-xl hover:bg-white/80 text-gray-500 hover:text-gray-800 transition-all active:scale-95"
                onClick={() => setEditOpen(false)}
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 md:p-6 bg-gradient-to-b from-white to-sky-50/20">
              <div className="space-y-4 rounded-2xl border border-gray-100/90 bg-white p-4 shadow-sm ring-1 ring-gray-100/70">
                {editError && (
                  <div className="p-3 bg-red-50 border border-red-200/90 rounded-xl text-sm text-red-700 ring-1 ring-red-100/50">
                    {editError}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Name</label>
                  <input
                    value={editForm.name}
                    onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 bg-gray-50/80 hover:bg-white transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Email</label>
                  <input
                    value={editForm.email}
                    onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                    className="w-full border-2 border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 bg-gray-50/80 hover:bg-white transition-all"
                  />
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold border-2 border-gray-200 text-gray-700 hover:bg-gray-50 transition-all active:scale-[0.98]"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!editAgent?.id) return;
                    setEditSaving(true);
                    setEditError("");
                    try {
                      await axios.put(`/auth/agents/${editAgent.id}`, {
                        name: editForm.name,
                        email: editForm.email,
                      });
                      setEditOpen(false);
                      setEditAgent(null);
                      await fetchAgents();
                    } catch (e) {
                      setEditError(e?.response?.data?.message || e?.message || "Failed to update agent");
                    } finally {
                      setEditSaving(false);
                    }
                  }}
                  disabled={editSaving}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-sky-600 to-sky-700 hover:from-sky-700 hover:to-sky-800 text-white shadow-md shadow-sky-600/25 disabled:opacity-60 transition-all active:scale-[0.98]"
                >
                  {editSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ManagePage;
