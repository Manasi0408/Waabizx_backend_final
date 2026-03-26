import React from "react";

const widgets = [
  {
    title: "AiSensy Training Call",
    body: "Schedule your platform onboarding call.",
    gradient: "from-sky-500/90 via-sky-600 to-blue-800",
    icon: (
      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    title: "Refer & Earn",
    body: "Invite your friends and earn ₹2000.",
    gradient: "from-teal-500/90 via-emerald-600 to-sky-800",
    icon: (
      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "Feedback Program",
    body: "Share feedback & earn WhatsApp credits.",
    gradient: "from-violet-500/90 via-purple-600 to-sky-900",
    icon: (
      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
      </svg>
    ),
  },
  {
    title: "Affiliate Program",
    body: "Earn recurring commission.",
    gradient: "from-rose-500/90 via-pink-600 to-sky-900",
    icon: (
      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
  },
];

function AgentWidgets() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6 motion-stagger-children">
      {widgets.map((w) => (
        <div
          key={w.title}
          className="group relative motion-card-rich motion-hover-lift overflow-hidden rounded-2xl border border-gray-100/90 bg-white/90 backdrop-blur-sm shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80 transition-all duration-300 hover:border-sky-200/50 hover:shadow-xl hover:shadow-sky-500/10"
        >
          <div className={`absolute inset-0 bg-gradient-to-br ${w.gradient} opacity-[0.92]`} aria-hidden />
          <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-white/10" aria-hidden />
          <span className="motion-card-shine pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
            <span className="motion-card-shine__beam absolute inset-0" />
          </span>
          <div className="relative p-6 md:p-7 text-white">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm ring-1 ring-white/30 shadow-inner">
              {w.icon}
            </div>
            <h3 className="font-bold text-lg md:text-xl tracking-tight drop-shadow-sm">{w.title}</h3>
            <p className="mt-2 text-sm text-white/90 leading-relaxed">{w.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default AgentWidgets;
