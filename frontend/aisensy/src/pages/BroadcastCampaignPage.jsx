import React from "react";

function BroadcastCampaignPage() {

  const campaigns = [
    { name: "Diwali Offer", sent: 2000, delivered: 1950 },
    { name: "Loan Update", sent: 5000, delivered: 4800 },
    { name: "EMI Reminder", sent: 3500, delivered: 3400 }
  ];

  return (
    <div className="p-8">

      <div className="flex justify-between mb-6">

        <h2 className="text-2xl font-bold">
          Broadcast Campaigns
        </h2>

        <button className="bg-green-600 text-white px-4 py-2 rounded">
          Create Campaign
        </button>

      </div>

      <table className="w-full bg-white shadow rounded">

        <thead className="bg-gray-100">
          <tr>
            <th className="p-3 text-left">Campaign</th>
            <th className="p-3 text-left">Sent</th>
            <th className="p-3 text-left">Delivered</th>
          </tr>
        </thead>

        <tbody>
          {campaigns.map((c, i) => (
            <tr key={i} className="border-t">

              <td className="p-3">{c.name}</td>
              <td className="p-3">{c.sent}</td>
              <td className="p-3">{c.delivered}</td>

            </tr>
          ))}
        </tbody>

      </table>

    </div>
  );
}

export default BroadcastCampaignPage;
