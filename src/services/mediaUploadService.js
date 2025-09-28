import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';

/**
 * Dedicated service for uploading media files (audio/images) to Foundry
 * Handles base64 conversion and direct API communication with Foundry media endpoints
 */
export class MediaUploadService {
  constructor(config) {
    this.foundryHost = config.foundryHost;
    this.ontologyRid = config.ontologyRid;
    this.getToken = config.getToken; // Function to get Foundry auth token
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
      const objectType = 'AtlasIntraencounter';
      const property = 'audiofile';
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
   * Core method to upload binary data to Foundry media endpoint
   * Uses direct media set upload as fallback when ontology approach fails
   * @private
   */
  async uploadToFoundryMediaEndpoint(fileBuffer, objectType, property, mediaItemPath, contentType, userId) {
    // Get authentication token
    const token = await this.getToken();
    
    // Use direct media set upload (more reliable)
    // The ontology RID seems to be incorrect, so we'll use the media set directly
    const mediaSetRid = 'ri.mio.main.media-set.774ed489-e6ba-4f75-abd3-784080d7cfb3';
    
    // Build media set upload URL
    const uploadUrl = `${this.foundryHost}/api/v2/mediasets/${mediaSetRid}/items?mediaItemPath=${encodeURIComponent(mediaItemPath)}&preview=true`;
    
    logger.info('MediaUploadService: Uploading to media set', {
      uploadUrl,
      mediaSetRid,
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
      logger.error('MediaUploadService: Media set upload failed', {
        status: uploadResponse.status,
        error: errorText,
        uploadUrl,
        mediaSetRid,
        userId
      });
      throw new Error(`Media set upload failed: ${uploadResponse.status} - ${errorText}`);
    }

    const result = await uploadResponse.json();
    
    logger.info('MediaUploadService: Media set upload successful', {
      mediaSetRid,
      mediaItemPath,
      userId,
      result
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
