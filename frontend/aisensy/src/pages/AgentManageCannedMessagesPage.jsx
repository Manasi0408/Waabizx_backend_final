import React, { useState } from "react";
import AgentSidebar from "../components/AgentSidebar";
import AgentTopbar from "../components/AgentTopbar";
import CannedMessagesPage from "./CannedMessagesPage";

function AgentManageCannedMessagesPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="h-screen flex flex-row bg-gray-50 overflow-hidden">
      <AgentSidebar open={sidebarOpen} />

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <AgentTopbar onMenuClick={() => setSidebarOpen((o) => !o)} />

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-sky-50/90 via-white to-sky-100/50">
          <CannedMessagesPage apiPath="/agent/canned-messages" />
        </div>
      </div>
    </div>
  );
}

export default AgentManageCannedMessagesPage;

