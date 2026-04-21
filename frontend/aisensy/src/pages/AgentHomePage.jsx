import React, { useState } from "react";
import AgentSidebar from "../components/AgentSidebar";
import AgentTopbar from "../components/AgentTopbar";
import AgentStatusCards from "../components/AgentStatusCards";
import AgentWidgets from "../components/AgentWidgets";

function AgentHomePage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="h-screen flex flex-row bg-gray-50 overflow-hidden">
      <AgentSidebar open={sidebarOpen} />

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <AgentTopbar onMenuClick={() => setSidebarOpen((o) => !o)} />

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-sky-50/90 via-white to-sky-100/50">
          <div className="relative isolate min-h-full">
            <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10" aria-hidden>
              <div className="absolute -top-28 -right-20 w-[22rem] h-[22rem] bg-sky-400/30 motion-page-blob" />
              <div className="absolute top-1/3 -left-24 w-[18rem] h-[18rem] bg-blue-400/20 motion-page-blob motion-page-blob--b" />
              <div className="absolute -bottom-32 right-1/4 w-[16rem] h-[16rem] bg-cyan-300/20 motion-page-blob" style={{ animationDelay: "-2s" }} />
            </div>

            <div className="relative z-0 p-4 md:p-6 lg:p-8 flex flex-col gap-6 xl:gap-8 max-w-[1800px] mx-auto">
              <div className="flex-1 min-w-0 space-y-6 md:space-y-8">
                <AgentStatusCards />
                <div className="group motion-enter motion-delay-1 overflow-hidden rounded-2xl border border-gray-100/90 shadow-lg shadow-gray-200/40 ring-1 ring-gray-100/80 motion-hover-lift transition-shadow duration-300 hover:shadow-xl hover:shadow-sky-500/10">
                  <img
                    src="/agent_banner.png"
                    alt="WhatsApp credits banner"
                    className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-[1.008]"
                  />
                </div>
                <AgentWidgets />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AgentHomePage;
