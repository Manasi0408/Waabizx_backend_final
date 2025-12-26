const { Contact } = require('../models');
const { Op } = require('sequelize');

exports.createContact = async (req, res) => {
  try {
    const userId = req.user.id;
    const { phone, name, email, tags, country } = req.body;

    const contactExists = await Contact.findOne({
      where: {
        phone,
        userId
      }
    });

    if (contactExists) {
      return res.status(400).json({
        success: false,
        message: 'Contact with this phone number already exists'
      });
    }

    const contact = await Contact.create({
      userId,
      phone,
      name,
      email,
      tags: tags || [],
      country
    });

    res.status(201).json({
      success: true,
      contact
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.getContacts = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, search, page = 1, limit = 20 } = req.query;

    const where = { userId };
    if (status) where.status = status;

    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { phone: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } }
      ];
    }

    const offset = (page - 1) * limit;

    const { count, rows: contacts } = await Contact.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      contacts,
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

exports.importContacts = async (req, res) => {
  try {
    const userId = req.user.id;
    const contactsData = req.body.contacts;

    if (!Array.isArray(contactsData) || contactsData.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No contacts data provided'
      });
    }

    const createdContacts = [];
    const errors = [];

    for (const contactData of contactsData) {
      try {
        const contact = await Contact.create({
          userId,
          phone: contactData.phone,
          name: contactData.name || '',
          email: contactData.email || null,
          tags: contactData.tags || [],
          country: contactData.country || null
        });
        createdContacts.push(contact);
      } catch (error) {
        errors.push({
          phone: contactData.phone,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      message: `Successfully imported ${createdContacts.length} contacts`,
      importedCount: createdContacts.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.updateContact = async (req, res) => {
  try {
    const userId = req.user.id;
    const contactId = req.params.id;
    const updates = req.body;

    const contact = await Contact.findOne({
      where: {
        id: contactId,
        userId
      }
    });

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    await contact.update(updates);

    res.json({
      success: true,
      contact
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.deleteContact = async (req, res) => {
  try {
    const userId = req.user.id;
    const contactId = req.params.id;

    const contact = await Contact.findOne({
      where: {
        id: contactId,
        userId
      }
    });

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    await contact.destroy();

    res.json({
      success: true,
      message: 'Contact deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};