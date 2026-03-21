import React, { useEffect, useMemo, useState } from "react";
import axios from "../api/axios";
import { getDashboardStats } from "../services/dashboardService";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function ManageAnalyticsPage() {
  const [days, setDays] = useState(30); // matches backend valid values: 1, 7, 30, 90
  const [dashboardChartData, setDashboardChartData] = useState([]);
  const [agentActivityData, setAgentActivityData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [agentFilter, setAgentFilter] = useState("all"); // 'all' | active | requesting | intervened | closed
  const [error, setError] = useState("");

  const loadAll = async () => {
    try {
      setError("");
      setLoading(true);

      const dashboard = await getDashboardStats(days);
      setDashboardChartData(dashboard?.chartData || []);

      const res = await axios.get("/dashboard/agent-activity");
      const data = res?.data?.data || [];
      setAgentActivityData(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.message || "Failed to load analytics");
      setDashboardChartData([]);
      setAgentActivityData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (!mounted) return;
      await loadAll();
    };
    run();

    // Auto refresh so charts are dynamically updated (not static).
    const interval = setInterval(() => {
      if (!mounted) return;
      loadAll();
    }, 10000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const agentTotals = useMemo(() => {
    const totals = { active: 0, requesting: 0, intervened: 0, closed: 0 };
    for (const row of agentActivityData || []) {
      totals.active += Number(row.active || 0);
      totals.requesting += Number(row.requesting || 0);
      totals.intervened += Number(row.intervened || 0);
      totals.closed += Number(row.closed || 0);
    }
    return totals;
  }, [agentActivityData]);

  const showAgentArea = (key) => agentFilter === "all" || agentFilter === key;

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4">
        <h2 className="text-lg md:text-xl font-semibold text-gray-900">Analytics</h2>
        <p className="text-sm text-gray-500">Charts update automatically with live data.</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-sm text-red-700 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {/* Chart 1 */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 md:p-6">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <h3 className="text-sm md:text-base font-semibold text-gray-800">Chats sent over time</h3>
              <div className="text-xs text-gray-500 mt-1">
                Sent / Delivered / Read
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Range</span>
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1"
              >
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
              </select>
            </div>
          </div>

          <div className="h-[240px] w-full">
            {loading ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-500">Loading...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dashboardChartData || []} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />

                  <Area
                    type="monotone"
                    dataKey="messages"
                    name="Messages Sent"
                    stroke="#3B82F6"
                    fill="#3B82F6"
                    fillOpacity={0.18}
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="delivered"
                    name="Messages Delivered"
                    stroke="#14B8A6"
                    fill="#14B8A6"
                    fillOpacity={0.18}
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="read"
                    name="Messages Read"
                    stroke="#8B5CF6"
                    fill="#8B5CF6"
                    fillOpacity={0.18}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2 */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 md:p-6">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              <h3 className="text-sm md:text-base font-semibold text-gray-800">Agent Activity [year]</h3>
              <div className="text-xs text-gray-500 mt-1">
                Active / Requesting / Intervened / Closed
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Filter</span>
              <select
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
                className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-2 py-1"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="requesting">Requesting</option>
                <option value="intervened">Intervened</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-xs">
            <div className="bg-gray-50 rounded-lg px-3 py-2">
              <div className="text-gray-500">Total Active</div>
              <div className="font-semibold text-gray-800">{agentTotals.active}</div>
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2">
              <div className="text-gray-500">Total Requesting</div>
              <div className="font-semibold text-gray-800">{agentTotals.requesting}</div>
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2">
              <div className="text-gray-500">Total Intervened</div>
              <div className="font-semibold text-gray-800">{agentTotals.intervened}</div>
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2">
              <div className="text-gray-500">Total Closed</div>
              <div className="font-semibold text-gray-800">{agentTotals.closed}</div>
            </div>
          </div>

          <div className="h-[240px] w-full">
            {loading ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-500">Loading...</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={agentActivityData || []} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />

                  {showAgentArea("active") && (
                    <Area
                      type="monotone"
                      dataKey="active"
                      name="Active"
                      stroke="#22C55E"
                      fill="#22C55E"
                      fillOpacity={0.18}
                      strokeWidth={2}
                    />
                  )}
                  {showAgentArea("requesting") && (
                    <Area
                      type="monotone"
                      dataKey="requesting"
                      name="Requesting"
                      stroke="#F59E0B"
                      fill="#F59E0B"
                      fillOpacity={0.18}
                      strokeWidth={2}
                    />
                  )}
                  {showAgentArea("intervened") && (
                    <Area
                      type="monotone"
                      dataKey="intervened"
                      name="Intervened"
                      stroke="#F97316"
                      fill="#F97316"
                      fillOpacity={0.18}
                      strokeWidth={2}
                    />
                  )}
                  {showAgentArea("closed") && (
                    <Area
                      type="monotone"
                      dataKey="closed"
                      name="Closed"
                      stroke="#EF4444"
                      fill="#EF4444"
                      fillOpacity={0.18}
                      strokeWidth={2}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

