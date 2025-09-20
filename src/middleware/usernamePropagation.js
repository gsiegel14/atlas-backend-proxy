import { logger } from '../utils/logger.js';

export const usernamePropagation = (req, res, next) => {
  try {
    // Ensure request context exists
    req.context = req.context || {};

    // Read header (case-insensitive via Express)
    const headerUsername = req.get('X-Auth0-Username');

    // Resolve username from JWT claims as fallback
    const claimPreferred = req.user?.preferred_username;
    const claimNickname = req.user?.nickname;
    const claimEmail = req.user?.email;
    const resolvedFromClaims = claimPreferred || claimNickname || claimEmail || undefined;

    // Choose final username: header first (if present), else claims
    const finalUsername = headerUsername || resolvedFromClaims;
    req.context.username = finalUsername;

    // If header present but mismatches claims, log a warning
    if (headerUsername && resolvedFromClaims && headerUsername !== resolvedFromClaims) {
      logger.warn('Username header mismatch with JWT claims', {
        headerUsername,
        claimPreferred,
        claimNickname,
        claimEmail,
        userSub: req.user?.sub,
        correlationId: req.correlationId
      });
    }

    next();
  } catch (error) {
    // Do not block request on propagation errors; log and continue
    logger.error('Username propagation middleware error', {
      error: error.message,
      userSub: req.user?.sub,
      correlationId: req.correlationId
    });
    next();
  }
};


