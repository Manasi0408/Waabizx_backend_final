import React, { useEffect, useMemo, useState } from "react";
import { getConversationQuota } from "../services/dashboardService";

function AgentStatusCards() {
  const [quota, setQuota] = useState({
    used: 0,
    remaining: 0,
    limit: 0,
    messagesSentToday: 0,
  });
  const [loadingQuota, setLoadingQuota] = useState(true);

  const accountId = useMemo(() => {
    try {
      const raw = localStorage.getItem("user");
      const u = raw ? JSON.parse(raw) : null;
      return u?.id;
    } catch (e) {
      return null;
    }
  }, []);

  useEffect(() => {
    if (accountId == null) return undefined;

    let cancelled = false;
    let first = true;

    const loadQuota = async () => {
      try {
        if (first) setLoadingQuota(true);
        const res = await getConversationQuota(accountId);
        if (!cancelled) {
          setQuota(
            res || { used: 0, remaining: 0, limit: 0, messagesSentToday: 0 }
          );
        }
      } catch (e) {
        if (!cancelled) {
          setQuota({ used: 0, remaining: 0, limit: 0, messagesSentToday: 0 });
        }
      } finally {
        if (!cancelled && first) {
          setLoadingQuota(false);
          first = false;
        }
      }
    };

    loadQuota();
    const t = setInterval(loadQuota, 10000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [accountId]);

  const cards = [
    {
      label: "WhatsApp Business API Status",
      value: "LIVE",
      valueClass: "text-emerald-600",
      accent: "from-emerald-500/10 to-sky-500/5",
    },
    {
      label: "Quality Rating",
      value: "High",
      valueClass: "text-emerald-600",
      accent: "from-sky-500/10 to-emerald-500/5",
    },
    {
      label: "Remaining (limit − sent today)",
      value: loadingQuota ? "..." : Number(quota.remaining || 0).toLocaleString(),
      valueClass: "text-gray-900",
      accent: "from-sky-500/15 to-blue-500/10",
    },
    {
      label: "Messages sent today",
      value: loadingQuota
        ? "..."
        : Number(quota.messagesSentToday || 0).toLocaleString(),
      valueClass: "text-gray-900",
      accent: "from-violet-500/10 to-sky-500/10",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 motion-stagger-children">
      {cards.map((card) => (
        <div
          key={card.label}
          className="group relative motion-card-rich motion-hover-lift overflow-hidden rounded-2xl border border-gray-100/90 bg-white/95 backdrop-blur-sm p-5 md:p-6 shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80 transition-all duration-300 hover:border-sky-200/60 hover:shadow-xl hover:shadow-sky-500/10"
        >
          <span
            className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${card.accent} opacity-80`}
            aria-hidden
          />
          <span className="motion-card-shine pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
            <span className="motion-card-shine__beam absolute inset-0" />
          </span>
          <div className="relative">
            <p className="text-sm text-gray-500 font-medium">{card.label}</p>
            <h3 className={`mt-2 font-bold text-xl md:text-2xl tracking-tight ${card.valueClass}`}>{card.value}</h3>
          </div>
        </div>
      ))}
    </div>
  );
}

export default AgentStatusCards;
