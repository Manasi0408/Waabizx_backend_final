const express = require('express');
const router = express.Router();

const {
  createProject,
  getProjects,
  getProjectById,
  deleteProject,
} = require('../controllers/projectController');

const { protect } = require('../middleware/authMiddleware');

// All routes require login
router.use(protect);

router.post('/create', createProject);
router.get('/list', getProjects);
router.get('/:id', getProjectById);
router.delete('/:id', deleteProject);

module.exports = router;

