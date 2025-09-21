import express from 'express';
import axios from 'axios';
import { logger } from '../utils/logger.js';

const router = express.Router();

function base64UrlDecode(segment) {
  if (!segment) return null;
  const pad = 4 - (segment.length % 4);
  const padded = segment + (pad < 4 ? '='.repeat(pad) : '');
  const b64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

function decodeJwtUnsafe(token) {
  const parts = (token || '').split('.');
  if (parts.length !== 3) return { header: null, payload: null };
  const headerJson = base64UrlDecode(parts[0]);
  const payloadJson = base64UrlDecode(parts[1]);
  let header = null;
  let payload = null;
  try { header = headerJson ? JSON.parse(headerJson) : null; } catch {}
  try { payload = payloadJson ? JSON.parse(payloadJson) : null; } catch {}
  return { header, payload };
}

router.post('/token/inspect', async (req, res) => {
  const authHeader = req.get('Authorization') || '';
  const bodyToken = req.body?.token || null;
  const token = bodyToken || (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null);

  if (!token) {
    return res.status(400).json({
      error: {
        code: 'MISSING_TOKEN',
        message: 'Provide token in Authorization: Bearer or JSON body { token }',
        correlationId: req.correlationId,
        timestamp: new Date().toISOString()
      }
    });
  }

  const { header, payload } = decodeJwtUnsafe(token);
  const domain = process.env.AUTH0_DOMAIN;
  const audience = process.env.AUTH0_AUDIENCE || 'https://api.atlas.ai';

  let jwksContainsKid = null;
  let jwksKeyCount = null;
  try {
    if (header?.kid && domain) {
      const resp = await axios.get(`https://${domain}/.well-known/jwks.json`, { timeout: 5000 });
      const keys = Array.isArray(resp.data?.keys) ? resp.data.keys : [];
      jwksKeyCount = keys.length;
      jwksContainsKid = keys.some(k => k.kid === header.kid);
    }
  } catch (e) {
    logger.warn('PublicDebug: JWKS fetch failed', { error: e.message });
  }

  const diagnostics = {
    header: header ? { alg: header.alg, kid: header.kid, typ: header.typ } : null,
    payload: payload ? { iss: payload.iss, aud: payload.aud, sub: payload.sub, scope: payload.scope, exp: payload.exp } : null,
    checks: {
      hasKid: Boolean(header?.kid),
      algIsRS256: header?.alg === 'RS256',
      issuerMatchesDomain: Boolean(payload?.iss && domain && payload.iss === `https://${domain}/`),
      audienceMatches: Boolean(payload?.aud && audience && (Array.isArray(payload.aud) ? payload.aud.includes(audience) : payload.aud === audience)),
      jwksContainsKid,
      jwksKeyCount
    },
    correlationId: req.correlationId,
    timestamp: new Date().toISOString()
  };

  res.json({ success: true, diagnostics });
});

export { router as publicDebugRouter };


