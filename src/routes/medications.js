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
  // Try to get username from context (set by usernamePropagation middleware)
  const username = typeof req.context?.username === 'string'
    ? req.context.username.trim()
    : undefined;
  
  // Fallback to Auth0 sub claim if username not found
  const auth0Sub = req.user?.sub;
  
  const identifier = username || auth0Sub;
  return identifier ? [identifier] : [];
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
    logger.info('Medication photo upload request', {
      hasContext: !!req.context,
      contextUsername: req.context?.username,
      userSub: req.user?.sub,
      userEmail: req.user?.email,
      headers: {
        'x-auth0-username': req.get('X-Auth0-Username')
      },
      correlationId: req.correlationId
    });

    const identifiers = resolveUserIdentifiers(req);
    if (identifiers.length === 0) {
      logger.error('Failed to resolve user identity', {
        context: req.context,
        user: req.user,
        correlationId: req.correlationId
      });
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

    // Get Foundry OAuth token with proper scopes for media set upload
    const tokenUrl = `${process.env.FOUNDRY_HOST}/multipass/api/oauth2/token`;
    logger.info('Fetching Foundry OAuth token', {
      url: tokenUrl,
      scopes: 'api:usage:mediasets-write',
      correlationId: req.correlationId
    });

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.FOUNDRY_CLIENT_ID}:${process.env.FOUNDRY_CLIENT_SECRET}`).toString('base64')}`
      },
      body: 'grant_type=client_credentials&scope=api:usage:mediasets-write'
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      logger.error('Failed to get Foundry token', {
        status: tokenResponse.status,
        error: errorText,
        correlationId: req.correlationId
      });
      throw new Error(`Failed to get Foundry token: ${tokenResponse.status} - ${errorText}`);
    }

    const { access_token } = await tokenResponse.json();
    logger.info('Successfully obtained Foundry OAuth token', {
      tokenLength: access_token.length,
      correlationId: req.correlationId
    });

    // Step 1: Upload to media set directly using Media Set API
    const mediaSetRid = 'ri.mio.main.media-set.6b57b513-6e54-4f04-b779-2a3a3f9753c8';
    
    const mediaUploadUrl = `${process.env.FOUNDRY_HOST}/api/v2/mediasets/${mediaSetRid}/items?mediaItemPath=${encodeURIComponent(finalFilename)}`;

    logger.info('Step 1: Uploading photo to media set', {
      url: mediaUploadUrl,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token.substring(0, 20)}...`,
        'Content-Type': 'application/octet-stream'
      },
      bodySize: photoBuffer.length,
      mediaSetRid,
      filename: finalFilename,
      correlationId: req.correlationId
    });

    const uploadResponse = await fetch(mediaUploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/octet-stream'
      },
      body: photoBuffer
    });

    logger.info('Media set upload response received', {
      status: uploadResponse.status,
      statusText: uploadResponse.statusText,
      headers: Object.fromEntries(uploadResponse.headers.entries()),
      correlationId: req.correlationId
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      logger.error('Failed to upload photo to media set', {
        status: uploadResponse.status,
        statusText: uploadResponse.statusText,
        error: errorText,
        url: mediaUploadUrl,
        userId: primaryUser,
        correlationId: req.correlationId
      });
      throw new Error(`Failed to upload photo to media set: ${uploadResponse.status} - ${errorText}`);
    }

    const uploadResult = await uploadResponse.json();
    
    logger.info('Step 1 successful: Photo uploaded to media set', {
      status: uploadResponse.status,
      mediaItemRid: uploadResult.mediaItemRid,
      userId: primaryUser,
      correlationId: req.correlationId
    });
    
    // Step 2: Return the media reference for use in the create action
    const mediaReference = {
      mediaSetRid: mediaSetRid,
      mediaItemRid: uploadResult.mediaItemRid
    };

    logger.info('Step 2: Returning media reference for create action', {
      userId: primaryUser,
      filename: finalFilename,
      mediaReference,
      correlationId: req.correlationId
    });

    res.status(201).json({
      success: true,
      mediaReference,
      filename: finalFilename,
      mimeType: mimeType,
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

// Create medication upload record with media reference
router.post('/create-with-photo', validateTokenWithScopes(['execute:actions']), async (req, res, next) => {
  try {
    const { mediaReference, userId, timestamp } = req.body || {};
    
    if (!mediaReference || !mediaReference.mediaItemRid) {
      return res.status(400).json({
        error: {
          code: 'INVALID_REQUEST',
          message: 'mediaReference with mediaItemRid is required',
          correlationId: req.correlationId,
          timestamp: new Date().toISOString()
        }
      });
    }

    logger.info('Creating medication upload record with photo reference', {
      mediaReference,
      userId,
      correlationId: req.correlationId
    });

    // Get Foundry OAuth token for the action
    const tokenUrl = `${process.env.FOUNDRY_HOST}/multipass/api/oauth2/token`;
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${process.env.FOUNDRY_CLIENT_ID}:${process.env.FOUNDRY_CLIENT_SECRET}`).toString('base64')}`
      },
      body: 'grant_type=client_credentials&scope=api:ontologies-read api:ontologies-write'
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Failed to get Foundry token: ${tokenResponse.status} - ${errorText}`);
    }

    const { access_token } = await tokenResponse.json();

    // Execute the create action using the exact API format from documentation
    const actionUrl = `${process.env.FOUNDRY_HOST}/api/v2/ontologies/ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194/actions/create-medications-upload/apply`;
    
    const actionPayload = {
      parameters: {
        user_id: userId || req.user?.sub,
        timestamp: timestamp || new Date().toISOString(),
        photolabel: { $rid: mediaReference.mediaItemRid }
      },
      options: {
        returnEdits: "ALL"
      }
    };

    logger.info('Executing create-medications-upload action', {
      actionUrl,
      payload: actionPayload,
      correlationId: req.correlationId
    });

    const actionResponse = await fetch(actionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(actionPayload)
    });

    if (!actionResponse.ok) {
      const errorText = await actionResponse.text();
      logger.error('Failed to execute create action', {
        status: actionResponse.status,
        error: errorText,
        correlationId: req.correlationId
      });
      throw new Error(`Failed to execute create action: ${actionResponse.status} - ${errorText}`);
    }

    const actionResult = await actionResponse.json();

    logger.info('Successfully created medication upload record', {
      actionResult,
      correlationId: req.correlationId
    });

    res.status(201).json({
      success: true,
      result: actionResult,
      correlationId: req.correlationId
    });
  } catch (error) {
    logger.error('Error creating medication upload record:', {
      error: error.message,
      stack: error.stack,
      correlationId: req.correlationId
    });
    next(error);
  }
});

export { router as medicationsRouter };
