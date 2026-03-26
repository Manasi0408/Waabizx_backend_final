const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  getIntervenedReport,
  exportIntervenedReport,
  getIntervenedCustomerReport,
  exportIntervenedCustomerReport,
} = require('../controllers/reportsController');

// GET /api/reports/intervened?date=YYYY-MM-DD
router.get('/intervened', protect, getIntervenedReport);
// GET /api/reports/intervened/export?date=YYYY-MM-DD&agentId=123
router.get('/intervened/export', protect, exportIntervenedReport);

// GET /api/reports/intervened/customers?date=YYYY-MM-DD&agentId=123&adminId=1
router.get('/intervened/customers', protect, getIntervenedCustomerReport);
// GET /api/reports/intervened/customers/export?date=YYYY-MM-DD&agentId=123&adminId=1
router.get('/intervened/customers/export', protect, exportIntervenedCustomerReport);

module.exports = router;

