const { Contact } = require('../models');
const { Op } = require('sequelize');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});

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
    const { status, type, search, page = 1, limit = 20 } = req.query;

    const where = { userId };
    if (status) where.status = status;
    if (type === 'opted_in') where.whatsappOptInAt = { [Op.not]: null };
    if (type === 'not_opted_in') where.whatsappOptInAt = { [Op.is]: null };

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

exports.getContactById = async (req, res) => {
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
        const { phone, name, email, tags, country, customFields, ...rest } = contactData;
        const custom = customFields && typeof customFields === 'object' ? customFields : (Object.keys(rest).length ? rest : {});
        const contact = await Contact.create({
          userId,
          phone: phone || contactData.phone,
          name: name || contactData.name || '',
          email: email || contactData.email || null,
          tags: tags || contactData.tags || [],
          country: country || contactData.country || null,
          customFields: custom
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

// Upload CSV and save to contacts table (Step 2 of campaign flow)
exports.uploadCSV = upload.single('csvFile');
exports.parseAndSaveContactsCSV = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No CSV file uploaded'
      });
    }
    const userId = req.user.id;
    const results = [];
    const stream = Readable.from(req.file.buffer.toString('utf8'));
    let detectedHeaders = [];
    await new Promise((resolve, reject) => {
      stream
        .pipe(csv({
          mapHeaders: ({ header }) => String(header || '').replace(/^\uFEFF/, '').trim()
        }))
        .on('data', (row) => {
          if (detectedHeaders.length === 0) detectedHeaders = Object.keys(row || {});
          const keys = Object.keys(row || {});
          const phoneKey =
            keys.find(k => /^phone$/i.test(k)) ||
            keys.find(k => /phone\s*number/i.test(k)) ||
            keys.find(k => /phonenumber/i.test(k)) ||
            keys.find(k => /mobile/i.test(k)) ||
            keys.find(k => /msisdn/i.test(k)) ||
            keys.find(k => /number/i.test(k));

          const phoneRaw = phoneKey ? row[phoneKey] : (row.phone || row.Phone || row.PHONE || row.PhoneNumber || row['phone number'] || '');
          const phone = String(phoneRaw || '').trim().replace(/\D/g, '');
          if (phone && phone.length >= 10) {
            const name = (row.name || row.Name || row.NAME || '').trim() || phone;
            const customFields = {};
            Object.keys(row).forEach(key => {
              const k = key.toLowerCase();
              if (!/^(phone|phonenumber|phone number|phone\s*number|mobile|msisdn|number)$/i.test(k) && k !== 'name') {
                customFields[key] = row[key] != null ? String(row[key]).trim() : '';
              }
            });
            results.push({ phone, name, customFields });
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });
    if (results.length === 0) {
      return res.status(400).json({
        success: false,
        message: `No valid phone numbers in CSV. Detected columns: ${detectedHeaders.join(', ') || '(none)'}. Use a phone column (phone/Phone Number/mobile) with valid numbers including country code.`
      });
    }
    let created = 0;
    let updated = 0;
    const errors = [];
    for (const row of results) {
      try {
        const [contact, createdFlag] = await Contact.findOrCreate({
          where: { userId, phone: row.phone },
          defaults: {
            userId,
            phone: row.phone,
            name: row.name,
            customFields: row.customFields || {}
          }
        });
        if (createdFlag) {
          created++;
        } else {
          await contact.update({
            name: row.name,
            customFields: { ...(contact.customFields || {}), ...(row.customFields || {}) }
          });
          updated++;
        }
      } catch (e) {
        errors.push({ phone: row.phone, error: e.message });
      }
    }
    res.json({
      success: true,
      message: `Contacts saved: ${created} created, ${updated} updated`,
      importedCount: created + updated,
      created,
      updated,
      columns: results.length ? ['phone', 'name', ...Object.keys(results[0].customFields || {})] : [],
      errors: errors.length ? errors : undefined
    });
  } catch (error) {
    console.error('Error parsing/saving contacts CSV:', error);
    res.status(500).json({
      success: false,
      message: 'Error processing CSV',
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

exports.optOutContact = async (req, res) => {
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

    // Update status to 'unsubscribed' (opt-out/block)
    await contact.update({
      status: 'unsubscribed',
      // Clear keyword opt-in timestamp so contact is treated as "not opted-in"
      whatsappOptInAt: null
    });

    res.json({
      success: true,
      message: 'Contact opted out successfully',
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

exports.optInContact = async (req, res) => {
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

    // Mark as opted-in (consent timestamp + active status)
    await contact.update({
      status: 'active',
      whatsappOptInAt: contact.whatsappOptInAt || new Date()
    });

    res.json({
      success: true,
      message: 'Contact opted in successfully',
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