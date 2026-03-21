import React, { useEffect, useMemo, useState } from "react";
import axios from "../api/axios";

const Icon = {
  Search: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
    </svg>
  ),
  Plus: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5" />
    </svg>
  ),
  Eye: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ),
  Pencil: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 4h2m-1 0a1 1 0 011 1v2m-4 14l-1-1 8-8 1 1-8 8z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 19l14-14" />
    </svg>
  ),
  Trash: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M9 6h6m-7 4h10l-1 11H8L7 10z" />
    </svg>
  ),
  Star: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.518 4.675a1 1 0 00.95.69h4.916c.969 0 1.371 1.24.588 1.81l-3.975 2.89a1 1 0 00-.364 1.118l1.518 4.675c.3.921-.755 1.688-1.54 1.118l-3.975-2.89a1 1 0 00-1.175 0l-3.975 2.89c-.784.57-1.838-.197-1.54-1.118l1.518-4.675a1 1 0 00-.364-1.118l-3.975-2.89c-.783-.57-.38-1.81.588-1.81h4.916a1 1 0 00.95-.69l1.518-4.675z" />
    </svg>
  ),
  X: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  ArrowLeft: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
    </svg>
  ),
};

const blankForm = { name: "", messageType: "TEXT", text: "" };

export default function CannedMessagesPage() {
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create"); // create | edit | view
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(blankForm);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [serverMediaUrl, setServerMediaUrl] = useState(null);

  const fetchMessages = async () => {
    try {
      setLoading(true);
      setError("");

      const params = {};
      if (search && String(search).trim()) params.search = search.trim();

      const res = await axios.get("/canned-messages", { params });
      const list = res?.data?.messages || [];
      setMessages(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Failed to load canned messages");
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setModalMode("create");
    setEditingId(null);
    setForm(blankForm);
    setFile(null);
    setPreviewUrl(null);
    setServerMediaUrl(null);
    setModalOpen(true);
  };

  const openEdit = (msg) => {
    setModalMode("edit");
    setEditingId(msg.id);
    setForm({
      name: msg.name || "",
      messageType: msg.type || "TEXT",
      text: msg.type === "TEXT" ? msg.text || "" : "",
    });
    setFile(null);
    setPreviewUrl(null);
    setServerMediaUrl(msg.mediaUrl || null);
    setModalOpen(true);
  };

  const openView = (msg) => {
    setModalMode("view");
    setEditingId(msg.id);
    setForm({
      name: msg.name || "",
      messageType: msg.type || "TEXT",
      text: msg.type === "TEXT" ? msg.text || "" : "",
    });
    setFile(null);
    setPreviewUrl(null);
    setServerMediaUrl(msg.mediaUrl || null);
    setModalOpen(true);
  };

  const isReadOnly = modalMode === "view";

  const handleFileChange = (f) => {
    setFile(f || null);
    if (!f) {
      setPreviewUrl(null);
      return;
    }
    if (f.type && f.type.startsWith("image/")) {
      const url = URL.createObjectURL(f);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  useEffect(() => {
    // Cleanup blob URLs
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const previewText = useMemo(() => {
    if (form.messageType === "TEXT") {
      return String(form.text || "").trim();
    }
    if (previewUrl) return "Image selected";
    if (file) return file.name;
    if (serverMediaUrl) return serverMediaUrl.split("/").pop() || "Selected file";
    return "";
  }, [form.messageType, form.text, previewUrl, file, serverMediaUrl]);

  const handleSubmit = async () => {
    try {
      setError("");

      const fd = new FormData();
      fd.append("name", form.name || "");
      fd.append("messageType", form.messageType);

      if (form.messageType === "TEXT") {
        fd.append("text", form.text || "");
      } else {
        // IMAGE | FILE
        if (file) fd.append("file", file);
      }

      if (modalMode === "edit") {
        await axios.put(`/canned-messages/${editingId}`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } else {
        await axios.post("/canned-messages", fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }

      setModalOpen(false);
      setFile(null);
      setPreviewUrl(null);
      setServerMediaUrl(null);
      await fetchMessages();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Failed to save canned message");
    }
  };

  const deleteMessage = async (msg) => {
    const ok = window.confirm(`Delete canned message "${msg.name}"?`);
    if (!ok) return;
    try {
      setError("");
      await axios.delete(`/canned-messages/${msg.id}`);
      await fetchMessages();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Failed to delete");
    }
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg md:text-xl font-semibold text-gray-900">Canned Messages</h2>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-sm font-semibold transition"
        >
          <Icon.Plus className="w-5 h-5" />
          Create
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 mb-4 p-4">
        <div className="bg-teal-50 border border-teal-100 text-teal-900 rounded-lg p-4 mb-4 text-sm">
          <div className="font-semibold mb-2">Quick Guide</div>
          <div>You can save canned message templates and use them in live chat.</div>
          <div className="mt-3">
            <span className="font-semibold">How to create Canned Message?</span>
            <ul className="list-disc ml-5 mt-2 text-gray-700">
              <li>Click Create</li>
              <li>Select Message Type and fill details</li>
              <li>Submit to save</li>
            </ul>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 relative">
            <Icon.Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search canned message by name"
              className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <button
            type="button"
            onClick={fetchMessages}
            className="px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-800 hover:bg-gray-50 transition"
          >
            Search
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-sm text-red-700 rounded-lg">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          {loading ? (
            <div className="text-sm text-gray-500 p-4">Loading...</div>
          ) : messages.length === 0 ? (
            <div className="text-sm text-gray-500 p-4">No canned messages found.</div>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600">
                  <th className="text-left font-semibold px-3 py-2">Name</th>
                  <th className="text-left font-semibold px-3 py-2">Type</th>
                  <th className="text-left font-semibold px-3 py-2">Text</th>
                  <th className="text-left font-semibold px-3 py-2">Created By</th>
                  <th className="text-left font-semibold px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((msg) => (
                  <tr key={msg.id} className="border-t border-gray-100 hover:bg-gray-50/60">
                    <td className="px-3 py-3 font-semibold text-gray-900 whitespace-nowrap">
                      {msg.name}
                    </td>
                    <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{msg.type}</td>
                    <td className="px-3 py-3 text-gray-600 max-w-[320px] truncate">{msg.text}</td>
                    <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{msg.createdBy}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => openView(msg)}
                          className="p-1 rounded text-teal-700 hover:text-teal-900 transition"
                          title="View"
                        >
                          <Icon.Eye className="w-5 h-5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(msg)}
                          className="p-1 rounded text-teal-700 hover:text-teal-900 transition disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Edit"
                          disabled={msg.type !== "TEXT" && !msg.mediaUrl}
                        >
                          <Icon.Pencil className="w-5 h-5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteMessage(msg)}
                          className="p-1 rounded text-teal-700 hover:text-teal-900 transition"
                          title="Delete"
                        >
                          <Icon.Trash className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-gray-700 hover:bg-gray-100 rounded"
              >
                <Icon.ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex-1">
                <div className="text-base font-semibold text-gray-900">
                  {modalMode === "create" ? "New Canned Message" : modalMode === "edit" ? "Edit Canned Message" : "Canned Message"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-gray-700 hover:bg-gray-100 rounded"
                title="Close"
              >
                <Icon.X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5">
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-sm text-red-700 rounded-lg">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Pick a name which describes your message"
                    disabled={isReadOnly}
                    className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-50"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Message Type</label>
                  <select
                    value={form.messageType}
                    onChange={(e) => {
                      const t = e.target.value;
                      setForm((p) => ({ ...p, messageType: t }));
                      setFile(null);
                      setPreviewUrl(null);
                      setServerMediaUrl(null);
                    }}
                    disabled={isReadOnly}
                    className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-50"
                  >
                    <option value="TEXT">TEXT</option>
                    <option value="IMAGE">IMAGE</option>
                    <option value="FILE">FILE</option>
                  </select>
                </div>

                {form.messageType === "TEXT" ? (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Text</label>
                    <textarea
                      value={form.text}
                      onChange={(e) => setForm((p) => ({ ...p, text: e.target.value }))}
                      placeholder="Enter your text message"
                      disabled={isReadOnly}
                      className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm min-h-[130px] focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-50"
                    />
                    <div className="text-xs text-gray-500 mt-2">
                      Use text formatting: <span className="font-semibold">-bold</span> &{" "}
                      <span className="font-semibold">-italic</span>. This content is stored and shown to you as preview.
                    </div>
                  </div>
                ) : (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Upload {form.messageType === "IMAGE" ? "Image" : "File"}
                    </label>
                    <input
                      type="file"
                      onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                      disabled={isReadOnly}
                      className="w-full text-sm text-gray-700"
                    />
                    <div className="text-xs text-gray-500 mt-2">
                      {serverMediaUrl && !file ? "Current file is already saved. Upload a new one if you want to replace it." : ""}
                    </div>
                  </div>
                )}

                <div className="md:col-span-2">
                  <div className="mt-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Message Preview</label>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
                      {form.messageType === "IMAGE" ? (
                        previewUrl ? (
                          <img src={previewUrl} alt="Preview" className="max-h-48 object-contain" />
                        ) : serverMediaUrl ? (
                          <img src={serverMediaUrl} alt="Preview" className="max-h-48 object-contain" />
                        ) : (
                          <div className="h-12 bg-gray-100 rounded" />
                        )
                      ) : (
                        <div className="text-sm text-gray-700 truncate">{previewText || " "}</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                >
                  Close
                </button>
                {modalMode !== "view" && (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    className="px-6 py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-lg text-sm font-semibold transition"
                  >
                    Submit
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

