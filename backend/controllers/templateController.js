const { Template } = require('../models');

exports.createTemplate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, content, category, variables } = req.body;

    const template = await Template.create({
      userId,
      name,
      content,
      category: category || 'other',
      variables: variables || []
    });

    res.status(201).json({
      success: true,
      template
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.getTemplates = async (req, res) => {
  try {
    const userId = req.user.id;
    const { category, status, page = 1, limit = 20 } = req.query;

    const where = { userId };
    if (category) where.category = category;
    if (status) where.status = status;

    const offset = (page - 1) * limit;

    const { count, rows: templates } = await Template.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      templates,
      pagination: {
        total: count,
        page: parseInt(page),
        pages: Math.ceil(count / limit),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.getTemplateById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const template = await Template.findOne({
      where: { id, userId }
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    res.json({
      success: true,
      template
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.updateTemplate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, content, category, status, variables } = req.body;

    const template = await Template.findOne({
      where: { id, userId }
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    if (name) template.name = name;
    if (content) template.content = content;
    if (category) template.category = category;
    if (status) template.status = status;
    if (variables) template.variables = variables;

    await template.save();

    res.json({
      success: true,
      template
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.deleteTemplate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const template = await Template.findOne({
      where: { id, userId }
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    await template.destroy();

    res.json({
      success: true,
      message: 'Template deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

