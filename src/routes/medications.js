import express from 'express';
import fetch from 'node-fetch';
import { validateTokenWithScopes } from '../middleware/auth0.js';
import { FoundryService } from '../services/foundryService.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

const foundryService = new FoundryService({
  host: process.env.FOUNDRY_HOST,
  clientId: process.env.FOUNDRY_CLIENT_ID,
  clientSecret: process.env.FOUNDRY_CLIENT_SECRET,
  tokenUrl: process.env.FOUNDRY_OAUTH_TOKEN_URL,
  ontologyRid: process.env.FOUNDRY_ONTOLOGY_RID,
  medicationsActionId: process.env.FOUNDRY_MEDICATIONS_ACTION_ID,
  medicationsUploadObjectType: process.env.FOUNDRY_MEDICATIONS_OBJECT_TYPE
});

function resolveUserIdentifiers(req) {
  const username = typeof req.context?.username === 'string'
    ? req.context.username.trim()
    : undefined;
  return username ? [username] : [];
}

router.get('/uploads', validateTokenWithScopes(['read:patient']), async (req, res, next) => {
  try {
    const identifiers = resolveUserIdentifiers(req);
    if (identifiers.length === 0) {
      return res.status(400).json({
        error: {
          code: 'MISSING_IDENTITY',
          message: 'Unable to resolve Auth0 username for this request',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    const limit = parseInt(req.query.limit, 10) || 50;

    logger.info('Listing medications uploads', {
      identifiers,
      limit,
      correlationId: req.correlationId
    });

    const uploads = await foundryService.listMedicationsUploads(identifiers, { limit });

    res.json({
      success: true,
      data: uploads,
      count: uploads.length,
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId
    });
  } catch (error) {
    logger.error('Failed to list medications uploads', {
      error: error.message,
      user: req.user?.sub,
      correlationId: req.correlationId
    });
    next(error);
  }
});

router.post('/uploads', validateTokenWithScopes(['execute:actions']), async (req, res, next) => {
  try {
    const identifiers = resolveUserIdentifiers(req);
    if (identifiers.length === 0) {
      return res.status(400).json({
        error: {
          code: 'MISSING_IDENTITY',
          message: 'Unable to resolve Auth0 username for this request',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    const primaryUser = identifiers[0];
    const {
      timestamp,
      photolabel,
      photoRid,
      photoUrl,
      additionalParameters = {},
      options = {}
    } = req.body || {};

    const mediaCandidate = photolabel
      || (photoRid ? { $rid: photoRid } : null)
      || photoUrl;

    if (!mediaCandidate) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'photolabel, photoRid, or photoUrl is required',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    const normalizedMedia = FoundryService.normalizeMediaReference(mediaCandidate);

    logger.info('Creating medications upload', {
      userId: primaryUser,
      hasPhotoRid: typeof normalizedMedia === 'object' && Boolean(normalizedMedia?.$rid),
      correlationId: req.correlationId
    });

    const result = await foundryService.createMedicationsUpload({
      userId: primaryUser,
      timestamp,
      photolabel: normalizedMedia,
      additionalParameters,
      options
    });

    res.status(201).json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId
    });
  } catch (error) {
    logger.error('Failed to create medications upload', {
      error: error.message,
      user: req.user?.sub,
      correlationId: req.correlationId
    });
    next(error);
  }
});

// Upload medication photo directly to media set
router.post('/upload-photo', validateTokenWithScopes(['execute:actions']), async (req, res, next) => {
  try {
    const identifiers = resolveUserIdentifiers(req);
    if (identifiers.length === 0) {
      return res.status(400).json({
        error: {
          code: 'MISSING_IDENTITY',
          message: 'Unable to resolve Auth0 username for this request',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    const primaryUser = identifiers[0];
    const { photoBase64, filename, mimeType = 'image/jpeg' } = req.body || {};

    if (!photoBase64) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'photoBase64 is required',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Decode base64 photo
    let photoBuffer;
    try {
      photoBuffer = Buffer.from(photoBase64, 'base64');
    } catch (error) {
      return res.status(400).json({
        error: {
          code: 'INVALID_BASE64',
          message: 'photoBase64 must be valid base64 encoded data',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Generate filename if not provided
    const safeTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileExtension = mimeType === 'image/png' ? 'png' : 'jpg';
    const finalFilename = filename || `medication-${primaryUser}-${safeTimestamp}.${fileExtension}`;

    logger.info('Uploading medication photo to media set', {
      userId: primaryUser,
      filename: finalFilename,
      mimeType,
      photoSize: photoBuffer.length,
      correlationId: req.correlationId
    });

    // Get Foundry OAuth token
    const tokenResponse = await fetch(`${process.env.FOUNDRY_HOST}/multipass/api/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.FOUNDRY_CLIENT_ID}:${process.env.FOUNDRY_CLIENT_SECRET}`).toString('base64')}`
      },
      body: 'grant_type=client_credentials&scope=api:ontologies-read api:ontologies-write'
    });

    if (!tokenResponse.ok) {
      throw new Error(`Failed to get Foundry token: ${tokenResponse.status}`);
    }

    const { access_token } = await tokenResponse.json();

    // Upload to media set using Ontology API
    const mediaSetRid = 'ri.mio.main.media-set.6b57b513-6e54-4f04-b779-2a3a3f9753c8';
    const ontologyRid = process.env.FOUNDRY_ONTOLOGY_RID || 'ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194';
    const objectType = process.env.FOUNDRY_MEDICATIONS_OBJECT_TYPE || 'MedicationsUpload';
    const property = 'photolabel'; // The media reference property name

    const uploadUrl = `${process.env.FOUNDRY_HOST}/api/v2/ontologies/${ontologyRid}/objectTypes/${objectType}/media/${property}/upload?mediaItemPath=${encodeURIComponent(finalFilename)}&preview=true`;

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/octet-stream'
      },
      body: photoBuffer
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      logger.error('Failed to upload medication photo to media set', {
        status: uploadResponse.status,
        error: errorText,
        userId: primaryUser,
        correlationId: req.correlationId
      });
      throw new Error(`Failed to upload photo to media set: ${uploadResponse.status} - ${errorText}`);
    }

    const uploadResult = await uploadResponse.json();
    
    logger.info('Successfully uploaded medication photo to media set', {
      userId: primaryUser,
      filename: finalFilename,
      mediaReference: uploadResult.reference,
      correlationId: req.correlationId
    });

    res.status(201).json({
      success: true,
      data: {
        mediaReference: uploadResult.reference,
        filename: finalFilename,
        mimeType: uploadResult.mimeType,
        mediaSetRid,
        uploadedAt: new Date().toISOString(),
        userId: primaryUser
      },
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId
    });

  } catch (error) {
    logger.error('Failed to upload medication photo', {
      error: error.message,
      user: req.user?.sub,
      correlationId: req.correlationId
    });
    next(error);
  }
});

export { router as medicationsRouter };
