import React, { useEffect, useMemo, useState } from "react";
import axios from "../api/axios";

function TemplateMessagesPage() {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [actionMenuOpenId, setActionMenuOpenId] = useState(null);
  const [actionMenuPos, setActionMenuPos] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templatesError, setTemplatesError] = useState("");

  useEffect(() => {
    const onDocMouseDown = (e) => {
      const btn = e.target?.closest?.("[data-action-button='true']");
      const menu = e.target?.closest?.("[data-action-menu='true']");
      if (!btn && !menu) {
        setActionMenuOpenId(null);
        setActionMenuPos(null);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  useEffect(() => {
    const loadTemplates = async () => {
      setLoadingTemplates(true);
      setTemplatesError("");

      try {
        // Local templates for currently selected project only.
        const localRes = await axios.get("/templates", {
          params: { page: 1, limit: 100 },
        });
        const localTemplates = Array.isArray(localRes.data?.templates)
          ? localRes.data.templates
          : [];

        const mappedLocal = localTemplates.map((t) => {
          const status = String(t?.status || "").toLowerCase();
          const statusLabel = status === "approved" ? "Approved" : "Draft";
          return {
            id: `local_${t.id}`,
            title: t.name,
            status: statusLabel,
            tag: t.category ? String(t.category) : "Overall",
          };
        });

        setTemplates(mappedLocal);
      } catch (e) {
        setTemplatesError(e?.response?.data?.message || e?.message || "Failed to load templates");
        setTemplates([]);
      } finally {
        setLoadingTemplates(false);
      }
    };

    loadTemplates();
  }, []);

  const filteredTemplates = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    let list = Array.isArray(templates) ? templates : [];

    if (activeFilter !== "All") {
      list = list.filter((t) => String(t.status) === activeFilter);
    }

    if (!q) return list;
    return list.filter((t) => {
      const title = String(t.title || "").toLowerCase();
      const status = String(t.status || "").toLowerCase();
      const tag = String(t.tag || "").toLowerCase();
      return title.includes(q) || status.includes(q) || tag.includes(q);
    });
  }, [search, templates, activeFilter]);

  const openMenuTemplate = useMemo(
    () => (actionMenuOpenId ? filteredTemplates.find((x) => x.id === actionMenuOpenId) : null),
    [actionMenuOpenId, filteredTemplates]
  );

  const filters = ["All", "Draft", "Pending", "Approved"];

  return (
    <div className="p-4 md:p-6 lg:p-8 flex flex-col h-[calc(100vh-6rem)] min-h-[280px]">
      <div className="motion-enter motion-hover-lift bg-white/95 backdrop-blur-sm border border-gray-100/90 rounded-2xl p-4 md:p-6 shadow-lg shadow-gray-200/40 ring-1 ring-gray-100/80 transition-all duration-300 hover:shadow-xl flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex items-center justify-between gap-4 mb-4 shrink-0">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">Template Messages</h2>
            <p className="text-sm text-gray-600 mt-1">Manage and submit WhatsApp templates.</p>
          </div>
        </div>

        <div className="mb-4 flex items-center gap-3 shrink-0">
          <div className="flex-1 relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates (status, name etc.)"
              className="w-full border-2 border-gray-200 rounded-xl pl-4 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 bg-gray-50/80 hover:bg-white transition-all shadow-sm"
            />
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-5 flex-1 min-h-0 min-w-0">
          <div className="w-full lg:w-56 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold uppercase tracking-wider text-sky-700/90">Filters</div>
            </div>
            <div className="space-y-1.5 rounded-xl border border-gray-100/90 bg-sky-50/30 p-2 ring-1 ring-sky-100/50">
              {filters.map((f) => {
                const isActive = activeFilter === f;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setActiveFilter(f)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-[0.99] ${
                      isActive
                        ? "bg-white text-sky-800 shadow-md shadow-sky-200/40 ring-1 ring-sky-200/60"
                        : "bg-transparent hover:bg-white/80 text-gray-700"
                    }`}
                  >
                    {f}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <div className="text-sm font-bold text-gray-800">{activeFilter}</div>
            </div>

            {loadingTemplates ? (
              <div className="py-12 text-center motion-enter shrink-0">
                <div className="inline-block h-9 w-9 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600" />
                <p className="mt-3 text-gray-600 text-sm">Loading templates...</p>
              </div>
            ) : templatesError ? (
              <div className="py-6 text-center text-red-600 text-sm motion-enter p-4 rounded-xl bg-red-50/80 border border-red-100 ring-1 ring-red-100/50 shrink-0">
                {templatesError}
              </div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col rounded-2xl border border-gray-100/90 bg-white/90 shadow-inner shadow-gray-100/50 ring-1 ring-gray-100/70 overflow-hidden">
                <div className="shrink-0 px-3 py-2.5 bg-gradient-to-r from-slate-50 via-sky-50/40 to-sky-50/20 border-b border-gray-100 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Templates ({filteredTemplates.length})
                </div>

                {filteredTemplates.length === 0 ? (
                  <div className="py-10 text-center text-gray-500 text-sm motion-enter shrink-0">No templates found.</div>
                ) : (
                  <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-3 md:p-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-4 motion-stagger-children">
                      {filteredTemplates.map((t) => (
                        <article
                          key={t.id}
                          className="group relative motion-card-rich motion-hover-lift rounded-2xl border border-gray-100/90 bg-white/95 p-4 shadow-md shadow-gray-200/30 ring-1 ring-gray-100/70 transition-all duration-300 hover:border-sky-200/60 hover:shadow-lg"
                        >
                          <span className="motion-card-shine pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
                            <span className="motion-card-shine__beam absolute inset-0" />
                          </span>

                          <div className="relative flex items-start justify-between gap-2 mb-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Name</p>
                              <h3 className="text-sm font-bold text-gray-900 leading-snug line-clamp-2">{t.title}</h3>
                            </div>
                            <div className="relative shrink-0">
                              <button
                                type="button"
                                data-action-button="true"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const next = actionMenuOpenId === t.id ? null : t.id;
                                  if (!next) {
                                    setActionMenuOpenId(null);
                                    setActionMenuPos(null);
                                    return;
                                  }
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  const w = 160;
                                  setActionMenuPos({
                                    top: rect.bottom + 6,
                                    left: Math.min(window.innerWidth - w - 8, Math.max(8, rect.right - w)),
                                  });
                                  setActionMenuOpenId(t.id);
                                }}
                                className="p-2 rounded-xl hover:bg-sky-100/80 text-gray-500 hover:text-sky-700 transition-all active:scale-95"
                                title="More"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 13.5a.75.75 0 110-1.5.75.75 0 010 1.5zM12 20.25a.75.75 0 110-1.5.75.75 0 010 1.5z" />
                                </svg>
                              </button>
                            </div>
                          </div>

                          <dl className="relative space-y-2.5 text-xs">
                            <div>
                              <dt className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Category</dt>
                              <dd className="mt-0.5 font-semibold text-gray-800 truncate">{t.tag}</dd>
                            </div>
                            <div className="flex flex-wrap gap-2 items-center">
                              <div>
                                <dt className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Status</dt>
                                <dd>
                                  <span
                                    className={`inline-block text-[11px] px-2.5 py-1 rounded-full font-semibold ${
                                      t.status === "Approved"
                                        ? "bg-green-50 text-green-700 ring-1 ring-green-100/80"
                                        : t.status === "Pending"
                                          ? "bg-yellow-50 text-yellow-800 ring-1 ring-yellow-100/80"
                                          : "bg-gray-50 text-gray-700 ring-1 ring-gray-100/80"
                                    }`}
                                  >
                                    {t.status}
                                  </span>
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Type</dt>
                                <dd>
                                  <span className="inline-block text-[11px] px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 font-semibold ring-1 ring-gray-200/60">
                                    TEXT
                                  </span>
                                </dd>
                              </div>
                              <div>
                                <dt className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-1">Health</dt>
                                <dd>
                                  <span className="inline-block text-[11px] px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold ring-1 ring-emerald-100/80">
                                    High
                                  </span>
                                </dd>
                              </div>
                            </div>
                          </dl>
                        </article>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {actionMenuOpenId && actionMenuPos && openMenuTemplate && (
        <>
          <div
            className="fixed inset-0 z-[90]"
            aria-hidden
            onMouseDown={() => {
              setActionMenuOpenId(null);
              setActionMenuPos(null);
            }}
          />
          <div
            data-action-menu="true"
            className="motion-pop fixed z-[100] w-40 bg-white border border-gray-100 rounded-xl shadow-2xl shadow-gray-900/10 overflow-hidden ring-1 ring-black/5"
            style={{ top: actionMenuPos.top, left: actionMenuPos.left }}
          >
            <button
              type="button"
              className="w-full text-left px-3 py-2.5 text-sm text-gray-700 hover:bg-sky-50 transition-colors"
              onClick={async (e) => {
                e.stopPropagation();
                const tpl = openMenuTemplate;
                try {
                  await navigator.clipboard.writeText(String(tpl.title || ""));
                  alert("Copied!");
                } catch {
                  alert("Copy not supported in this browser");
                } finally {
                  setActionMenuOpenId(null);
                  setActionMenuPos(null);
                }
              }}
            >
              Copy
            </button>

            <button
              type="button"
              className="w-full text-left px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
              onClick={async (e) => {
                e.stopPropagation();
                const tpl = openMenuTemplate;
                const ok = window.confirm("Delete this template?");
                if (!ok) return;

                const isLocal = String(tpl.id || "").startsWith("local_");
                try {
                  if (isLocal) {
                    const originalId = String(tpl.id).replace("local_", "");
                    await axios.delete(`/templates/${originalId}`);
                  }
                } catch (err) {
                  alert(err?.response?.data?.message || err?.message || "Delete failed");
                  return;
                } finally {
                  setTemplates((prev) => prev.filter((x) => x.id !== tpl.id));
                  setActionMenuOpenId(null);
                  setActionMenuPos(null);
                }
              }}
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default TemplateMessagesPage;
