const Project = require('../models/Project');
const db = require('../config/db');
const axios = require('axios');

const META_API_VERSION = process.env.META_API_VERSION || 'v22.0';

const toDisplayPhone = async (phoneNumberId, token) => {
  if (!phoneNumberId || !token) return null;
  try {
    const resp = await axios.get(
      `https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { fields: 'display_phone_number,verified_name' },
        timeout: 10000,
      }
    );
    return resp?.data?.display_phone_number || null;
  } catch (_) {
    return null;
  }
};

const attachProjectPhoneNumbers = async (projects) => {
  if (!Array.isArray(projects) || projects.length === 0) return projects;

  const projectIds = projects.map((p) => Number(p.id)).filter((id) => Number.isInteger(id) && id > 0);
  if (projectIds.length === 0) return projects;

  // Get latest WhatsApp account mapping per project (contains phone_number_id + token).
  const placeholders = projectIds.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT wa.projectId, wa.phone_number_id, wa.access_token
     FROM whatsapp_accounts wa
     INNER JOIN (
       SELECT projectId, MAX(id) AS max_id
       FROM whatsapp_accounts
       WHERE projectId IN (${placeholders})
       GROUP BY projectId
     ) latest ON latest.max_id = wa.id`,
    projectIds
  );

  const waByProject = new Map();
  (rows || []).forEach((r) => {
    waByProject.set(Number(r.projectId), {
      phoneNumberId: String(r.phone_number_id || '').trim(),
      accessToken: String(r.access_token || '').trim(),
    });
  });

  // Fallback #1: latest customer/mapped phone from clients_whatsapp per project
  const [clientPhoneRows] = await db.query(
    `SELECT cw.project_id, cw.phone
     FROM clients_whatsapp cw
     INNER JOIN (
       SELECT project_id, MAX(id) AS max_id
       FROM clients_whatsapp
       WHERE project_id IN (${placeholders}) AND phone IS NOT NULL AND TRIM(phone) <> ''
       GROUP BY project_id
     ) latest ON latest.max_id = cw.id`,
    projectIds
  );
  const clientPhoneByProject = new Map();
  (clientPhoneRows || []).forEach((r) => {
    clientPhoneByProject.set(Number(r.project_id), String(r.phone || '').trim());
  });

  // Fallback #2: project owner's registration mobile from users.mobile_number
  const ownerIds = projects.map((p) => Number(p.user_id)).filter((id) => Number.isInteger(id) && id > 0);
  const uniqueOwnerIds = Array.from(new Set(ownerIds));
  let ownerMobileByUser = new Map();
  if (uniqueOwnerIds.length > 0) {
    const ownerPlaceholders = uniqueOwnerIds.map(() => '?').join(',');
    const [ownerRows] = await db.query(
      `SELECT id, mobile_number
       FROM users
       WHERE id IN (${ownerPlaceholders})`,
      uniqueOwnerIds
    );
    ownerMobileByUser = new Map(
      (ownerRows || []).map((r) => [Number(r.id), String(r.mobile_number || '').trim()])
    );
  }

  // Resolve display numbers in parallel.
  const resolved = await Promise.all(
    projects.map(async (p) => {
      const pid = Number(p.id);
      const mapping = waByProject.get(pid) || {};
      const phoneNumberId =
        mapping.phoneNumberId ||
        String(p.whatsapp_number_id || '').trim() ||
        null;
      const token =
        mapping.accessToken ||
        process.env.WHATSAPP_TOKEN ||
        process.env.PERMANENT_TOKEN ||
        process.env.Whatsapp_Token ||
        '';

      const displayPhone = await toDisplayPhone(phoneNumberId, token);
      const mappedPhone = clientPhoneByProject.get(pid) || null;
      const ownerPhone = ownerMobileByUser.get(Number(p.user_id)) || null;
      return {
        ...p,
        whatsappNumber: displayPhone || mappedPhone || ownerPhone || null,
      };
    })
  );

  return resolved;
};

// Create Project
exports.createProject = async (req, res) => {
  try {
    const { project_name } = req.body || {};

    if (!project_name || String(project_name).trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Project name is required',
      });
    }

    const projectId = await Project.create(req.user.id, String(project_name).trim());
    const project = await Project.findById(projectId);

    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      projectId,
      project,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get Projects (Role Based)
exports.getProjects = async (req, res) => {
  try {
    let projects;

    if (req.user.role === 'admin') {
      // Admin sees all projects
      projects = await Project.findAll();
    } else {
      // Agent / Manager / User sees only their own
      projects = await Project.findByUser(req.user.id);
    }

    projects = await attachProjectPhoneNumbers(projects);

    res.json({
      success: true,
      count: projects.length,
      projects,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get Single Project
exports.getProjectById = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found',
      });
    }

    // Admin can see any project; others only their own
    if (req.user.role !== 'admin' && Number(project.user_id) !== Number(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient permissions.',
      });
    }

    res.json({
      success: true,
      project,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Delete Project (Admin only)
exports.deleteProject = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admin can delete project',
      });
    }

    await Project.delete(req.params.id);

    res.json({
      success: true,
      message: 'Project deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

