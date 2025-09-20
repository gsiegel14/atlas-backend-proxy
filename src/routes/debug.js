import express from 'express';

const router = express.Router();

router.get('/whoami', (req, res) => {
  res.json({
    success: true,
    claims: req.user || null,
    username: req.context?.username || null,
    headers: {
      xAuth0Username: req.get('X-Auth0-Username') || null,
      xCorrelationId: req.get('X-Correlation-Id') || null
    },
    correlationId: req.correlationId,
    timestamp: new Date().toISOString()
  });
});

export { router as debugRouter };


