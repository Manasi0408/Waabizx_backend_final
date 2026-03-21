import React from "react";

function ContactManagementPage() {

  const contacts = [
    { name: "Rahul Sharma", phone: "9876543210" },
    { name: "Priya Patel", phone: "9123456789" },
    { name: "Amit Kumar", phone: "9988776655" }
  ];

  return (
    <div className="p-8">

      <div className="flex justify-between mb-6">

        <h2 className="text-2xl font-bold">
          Contact Management
        </h2>

        <button className="bg-green-600 text-white px-4 py-2 rounded">
          Add Contact
        </button>

      </div>

      <table className="w-full bg-white shadow rounded">

        <thead className="bg-gray-100">
          <tr>
            <th className="p-3 text-left">Name</th>
            <th className="p-3 text-left">Phone</th>
          </tr>
        </thead>

        <tbody>

          {contacts.map((c,i)=>(
            <tr key={i} className="border-t">

              <td className="p-3">{c.name}</td>
              <td className="p-3">{c.phone}</td>

            </tr>
          ))}

        </tbody>

      </table>

    </div>
  );
}

export default ContactManagementPage;
