import React from "react";

function statusStyles(status) {
  const s = (status || "").toLowerCase();
  if (s === "active" || s === "live" || s === "approved")
    return { dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-800 ring-emerald-200/80" };
  if (s === "pending" || s === "draft")
    return { dot: "bg-amber-500", pill: "bg-amber-50 text-amber-900 ring-amber-200/80" };
  return { dot: "bg-slate-400", pill: "bg-slate-100 text-slate-700 ring-slate-200/80" };
}

function ProjectCard({ project }) {
  const role = project.owner_role || project.role;
  const status = project.status || "N/A";
  const { dot, pill } = statusStyles(status);
  const created = project.created_at ? new Date(project.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }) : "—";

  const initial = String(project.project_name || "?")
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <div className="relative px-5 pb-5 pt-4 md:px-6 md:pb-6 md:pt-5">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-500/[0.04] via-transparent to-blue-600/[0.05] opacity-0 transition-opacity duration-300 group-hover:opacity-100" aria-hidden />

      <div className="relative flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 text-lg font-bold text-white shadow-md shadow-sky-600/25 ring-2 ring-white/80">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-base font-bold tracking-tight text-gray-900 md:text-[17px]">
              {project.project_name}
            </h3>
            {role && (
              <span className="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-800 ring-1 ring-sky-200/80">
                {role}
              </span>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${pill}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
              {status}
            </span>
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs font-medium text-gray-500">
            <svg className="h-4 w-4 shrink-0 text-sky-500/80" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>Created {created}</span>
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-gray-100/90 pt-4">
            <span className="text-xs font-semibold text-gray-400">Workspace</span>
            <span className="inline-flex items-center gap-1 text-sm font-bold text-sky-600 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-sky-700">
              Open
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProjectCard;
