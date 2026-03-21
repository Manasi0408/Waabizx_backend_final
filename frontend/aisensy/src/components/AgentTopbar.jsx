import React, { useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { logout } from "../services/authService";

function AgentTopbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const project = useMemo(() => {
    const fromState = location?.state?.project;
    if (fromState) return fromState;
    try {
      const raw = localStorage.getItem("selectedProject");
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }, [location?.state?.project]);

  const agent = useMemo(() => {
    const fromState = location?.state?.agent;
    if (fromState && (fromState.id || fromState.name || fromState.email)) return fromState;
    try {
      const raw = localStorage.getItem("selectedAgent");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.id || parsed.name || parsed.email)) return parsed;
      }
      const rawUser = localStorage.getItem("user");
      if (rawUser) {
        const u = JSON.parse(rawUser);
        if (u) return { id: u.id ?? u._id, name: u.name, email: u.email };
      }
    } catch (e) {}
    return null;
  }, [location?.state?.agent]);

  const displayAgentName = agent?.name || agent?.email || "—";
  const displayProjectName = project?.project_name ? project.project_name : "Project: —";

  // Persist so Live Chat and History show the same agent and project
  useEffect(() => {
    try {
      if (agent) localStorage.setItem("selectedAgent", JSON.stringify(agent));
      if (project) localStorage.setItem("selectedProject", JSON.stringify(project));
    } catch (e) {}
  }, [agent, project]);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="bg-white shadow px-6 py-4 flex justify-between">

      <div className="min-w-0 flex flex-col max-w-[280px]">
        <span className="font-semibold text-lg text-gray-900 truncate">{displayAgentName}</span>
        <span className="text-sm text-gray-600 truncate">{displayProjectName}</span>
      </div>

      <div className="flex items-center gap-6 text-sm">

        <div>
          WhatsApp Business API Status :
          <span className="text-green-600 ml-2 font-semibold">
            LIVE
          </span>
        </div>

        <div>
          Current Plan :
          <span className="ml-2 font-semibold">
            BASIC
          </span>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          title="Logout"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span>Logout</span>
        </button>

      </div>

    </div>
  );
}

export default AgentTopbar;
