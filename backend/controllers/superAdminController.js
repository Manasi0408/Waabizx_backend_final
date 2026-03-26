const { User, Contact } = require("../models");

exports.getAllAdmins = async (req, res) => {
  try {
    const admins = await User.findAll({
      where: { role: "admin" },
      attributes: ["id", "name", "email", "status", "lastLogin", "createdAt"],
      order: [["createdAt", "DESC"]],
    });

    res.json(admins);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

exports.getAdminContacts = async (req, res) => {
  try {
    const adminId = Number(req.params.adminId);
    if (!adminId || Number.isNaN(adminId)) {
      return res.status(400).json({ success: false, message: "Invalid admin id" });
    }

    const contacts = await Contact.findAll({
      where: { userId: adminId },
      order: [["createdAt", "DESC"]],
    });

    res.json(contacts);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};

