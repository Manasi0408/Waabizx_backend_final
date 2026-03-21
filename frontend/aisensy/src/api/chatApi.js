const API = "http://localhost:5000/api/chat";
const API_BASE = "http://localhost:5000/api";

const getAuthHeaders = () => {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const getActiveChats = async () => {
  const res = await fetch(`${API}/active`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  return res.json();
};

export const getRequestingChats = async () => {
  const res = await fetch(`${API}/requesting`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  return res.json();
};

// Manager Inbox: all requesting conversations (for assign flow)
export const getManagerRequesting = async () => {
  const res = await fetch(`${API_BASE}/manager/requesting`, {
    headers: getAuthHeaders(),
  });
  return res.json();
};

// Agent Requesting Tab: conversations assigned to this agent, status=requesting
export const getAgentRequesting = async (agentId) => {
  const res = await fetch(
    `${API_BASE}/agent/requesting?agentId=${encodeURIComponent(agentId)}`,
    { headers: getAuthHeaders() }
  );
  return res.json();
};

export const getIntervenedChats = async () => {
  const res = await fetch(`${API}/intervened`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  return res.json();
};

export const getMessages = async (conversationId) => {
  const res = await fetch(`${API}/messages/${conversationId}`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  return res.json();
};

export const acceptChat = async (id) => {
  const res = await fetch(`${API}/accept/${id}`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
    },
  });
  return res.json();
};

export const interveneChat = async (id) => {
  const res = await fetch(`${API}/intervene/${id}`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
    },
  });
  return res.json();
};

export const sendMessage = async (conversation_id, message) => {
  const res = await fetch(`${API}/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      conversation_id,
      message,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.error || data?.message || "Failed to send message");
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
};

export const closeChat = async (id) => {
  const res = await fetch(`${API}/close/${id}`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
    },
  });

  return res.json();
};

// Manager/Admin: intervene by phone (for /inbox)
export const interveneByPhone = async (phone) => {
  const res = await fetch(`${API_BASE}/chat/intervene-by-phone`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ phone }),
  });
  return res.json();
};

// Manager: assign conversation to an agent (appears in Agent Requesting tab)
export const assignChatToAgent = async (conversationId, agentId) => {
  const res = await fetch(`${API_BASE}/assign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      conversationId,
      agentId,
    }),
  });

  return res.json();
};
