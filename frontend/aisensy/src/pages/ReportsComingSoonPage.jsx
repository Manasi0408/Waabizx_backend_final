import React, { useEffect, useMemo, useState } from "react";
import MainSidebarNav from "../components/MainSidebarNav";

export default function ReportsComingSoonPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const API_URL = "https://wabizx.techwhizzc.com/api";

  const [selectedAgent, setSelectedAgent] = useState(null);
  const user = useMemo(() => {
    try {
      const raw = localStorage.getItem("user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  const userName = user?.name || user?.email || "User";
  const userInitial = String(userName || "U").charAt(0).toUpperCase();

  const loggedInUserId = user?.id ?? user?._id ?? null;

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [selectedDate, setSelectedDate] = useState(today);

  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState({ show: false, message: "" });
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState({ totalIntervenedConversations: 0 });

  useEffect(() => {
    try {
      const raw = localStorage.getItem("selectedAgent");
      const parsed = raw ? JSON.parse(raw) : null;
      setSelectedAgent(parsed && (parsed.id || parsed._id || parsed.email || parsed.name) ? parsed : null);
    } catch {
      setSelectedAgent(null);
    }
  }, []);

  const selectedAgentId = selectedAgent
    ? (selectedAgent.id ?? selectedAgent._id ?? null)
    : null;
  const selectedAgentEmail = selectedAgent ? selectedAgent.email : null;

  const displayedRows = rows;
  const displayedTotal = total;

  const showToast = (message) => {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: "" }), 3000);
  };

  useEffect(() => {
    const fetchReport = async () => {
      try {
        setLoading(true);
        setError("");
        const token = localStorage.getItem("token");
        if (!token) throw new Error("No token found");

        const qs = new URLSearchParams({ date: selectedDate });
        if (selectedAgentId != null) {
          qs.set("agentId", String(selectedAgentId));
          if (loggedInUserId != null) qs.set("adminId", String(loggedInUserId));
        }

        const res = await fetch(`${API_URL}/reports/intervened/customers?${qs.toString()}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.message || data?.error || "Failed to fetch report");
        }

        setRows(Array.isArray(data?.customers) ? data.customers : []);
        setTotal({
          totalIntervenedConversations: Number(data?.totalIntervenedConversations || 0),
        });
      } catch (e) {
        setError(e?.message || String(e));
        setRows([]);
        setTotal({ totalIntervenedConversations: 0 });
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [API_URL, selectedDate, selectedAgentId, loggedInUserId]);

  const handleExport = async () => {
    try {
      if (!displayedRows || displayedRows.length === 0) {
        showToast("No data available for the given date.");
        return;
      }

      setExporting(true);
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No token found");

      const qs = new URLSearchParams({ date: selectedDate });
      if (selectedAgentId != null) {
        qs.set("agentId", String(selectedAgentId));
        if (loggedInUserId != null) qs.set("adminId", String(loggedInUserId));
      }

      const res = await fetch(`${API_URL}/reports/intervened/customers/export?${qs.toString()}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const maybeJson = await res.json().catch(() => null);
        throw new Error(maybeJson?.message || maybeJson?.error || "Failed to export CSV");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `intervened-report-${selectedDate}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {toast.show && (
        <div className="fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg border border-gray-200 bg-white/95 backdrop-blur-md text-sm font-semibold text-gray-800">
          {toast.message}
        </div>
      )}
      {/* Top Navigation Bar */}
      <header className="motion-header-enter shrink-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-4 md:px-8 py-3.5 md:py-4 flex justify-between items-center shadow-sm shadow-gray-200/50">
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="p-2.5 rounded-xl hover:bg-gray-100/80 active:scale-95 transition lg:hidden"
            aria-label="Toggle sidebar"
          >
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-gradient-to-br from-sky-500 via-sky-600 to-blue-900 rounded-xl flex items-center justify-center shadow-lg shadow-sky-500/30 ring-2 ring-white">
              <span className="text-white font-bold text-lg">W</span>
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-sky-700 tracking-tight truncate">Reports</h2>
              <p className="text-xs text-gray-500 truncate">Intervened agents summary</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-sm text-gray-600">
            <span className="font-semibold text-gray-700">{userName}</span>
          </div>
          <div
            className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 flex items-center justify-center cursor-pointer shadow-md shadow-sky-500/35 ring-2 ring-white"
            title={userName}
          >
            <span className="text-white font-semibold text-sm">{userInitial}</span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Collapsible Sidebar */}
        <aside
          className={`bg-sky-950 text-white border-r border-sky-900 h-full shrink-0 flex flex-col overflow-hidden transition-all duration-300 ${
            sidebarOpen ? "w-20" : "w-0 md:w-20"
          }`}
        >
          <MainSidebarNav />
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-sky-50/90 via-white to-sky-100/50">
          <div className="p-4 md:p-8 lg:p-10 max-w-[1600px] mx-auto">
            {/* Simple header + date picker */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-slate-900">Intervened agent report</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Pick a date to see intervened conversations handled by each agent.
                </p>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-sky-700">Date</label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-white/90 border border-gray-200 rounded-xl px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400/40 focus:border-sky-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={exporting}
                  className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {exporting ? "Exporting..." : "Export"}
                </button>
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4 md:gap-5 mb-7 md:mb-9">
              <div className="bg-white rounded-2xl border border-gray-100/80 p-5 md:p-6 shadow-sm shadow-gray-200/40 hover:shadow-xl hover:shadow-sky-400/10 hover:border-sky-100 overflow-hidden relative">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500 opacity-90" aria-hidden />
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-sm font-semibold text-gray-500 tracking-tight">Intervened conversations</div>
                    <p className="text-3xl md:text-4xl font-bold text-gray-900 mb-1 tabular-nums tracking-tight">
                      {loading ? "..." : displayedTotal.totalIntervenedConversations.toLocaleString()}
                    </p>
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a10.6 10.6 0 01-4.839-1.145L3 20l1.145-3.161A7.963 7.963 0 012 12c0-4.418 4.03-8 9-8s10 3.582 10 8z" />
                    </svg>
                  </div>
                </div>
                <p className="text-xs font-medium text-emerald-600">Total for selected date</p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100/80 p-5 md:p-6 shadow-sm shadow-gray-200/40 hover:shadow-xl hover:shadow-sky-400/10 hover:border-sky-100 overflow-hidden relative">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-sky-400 via-sky-500 to-blue-500 opacity-90" aria-hidden />
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-sm font-semibold text-gray-500 tracking-tight">Customers</div>
                    <p className="text-3xl md:text-4xl font-bold text-gray-900 mb-1 tabular-nums tracking-tight">
                      {loading ? "..." : (displayedRows?.length || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center shadow-lg shadow-sky-500/30">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h-5a4 4 0 010-8h5v8zM7 20H4a4 4 0 010-8h3v8zM14 4v6a4 4 0 01-4 4H8a4 4 0 01-4-4V4h10z" />
                    </svg>
                  </div>
                </div>
                <p className="text-xs font-medium text-sky-600">Customers with intervened activity</p>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm">{error}</div>
            )}

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-sky-50/30">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-gray-900">Customers</span>
                  <span className="text-xs text-gray-500">Date: {selectedDate}</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gradient-to-r from-gray-50 to-sky-50/40 text-gray-600">
                    <tr>
                      <th className="text-left px-5 py-3 font-semibold">Customer Name</th>
                      <th className="text-left px-5 py-3 font-semibold">Phone</th>
                      <th className="text-left px-5 py-3 font-semibold">Intervened conversations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan="3" className="px-5 py-10">
                          <div className="flex items-center justify-center gap-3">
                            <div className="animate-spin rounded-full h-8 w-8 border-2 border-sky-200 border-t-sky-600" />
                            <span className="text-sm font-semibold text-gray-600">Loading report...</span>
                          </div>
                        </td>
                      </tr>
                    ) : displayedRows.length === 0 ? (
                      <tr>
                        <td colSpan="3" className="px-5 py-10">
                          <div className="text-center">
                            <div className="mx-auto w-12 h-12 rounded-2xl bg-sky-50 ring-1 ring-sky-100 flex items-center justify-center">
                              <svg className="w-6 h-6 text-sky-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 014 0M9 5h6" />
                              </svg>
                            </div>
                            <p className="mt-3 text-sm font-semibold text-gray-700">No data for this date</p>
                            <p className="mt-1 text-xs text-gray-500">Try selecting another day.</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      displayedRows.map((r) => (
                        <tr
                          key={`${r.phone}-${r.customerName}`}
                          className="border-t border-gray-100 hover:bg-sky-50/50 transition-colors"
                        >
                          <td className="px-5 py-3 font-semibold text-gray-900">{r.customerName}</td>
                          <td className="px-5 py-3 text-gray-700 tabular-nums">{r.phone}</td>
                          <td className="px-5 py-3 text-gray-700 tabular-nums">{r.intervenedConversationsCount.toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

