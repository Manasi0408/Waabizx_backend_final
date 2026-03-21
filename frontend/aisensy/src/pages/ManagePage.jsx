import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import axios from "../api/axios";
import TemplateMessagesPage from "./TemplateMessagesPage";
import ManageAnalyticsPage from "./ManageAnalyticsPage";
import CannedMessagesPage from "./CannedMessagesPage";
import MainSidebarNav from "../components/MainSidebarNav";

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

  const [activeSub, setActiveSub] = useState("agents");
  const [search, setSearch] = useState("");

  const [agents, setAgents] = useState([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [agentsError, setAgentsError] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editAgent, setEditAgent] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", email: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

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
    if (!name || !email || !password) {
      setCreateError("Name, email and password are required.");
      return;
    }

    setCreating(true);
    try {
      await axios.post("/auth/register", {
        name,
        email,
        password,
        role: "agent",
      });
      setCreateOpen(false);
      setCreateForm({ name: "", email: "", password: "" });
      await fetchAgents();
    } catch (e) {
      setCreateError(e?.response?.data?.message || e?.message || "Failed to create agent");
    } finally {
      setCreating(false);
    }
  };

  const manageMenu = [
    { id: "template", label: "Template Message" },
    { id: "canned", label: "Canned Message" },
    { id: "agents", label: "Agents" },
    { id: "analytics", label: "Analytics" },
  ];

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
      <header className="shrink-0 bg-white border-b border-gray-200 px-4 md:px-6 py-4 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-4">
          <Link to="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">A</span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-800 hidden sm:block">AiSensy</h1>
          </Link>
          <span className="text-gray-400 hidden md:block">|</span>
          <h2 className="text-lg font-semibold text-gray-600 hidden md:block">Manage</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center cursor-pointer">
            <span className="text-white font-semibold text-sm">{userInitial}</span>
          </div>
        </div>
      </header>

      <div className="flex">
      {/* Dashboard-style compact left sidebar */}
      <aside className="bg-teal-900 text-white border-r border-teal-800 w-20 min-h-[calc(100vh-73px)]">
        <MainSidebarNav />
      </aside>

      {/* Page content */}
      <div className="flex-1 overflow-y-auto bg-white flex flex-col">
        <div className="flex-1 flex">
          {/* Left manage menu */}
          <aside className="w-64 shrink-0 border-r border-gray-200 bg-white flex flex-col min-h-0 overflow-y-auto">
            <div className="px-4 pt-4 pb-3 border-b border-gray-100">
              <h1 className="text-lg font-semibold text-gray-900">Manage</h1>
            </div>
            <nav className="p-3">
              <div className="space-y-1">
                {manageMenu.map((item) => {
                  const isActive = activeSub === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveSub(item.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs transition ${
                        isActive ? "bg-teal-50 text-teal-800 font-semibold" : "text-gray-700 hover:bg-gray-50"
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
          <main className="flex-1 min-h-0 overflow-y-auto bg-gray-50">
            {activeSub === "template" ? (
              <TemplateMessagesPage />
            ) : activeSub === "analytics" ? (
              <ManageAnalyticsPage />
            ) : activeSub === "canned" ? (
              <CannedMessagesPage />
            ) : activeSub !== "agents" ? (
              <div className="p-8">
                <div className="bg-white border border-gray-200 rounded-xl p-8">
                  <h2 className="text-lg font-semibold text-gray-900 mb-2">Coming soon</h2>
                  <p className="text-gray-600 text-sm">This section will be available next.</p>
                </div>
              </div>
            ) : (
              <div className="p-8">
                <div className="bg-white border border-gray-200 rounded-xl p-6">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900">Agents</h2>
                      <p className="text-sm text-gray-500">You can add members with varying access level to manage your business.</p>
                    </div>
                    <button
                      onClick={() => {
                        setCreateError("");
                        setCreateOpen(true);
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg text-sm font-medium transition"
                    >
                      <span className="text-lg leading-none">+</span>
                      Add Agent
                    </button>
                  </div>

                  <div className="mt-6 flex items-center gap-4">
                    <div className="flex-1 relative">
                      <svg className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by Agent Name or Email"
                        className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      />
                    </div>
                    <button
                      onClick={fetchAgents}
                      className="px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Refresh
                    </button>
                  </div>

                  {agentsError && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                      {agentsError}
                    </div>
                  )}

                  <div className="mt-6">
                    {loadingAgents ? (
                      <div className="py-10 text-center text-gray-500 text-sm">Loading agents...</div>
                    ) : filteredAgents.length === 0 ? (
                      <div className="py-10 text-center text-gray-500 text-sm">No agents found.</div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {filteredAgents.map((a) => {
                          const name = a?.name || "Agent";
                          const email = a?.email || "";
                          const initial = String(name).trim().charAt(0).toUpperCase();
                          const status = (a?.status || "active").toString().toLowerCase();
                          const statusLabel = status === "active" ? "Online" : status;
                          return (
                            <div
                              key={a.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                navigate("/agent-dashboard", {
                                  state: selectedProject ? { project: selectedProject, agent: a } : { agent: a },
                                });
                              }}
                              onKeyDown={(e) => {
                                if (e.key !== "Enter") return;
                                navigate("/agent-dashboard", {
                                  state: selectedProject ? { project: selectedProject, agent: a } : { agent: a },
                                });
                              }}
                              className="border border-gray-200 rounded-xl bg-white p-5 cursor-pointer hover:shadow-sm transition"
                            >
                              <div className="flex items-start justify-between">
                              <div className="flex items-center gap-3 min-w-0">
                                  <div className="w-12 h-12 rounded-full bg-green-50 text-green-700 flex items-center justify-center font-semibold">
                                    {initial}
                                  </div>
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-gray-900 truncate">{name}</div>
                                  <div className="text-xs text-gray-500 truncate">{email}</div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 text-gray-400">
                                  <button
                                    className="p-2 rounded hover:bg-gray-50"
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
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                  </button>
                                </div>
                              </div>

                              <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
                                <div>
                                  <div className="text-gray-400">Username</div>
                                  <div className="text-gray-700 mt-1 truncate">{email}</div>
                                </div>
                                <div>
                                  <div className="text-gray-400">Status</div>
                                  <div className="text-gray-700 mt-1 truncate">{statusLabel}</div>
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
          </main>
        </div>
      </div>
      </div>

      {/* Create Agent Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => (!creating ? setCreateOpen(false) : null)}
          />
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Add Agent</h3>
              <button
                type="button"
                className="p-2 rounded hover:bg-gray-100 text-gray-500"
                onClick={() => (!creating ? setCreateOpen(false) : null)}
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {createError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {createError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  value={createForm.name}
                  onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="Agent name"
                  disabled={creating}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  value={createForm.email}
                  onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="agent@example.com"
                  disabled={creating}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  placeholder="Minimum 6 characters"
                  disabled={creating}
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
                onClick={() => setCreateOpen(false)}
                disabled={creating}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onCreateAgent}
                disabled={creating}
                className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-teal-700 hover:bg-teal-800 text-white disabled:opacity-60"
              >
                {creating ? "Creating..." : "Create Agent"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Agent Modal */}
      {editOpen && editAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setEditOpen(false)}
          />
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Edit Agent</h3>
              <button
                type="button"
                className="p-2 rounded hover:bg-gray-100 text-gray-500"
                onClick={() => setEditOpen(false)}
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {editError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {editError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  value={editForm.email}
                  onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="px-4 py-2.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
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
                className="ml-3 px-4 py-2.5 rounded-lg text-sm font-semibold bg-teal-700 hover:bg-teal-800 text-white disabled:opacity-60"
              >
                {editSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ManagePage;
