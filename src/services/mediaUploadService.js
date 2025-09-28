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
      
      // Configure for audio uploads
      // Note: AtlasIntraencounter doesn't exist, using generic media upload
      const objectType = 'MediaUpload';
      const property = 'mediaFile';
      const mediaItemPath = this.createAudioPath(filename);

      return await this.uploadToFoundryMediaEndpoint(
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
      
      // Configure for image uploads
      const objectType = 'MedicationsUpload';
      const property = 'photolabel';
      const mediaItemPath = this.createImagePath(filename);

      return await this.uploadToFoundryMediaEndpoint(
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
        'scope': 'api:ontologies-read api:ontologies-write'
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
   * Core method to upload binary data to Foundry media endpoint
   * Uses direct media set API since object types are not configured correctly
   * @private
   */
  async uploadToFoundryMediaEndpoint(fileBuffer, objectType, property, mediaItemPath, contentType, userId) {
    // Get authentication token via direct REST API
    const token = await this.getFoundryToken();
    
    // Use direct media set API instead of ontology endpoint
    // The media set RID you provided: ri.mio.main.media-set.774ed489-e6ba-4f75-abd3-784080d7cfb3
    const mediaSetRid = 'ri.mio.main.media-set.774ed489-e6ba-4f75-abd3-784080d7cfb3';
    const uploadUrl = `${this.foundryHost}/api/v2/mediasets/${mediaSetRid}/items?mediaItemPath=${encodeURIComponent(mediaItemPath)}&preview=true`;
    
    logger.info('MediaUploadService: Uploading to Foundry ontology endpoint', {
      uploadUrl,
      ontologyApiName: this.ontologyApiName,
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
      logger.error('MediaUploadService: Foundry ontology upload failed', {
        status: uploadResponse.status,
        error: errorText,
        uploadUrl,
        ontologyApiName: this.ontologyApiName,
        objectType,
        property,
        userId
      });
      throw new Error(`Foundry ontology media upload failed: ${uploadResponse.status} - ${errorText}`);
    }

    const result = await uploadResponse.json();
    
    logger.info('MediaUploadService: Foundry ontology upload successful', {
      ontologyApiName: this.ontologyApiName,
      objectType,
      property,
      mediaItemPath,
      userId,
      hasReference: !!result.reference
    });

    return result;
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
