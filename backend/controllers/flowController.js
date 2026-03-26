const { Flow } = require("../models");

const parseFlowData = (flow) => {
  const raw = flow?.data;
  if (!raw) return { nodes: [], edges: [] };
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return { nodes: [], edges: [] };
    }
  }
  return raw;
};

const parseCommaList = (value) => {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
};

const normalizeEdgeLabel = (edge) => {
  const label = edge?.label || edge?.data?.label || "";
  return String(label || "").trim();
};

const findStartNodeId = (nodes) => {
  const start = (nodes || []).find((n) => n?.type === "start");
  return start?.id || (nodes && nodes.length > 0 ? nodes[0].id : null);
};

const buildIndex = (flow) => {
  const nodes = flow?.nodes || [];
  const edges = flow?.edges || [];

  const nodeById = new Map();
  nodes.forEach((n) => nodeById.set(n.id, n));

  const outgoingBySource = new Map();
  edges.forEach((e) => {
    const list = outgoingBySource.get(e.source) || [];
    list.push(e);
    outgoingBySource.set(e.source, list);
  });

  return { nodeById, outgoingBySource };
};

const pickEdgeTargetByLabel = (outgoingEdges, label) => {
  if (!label) return null;
  const desired = String(label).trim().toLowerCase();
  const match = (outgoingEdges || []).find((e) => normalizeEdgeLabel(e).toLowerCase() === desired);
  return match?.target || null;
};

const runFlow = (flow, { userInput, currentNodeId }) => {
  const { nodeById, outgoingBySource } = buildIndex(flow);
  const startNodeId = findStartNodeId(flow.nodes);

  // "currentNodeId" is used as the node that consumed the user's last input.
  const initialNodeId = currentNodeId || startNodeId;
  let nodeId = initialNodeId;

  const output = [];
  const visited = new Set();
  const maxSteps = 30;
  let steps = 0;

  while (nodeId && steps < maxSteps) {
    steps += 1;
    if (visited.has(nodeId) && nodeId !== currentNodeId) break;
    visited.add(nodeId);

    const node = nodeById.get(nodeId);
    if (!node) break;

    const outgoing = outgoingBySource.get(nodeId) || [];
    const firstEdgeTarget = outgoing[0]?.target || null;

    if (node.type === "start") {
      nodeId = firstEdgeTarget;
      continue;
    }

    if (node.type === "text") {
      output.push({ type: "text", text: node.data?.text || "" });
      nodeId = firstEdgeTarget;
      continue;
    }

    if (node.type === "image") {
      output.push({ type: "image", imageUrl: node.data?.imageUrl || "" });
      nodeId = firstEdgeTarget;
      continue;
    }

    if (node.type === "button") {
      const buttons = parseCommaList(node.data?.buttons || "");
      output.push({
        type: "button",
        text: node.data?.text || "",
        buttons,
      });
      nodeId = firstEdgeTarget;
      continue;
    }

    if (node.type === "question") {
      const question = node.data?.question || "";
      const options = parseCommaList(node.data?.options || "");

      // Only consume userInput when the client tells us this question is the "current" one.
      const shouldConsume =
        String(currentNodeId || "").trim() &&
        String(nodeId) === String(currentNodeId) &&
        userInput !== undefined &&
        userInput !== null &&
        String(userInput).trim() !== "";

      if (!shouldConsume) {
        output.push({
          type: "question",
          question,
          options,
        });

        return {
          output,
          nextNodeId: nodeId,
          done: false,
        };
      }

      const matchedOption =
        options.find((opt) => String(opt).trim().toLowerCase() === String(userInput).trim().toLowerCase()) ||
        options.find((opt) => String(userInput).trim().toLowerCase().includes(String(opt).trim().toLowerCase())) ||
        null;

      const targetByLabel = pickEdgeTargetByLabel(outgoing, matchedOption) || pickEdgeTargetByLabel(outgoing, userInput) || firstEdgeTarget;

      nodeId = targetByLabel;
      continue;
    }

    if (node.type === "template") {
      const question = node.data?.question || "";
      const optionsSource =
        node.data?.options ||
        `${node.data?.optionA || ""}, ${node.data?.optionB || ""}`;
      const options = parseCommaList(optionsSource);

      const shouldConsume =
        String(currentNodeId || "").trim() &&
        String(nodeId) === String(currentNodeId) &&
        userInput !== undefined &&
        userInput !== null &&
        String(userInput).trim() !== "";

      if (!shouldConsume) {
        output.push({
          type: "question",
          question,
          options,
        });

        return {
          output,
          nextNodeId: nodeId,
          done: false,
        };
      }

      const matchedOption =
        options.find(
          (opt) =>
            String(opt).trim().toLowerCase() ===
            String(userInput).trim().toLowerCase()
        ) ||
        options.find((opt) =>
          String(userInput)
            .trim()
            .toLowerCase()
            .includes(String(opt).trim().toLowerCase())
        ) ||
        null;

      const targetByLabel =
        pickEdgeTargetByLabel(outgoing, matchedOption) ||
        pickEdgeTargetByLabel(outgoing, userInput) ||
        firstEdgeTarget;

      nodeId = targetByLabel;
      continue;
    }

    // Unknown node type: stop.
    break;
  }

  return {
    output,
    nextNodeId: null,
    done: true,
  };
};

exports.listFlows = async (req, res) => {
  try {
    const userId = req.user.id;
    const rows = await Flow.findAll({
      where: { userId },
      attributes: ["id", "name", "createdAt", "updatedAt"],
      order: [["updatedAt", "DESC"]],
    });

    return res.json({
      success: true,
      flows: rows.map((f) => ({
        id: f.id,
        name: f.name,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
      })),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

exports.saveFlow = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, data } = req.body || {};

    const nodes = Array.isArray(data?.nodes) ? data.nodes : [];
    const edges = Array.isArray(data?.edges) ? data.edges : [];

    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, message: "Flow name is required" });
    }

    const created = await Flow.create({
      userId,
      name: String(name).trim(),
      data: JSON.stringify({ nodes, edges }),
    });

    return res.status(201).json({
      success: true,
      message: "Flow saved successfully",
      flow: {
        id: created.id,
        name: created.name,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

exports.getFlow = async (req, res) => {
  try {
    const userId = req.user.id;
    const flowId = Number(req.params.flowId);
    if (!flowId || Number.isNaN(flowId)) {
      return res.status(400).json({ success: false, message: "Invalid flow id" });
    }

    const flow = await Flow.findOne({
      where: { id: flowId, userId },
    });

    if (!flow) {
      return res.status(404).json({ success: false, message: "Flow not found" });
    }

    return res.json({
      success: true,
      flow: {
        id: flow.id,
        name: flow.name,
        data: parseFlowData(flow),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

exports.executeFlow = async (req, res) => {
  try {
    const userId = req.user.id;
    const flowId = Number(req.params.flowId);
    if (!flowId || Number.isNaN(flowId)) {
      return res.status(400).json({ success: false, message: "Invalid flow id" });
    }

    const flowRow = await Flow.findOne({
      where: { id: flowId, userId },
    });

    if (!flowRow) {
      return res.status(404).json({ success: false, message: "Flow not found" });
    }

    const flowData = parseFlowData(flowRow);
    const { userInput, currentNodeId } = req.body || {};

    const result = runFlow(flowData, { userInput, currentNodeId });
    return res.json({
      success: true,
      output: result.output,
      nextNodeId: result.nextNodeId,
      done: result.done,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

