import React from "react";

function AgentStatusCards() {
  return (
    <div className="grid grid-cols-3 gap-6 mb-6">

      <div className="bg-white p-6 rounded shadow">

        <p className="text-sm text-gray-500">
          WhatsApp Business API Status
        </p>

        <h3 className="text-green-600 font-bold text-lg">
          LIVE
        </h3>

      </div>

      <div className="bg-white p-6 rounded shadow">

        <p className="text-sm text-gray-500">
          Quality Rating
        </p>

        <h3 className="text-green-600 font-bold text-lg">
          High
        </h3>

      </div>

      <div className="bg-white p-6 rounded shadow">

        <p className="text-sm text-gray-500">
          Remaining Quota
        </p>

        <h3 className="text-lg font-bold">
          99281
        </h3>

      </div>

    </div>
  );
}

export default AgentStatusCards;
