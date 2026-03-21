import React from "react";
import AgentSidebar from "../components/AgentSidebar";
import AgentTopbar from "../components/AgentTopbar";
import AgentStatusCards from "../components/AgentStatusCards";
import AgentWidgets from "../components/AgentWidgets";
import AgentRightPanel from "../components/AgentRightPanel";

function AgentHomePage() {
  return (
    <div className="flex bg-gray-100 min-h-screen">

      <AgentSidebar />

      <div className="flex-1">

        <AgentTopbar />

        <div className="flex p-6 gap-6">

          <div className="flex-1">

            <AgentStatusCards />

            <img
              src="/agent_banner.png"
              alt="WhatsApp credits banner"
              className="w-full h-auto rounded-lg mb-6"
            />

            <AgentWidgets />

          </div>

          <AgentRightPanel />

        </div>

      </div>

    </div>
  );
}

export default AgentHomePage;
