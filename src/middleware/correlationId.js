import { v4 as uuidv4 } from 'uuid';

export const correlationId = (req, res, next) => {
  // Use existing correlation ID from header or generate new one
  req.correlationId = req.get('X-Correlation-Id') || uuidv4();
  
  // Add correlation ID to response headers
  res.set('X-Correlation-Id', req.correlationId);
  
  next();
};
