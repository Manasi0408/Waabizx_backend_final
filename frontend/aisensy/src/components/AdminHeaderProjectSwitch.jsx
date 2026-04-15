import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import axios from '../api/axios';

function readStoredUser() {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readSelectedProject() {
  try {
    const raw = localStorage.getItem('selectedProject');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function projectLabel(p) {
  return String(p?.project_name || p?.name || '').trim();
}

/**
 * Admin-only: project name + dropdown in the top header (current project listed first).
 */
export default function AdminHeaderProjectSwitch() {
  const location = useLocation();
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState([]);

  const isAdmin = useMemo(() => {
    const r = String(readStoredUser()?.role || '').toLowerCase();
    return r === 'admin';
  }, [location.pathname, location.key]);

  const selected = useMemo(
    () => readSelectedProject(),
    [location.pathname, location.key, open]
  );

  const orderedProjects = useMemo(() => {
    const list = Array.isArray(projects) ? [...projects] : [];
    const sid = selected?.id;
    if (sid == null || String(sid).trim() === '') return list;
    const idx = list.findIndex((p) => String(p?.id) === String(sid));
    if (idx <= 0) return list;
    const [cur] = list.splice(idx, 1);
    return [cur, ...list];
  }, [projects, selected]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get('/projects/list');
        if (!cancelled) setProjects(res.data?.projects || []);
      } catch {
        if (!cancelled) setProjects([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, location.key]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!isAdmin) return null;

  const displayName = projectLabel(selected) || 'Project';

  const onPick = (p) => {
    const same = selected?.id != null && String(selected.id) === String(p?.id);
    if (same) {
      setOpen(false);
      return;
    }
    try {
      localStorage.setItem('selectedProject', JSON.stringify(p));
    } catch (_) {
      /* ignore */
    }
    setOpen(false);
    window.location.reload();
  };

  return (
    <>
      <span className="text-gray-300 hidden md:block shrink-0" aria-hidden>
        |
      </span>
      <div className="relative min-w-0 max-w-[14rem] lg:max-w-xs hidden md:block shrink-0" ref={wrapRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full min-w-0 items-center gap-1.5 rounded-xl border border-gray-200/90 bg-white/90 px-2.5 py-1.5 text-left text-sm font-semibold text-sky-800 shadow-sm ring-1 ring-gray-100/80 transition hover:border-sky-200/90 hover:bg-sky-50/50 focus:outline-none focus:ring-2 focus:ring-sky-400/35"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label="Switch project"
        >
          <span className="min-w-0 flex-1 truncate" title={displayName}>
            {displayName}
          </span>
          <svg
            className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {open && (
          <ul
            className="motion-pop absolute left-0 right-0 z-[60] mt-2 max-h-64 overflow-y-auto rounded-xl border border-gray-100 bg-white py-1 shadow-xl shadow-gray-900/10 ring-1 ring-black/5"
            role="listbox"
            aria-label="Projects"
          >
            {orderedProjects.length === 0 ? (
              <li className="px-3 py-2 text-xs text-gray-500">No projects found</li>
            ) : (
              orderedProjects.map((p) => {
                const name = projectLabel(p) || 'Untitled';
                const active = selected?.id != null && String(selected.id) === String(p?.id);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => onPick(p)}
                      className={`flex w-full min-w-0 items-center px-3 py-2 text-left text-sm transition hover:bg-sky-50 ${
                        active ? 'bg-sky-50 font-semibold text-sky-900' : 'text-gray-800'
                      }`}
                    >
                      <span className="truncate" title={name}>
                        {name}
                      </span>
                      {active ? (
                        <span className="ml-2 shrink-0 text-xs font-medium text-sky-600">Current</span>
                      ) : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        )}
      </div>
    </>
  );
}
