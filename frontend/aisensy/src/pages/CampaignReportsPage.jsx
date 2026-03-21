import React from "react";

function CampaignReportsPage() {

  const reports = [
    { campaign:"Diwali Sale", clicks:200, responses:120 },
    { campaign:"Loan Offer", clicks:350, responses:210 }
  ];

  return (
    <div className="p-8">

      <h2 className="text-2xl font-bold mb-6">
        Campaign Reports
      </h2>

      <table className="w-full bg-white shadow rounded">

        <thead className="bg-gray-100">
          <tr>
            <th className="p-3">Campaign</th>
            <th className="p-3">Clicks</th>
            <th className="p-3">Responses</th>
          </tr>
        </thead>

        <tbody>

          {reports.map((r,i)=>(
            <tr key={i} className="border-t">

              <td className="p-3">{r.campaign}</td>
              <td className="p-3">{r.clicks}</td>
              <td className="p-3">{r.responses}</td>

            </tr>
          ))}

        </tbody>

      </table>

    </div>
  );
}

export default CampaignReportsPage;
