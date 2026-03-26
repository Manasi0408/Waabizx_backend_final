const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/authMiddleware");
const { authorize } = require("../middleware/roleMiddleware");
const {
  getAllAdmins,
  getAdminContacts,
} = require("../controllers/superAdminController");

// SuperAdmin endpoints
router.get("/admins", protect, authorize("super_admin"), getAllAdmins);
router.get(
  "/admins/:adminId/contacts",
  protect,
  authorize("super_admin"),
  getAdminContacts
);

module.exports = router;

