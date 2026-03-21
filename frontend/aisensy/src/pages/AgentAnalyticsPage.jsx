import React from "react";

function AgentAnalyticsPage() {
  const stats = [
    { title: "Total Conversations", value: "3,450" },
    { title: "Messages Sent", value: "7,890" },
    { title: "Messages Received", value: "6,240" },
    { title: "Active Users", value: "812" }
  ];

  return (
    <div className="p-8">

      <h2 className="text-2xl font-bold mb-6">
        WhatsApp Conversation Analytics
      </h2>

      <div className="grid grid-cols-4 gap-6">

        {stats.map((item, i) => (
          <div key={i} className="bg-white p-6 rounded shadow">

            <p className="text-gray-500 text-sm">
              {item.title}
            </p>

            <h3 className="text-2xl font-bold mt-2">
              {item.value}
            </h3>

          </div>
        ))}

      </div>

    </div>
  );
}

export default AgentAnalyticsPage;
