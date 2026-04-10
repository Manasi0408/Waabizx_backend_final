const getProjectId = (req) => {
  const fromReq = Number(req?.projectId);
  if (Number.isInteger(fromReq) && fromReq > 0) return fromReq;
  return null;
};

const requireProjectId = (req, res) => {
  const projectId = getProjectId(req);
  if (!projectId) {
    res.status(400).json({
      success: false,
      message: 'Project is required. Please select a project first.',
    });
    return null;
  }
  return projectId;
};

const withProjectScope = (req, where = {}) => {
  const projectId = getProjectId(req);
  if (!projectId) return { ...where };
  return { ...where, projectId };
};

module.exports = {
  getProjectId,
  requireProjectId,
  withProjectScope,
};
