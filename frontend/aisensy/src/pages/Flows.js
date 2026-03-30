import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  useEdgesState,
  useNodesState,
} from "reactflow";
import "reactflow/dist/style.css";
import { useNavigate } from "react-router-dom";
import axios from "../api/axios";
import MainSidebarNav from "../components/MainSidebarNav";
import { getProfile, isAuthenticated, logout } from "../services/authService";

function getTemplateBodyText(template) {
  if (!template) return "";
  if (typeof template.content === "string" && template.content.trim()) return template.content;
  if (typeof template.body === "string" && template.body.trim()) return template.body;
  if (typeof template.message === "string" && template.message.trim()) return template.message;
  const components = Array.isArray(template.components) ? template.components : [];
  const bodyComponent = components.find((c) => String(c?.type || "").toUpperCase() === "BODY");
  if (typeof bodyComponent?.text === "string") return bodyComponent.text;
  return "";
}

function getTemplateButtons(template) {
  const components = Array.isArray(template?.components) ? template.components : [];
  const buttonComponent = components.find((c) => String(c?.type || "").toUpperCase() === "BUTTONS");
  if (Array.isArray(buttonComponent?.buttons) && buttonComponent.buttons.length > 0) {
    return buttonComponent.buttons
      .map((b) => b?.text || b?.title || "")
      .filter(Boolean)
      .slice(0, 3);
  }
  if (Array.isArray(template?.buttons) && template.buttons.length > 0) {
    return template.buttons
      .map((b) => (typeof b === "string" ? b : b?.text || b?.title || ""))
      .filter(Boolean)
      .slice(0, 3);
  }
  return [];
}

function StartNode({ data }) {
  return (
    <div className="rounded-2xl border-4 border-emerald-600 bg-[#f2f2f2] shadow-sm p-2 min-w-[190px]">
      <div className="rounded-lg bg-white border border-gray-300 px-2 py-1.5 text-[11px] font-bold text-teal-700 flex items-center justify-between gap-2">
        <span className="truncate">Flow Start</span>
        <span className="text-xs text-gray-500">○</span>
      </div>
      <div className="mt-2 rounded-md bg-white border border-gray-300 px-2 py-1.5 text-[11px] text-gray-600">
        Type, press enter to add keyword
      </div>
      <div className="mt-2 rounded-md bg-white border border-gray-300 px-2 py-2 text-[11px] text-gray-500">
        {data?.keywords || "Enter keywords"}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-gray-600">
        <span className="leading-snug">Enter regex to match substring trigger.</span>
        <span className={`inline-flex h-4 w-7 rounded-full ${data?.regexEnabled ? "bg-emerald-500" : "bg-gray-300"} relative`}>
          <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${data?.regexEnabled ? "left-3.5" : "left-0.5"}`} />
        </span>
      </div>
      <div className="mt-2 rounded-md bg-white border border-gray-300 px-2 py-2 text-[11px] text-gray-500">
        {data?.regex || "Enter Regex"}
      </div>
      <div className="mt-2 text-[11px] text-gray-600">Add upto 1 template to begin flow</div>
      {data?.templateName ? (
        <div className="mt-1 rounded-md bg-white border border-gray-300 overflow-hidden">
          <div className="px-2 py-1 text-[10px] text-gray-500 border-b border-gray-200 flex items-center justify-between gap-2">
            <span className="truncate">{data.templateName}</span>
            <button
              type="button"
              onClick={() => data?.onDeleteTemplate?.()}
              className="shrink-0 inline-flex items-center justify-center h-5 w-5 rounded text-rose-600 hover:text-rose-700 hover:bg-rose-50"
              title="Delete selected template"
              aria-label="Delete selected template"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
          <div className="px-2 py-2 text-[11px] text-gray-800 whitespace-pre-line">
            {data?.templateContent || "Template selected"}
          </div>
          <div className="px-2 pb-2 space-y-1">
            {(Array.isArray(data?.templateButtons) ? data.templateButtons : []).map((btn) => (
              <div key={btn} className="rounded-md border border-gray-200 bg-[#f7f7f7] py-1.5 text-center text-[11px] font-semibold text-sky-700 flex items-center justify-center gap-2">
                <span className="truncate">{btn}</span>
                <span className="text-emerald-600">○</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => data?.onChooseTemplate?.()}
          className="mt-1 w-full rounded-md bg-white border border-gray-300 px-2 py-2 text-[12px] font-semibold text-gray-700 hover:bg-gray-50 transition"
        >
          Choose Template
        </button>
      )}
      <div className="mt-2 text-[11px] text-gray-600">Add upto 20 Meta Ads to begin flow</div>
      <div className="mt-1 w-full rounded-md bg-white border border-gray-300 px-2 py-2 text-[12px] font-semibold text-gray-700 text-center">
        Choose Facebook Ad
      </div>
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-sky-600" />
    </div>
  );
}

function TextNode({ data }) {
  return (
    <div className="rounded-2xl border-4 border-emerald-600 bg-[#f2f2f2] shadow-sm p-2 min-w-[220px]">
      <div className="rounded-lg bg-white border border-gray-300 px-2 py-1 text-[11px] font-bold text-teal-700">Text Message</div>
      <div className="mt-2 rounded-md bg-white border border-gray-300 px-2 py-2 text-xs text-gray-700 whitespace-pre-line">
        {data?.text || "Text message"}
      </div>
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-sky-600" />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-sky-600" />
    </div>
  );
}

function ImageNode({ data }) {
  return (
    <div className="rounded-2xl border-4 border-emerald-600 bg-[#f2f2f2] shadow-sm p-2 min-w-[220px]">
      <div className="rounded-lg bg-white border border-gray-300 px-2 py-1 text-[11px] font-bold text-teal-700">Media</div>
      <div className="mt-2 h-24 w-full rounded-md bg-white border border-gray-300 overflow-hidden flex items-center justify-center">
        {data?.imageUrl ? (
          <img src={data.imageUrl} alt="node" className="h-full w-full object-cover" />
        ) : (
          <span className="text-xs text-gray-500">Preview</span>
        )}
      </div>
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-sky-600" />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-sky-600" />
    </div>
  );
}

function QuestionNode({ data }) {
  const options = String(data?.options || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const optionA = options[0] || "Option A";
  const optionB = options[1] || "Option B";

  return (
    <div className="rounded-2xl border-4 border-emerald-600 bg-[#f2f2f2] shadow-sm p-2 min-w-[300px]">
      <div className="rounded-lg bg-white border border-gray-300 px-2 py-1 text-[11px] font-bold text-teal-700">Ask Question</div>
      <div className="mt-2 rounded-md bg-white border border-gray-300 px-2 py-2 text-sm font-semibold text-gray-900">
        {data?.question || "Question"}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-md bg-white border border-gray-300 px-2 py-2">
          <div className="text-xs font-semibold text-sky-800 truncate">{optionA}</div>
          <div className="mt-0.5 text-[10px] text-gray-500 truncate">Connect left dot</div>
        </div>
        <div className="rounded-md bg-white border border-gray-300 px-2 py-2">
          <div className="text-xs font-semibold text-sky-800 truncate">{optionB}</div>
          <div className="mt-0.5 text-[10px] text-gray-500 truncate">Connect right dot</div>
        </div>
      </div>
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-sky-600" />
      <Handle type="source" position={Position.Left} id="optionA" className="!w-3 !h-3 !bg-sky-500 !border-2 !border-white shadow" />
      <Handle type="source" position={Position.Right} id="optionB" className="!w-3 !h-3 !bg-sky-500 !border-2 !border-white shadow" />
    </div>
  );
}

function ButtonNode({ data }) {
  const buttons = String(data?.buttons || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="rounded-2xl border-4 border-emerald-600 bg-[#f2f2f2] shadow-sm p-2 min-w-[260px]">
      <div className="rounded-lg bg-white border border-gray-300 px-2 py-1 text-[11px] font-bold text-teal-700">Text + Button</div>
      <div className="mt-2 rounded-md bg-white border border-gray-300 px-2 py-2 text-sm font-semibold text-gray-900">
        {data?.text || "Buttons message"}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {buttons.length > 0 ? (
          buttons.slice(0, 4).map((b) => (
            <span key={b} className="inline-flex items-center rounded-md bg-white border border-gray-300 text-sky-800 px-2 py-0.5 text-[11px] font-semibold">
              {b}
            </span>
          ))
        ) : (
          <span className="text-xs text-gray-500">Add buttons</span>
        )}
      </div>
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-sky-600" />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-sky-600" />
    </div>
  );
}

function ListMessageNode({ data }) {
  const items = String(data?.items || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="rounded-2xl border-4 border-emerald-600 bg-[#f2f2f2] shadow-sm p-2 min-w-[280px]">
      <div className="rounded-lg bg-white border border-gray-300 px-2 py-1 text-[11px] font-bold text-teal-700">List Message</div>
      <div className="mt-2 rounded-md bg-white border border-gray-300 px-2 py-2 text-sm font-semibold text-gray-900">
        {data?.title || "Choose an option"}
      </div>
      <div className="mt-2 space-y-1">
        {items.length > 0 ? (
          items.slice(0, 6).map((item) => (
            <div key={item} className="rounded-md bg-white border border-gray-300 px-2 py-1 text-xs text-gray-700">
              {item}
            </div>
          ))
        ) : (
          <div className="text-xs text-gray-500">Add list items</div>
        )}
      </div>
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-sky-600" />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-sky-600" />
    </div>
  );
}

function MultiProductNode({ data }) {
  const products = String(data?.products || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="rounded-2xl border-4 border-emerald-600 bg-[#f2f2f2] shadow-sm p-2 min-w-[300px]">
      <div className="rounded-lg bg-white border border-gray-300 px-2 py-1 text-[11px] font-bold text-teal-700">Multi Product Message</div>
      <div className="mt-2 rounded-md bg-white border border-gray-300 px-2 py-2 text-sm font-semibold text-gray-900">
        {data?.title || "Top Picks For You"}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {products.length > 0 ? (
          products.slice(0, 6).map((p) => (
            <div key={p} className="rounded-md bg-white border border-gray-300 px-2 py-2 text-xs text-gray-700 truncate">
              {p}
            </div>
          ))
        ) : (
          <div className="col-span-2 text-xs text-gray-500">Add product names</div>
        )}
      </div>
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-sky-600" />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-sky-600" />
    </div>
  );
}

function TemplateNode({ data }) {
  const question = data?.question || "Choose an option:";
  const optionA = data?.optionA || "Option A";
  const optionB = data?.optionB || "Option B";

  return (
    <div className="rounded-2xl border-4 border-emerald-600 bg-[#f2f2f2] shadow-sm p-3 min-w-[340px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wide text-teal-700">
            Template
          </div>
          <textarea
            value={question}
            onChange={(e) => data?.onTemplateChange?.({ question: e.target.value })}
            className="nodrag mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm font-semibold text-gray-900 resize-none min-h-[64px] focus:outline-none focus:ring-2 focus:ring-sky-300/70"
            placeholder="Template question"
          />
        </div>

        <div className="shrink-0 inline-flex items-center rounded-full bg-white border border-gray-300 px-2 py-1 text-[11px] font-bold text-teal-700">
          2 options
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-white border border-gray-300 px-2 py-2">
          <input
            value={optionA}
            onChange={(e) => data?.onTemplateChange?.({ optionA: e.target.value })}
            className="nodrag w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-300/70"
            placeholder="Option A"
          />
          <div className="mt-0.5 text-[10px] text-gray-500 truncate">Connect left dot</div>
        </div>
        <div className="rounded-xl bg-white border border-gray-300 px-2 py-2">
          <input
            value={optionB}
            onChange={(e) => data?.onTemplateChange?.({ optionB: e.target.value })}
            className="nodrag w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-300/70"
            placeholder="Option B"
          />
          <div className="mt-0.5 text-[10px] text-gray-500 truncate">Connect right dot</div>
        </div>
      </div>

      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-sky-600" />
      <Handle type="source" position={Position.Left} id="optionA" className="!w-3 !h-3 !bg-sky-500 !border-2 !border-white shadow" />
      <Handle type="source" position={Position.Right} id="optionB" className="!w-3 !h-3 !bg-sky-500 !border-2 !border-white shadow" />
    </div>
  );
}

function nodeDataDefaults(type) {
  switch (type) {
    case "start":
      return {
        keywords: "",
        regexEnabled: false,
        regex: "",
        templateName: "",
        templateId: null,
      };
    case "text":
      return { text: "Hello! How can I help you?" };
    case "image":
      return { imageUrl: "" };
    case "question":
      return { question: "Choose an option:", options: "YES, NO" };
    case "button":
      return { text: "Select a button:", buttons: "Option A, Option B" };
    case "template":
      return {
        question: "Choose an option:",
        optionA: "YES",
        optionB: "NO",
        options: "YES, NO",
      };
    case "list_message":
      return {
        title: "Choose an option",
        items: "Item 1, Item 2, Item 3",
      };
    case "multi_product":
      return {
        title: "Top Picks For You",
        products: "Product A, Product B, Product C, Product D",
      };
    default:
      return {};
  }
}

function sanitizeNodesForSave(nodes) {
  return nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: { x: n.position?.x || 0, y: n.position?.y || 0 },
    data: Object.fromEntries(
      Object.entries(n.data || {}).filter(([, value]) => typeof value !== "function")
    ),
  }));
}

function sanitizeEdgesForSave(edges) {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label || e.data?.label || "",
    data: e.data || {},
  }));
}

function Flows() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  const flowWrapperRef = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);

  const initialNodes = useMemo(
    () => [
      {
        id: "start",
        type: "start",
        position: { x: 240, y: 80 },
        data: nodeDataDefaults("start"),
      },
    ],
    []
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) || null, [nodes, selectedNodeId]);
  const selectedEdge = useMemo(() => edges.find((e) => e.id === selectedEdgeId) || null, [edges, selectedEdgeId]);

  const [connectStart, setConnectStart] = useState(null);
  const [insertModalOpen, setInsertModalOpen] = useState(false);
  const [pendingInsert, setPendingInsert] = useState(null); // { sourceNodeId, sourceHandleId, position }

  const [flowName, setFlowName] = useState("My Flow");
  const [savedFlowId, setSavedFlowId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loadingSavedFlow, setLoadingSavedFlow] = useState(false);
  const [flowLoadId, setFlowLoadId] = useState("");
  const [savedFlowsList, setSavedFlowsList] = useState([]);
  const [loadingFlowsList, setLoadingFlowsList] = useState(false);

  const [testStarted, setTestStarted] = useState(false);
  const [testInput, setTestInput] = useState("");
  const [executionCurrentNodeId, setExecutionCurrentNodeId] = useState(null);
  const [executionLog, setExecutionLog] = useState([]);
  const [executing, setExecuting] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [templatePickerLoading, setTemplatePickerLoading] = useState(false);
  const [templatePickerSearch, setTemplatePickerSearch] = useState("");
  const [approvedTemplates, setApprovedTemplates] = useState([]);
  const [templatePickerNodeId, setTemplatePickerNodeId] = useState("start");
  const [templatePreview, setTemplatePreview] = useState(null);

  const nodeTypes = useMemo(
    () => ({
      start: StartNode,
      text: TextNode,
      image: ImageNode,
      question: QuestionNode,
      button: ButtonNode,
      list_message: ListMessageNode,
      multi_product: MultiProductNode,
      template: TemplateNode,
    }),
    []
  );

  const displayNodes = useMemo(
    () =>
      nodes.map((n) =>
        n.type === "start"
          ? {
              ...n,
              data: {
                ...(n.data || {}),
                onChooseTemplate: () => {
                  setTemplatePickerNodeId(n.id);
                  setTemplatePickerOpen(true);
                },
                onDeleteTemplate: () => {
                  setNodes((nds) =>
                    nds.map((node) =>
                      node.id === n.id
                        ? {
                            ...node,
                            data: {
                              ...(node.data || {}),
                              templateId: null,
                              templateName: "",
                              templateContent: "",
                              templateButtons: [],
                            },
                          }
                        : node
                    )
                  );
                },
              },
            }
          : n.type === "template"
          ? {
              ...n,
              data: {
                ...(n.data || {}),
                onTemplateChange: (patch) => {
                  setNodes((nds) =>
                    nds.map((node) => {
                      if (node.id !== n.id) return node;
                      const nextData = { ...(node.data || {}), ...(patch || {}) };
                      const a = String(nextData.optionA || "YES").trim();
                      const b = String(nextData.optionB || "NO").trim();
                      nextData.options = `${a}, ${b}`;
                      return { ...node, data: nextData };
                    })
                  );
                },
              },
            }
          : n
      ),
    [nodes, setNodes]
  );

  useEffect(() => {
    const check = async () => {
      try {
        if (!isAuthenticated()) {
          navigate("/login");
          return;
        }
        const userData = await getProfile();
        setUser(userData);
      } catch (e) {
        logout();
        navigate("/login");
      } finally {
        setLoading(false);
      }
    };
    check();
  }, [navigate]);


  const fetchSavedFlowsList = useCallback(async () => {
    setLoadingFlowsList(true);
    try {
      const resp = await axios.get("/flows");
      if (resp?.data?.success && Array.isArray(resp.data.flows)) {
        const uniqueByName = [];
        const seenNames = new Set();
        for (const flow of resp.data.flows) {
          const key = String(flow?.name || "").trim().toLowerCase();
          if (!key || seenNames.has(key)) continue;
          seenNames.add(key);
          uniqueByName.push(flow);
        }
        setSavedFlowsList(uniqueByName);
      }
    } finally {
      setLoadingFlowsList(false);
    }
  }, []);

  const fetchApprovedTemplates = useCallback(async () => {
    setTemplatePickerLoading(true);
    try {
      const resp = await axios.get("/templates", {
        params: { status: "approved", page: 1, limit: 200 },
      });
      if (resp?.data?.success) {
        setApprovedTemplates(resp.data.templates || []);
      } else {
        setApprovedTemplates([]);
      }
    } finally {
      setTemplatePickerLoading(false);
    }
  }, []);

  useEffect(() => {
    if (templatePickerOpen) {
      fetchApprovedTemplates();
    }
  }, [templatePickerOpen, fetchApprovedTemplates]);

  const filteredApprovedTemplates = useMemo(() => {
    const q = String(templatePickerSearch || "").trim().toLowerCase();
    if (!q) return approvedTemplates;
    return approvedTemplates.filter((t) =>
      String(t?.name || "").toLowerCase().includes(q)
    );
  }, [approvedTemplates, templatePickerSearch]);

  const applyStartTemplateSelection = useCallback(
    (template) => {
      const nodeId = templatePickerNodeId || "start";
      const templateButtons = getTemplateButtons(template);
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? {
                ...n,
                data: {
                  ...(n.data || {}),
                  templateId: template?.id || null,
                  templateName: template?.name || "",
                  templateContent: getTemplateBodyText(template),
                  templateButtons,
                },
              }
            : n
        )
      );
      setTemplatePickerOpen(false);
      setTemplatePickerSearch("");
    },
    [templatePickerNodeId, setNodes]
  );

  useEffect(() => {
    if (!loading) fetchSavedFlowsList();
  }, [loading, fetchSavedFlowsList]);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      if (!reactFlowInstance) return;
      const type = event.dataTransfer.getData("application/reactflow");
      if (!type) return;

      const bounds = flowWrapperRef.current?.getBoundingClientRect();
      if (!bounds) return;

      const position = reactFlowInstance.project({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      const newNodeId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      setNodes((nds) =>
        nds.concat({
          id: newNodeId,
          type,
          position,
          data: nodeDataDefaults(type),
        })
      );
    },
    [reactFlowInstance, setNodes]
  );

  const getSourceOptionLabelForHandle = useCallback(
    (sourceNode, handleId) => {
      if (!sourceNode) return "";
      if (sourceNode.type === "template") {
        if (handleId === "optionA") return sourceNode.data?.optionA || "Option A";
        if (handleId === "optionB") return sourceNode.data?.optionB || "Option B";
      }
      if (sourceNode.type === "question") {
        const options = String(sourceNode.data?.options || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        if (handleId === "optionA") return options[0] || "Option A";
        if (handleId === "optionB") return options[1] || "Option B";
      }
      return "";
    },
    []
  );

  const onConnect = useCallback(
    (params) => {
      const sourceNode = nodes.find((n) => n.id === params?.source) || null;
      const defaultLabel = getSourceOptionLabelForHandle(sourceNode, params?.sourceHandle);

      setEdges((eds) =>
        addEdge(
          {
            ...params,
            label: defaultLabel || "",
            data: { ...(params.data || {}), label: defaultLabel || "" },
          },
          eds
        )
      );
    },
    [getSourceOptionLabelForHandle, nodes, setEdges]
  );

  const onConnectStart = useCallback((event, params) => {
    const nodeId = params?.nodeId || null;
    const handleId = params?.handleId || null;
    setConnectStart({ nodeId, handleId });
  }, []);

  const onConnectEnd = useCallback(
    (event) => {
      if (!connectStart?.nodeId) {
        setConnectStart(null);
        return;
      }

      const overNode = event?.target?.closest?.(".react-flow__node");
      if (overNode) {
        setConnectStart(null);
        return;
      }

      if (!reactFlowInstance || !flowWrapperRef.current) {
        setConnectStart(null);
        return;
      }

      const sourceNode = nodes.find((n) => n.id === connectStart.nodeId) || null;
      if (!sourceNode) {
        setConnectStart(null);
        return;
      }

      const bounds = flowWrapperRef.current.getBoundingClientRect();
      const position = reactFlowInstance.project({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });
      const panelWidth = 280;
      const panelHeight = 360;
      const sx = Math.min(Math.max((event.clientX || 0) + 12, 8), (window.innerWidth || 1200) - panelWidth - 8);
      const sy = Math.min(Math.max((event.clientY || 0) + 12, 8), (window.innerHeight || 800) - panelHeight - 8);

      setPendingInsert({
        sourceNodeId: connectStart.nodeId,
        sourceHandleId: connectStart.handleId,
        position,
        screenPosition: { x: sx, y: sy },
      });
      setInsertModalOpen(true);
      setConnectStart(null);
    },
    [connectStart, reactFlowInstance, nodes]
  );

  const handleInsertNodeType = useCallback(
    (type) => {
      if (!pendingInsert) return;
      const sourceNode = nodes.find((n) => n.id === pendingInsert.sourceNodeId) || null;

      const newNodeId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const position = pendingInsert.position || { x: 0, y: 0 };

      setNodes((nds) =>
        nds.concat({
          id: newNodeId,
          type,
          position,
          data: nodeDataDefaults(type),
        })
      );

      const edgeLabel = getSourceOptionLabelForHandle(sourceNode, pendingInsert.sourceHandleId);

      setEdges((eds) =>
        addEdge(
          {
            source: pendingInsert.sourceNodeId,
            target: newNodeId,
            sourceHandle: pendingInsert.sourceHandleId,
            label: edgeLabel || "",
            data: { label: edgeLabel || "" },
          },
          eds
        )
      );

      setSelectedNodeId(newNodeId);
      setSelectedEdgeId(null);
      setPendingInsert(null);
      setInsertModalOpen(false);
      setConnectStart(null);
    },
    [
      pendingInsert,
      nodes,
      setNodes,
      setEdges,
      getSourceOptionLabelForHandle,
      setSelectedNodeId,
      setSelectedEdgeId,
    ]
  );

  const onNodeClick = useCallback((event, node) => {
    event.stopPropagation();
    setSelectedEdgeId(null);
    setSelectedNodeId(node.id);
  }, []);

  const onEdgeClick = useCallback((event, edge) => {
    event.stopPropagation();
    setSelectedNodeId(null);
    setSelectedEdgeId(edge.id);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, []);

  const deleteSelectedNode = useCallback(() => {
    if (!selectedNodeId) return;

    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) =>
      eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId)
    );
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, [selectedNodeId, setEdges, setNodes]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!selectedNodeId) return;
      const tag = event.target?.tagName?.toLowerCase?.() || "";
      const isTypingField =
        tag === "input" ||
        tag === "textarea" ||
        event.target?.isContentEditable === true;
      if (isTypingField) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelectedNode();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedNodeId, deleteSelectedNode]);

  const updateSelectedNodeData = useCallback(
    (patch) => {
      if (!selectedNodeId) return;
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== selectedNodeId) return n;
          return { ...n, data: { ...(n.data || {}), ...patch } };
        })
      );
    },
    [selectedNodeId, setNodes]
  );

  const updateSelectedEdgeLabel = useCallback(
    (label) => {
      if (!selectedEdgeId) return;
      setEdges((eds) =>
        eds.map((e) => {
          if (e.id !== selectedEdgeId) return e;
          return { ...e, label, data: { ...(e.data || {}), label } };
        })
      );
    },
    [selectedEdgeId, setEdges]
  );

  const palette = useMemo(
    () => [
      { type: "start", label: "Start" },
      { type: "template", label: "Template" },
      { type: "text", label: "Text" },
      { type: "image", label: "Image" },
      { type: "question", label: "Question" },
      { type: "button", label: "Buttons" },
    ],
    []
  );

  const contentBlockOptions = useMemo(
    () => [
      { key: "text_button", label: "Text + Button", nodeType: "button", icon: "💬" },
      { key: "media", label: "Media", nodeType: "image", icon: "🖼️" },
      { key: "list_message", label: "List Message", nodeType: "list_message", icon: "📋" },
      { key: "single_product", label: "Single Product Message", nodeType: "text", icon: "🛒" },
      { key: "multi_product", label: "Multi Product Message", nodeType: "multi_product", icon: "🧺" },
      { key: "template", label: "Template", nodeType: "template", icon: "📄" },
      { key: "ask_question", label: "Ask Question", nodeType: "question", icon: "❓" },
      { key: "set_attribute", label: "Set Attribute", nodeType: "text", icon: "🧾" },
    ],
    []
  );

  const handleSaveFlow = useCallback(async () => {
    setSaving(true);
    try {
      const payload = {
        name: String(flowName || "Untitled").trim() || "Untitled",
        data: {
          nodes: sanitizeNodesForSave(nodes),
          edges: sanitizeEdgesForSave(edges),
        },
      };

      const resp = await axios.post("/flows", payload);
      if (resp?.data?.success) {
        setSavedFlowId(resp.data.flow?.id || resp.data.flowId || null);
        fetchSavedFlowsList();
      }
    } finally {
      setSaving(false);
    }
  }, [flowName, nodes, edges, fetchSavedFlowsList]);

  const loadFlowById = useCallback(
    async (id) => {
      const fid = String(id || "").trim();
      if (!fid) return;

      setLoadingSavedFlow(true);
      try {
        const resp = await axios.get(`/flows/${fid}`);
        if (resp?.data?.success && resp?.data?.flow?.data) {
          const loaded = resp.data.flow.data;
          setNodes(
            (loaded.nodes || []).map((n) => ({
              id: n.id,
              type: n.type,
              position: n.position || { x: 0, y: 0 },
              data: n.data || {},
            }))
          );
          setEdges(
            (loaded.edges || []).map((e) => ({
              id: e.id,
              source: e.source,
              target: e.target,
              label: e.label || e.data?.label || "",
              data: e.data || {},
            }))
          );

          setSavedFlowId(resp.data.flow.id);
          setFlowName(resp.data.flow.name || "My Flow");
          setFlowLoadId(String(resp.data.flow.id));
          setTestStarted(false);
          setExecutionCurrentNodeId(null);
          setExecutionLog([]);
        }
      } finally {
        setLoadingSavedFlow(false);
      }
    },
    [setEdges, setNodes]
  );

  const handleLoadFlow = useCallback(() => {
    loadFlowById(flowLoadId);
  }, [flowLoadId, loadFlowById]);

  const handleCreateNewFlow = useCallback(() => {
    setNodes([
      {
        id: "start",
        type: "start",
        position: { x: 240, y: 80 },
        data: nodeDataDefaults("start"),
      },
    ]);
    setEdges([]);
    setFlowName("My Flow");
    setSavedFlowId(null);
    setFlowLoadId("");
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setTestStarted(false);
    setExecutionCurrentNodeId(null);
    setExecutionLog([]);
    setTestInput("");
  }, [setEdges, setNodes]);

  const handleExecuteTest = useCallback(async () => {
    if (!savedFlowId) return;
    setExecuting(true);
    try {
      const resp = await axios.post(`/flows/${savedFlowId}/execute`, {
        userInput: testStarted ? String(testInput || "") : "",
        currentNodeId: testStarted ? executionCurrentNodeId : null,
      });

      if (resp?.data?.success) {
        const output = resp.data.output || [];
        setExecutionLog((prev) => prev.concat(output));

        setExecutionCurrentNodeId(resp.data.done ? null : resp.data.nextNodeId || null);
        setTestStarted(true);
        setTestInput("");
      }
    } finally {
      setExecuting(false);
    }
  }, [savedFlowId, testInput, testStarted, executionCurrentNodeId]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600" />
      </div>
    );
  }

  const userName = user?.name || "User";
  const userInitial = userName.charAt(0).toUpperCase();

  return (
    <>
      <div className="h-screen flex flex-row bg-gray-50 overflow-hidden">
      <aside className="bg-sky-950 text-white border-r border-sky-900 w-20 shrink-0 h-full flex flex-col overflow-hidden">
        <MainSidebarNav />
      </aside>

      <div className="flex-1 min-h-0 flex flex-col">
        <header className="motion-header-enter shrink-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-4 md:px-8 py-3.5 md:py-4 flex items-center justify-between gap-3 shadow-sm shadow-gray-200/50">
          <div className="min-w-0 flex items-center gap-4">
            <div
              className="flex items-center gap-3 transition-all duration-300 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] shrink-0 cursor-pointer"
              onClick={() => navigate("/dashboard")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") navigate("/dashboard");
              }}
            >
              <div className="w-10 h-10 bg-gradient-to-br from-sky-500 via-sky-600 to-blue-900 rounded-xl flex items-center justify-center shadow-lg shadow-sky-500/30 ring-2 ring-white">
                <span className="text-white font-bold text-lg">W</span>
              </div>
              <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent hidden sm:block">
                Waabizx
              </h1>
            </div>
            <span className="text-gray-300 hidden md:block shrink-0">|</span>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-sky-700 tracking-tight">Flows</h2>
              <p className="text-xs md:text-sm text-gray-500 truncate">Drag nodes, connect lines, configure, then save and execute.</p>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            <div className="hidden md:flex items-center gap-2">
              <button
                type="button"
                onClick={handleCreateNewFlow}
                className="px-3 py-2 rounded-xl bg-white/80 border border-gray-200/80 text-gray-700 text-sm font-semibold hover:bg-white transition-all duration-200"
              >
                New Flow
              </button>
              <input
                value={flowName}
                onChange={(e) => setFlowName(e.target.value)}
                className="w-44 px-3 py-2 rounded-xl border border-gray-200/80 bg-white/70 focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm"
                placeholder="Flow name"
              />
              <button
                type="button"
                onClick={handleSaveFlow}
                disabled={saving}
                className="px-3 py-2 rounded-xl bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 text-white text-sm font-semibold shadow-md shadow-sky-500/25 hover:shadow-lg disabled:opacity-60 transition-all duration-200"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                value={flowLoadId}
                onChange={(e) => setFlowLoadId(e.target.value)}
                className="w-28 md:w-36 px-3 py-2 rounded-xl border border-gray-200/80 bg-white/70 focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm"
                placeholder="Flow ID"
              />
              <button
                type="button"
                onClick={handleLoadFlow}
                disabled={loadingSavedFlow}
                className="px-3 py-2 rounded-xl bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 text-white text-sm font-semibold shadow-md shadow-sky-500/25 hover:shadow-lg disabled:opacity-60 transition-all duration-200"
              >
                {loadingSavedFlow ? "Loading..." : "Load"}
              </button>
            </div>
            <button
              type="button"
              onClick={() => navigate("/settings")}
              className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 flex items-center justify-center cursor-pointer shadow-md shadow-sky-500/35 hover:shadow-lg hover:ring-2 ring-sky-300/60 hover:scale-[1.03] transition-all duration-200 focus:outline-none"
            >
              <span className="text-white font-semibold text-sm">{userInitial}</span>
            </button>
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-hidden bg-gradient-to-b from-sky-50/50 via-white to-sky-100/30">
          <div className="flex flex-row h-full min-h-0">
            {/* Palette (left) */}
            <aside className="w-72 shrink-0 border-r border-gray-200/70 bg-white/60 backdrop-blur-sm p-3 flex flex-col min-h-0">
              <div className="pb-3 bg-white/60 backdrop-blur-sm">
                <div className="text-xs font-bold uppercase tracking-wider text-sky-700/80">Node Types</div>
                <div className="mt-1 text-xs text-gray-500">
                  Drag a type into the canvas. Connect lines using node handles.
                </div>
              </div>

              <div className="mt-3 flex-1 min-h-0 overflow-y-auto pr-1">
                <div className="space-y-2">
                  {palette.map((item) => (
                    <div
                      key={item.type}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("application/reactflow", item.type);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      className="select-none cursor-grab p-3 rounded-2xl border border-gray-100/80 bg-white/90 hover:border-sky-200/70 hover:shadow-sm transition-all duration-200"
                      title={`Drag to canvas: ${item.label}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-bold text-gray-900">{item.label}</div>
                        <span className="text-[11px] font-bold uppercase tracking-wide text-sky-700/80">Drag</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 p-3 rounded-2xl border border-gray-100/80 bg-gradient-to-br from-white to-sky-50/20">
                  <div className="text-xs font-bold uppercase tracking-wide text-sky-800/80">Tip</div>
                  <p className="mt-1 text-xs text-gray-600 leading-relaxed">
                    For <span className="font-semibold">Question</span> nodes, set <span className="font-semibold">Options</span>, then label the edges with option text.
                  </p>
                </div>

                <div className="mt-5 border-t border-gray-200/70 pt-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-bold uppercase tracking-wider text-sky-700/80">Your flows</div>
                    <button
                      type="button"
                      onClick={fetchSavedFlowsList}
                      disabled={loadingFlowsList}
                      className="text-[11px] font-bold text-sky-700 hover:text-sky-800 disabled:opacity-50"
                    >
                      {loadingFlowsList ? "…" : "Refresh"}
                    </button>
                  </div>
                  <div className="mt-2 max-h-48 overflow-y-auto space-y-2">
                    {loadingFlowsList && savedFlowsList.length === 0 ? (
                      <div className="text-xs text-gray-500 py-2">Loading…</div>
                    ) : null}
                    {!loadingFlowsList && savedFlowsList.length === 0 ? (
                      <div className="text-xs text-gray-500 leading-relaxed py-1">No saved flows yet. Save one to see it here.</div>
                    ) : null}
                    {savedFlowsList.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => loadFlowById(f.id)}
                        disabled={loadingSavedFlow}
                        className="w-full text-left p-3 rounded-2xl border border-gray-100/80 bg-white/90 hover:border-sky-200/70 hover:shadow-sm transition-all duration-200 disabled:opacity-60"
                      >
                        <div className="text-sm font-bold text-gray-900 truncate">{f.name || "Untitled Flow"}</div>
                        {f.updatedAt ? (
                          <div className="mt-1 text-[10px] text-gray-400">
                            {new Date(f.updatedAt).toLocaleString()}
                          </div>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </aside>

            {/* Canvas (center) */}
            <main
              className="flex-1 min-w-0 min-h-0 relative"
              ref={flowWrapperRef}
              onDrop={onDrop}
              onDragOver={onDragOver}
            >
              <ReactFlow
                nodes={displayNodes}
                edges={edges}
                nodeTypes={nodeTypes}
                defaultEdgeOptions={{
                  type: "smoothstep",
                  animated: true,
                  style: { stroke: "#0284c7", strokeWidth: 2 },
                }}
                connectionLineStyle={{ stroke: "#0ea5e9", strokeWidth: 2 }}
                connectionLineType="smoothstep"
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                  onConnectStart={onConnectStart}
                  onConnectEnd={onConnectEnd}
                onNodeClick={onNodeClick}
                onEdgeClick={onEdgeClick}
                onPaneClick={clearSelection}
                onInit={setReactFlowInstance}
                fitView
                fitViewOptions={{ padding: 0.2 }}
              >
                <Background gap={18} size={1} color="#e2e8f0" />
                <Controls />
                <MiniMap
                  nodeColor={(n) => {
                    if (n.type === "question") return "#0ea5e9";
                    if (n.type === "template") return "#0284c7";
                    return "#94a3b8";
                  }}
                />
              </ReactFlow>
            </main>

            {/* Config (right) */}
            <aside className="w-64 shrink-0 border-l border-gray-200/70 bg-white/60 backdrop-blur-sm p-3 overflow-y-auto">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-sky-700/80">Configuration</div>
                  <div className="mt-1 text-xs text-gray-500">Edit selected node/edge.</div>
                </div>
                {savedFlowId ? (
                  <span className="inline-flex items-center rounded-full bg-sky-50 text-sky-800 px-2 py-1 text-[11px] font-bold ring-1 ring-sky-100/60">
                    Flow ID: {savedFlowId}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-gray-50 text-gray-700 px-2 py-1 text-[11px] font-bold ring-1 ring-gray-200/70">
                    Not saved
                  </span>
                )}
              </div>

              <div className="mt-4 space-y-3">
                {selectedNode ? (
                  <div className="rounded-2xl border border-gray-100/80 bg-white/90 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Selected Node</div>
                        <div className="mt-1 text-sm font-bold text-gray-900 capitalize">{selectedNode.type}</div>
                      </div>
                      <button
                        type="button"
                        onClick={deleteSelectedNode}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 text-xs font-bold ring-1 ring-rose-200/70 hover:bg-rose-100 transition-all duration-200"
                      >
                        Delete
                      </button>
                    </div>

                    <div className="mt-3 space-y-2">
                      {selectedNode.type === "start" ? (
                        <div className="space-y-2">
                          <div>
                            <label className="text-xs font-semibold text-gray-600">Keywords</label>
                            <input
                              value={selectedNode.data?.keywords || ""}
                              onChange={(e) => updateSelectedNodeData({ keywords: e.target.value })}
                              className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200/80 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm"
                              placeholder="keyword1, keyword2"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-gray-600">Regex</label>
                            <input
                              value={selectedNode.data?.regex || ""}
                              onChange={(e) => updateSelectedNodeData({ regex: e.target.value })}
                              className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200/80 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm"
                              placeholder="Enter Regex"
                            />
                          </div>
                          <label className="flex items-center gap-2 text-xs text-gray-700">
                            <input
                              type="checkbox"
                              checked={!!selectedNode.data?.regexEnabled}
                              onChange={(e) => updateSelectedNodeData({ regexEnabled: e.target.checked })}
                            />
                            Enable regex matching
                          </label>
                          <div>
                            <label className="text-xs font-semibold text-gray-600">Template</label>
                            <div className="mt-1 flex items-center gap-2">
                              <input
                                value={selectedNode.data?.templateName || ""}
                                readOnly
                                className="flex-1 px-3 py-2 rounded-xl border border-gray-200/80 bg-gray-50 text-sm"
                                placeholder="No template selected"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setTemplatePickerNodeId(selectedNode.id);
                                  setTemplatePickerOpen(true);
                                }}
                                className="px-3 py-2 rounded-xl border border-gray-200/80 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
                              >
                                Choose
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {selectedNode.type === "template" ? (
                        <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-2">
                          <div className="text-xs text-sky-800 leading-relaxed">
                            Edit template text directly inside the template node on canvas.
                          </div>
                        </div>
                      ) : null}

                      {selectedNode.type === "text" ? (
                        <div>
                          <label className="text-xs font-semibold text-gray-600">Text</label>
                          <textarea
                            value={selectedNode.data?.text || ""}
                            onChange={(e) => updateSelectedNodeData({ text: e.target.value })}
                            className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200/80 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm min-h-[86px]"
                          />
                        </div>
                      ) : null}

                      {selectedNode.type === "image" ? (
                        <div>
                          <label className="text-xs font-semibold text-gray-600">Image URL</label>
                          <input
                            value={selectedNode.data?.imageUrl || ""}
                            onChange={(e) => updateSelectedNodeData({ imageUrl: e.target.value })}
                            className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200/80 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm"
                            placeholder="https://... or /uploads/..."
                          />
                          {selectedNode.data?.imageUrl ? (
                            <div className="mt-2 rounded-xl overflow-hidden border border-gray-100/80 bg-white">
                              <img src={selectedNode.data.imageUrl} alt="preview" className="w-full h-28 object-cover" />
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {selectedNode.type === "question" ? (
                        <div>
                          <label className="text-xs font-semibold text-gray-600">Question</label>
                          <textarea
                            value={selectedNode.data?.question || ""}
                            onChange={(e) => updateSelectedNodeData({ question: e.target.value })}
                            className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200/80 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm min-h-[72px]"
                          />
                          <div className="mt-2">
                            <label className="text-xs font-semibold text-gray-600">Options (comma separated)</label>
                            <input
                              value={selectedNode.data?.options || ""}
                              onChange={(e) => updateSelectedNodeData({ options: e.target.value })}
                              className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200/80 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm"
                              placeholder="YES, NO"
                            />
                          </div>
                        </div>
                      ) : null}

                      {selectedNode.type === "button" ? (
                        <div>
                          <label className="text-xs font-semibold text-gray-600">Text</label>
                          <input
                            value={selectedNode.data?.text || ""}
                            onChange={(e) => updateSelectedNodeData({ text: e.target.value })}
                            className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200/80 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm"
                          />
                          <div className="mt-2">
                            <label className="text-xs font-semibold text-gray-600">Buttons (comma separated)</label>
                            <input
                              value={selectedNode.data?.buttons || ""}
                              onChange={(e) => updateSelectedNodeData({ buttons: e.target.value })}
                              className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200/80 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm"
                              placeholder="Option A, Option B"
                            />
                          </div>
                        </div>
                      ) : null}

                      {selectedNode.type === "list_message" ? (
                        <div>
                          <label className="text-xs font-semibold text-gray-600">List title</label>
                          <input
                            value={selectedNode.data?.title || ""}
                            onChange={(e) => updateSelectedNodeData({ title: e.target.value })}
                            className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200/80 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm"
                          />
                          <div className="mt-2">
                            <label className="text-xs font-semibold text-gray-600">Items (comma separated)</label>
                            <input
                              value={selectedNode.data?.items || ""}
                              onChange={(e) => updateSelectedNodeData({ items: e.target.value })}
                              className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200/80 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm"
                              placeholder="Item 1, Item 2, Item 3"
                            />
                          </div>
                        </div>
                      ) : null}

                      {selectedNode.type === "multi_product" ? (
                        <div>
                          <label className="text-xs font-semibold text-gray-600">Section title</label>
                          <input
                            value={selectedNode.data?.title || ""}
                            onChange={(e) => updateSelectedNodeData({ title: e.target.value })}
                            className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200/80 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm"
                          />
                          <div className="mt-2">
                            <label className="text-xs font-semibold text-gray-600">Products (comma separated)</label>
                            <input
                              value={selectedNode.data?.products || ""}
                              onChange={(e) => updateSelectedNodeData({ products: e.target.value })}
                              className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200/80 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm"
                              placeholder="Product A, Product B, Product C"
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {selectedEdge ? (
                  <div className="rounded-2xl border border-gray-100/80 bg-white/90 p-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Selected Edge</div>
                    <div className="mt-1 text-sm font-bold text-gray-900">Condition / Option label</div>

                    <div className="mt-3">
                      <label className="text-xs font-semibold text-gray-600">Label</label>
                      <input
                        value={selectedEdge.label || selectedEdge.data?.label || ""}
                        onChange={(e) => updateSelectedEdgeLabel(e.target.value)}
                        className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200/80 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm"
                        placeholder="YES / NO / Option A"
                      />
                    </div>
                    <div className="mt-2 text-xs text-gray-600 leading-relaxed">
                      This label will be matched when the flow reaches a <span className="font-semibold">Question</span> / <span className="font-semibold">Template</span> node.
                    </div>
                  </div>
                ) : null}

                {!selectedNode && !selectedEdge ? (
                  <div className="rounded-2xl border border-gray-100/80 bg-white/90 p-3">
                    <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Nothing selected</div>
                    <p className="mt-2 text-xs text-gray-600 leading-relaxed">
                      Click a node to configure it, or click an edge to label the connection.
                    </p>
                  </div>
                ) : null}

                {/* Execute Test */}
                <div className="rounded-2xl border border-gray-100/80 bg-gradient-to-br from-white to-sky-50/30 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-sky-800/80">Flow Execution</div>
                      <div className="mt-1 text-xs text-gray-600">
                        {testStarted ? "Answer the question" : "Start from the beginning"}
                      </div>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-white/80 px-2 py-1 text-[11px] font-bold ring-1 ring-gray-200/80 text-gray-700">
                      {executionCurrentNodeId ? `at ${executionCurrentNodeId}` : "start"}
                    </span>
                  </div>

                  <div className="mt-3">
                    <label className="text-xs font-semibold text-gray-600">
                      {testStarted ? "Your input (match edge label)" : "Auto-start"}
                    </label>
                    <input
                      value={testInput}
                      onChange={(e) => setTestInput(e.target.value)}
                      disabled={!testStarted}
                      className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200/80 bg-white disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm"
                      placeholder={testStarted ? "Type YES / NO" : "Click Run to start"}
                    />
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleExecuteTest}
                      disabled={!savedFlowId || executing}
                      className="flex-1 px-3 py-2 rounded-xl bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 text-white text-sm font-semibold shadow-md shadow-sky-500/25 hover:shadow-lg disabled:opacity-60 transition-all duration-200"
                    >
                      {executing ? "Running..." : testStarted ? "Run (answer)" : "Run (start)"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTestStarted(false);
                        setExecutionCurrentNodeId(null);
                        setExecutionLog([]);
                        setTestInput("");
                      }}
                      className="px-3 py-2 rounded-xl bg-white/70 border border-gray-200/80 text-sm font-semibold text-gray-700 hover:bg-white disabled:opacity-60 transition-all duration-200"
                    >
                      Reset
                    </button>
                  </div>

                  <div className="mt-3 space-y-2">
                    {executionLog.length === 0 ? (
                      <div className="text-xs text-gray-600 leading-relaxed">No outputs yet. Click “Run (start)”.</div>
                    ) : null}
                    {executionLog.slice(-8).map((item, idx) => {
                      const key = `${idx}-${item?.type || "out"}`;
                      if (item.type === "text") {
                        return (
                          <div key={key} className="rounded-xl border border-sky-100 bg-white/90 p-3">
                            <div className="text-xs font-bold uppercase tracking-wide text-sky-800/80">Text</div>
                            <div className="mt-1 text-sm font-semibold text-gray-900">{item.text || ""}</div>
                          </div>
                        );
                      }
                      if (item.type === "image") {
                        return (
                          <div key={key} className="rounded-xl border border-sky-100 bg-white/90 p-3">
                            <div className="text-xs font-bold uppercase tracking-wide text-sky-800/80">Image</div>
                            {item.imageUrl ? <img src={item.imageUrl} alt="flow output" className="mt-2 w-full h-28 object-cover rounded-lg border border-gray-100" /> : null}
                            <div className="mt-1 text-xs text-gray-600 truncate">{item.imageUrl || ""}</div>
                          </div>
                        );
                      }
                      if (item.type === "question") {
                        return (
                          <div key={key} className="rounded-xl border border-sky-100 bg-white/90 p-3">
                            <div className="text-xs font-bold uppercase tracking-wide text-sky-800/80">Question</div>
                            <div className="mt-1 text-sm font-semibold text-gray-900">{item.question || ""}</div>
                            {Array.isArray(item.options) && item.options.length > 0 ? (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {item.options.slice(0, 6).map((opt) => (
                                  <span key={opt} className="inline-flex items-center rounded-full bg-sky-50 text-sky-800 px-2 py-0.5 text-[11px] font-bold ring-1 ring-sky-100/60">
                                    {opt}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      }
                      if (item.type === "button") {
                        return (
                          <div key={key} className="rounded-xl border border-sky-100 bg-white/90 p-3">
                            <div className="text-xs font-bold uppercase tracking-wide text-sky-800/80">Buttons</div>
                            <div className="mt-1 text-sm font-semibold text-gray-900">{item.text || ""}</div>
                            {Array.isArray(item.buttons) && item.buttons.length > 0 ? (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {item.buttons.slice(0, 6).map((b) => (
                                  <span key={b} className="inline-flex items-center rounded-lg bg-sky-50 text-sky-800 px-2 py-0.5 text-[11px] font-bold ring-1 ring-sky-100/60">
                                    {b}
                                  </span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      }

                      return (
                        <div key={key} className="rounded-xl border border-gray-200 bg-white/90 p-3">
                          <div className="text-xs font-bold uppercase tracking-wide text-gray-500">{item?.type || "Output"}</div>
                          <div className="mt-1 text-sm text-gray-800">{item?.text || item?.question || ""}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
    {insertModalOpen && pendingInsert ? (
      <div
        className="fixed inset-0 z-[1400]"
        onClick={() => {
          setInsertModalOpen(false);
          setPendingInsert(null);
          setConnectStart(null);
        }}
      >
        <div
          className="absolute w-[280px] rounded-2xl border border-sky-200/70 bg-white/95 backdrop-blur-md shadow-xl shadow-sky-100/60 p-3 pointer-events-auto"
          style={{
            left: `${pendingInsert.screenPosition?.x ?? 16}px`,
            top: `${pendingInsert.screenPosition?.y ?? 16}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-bold text-gray-900">Content Block</div>
            </div>
            <button
              type="button"
              onClick={() => {
                setInsertModalOpen(false);
                setPendingInsert(null);
                setConnectStart(null);
              }}
              className="w-9 h-9 rounded-full bg-white/80 ring-1 ring-gray-200/80 hover:bg-white transition-all duration-200 text-gray-700 font-bold"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div className="mt-2 space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
            {contentBlockOptions.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => handleInsertNodeType(opt.nodeType)}
                className="w-full px-2.5 py-2 rounded-lg border border-gray-200/80 bg-white/90 hover:border-sky-200/70 hover:shadow-sm transition-all duration-200 text-left flex items-center gap-2"
              >
                <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-sky-50 text-sky-700 text-[11px]">
                  {opt.icon}
                </span>
                <span className="text-xs font-semibold text-gray-800">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    ) : null}
    {templatePickerOpen ? (
      <div className="fixed inset-0 z-[1500] bg-black/20 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-full max-w-4xl rounded-2xl border border-gray-200/80 bg-white/95 backdrop-blur-md shadow-lg p-4 md:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-lg font-semibold text-gray-900">Template Messages</div>
              <div className="mt-1 text-xs text-gray-500">Only approved templates are listed.</div>
            </div>
            <button
              type="button"
              onClick={() => {
                setTemplatePickerOpen(false);
                setTemplatePickerSearch("");
              }}
              className="w-9 h-9 rounded-full bg-white/80 ring-1 ring-gray-200/80 hover:bg-white transition-all duration-200 text-gray-700 font-bold"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <input
            value={templatePickerSearch}
            onChange={(e) => setTemplatePickerSearch(e.target.value)}
            placeholder="Search templates"
            className="mt-3 w-full max-w-sm px-3 py-2 rounded-xl border border-gray-200/80 bg-white/70 focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm"
          />
          <div className="mt-4 rounded-xl border border-gray-100 overflow-hidden">
            <div className="grid grid-cols-12 bg-slate-50 text-xs font-semibold text-slate-600 px-3 py-2">
              <div className="col-span-4">Name</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2">Type</div>
              <div className="col-span-3">Created At</div>
              <div className="col-span-1 text-right">Action</div>
            </div>
            <div className="max-h-[360px] overflow-y-auto divide-y divide-gray-100">
              {templatePickerLoading ? (
                <div className="px-3 py-6 text-sm text-gray-500">Loading templates...</div>
              ) : filteredApprovedTemplates.length === 0 ? (
                <div className="px-3 py-6 text-sm text-gray-500">No approved templates found.</div>
              ) : (
                filteredApprovedTemplates.map((t) => (
                  <div key={t.id || t.name} className="grid grid-cols-12 px-3 py-3 text-sm items-center">
                    <div className="col-span-4 text-gray-800 truncate">
                      <button
                        type="button"
                        className="w-full text-left truncate hover:underline"
                        onClick={() => {
                          setTemplatePreview(null);
                          applyStartTemplateSelection(t);
                        }}
                      >
                        {t.name}
                      </button>
                    </div>
                    <div className="col-span-2 text-emerald-600 font-semibold">{String(t.status || "APPROVED").toUpperCase()}</div>
                    <div className="col-span-2 text-gray-600 uppercase text-xs">{t.type || t.category || "TEXT"}</div>
                    <div className="col-span-3 text-gray-600 text-xs">{t.createdAt ? new Date(t.createdAt).toLocaleDateString() : "-"}</div>
                    <div className="col-span-1 text-right">
                      <button
                        type="button"
                        onClick={() => setTemplatePreview(t)}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
                        title="Preview template"
                      >
                        <span aria-hidden>👁</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    ) : null}
    {templatePreview ? (
      <div className="fixed inset-0 z-[1600] bg-black/30 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-full max-w-3xl rounded-xl border border-gray-300 bg-white shadow-xl p-4 md:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex items-center gap-2">
              <div className="text-2xl font-semibold text-gray-900 truncate">{templatePreview.name || "Template"}</div>
              <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[10px] font-bold uppercase">
                {String(templatePreview.status || "APPROVED")}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setTemplatePreview(null)}
              className="w-8 h-8 rounded-full hover:bg-gray-100 text-gray-600 text-xl leading-none"
              aria-label="Close preview"
            >
              ×
            </button>
          </div>
          <div className="mt-3 border-t border-gray-200 pt-4 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="text-3xl font-medium text-gray-800">Template Journey</div>
              <div className="mt-5 space-y-6">
                <div className="flex items-center gap-3">
                  <span className="h-9 w-9 rounded-full border border-gray-300 flex items-center justify-center text-gray-600">📄</span>
                  <div>
                    <span className="inline-flex rounded-lg bg-gray-100 px-3 py-1 text-sm font-semibold text-gray-700">Created</span>
                    <div className="mt-1 text-sm text-gray-500">
                      {templatePreview.createdAt ? new Date(templatePreview.createdAt).toLocaleString() : "-"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="h-9 w-9 rounded-full border border-emerald-300 bg-emerald-50 flex items-center justify-center text-emerald-600">✓</span>
                  <div>
                    <span className="inline-flex rounded-lg bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">
                      {String(templatePreview.status || "Approved")}
                    </span>
                    <div className="mt-1 text-sm text-gray-500">
                      {templatePreview.updatedAt ? new Date(templatePreview.updatedAt).toLocaleString() : "-"}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="px-3 py-2 bg-[#f7f7f7] border-b border-gray-200 text-sm font-semibold text-gray-700">WhatsApp Preview</div>
                <div className="p-3">
                  <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-800 whitespace-pre-line">
                    {getTemplateBodyText(templatePreview) || "No template body available."}
                  </div>
                  {getTemplateButtons(templatePreview).length > 0 ? (
                    <div className="mt-2 space-y-1.5">
                      {getTemplateButtons(templatePreview).map((btn) => (
                        <div key={btn} className="rounded-md border border-gray-200 bg-[#f7f7f7] py-2 text-center text-sm font-semibold text-sky-700">
                          {btn}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setTemplatePreview(null)}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-semibold"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                applyStartTemplateSelection(templatePreview);
                setTemplatePreview(null);
              }}
              className="px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700"
            >
              Use This Template
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}

export default Flows;

