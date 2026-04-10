const { sequelize } = require('../models');
const { requireProjectId } = require('../utils/projectScope');

/**
 * Intervened report by date.
 * For each agent (users.role='agent'), count messages sent in conversations
 * where conversations.status='intervened' on the provided date.
 */
exports.getIntervenedReport = async (req, res) => {
  try {
    const projectId = requireProjectId(req, res);
    if (!projectId) return;
    const dateStr = String(req.query.date || '').trim();
    const date = dateStr || new Date().toISOString().slice(0, 10);

    // NOTE:
    // In this DB, `agent_conversations` exists but does NOT contain `assigned_agent`.
    // So we rely only on conversations.agent_id to avoid SQL errors.

    const agents = await sequelize.query(
      `
      SELECT
        u.id AS agentId,
        COALESCE(u.name, u.email, CONCAT('User ', u.id)) AS agentName,
        COUNT(c.id) AS intervenedConversations,
        COUNT(c.id) AS intervenedMessages
      FROM users u
      LEFT JOIN conversations c
        ON c.agent_id = u.id
       AND LOWER(TRIM(COALESCE(c.status,''))) = 'intervened'
       AND DATE(COALESCE(c.created_at, c.last_message_time)) = :date
      WHERE u.role IN ('agent','admin')
        AND u.projectId = :projectId
      GROUP BY u.id, u.name, u.email
      ORDER BY intervenedMessages DESC, intervenedConversations DESC
      `,
      {
        replacements: { date, projectId },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const total = await sequelize.query(
      `
      SELECT
        COUNT(c.id) AS totalIntervenedConversations,
        COUNT(c.id) AS totalIntervenedMessages
      FROM conversations c
      WHERE LOWER(TRIM(COALESCE(c.status,''))) = 'intervened'
        AND c.agent_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM users u
          WHERE u.id = c.agent_id
            AND u.projectId = :projectId
        )
        AND DATE(COALESCE(c.created_at, c.last_message_time)) = :date
      `,
      {
        replacements: { date, projectId },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const t = total?.[0] || {};

    res.json({
      success: true,
      date,
      total: {
        intervenedMessages: Number(t.totalIntervenedMessages || 0),
        intervenedConversations: Number(t.totalIntervenedConversations || 0),
      },
      agents: (agents || []).map((a) => ({
        agentId: a.agentId,
        agentName: a.agentName,
        intervenedMessages: Number(a.intervenedMessages || 0),
        intervenedConversations: Number(a.intervenedConversations || 0),
      })),
    });
  } catch (e) {
    console.error('getIntervenedReport error:', e);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: e?.message || String(e),
    });
  }
};

exports.exportIntervenedReport = async (req, res) => {
  try {
    const projectId = requireProjectId(req, res);
    if (!projectId) return;
    const dateStr = String(req.query.date || '').trim();
    const date = dateStr || new Date().toISOString().slice(0, 10);
    const agentIdRaw = req.query.agentId;
    const agentId = agentIdRaw != null && String(agentIdRaw).trim() !== ''
      ? Number(agentIdRaw)
      : null;

    const rows = await sequelize.query(
      `
      SELECT
        COALESCE(NULLIF(TRIM(c.customer_name), ''), NULLIF(TRIM(c.phone), ''), 'N/A') AS customer_name,
        COALESCE(NULLIF(TRIM(c.phone), ''), 'N/A') AS phone
      FROM conversations c
      JOIN users u
        ON u.id = c.agent_id
      WHERE LOWER(TRIM(COALESCE(c.status,''))) = 'intervened'
        AND u.role IN ('agent','admin')
        AND u.projectId = :projectId
        AND DATE(COALESCE(c.created_at, c.last_message_time)) = :date
        AND (:agentId IS NULL OR c.agent_id = :agentId)
      ORDER BY c.id DESC
      `,
      {
        replacements: { date, agentId, projectId },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const escapeCsv = (value) => {
      const s = value == null ? '' : String(value);
      if (s.includes('"') || s.includes(',') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const header = 'customer_name,phone';
    const lines = (rows || []).map((r) =>
      `${escapeCsv(r.customer_name)},${escapeCsv(r.phone)}`
    );
    const csv = [header, ...lines].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=\"intervened-report-${date}.csv\"`
    );
    return res.status(200).send(csv);
  } catch (e) {
    console.error('exportIntervenedReport error:', e);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: e?.message || String(e),
    });
  }
};

exports.getIntervenedCustomerReport = async (req, res) => {
  try {
    const projectId = requireProjectId(req, res);
    if (!projectId) return;
    const dateStr = String(req.query.date || '').trim();
    const date = dateStr || new Date().toISOString().slice(0, 10);

    const agentIdRaw = req.query.agentId;
    const adminIdRaw = req.query.adminId;

    const agentId =
      agentIdRaw != null && String(agentIdRaw).trim() !== ''
        ? Number(agentIdRaw)
        : null;
    const adminId =
      adminIdRaw != null && String(adminIdRaw).trim() !== ''
        ? Number(adminIdRaw)
        : null;

    const customers = await sequelize.query(
      `
      SELECT
        MAX(
          COALESCE(
            NULLIF(TRIM(c.customer_name), ''),
            NULLIF(TRIM(c.phone), ''),
            'N/A'
          )
        ) AS customer_name,
        COALESCE(NULLIF(TRIM(c.phone), ''), 'N/A') AS phone,
        COUNT(DISTINCT c.id) AS intervened_conversations_count
      FROM conversations c
      JOIN users u
        ON u.id = c.agent_id
      WHERE LOWER(TRIM(COALESCE(c.status,''))) = 'intervened'
        AND u.role IN ('agent','admin')
        AND u.projectId = :projectId
        AND DATE(COALESCE(c.created_at, c.last_message_time)) = :date
        AND (
          (:agentId IS NULL AND :adminId IS NULL)
          OR c.agent_id = :agentId
          OR c.agent_id = :adminId
        )
      GROUP BY COALESCE(NULLIF(TRIM(c.phone), ''), 'N/A')
      ORDER BY intervened_conversations_count DESC
      `,
      {
        replacements: { date, agentId, adminId, projectId },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const total = await sequelize.query(
      `
      SELECT
        COUNT(DISTINCT c.id) AS totalIntervenedConversations
      FROM conversations c
      JOIN users u
        ON u.id = c.agent_id
      WHERE LOWER(TRIM(COALESCE(c.status,''))) = 'intervened'
        AND u.role IN ('agent','admin')
        AND u.projectId = :projectId
        AND DATE(COALESCE(c.created_at, c.last_message_time)) = :date
        AND (
          (:agentId IS NULL AND :adminId IS NULL)
          OR c.agent_id = :agentId
          OR c.agent_id = :adminId
        )
      `,
      {
        replacements: { date, agentId, adminId, projectId },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const t = total?.[0] || {};

    return res.json({
      success: true,
      date,
      totalIntervenedConversations: Number(t.totalIntervenedConversations || 0),
      customers: (customers || []).map((c) => ({
        customerName: c.customer_name,
        phone: c.phone,
        intervenedConversationsCount: Number(c.intervened_conversations_count || 0),
      })),
    });
  } catch (e) {
    console.error('getIntervenedCustomerReport error:', e);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: e?.message || String(e),
    });
  }
};

exports.exportIntervenedCustomerReport = async (req, res) => {
  try {
    const projectId = requireProjectId(req, res);
    if (!projectId) return;
    const dateStr = String(req.query.date || '').trim();
    const date = dateStr || new Date().toISOString().slice(0, 10);

    const agentIdRaw = req.query.agentId;
    const adminIdRaw = req.query.adminId;

    const agentId =
      agentIdRaw != null && String(agentIdRaw).trim() !== ''
        ? Number(agentIdRaw)
        : null;
    const adminId =
      adminIdRaw != null && String(adminIdRaw).trim() !== ''
        ? Number(adminIdRaw)
        : null;

    const rows = await sequelize.query(
      `
      SELECT
        MAX(
          COALESCE(
            NULLIF(TRIM(c.customer_name), ''),
            NULLIF(TRIM(c.phone), ''),
            'N/A'
          )
        ) AS customer_name,
        COALESCE(NULLIF(TRIM(c.phone), ''), 'N/A') AS phone,
        COUNT(DISTINCT c.id) AS intervened_conversations_count
      FROM conversations c
      JOIN users u
        ON u.id = c.agent_id
      WHERE LOWER(TRIM(COALESCE(c.status,''))) = 'intervened'
        AND u.role IN ('agent','admin')
        AND u.projectId = :projectId
        AND DATE(COALESCE(c.created_at, c.last_message_time)) = :date
        AND (
          (:agentId IS NULL AND :adminId IS NULL)
          OR c.agent_id = :agentId
          OR c.agent_id = :adminId
        )
      GROUP BY COALESCE(NULLIF(TRIM(c.phone), ''), 'N/A')
      ORDER BY intervened_conversations_count DESC
      `,
      {
        replacements: { date, agentId, adminId, projectId },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const escapeCsv = (value) => {
      const s = value == null ? '' : String(value);
      if (s.includes('"') || s.includes(',') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    const header = 'customer_name,phone,intervened_conversations_count';
    const lines = (rows || []).map((r) => {
      const customerName = r.customer_name;
      const phone = r.phone;
      const count = r.intervened_conversations_count;
      return `${escapeCsv(customerName)},${escapeCsv(phone)},${escapeCsv(count)}`;
    });
    const csv = [header, ...lines].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=\"intervened-customers-${date}.csv\"`
    );
    return res.status(200).send(csv);
  } catch (e) {
    console.error('exportIntervenedCustomerReport error:', e);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: e?.message || String(e),
    });
  }
};

