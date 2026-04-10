const Project = require('../models/Project');

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

