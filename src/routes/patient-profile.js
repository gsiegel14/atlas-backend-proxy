/**
 * Patient Profile Routes
 * Handles patient profile CRUD operations via Foundry Ontology API
 */

import express from 'express';
import PatientProfileService from '../services/patient-profile-service.js';
import { logger } from '../utils/logger.js';
import crypto from 'crypto';

const router = express.Router();

// Note: Auth0 JWT validation is handled by server.js middleware for all /api routes
// req.auth will contain the validated JWT payload with user info

/**
 * POST /api/v1/patient-profile/update
 * Update or create patient profile with setup data
 * 
 * Body:
 * {
 *   "dateOfBirth": "1990-01-15",
 *   "birthSex": "Male",
 *   "pronouns": "he/him",
 *   "emergencyContactName": "Jane Doe",
 *   "emergencyContactPhone": "+1234567890",
 *   "familyMedicalHistory": ["Heart Disease", "Type 2 Diabetes"],
 *   "healthKitAuthorized": true
 * }
 */
router.post('/update', async (req, res) => {
    const correlationId = req.headers['x-correlation-id'] || crypto.randomUUID();
    
    try {
        // Extract user ID from Auth0 token
        const userId = req.auth.sub;
        
        logger.info('Patient profile update request', { 
            userId, 
            correlationId,
            hasDateOfBirth: !!req.body.dateOfBirth,
            hasFamilyHistory: !!req.body.familyMedicalHistory
        });

        // Get Foundry token (from service account)
        const foundryToken = process.env.FOUNDRY_TOKEN || process.env.FOUNDRY_SERVICE_TOKEN;
        if (!foundryToken) {
            logger.error('Foundry service token not configured', { correlationId });
            return res.status(500).json({
                success: false,
                error: 'Service configuration error'
            });
        }

        const profileService = new PatientProfileService(foundryToken);

        // Prepare profile data from request body
        const profileData = {};
        
        if (req.body.firstName) profileData.firstName = req.body.firstName;
        if (req.body.lastName) profileData.lastName = req.body.lastName;
        if (req.body.email) profileData.email = req.body.email;
        if (req.body.phoneNumber) profileData.phoneNumber = req.body.phoneNumber;
        if (req.body.address) profileData.address = req.body.address;
        
        // Demographics
        if (req.body.dateOfBirth) profileData.dateOfBirth = req.body.dateOfBirth;
        if (req.body.birthSex) profileData.birthSex = req.body.birthSex;
        if (req.body.pronouns) profileData.pronouns = req.body.pronouns;
        
        // Emergency contact
        if (req.body.emergencyContactName) {
            profileData.emergencyContactName = req.body.emergencyContactName;
        }
        if (req.body.emergencyContactPhone) {
            profileData.emergencyContactPhone = req.body.emergencyContactPhone;
        }
        
        // Medical history
        if (req.body.familyMedicalHistory) {
            profileData.familyMedicalHistory = req.body.familyMedicalHistory;
        }
        
        // HealthKit
        if (req.body.healthKitAuthorized !== undefined) {
            profileData.healthKitAuthorized = req.body.healthKitAuthorized;
            
            // Auto-set authorization date if newly authorized
            if (req.body.healthKitAuthorized && !req.body.healthKitAuthorizationDate) {
                profileData.healthKitAuthorizationDate = new Date().toISOString();
            }
        }
        
        if (req.body.healthKitAuthorizationDate) {
            profileData.healthKitAuthorizationDate = req.body.healthKitAuthorizationDate;
        }

        // Upsert the profile
        const result = await profileService.upsertProfile(userId, profileData);

        logger.info('Successfully updated patient profile', { 
            userId, 
            correlationId,
            resultType: result.type 
        });

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: result
        });

    } catch (error) {
        logger.error('Failed to update patient profile', { 
            error: error.message,
            stack: error.stack,
            correlationId 
        });
        
        res.status(500).json({
            success: false,
            error: error.message,
            correlationId
        });
    }
});

/**
 * GET /api/v1/patient-profile
 * Get current user's patient profile
 */
router.get('/', async (req, res) => {
    const correlationId = req.headers['x-correlation-id'] || crypto.randomUUID();
    
    try {
        const userId = req.auth.sub;
        
        logger.info('Patient profile fetch request', { userId, correlationId });

        const foundryToken = process.env.FOUNDRY_TOKEN || process.env.FOUNDRY_SERVICE_TOKEN;
        if (!foundryToken) {
            logger.error('Foundry service token not configured', { correlationId });
            return res.status(500).json({
                success: false,
                error: 'Service configuration error'
            });
        }

        const profileService = new PatientProfileService(foundryToken);
        const profile = await profileService.findProfileByUserId(userId);

        if (!profile) {
            logger.info('No profile found for user', { userId, correlationId });
            return res.status(404).json({
                success: false,
                error: 'Profile not found'
            });
        }

        logger.info('Successfully fetched patient profile', { 
            userId, 
            atlasId: profile.atlasId,
            correlationId 
        });

        res.json({
            success: true,
            data: profile
        });

    } catch (error) {
        logger.error('Failed to fetch patient profile', { 
            error: error.message,
            stack: error.stack,
            correlationId 
        });
        
        res.status(500).json({
            success: false,
            error: error.message,
            correlationId
        });
    }
});

/**
 * PATCH /api/v1/patient-profile/partial
 * Partially update patient profile (only specified fields)
 * 
 * Body: Any subset of profile fields
 */
router.patch('/partial', async (req, res) => {
    const correlationId = req.headers['x-correlation-id'] || crypto.randomUUID();
    
    try {
        const userId = req.auth.sub;
        
        logger.info('Partial profile update request', { 
            userId, 
            correlationId,
            updateFields: Object.keys(req.body)
        });

        const foundryToken = process.env.FOUNDRY_TOKEN || process.env.FOUNDRY_SERVICE_TOKEN;
        if (!foundryToken) {
            logger.error('Foundry service token not configured', { correlationId });
            return res.status(500).json({
                success: false,
                error: 'Service configuration error'
            });
        }

        const profileService = new PatientProfileService(foundryToken);

        // Find existing profile
        const existingProfile = await profileService.findProfileByUserId(userId);
        
        if (!existingProfile) {
            logger.warn('Attempting partial update on non-existent profile', { 
                userId, 
                correlationId 
            });
            return res.status(404).json({
                success: false,
                error: 'Profile not found. Use POST /update to create.'
            });
        }

        // Apply update with only the provided fields
        const result = await profileService.updateProfile(
            existingProfile.atlasId,
            req.body
        );

        logger.info('Successfully partially updated patient profile', { 
            userId,
            atlasId: existingProfile.atlasId,
            correlationId 
        });

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: result
        });

    } catch (error) {
        logger.error('Failed to partially update patient profile', { 
            error: error.message,
            stack: error.stack,
            correlationId 
        });
        
        res.status(500).json({
            success: false,
            error: error.message,
            correlationId
        });
    }
});

/**
 * POST /api/v1/patient-profile/batch-update
 * Admin endpoint to batch update multiple profiles
 * Requires admin role
 * 
 * Body:
 * {
 *   "updates": [
 *     { "atlasId": "...", "firstName": "...", ... },
 *     { "atlasId": "...", "firstName": "...", ... }
 *   ]
 * }
 */
router.post('/batch-update', async (req, res) => {
    const correlationId = req.headers['x-correlation-id'] || crypto.randomUUID();
    
    try {
        // Check if user has admin role (implement your own auth check)
        const userRoles = req.auth.permissions || [];
        if (!userRoles.includes('admin')) {
            logger.warn('Unauthorized batch update attempt', { 
                userId: req.auth.sub,
                correlationId 
            });
            return res.status(403).json({
                success: false,
                error: 'Insufficient permissions'
            });
        }

        logger.info('Batch profile update request', { 
            userId: req.auth.sub,
            count: req.body.updates?.length,
            correlationId 
        });

        if (!req.body.updates || !Array.isArray(req.body.updates)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid request: updates array required'
            });
        }

        const foundryToken = process.env.FOUNDRY_TOKEN || process.env.FOUNDRY_SERVICE_TOKEN;
        if (!foundryToken) {
            logger.error('Foundry service token not configured', { correlationId });
            return res.status(500).json({
                success: false,
                error: 'Service configuration error'
            });
        }

        const profileService = new PatientProfileService(foundryToken);
        const result = await profileService.batchUpdateProfiles(req.body.updates);

        logger.info('Successfully batch updated profiles', { 
            count: req.body.updates.length,
            correlationId 
        });

        res.json({
            success: true,
            message: `Successfully updated ${req.body.updates.length} profiles`,
            data: result
        });

    } catch (error) {
        logger.error('Failed to batch update profiles', { 
            error: error.message,
            stack: error.stack,
            correlationId 
        });
        
        res.status(500).json({
            success: false,
            error: error.message,
            correlationId
        });
    }
});

export default router;
