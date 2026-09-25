// GET /api/health — unauthenticated liveness check.

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Use GET' }));
  }
  res.statusCode = 200;
  res.end(JSON.stringify({
    status: 'ok',
    services: ['trustlayer/coi-check', 'ecms/subcontracts'],
    time: new Date().toISOString()
  }));
};
