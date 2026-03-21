import React, { useEffect, useMemo, useState } from "react";
import axios from "../api/axios";

function TemplateMessagesPage() {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [actionMenuOpenId, setActionMenuOpenId] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templatesError, setTemplatesError] = useState("");

  useEffect(() => {
    const onDocMouseDown = (e) => {
      const btn = e.target?.closest?.("[data-action-button='true']");
      const menu = e.target?.closest?.("[data-action-menu='true']");
      if (!btn && !menu) setActionMenuOpenId(null);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  useEffect(() => {
    const loadTemplates = async () => {
      setLoadingTemplates(true);
      setTemplatesError("");

      try {
        // 1) Local templates (Draft / Approved / Rejected)
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

        // 2) Meta templates (PENDING / APPROVED / REJECTED)
        const metaRes = await axios.get("/templates/meta");
        const metaTemplates = Array.isArray(metaRes.data?.templates)
          ? metaRes.data.templates
          : [];

        const mappedMeta = metaTemplates.map((t) => {
          const metaStatus = String(t?.metaStatus || t?.status || "").toUpperCase();
          const statusLabel =
            metaStatus === "APPROVED" ? "Approved" : metaStatus === "PENDING" ? "Pending" : "Draft";

          return {
            id: `meta_${t.id}`,
            title: t.name,
            status: statusLabel,
            tag: t.category ? String(t.category) : "Overall",
          };
        });

        // Merge and de-duplicate by title
        const byTitle = new Map();
        [...mappedLocal, ...mappedMeta].forEach((t) => {
          const key = String(t.title || "").trim().toLowerCase();
          if (!key) return;
          if (!byTitle.has(key)) {
            byTitle.set(key, t);
            return;
          }
          const existing = byTitle.get(key);
          // Prefer Pending/Approved over Draft when the same template exists in multiple sources.
          if (existing?.status === "Draft" && t?.status !== "Draft") {
            byTitle.set(key, t);
          }
        });

        setTemplates(Array.from(byTitle.values()));
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

  const filters = ["All", "Draft", "Pending", "Approved"];

  return (
    <div className="p-4">
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Template Messages</h2>
            <p className="text-sm text-gray-500">Manage and submit WhatsApp templates.</p>
          </div>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <div className="flex-1 relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates (status, name etc.)"
              className="w-full border border-gray-300 rounded-lg pl-4 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex gap-6">
          <div className="w-56 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-gray-800">Filters</div>
            </div>
            <div className="space-y-2">
              {filters.map((f) => {
                const isActive = activeFilter === f;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setActiveFilter(f)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition ${
                      isActive ? "bg-teal-50 text-teal-800" : "bg-transparent hover:bg-gray-50 text-gray-700"
                    }`}
                  >
                    {f}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-gray-800">{activeFilter}</div>
            </div>

            {loadingTemplates ? (
              <div className="py-10 text-center text-gray-500 text-sm">Loading templates...</div>
            ) : templatesError ? (
              <div className="py-10 text-center text-red-600 text-sm">{templatesError}</div>
            ) : (
              <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                <div className="grid grid-cols-7 gap-3 px-3 py-3 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <div className="col-span-2 text-left">Name</div>
                  <div className="text-left">Category</div>
                  <div className="text-left">Status</div>
                  <div className="text-left">Type</div>
                  <div className="text-left">Health</div>
                  <div className="text-right col-span-1">Action</div>
                </div>

                {filteredTemplates.length === 0 ? (
                  <div className="py-10 text-center text-gray-500 text-sm">No templates found.</div>
                ) : (
                  <div>
                    {filteredTemplates.map((t) => (
                      <div
                        key={t.id}
                        className="grid grid-cols-7 gap-3 px-3 py-3 border-b border-gray-100 items-center hover:bg-gray-50"
                      >
                        <div className="col-span-2 min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">{t.title}</div>
                        </div>

                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-gray-700 truncate">{t.tag}</div>
                        </div>

                        <div className="min-w-0">
                          <span
                            className={`text-[11px] px-2 py-1 rounded-full font-semibold ${
                              t.status === "Approved"
                                ? "bg-green-50 text-green-700"
                                : t.status === "Pending"
                                  ? "bg-yellow-50 text-yellow-800"
                                  : "bg-gray-50 text-gray-700"
                            }`}
                          >
                            {t.status}
                          </span>
                        </div>

                        <div className="min-w-0">
                          <span className="text-[11px] px-2 py-1 rounded-full bg-gray-100 text-gray-600 font-semibold">
                            TEXT
                          </span>
                        </div>

                        <div className="min-w-0">
                          <span className="text-[11px] px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold">
                            High
                          </span>
                        </div>

                        <div className="text-right col-span-1 flex items-center justify-end relative">
                          <button
                            type="button"
                            data-action-button="true"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionMenuOpenId((prev) => (prev === t.id ? null : t.id));
                            }}
                            className="p-1.5 rounded hover:bg-gray-100"
                            title="More"
                          >
                            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 13.5a.75.75 0 110-1.5.75.75 0 010 1.5zM12 20.25a.75.75 0 110-1.5.75.75 0 010 1.5z" />
                            </svg>
                          </button>

                          {actionMenuOpenId === t.id && (
                            <div
                              data-action-menu="true"
                              className="absolute right-0 top-full mt-2 w-40 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-10"
                            >
                              <button
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    await navigator.clipboard.writeText(String(t.title || ""));
                                    alert("Copied!");
                                  } catch {
                                    alert("Copy not supported in this browser");
                                  } finally {
                                    setActionMenuOpenId(null);
                                  }
                                }}
                              >
                                Copy
                              </button>

                              <button
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const ok = window.confirm("Delete this template?");
                                  if (!ok) return;

                                  const isLocal = String(t.id || "").startsWith("local_");
                                  try {
                                    if (isLocal) {
                                      const originalId = String(t.id).replace("local_", "");
                                      await axios.delete(`/templates/${originalId}`);
                                    }
                                  } catch (err) {
                                    alert(err?.response?.data?.message || err?.message || "Delete failed");
                                    return;
                                  } finally {
                                    setTemplates((prev) => prev.filter((x) => x.id !== t.id));
                                    setActionMenuOpenId(null);
                                  }
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TemplateMessagesPage;
