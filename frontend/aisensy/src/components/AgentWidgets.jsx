import React from "react";

function AgentWidgets() {
  return (
    <div className="grid grid-cols-2 gap-6">

      <div className="bg-blue-200 p-6 rounded shadow">

        <h3 className="font-semibold mb-2">
          AiSensy Training Call
        </h3>

        <p className="text-sm">
          Schedule your platform onboarding call.
        </p>

      </div>

      <div className="bg-green-200 p-6 rounded shadow">

        <h3 className="font-semibold mb-2">
          Refer & Earn
        </h3>

        <p className="text-sm">
          Invite your friends and earn ₹2000.
        </p>

      </div>

      <div className="bg-purple-200 p-6 rounded shadow">

        <h3 className="font-semibold mb-2">
          Feedback Program
        </h3>

        <p className="text-sm">
          Share feedback & earn WhatsApp credits.
        </p>

      </div>

      <div className="bg-pink-200 p-6 rounded shadow">

        <h3 className="font-semibold mb-2">
          Affiliate Program
        </h3>

        <p className="text-sm">
          Earn recurring commission.
        </p>

      </div>

    </div>
  );
}

export default AgentWidgets;
