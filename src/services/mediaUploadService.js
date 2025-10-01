import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';

/**
 * Dedicated service for uploading media files (audio/images) to Foundry
 * Uses direct REST API calls to Foundry endpoints, bypassing OSDK client complexity
 */
export class MediaUploadService {
  constructor(config) {
    this.foundryHost = config.foundryHost;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.tokenUrl = config.tokenUrl;
    this.ontologyApiName = config.ontologyApiName || 'ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194';
    this.intraencounterActionId = config.intraencounterActionId
      || process.env.FOUNDRY_INTRAENCOUNTER_ACTION_ID
      || 'createAtlasIntraencounterProduction';
    this.audioMediaSetRid = config.audioMediaSetRid || process.env.FOUNDRY_AUDIO_MEDIA_SET_RID || 'ri.mio.main.media-set.774ed489-e6ba-4f75-abd3-784080d7cfb3';
    this.medicationsMediaSetRid = config.medicationsMediaSetRid || process.env.FOUNDRY_MEDICATIONS_MEDIA_SET_RID || 'ri.mio.main.media-set.6b57b513-6e54-4f04-b779-2a3a3f9753c8';
  }

  /**
   * Upload audio file (WAV/WebM) to Foundry media endpoint
   * @param {string} base64Data - Base64 encoded audio data
   * @param {string} filename - Original filename
   * @param {string} contentType - MIME type (audio/wav, audio/webm, etc.)
   * @param {string} userId - User ID for logging
   * @returns {Promise<Object>} Media reference from Foundry
   */
  async uploadAudioFile(base64Data, filename, contentType = 'audio/wav', userId = null) {
    logger.info('MediaUploadService: Starting audio upload', {
      filename,
      contentType,
      userId,
      dataSize: base64Data.length
    });

    try {
      // Convert base64 to binary buffer
      const fileBuffer = Buffer.from(base64Data, 'base64');
      
      // Configure for audio uploads - use the correct object type and property
      // for AtlasIntraencounterProduction
      const objectType = 'AtlasIntraencounterProduction';
      const property = 'audiofile';
      const mediaItemPath = this.createAudioPath(filename);

      return await this.uploadViaOntologyMediaEndpoint(
        fileBuffer,
        objectType,
        property,
        mediaItemPath,
        contentType,
        userId
      );
    } catch (error) {
      logger.error('MediaUploadService: Audio upload failed', {
        error: error.message,
        filename,
        userId
      });
      throw error;
    }
  }

  /**
   * Upload image file to Foundry media endpoint
   * @param {string} base64Data - Base64 encoded image data
   * @param {string} filename - Original filename
   * @param {string} contentType - MIME type (image/jpeg, image/png, etc.)
   * @param {string} userId - User ID for logging
   * @returns {Promise<Object>} Media reference from Foundry
   */
  async uploadImageFile(base64Data, filename, contentType = 'image/jpeg', userId = null) {
    logger.info('MediaUploadService: Starting image upload', {
      filename,
      contentType,
      userId,
      dataSize: base64Data.length
    });

    try {
      // Convert base64 to binary buffer
      const fileBuffer = Buffer.from(base64Data, 'base64');
      
      // Configure for image uploads - use the correct object type and property
      // for MedicationsUpload
      const objectType = 'MedicationsUpload';
      const property = 'photolabel';
      const mediaItemPath = this.createImagePath(filename);

      return await this.uploadViaOntologyMediaEndpoint(
        fileBuffer,
        objectType,
        property,
        mediaItemPath,
        contentType,
        userId
      );
    } catch (error) {
      logger.error('MediaUploadService: Image upload failed', {
        error: error.message,
        filename,
        userId
      });
      throw error;
    }
  }

  /**
   * Get Foundry OAuth token using direct REST API call
   * @private
   */
  async getFoundryToken() {
    const tokenResponse = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        'grant_type': 'client_credentials',
        'client_id': this.clientId,
        'client_secret': this.clientSecret,
        'scope': 'api:ontologies-read api:ontologies-write api:usage:mediasets-write'
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      logger.error('MediaUploadService: Failed to get Foundry token', {
        status: tokenResponse.status,
        error: errorText
      });
      throw new Error(`Failed to get Foundry token: ${tokenResponse.status} - ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    return tokenData.access_token;
  }

  /**
   * Create Atlas Intraencounter Production record using direct Foundry action API
   * @param {Object} params - Parameters for the intraencounter
   * @param {string} params.timestamp - ISO 8601 timestamp
   * @param {string} params.user_id - User ID
   * @param {Object} params.audiofile - Media reference from upload
   * @param {string} params.transcript - Transcribed text
   * @param {string} params.location - Location
   * @param {string} params.provider_name - Provider name
   * @param {string} params.speciality - Medical specialty
   * @param {string} params.hospital - Hospital name
   * @returns {Promise<Object>} Action result
   */
  async createIntraencounterProduction(params) {
    // Get authentication token via direct REST API
    const token = await this.getFoundryToken();

    // Use the MediaReference directly as returned from the upload endpoint
    // The ontology media upload endpoint returns a properly formatted MediaReference
    // that includes both the reference object and mimeType
    const audiofileRef = params.audiofile;

    const requestBody = {
      parameters: {
        timestamp: params.timestamp || new Date().toISOString(),
        user_id: params.user_id,
        audiofile: audiofileRef, // MediaReference from ontology upload endpoint
        transcript: params.transcript,
        location: params.location || '',
        provider_name: params.provider_name || '',
        speciality: params.speciality || '',
        hospital: params.hospital || '',
        llm_summary: params.llm_summary || ''
      },
      options: {
        mode: "VALIDATE_AND_EXECUTE",
        returnEdits: "ALL"
      }
    };

    const actionIdCandidates = this.buildActionIdVariants(this.intraencounterActionId);
    let lastError = null;

    for (const candidate of actionIdCandidates) {
      const actionUrl = `${this.foundryHost}/api/v2/ontologies/${this.ontologyApiName}/actions/${candidate}/apply`;

      logger.info('MediaUploadService: Creating intraencounter via Foundry action', {
        actionUrl,
        actionId: candidate,
        ontologyApiName: this.ontologyApiName,
        userId: params.user_id,
        hasAudiofile: !!params.audiofile,
        hasTranscript: !!params.transcript,
        audiofileFormat: typeof params.audiofile,
        audiofileKeys: params.audiofile ? Object.keys(params.audiofile) : []
      });

      try {
        const actionResponse = await fetch(actionUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        if (!actionResponse.ok) {
          const errorText = await actionResponse.text();
          logger.warn('MediaUploadService: Foundry action attempt failed', {
            status: actionResponse.status,
            error: errorText,
            actionUrl,
            actionId: candidate,
            userId: params.user_id
          });

          const error = new Error(`Foundry action failed: ${actionResponse.status} - ${errorText}`);
          error.status = actionResponse.status;
          error.foundryError = errorText;
          error.actionId = candidate;
          error.actionUrl = actionUrl;
          lastError = error;
          continue;
        }

        const result = await actionResponse.json();

        logger.info('MediaUploadService: Foundry action successful', {
          ontologyApiName: this.ontologyApiName,
          userId: params.user_id,
          actionId: candidate,
          hasResult: !!result
        });

        return result;
      } catch (error) {
        logger.error('MediaUploadService: Foundry action request error', {
          error: error.message,
          actionUrl,
          actionId: candidate,
          userId: params.user_id
        });
        lastError = error;
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error('Foundry action failed: no valid actionId candidates resolved');
  }

  buildActionIdVariants(actionId) {
    const fallback = (actionId || '').trim() || 'createAtlasIntraencounterProduction';
    const variants = new Set();
    variants.add(fallback);
    variants.add(fallback.replace(/_/g, '-'));
    variants.add(fallback.replace(/-([a-z])/g, (_, char) => char.toUpperCase()));
    variants.add(fallback.replace(/([A-Z])/g, '-$1').replace(/^-/, '').toLowerCase());
    return Array.from(variants).filter(Boolean);
  }

  /**
   * Upload binary data to Foundry via the Ontology Object Type Media Property endpoint
   * This is the correct approach per Foundry API docs - uploads are associated with
   * the object type's property schema, ensuring proper MediaReference validation
   * @private
   */
  async uploadViaOntologyMediaEndpoint(fileBuffer, objectType, property, mediaItemPath, contentType, userId) {
    // Get authentication token via direct REST API
    const token = await this.getFoundryToken();
    
    // Use the correct Foundry API endpoint for media uploads
    // POST /api/v2/ontologies/{ontology}/objectTypes/{objectType}/media/{property}/upload
    const uploadUrl = `${this.foundryHost}/api/v2/ontologies/${this.ontologyApiName}/objectTypes/${objectType}/media/${property}/upload?mediaItemPath=${encodeURIComponent(mediaItemPath)}&preview=true`;
    
    logger.info('MediaUploadService: Uploading via ontology media property endpoint', {
      uploadUrl,
      ontology: this.ontologyApiName,
      objectType,
      property,
      mediaItemPath,
      fileSize: fileBuffer.length,
      contentType,
      userId
    });

    // Make the upload request
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/octet-stream'
      },
      body: fileBuffer
    });

    // Handle response
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      logger.error('MediaUploadService: Ontology media upload failed', {
        status: uploadResponse.status,
        error: errorText,
        uploadUrl,
        objectType,
        property,
        userId
      });
      throw new Error(`Foundry ontology media upload failed: ${uploadResponse.status} - ${errorText}`);
    }

    const result = await uploadResponse.json();
    
    logger.info('MediaUploadService: Ontology media upload successful', {
      objectType,
      property,
      mediaItemPath,
      userId,
      hasReference: !!result.reference,
      mimeType: result.mimeType
    });

    // The response contains a properly formatted MediaReference object
    // that can be used directly in ontology actions
    return {
      ...result,
      // Ensure backward compatibility - the reference field contains the MediaReference
      reference: result.reference || result
    };
  }

  /**
   * Create organized path for audio files
   * @private
   */
  createAudioPath(filename) {
    const sanitizedFilename = this.sanitizeFilename(filename);
    const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return `encounters/audio/${timestamp}/${sanitizedFilename}`;
  }

  /**
   * Create organized path for image files
   * @private
   */
  createImagePath(filename) {
    const sanitizedFilename = this.sanitizeFilename(filename);
    const timestamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return `medications/${timestamp}/${sanitizedFilename}`;
  }

  /**
   * Sanitize filename for safe storage
   * @private
   */
  sanitizeFilename(filename) {
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .replace(/_{2,}/g, '_')
      .toLowerCase();
  }

  /**
   * Validate base64 data
   * @param {string} base64Data - Base64 string to validate
   * @returns {boolean} True if valid base64
   */
  static isValidBase64(base64Data) {
    if (!base64Data || typeof base64Data !== 'string') {
      return false;
    }
    
    try {
      // Check if it's valid base64
      const buffer = Buffer.from(base64Data, 'base64');
      return buffer.toString('base64') === base64Data;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get file size in bytes from base64 data
   * @param {string} base64Data - Base64 encoded data
   * @returns {number} File size in bytes
   */
  static getFileSizeFromBase64(base64Data) {
    if (!base64Data) return 0;
    
    // Remove data URL prefix if present (data:audio/wav;base64,...)
    const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
    
    // Calculate actual file size (base64 is ~33% larger than binary)
    const padding = (cleanBase64.match(/=/g) || []).length;
    return Math.floor((cleanBase64.length * 3) / 4) - padding;
  }
}
