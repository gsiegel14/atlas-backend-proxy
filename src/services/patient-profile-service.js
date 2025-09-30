/**
 * Patient Profile Service
 * Handles patient profile operations using Foundry Ontology API
 */

import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';

const FOUNDRY_BASE_URL = process.env.FOUNDRY_BASE_URL || 'https://atlasengine.palantirfoundry.com/api';
const ONTOLOGY_RID = process.env.FOUNDRY_ONTOLOGY_API_NAME || process.env.ONTOLOGY_RID || 'ontology-151e0d3d-719c-464d-be5c-a6dc9f53d194';

class PatientProfileService {
    constructor(foundryToken) {
        this.foundryToken = foundryToken;
    }

    /**
     * Find patient profile by user_id using Ontology search
     */
    async findProfileByUserId(userId) {
        try {
            const url = `${FOUNDRY_BASE_URL}/v2/ontologies/${ONTOLOGY_RID}/objects/A/search`;
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.foundryToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    where: {
                        type: 'eq',
                        field: 'user_id',
                        value: userId
                    },
                    pageSize: 1
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error('Failed to search for profile', { 
                    status: response.status, 
                    error: errorText,
                    userId 
                });
                throw new Error(`Failed to search profile: ${response.statusText}`);
            }

            const result = await response.json();
            
            if (result.data && result.data.length > 0) {
                logger.info('Found existing profile', { 
                    atlasId: result.data[0].atlasId,
                    userId 
                });
                return result.data[0];
            }

            logger.info('No existing profile found', { userId });
            return null;

        } catch (error) {
            logger.error('Error finding profile by user_id', { 
                error: error.message,
                userId 
            });
            throw error;
        }
    }

    /**
     * Apply edit-a action to update patient profile
     * Uses Foundry Ontology API v2
     */
    async updateProfile(atlasId, profileData) {
        try {
            const url = `${FOUNDRY_BASE_URL}/v2/ontologies/${ONTOLOGY_RID}/actions/edit-a/apply`;
            
            // Prepare parameters - only include fields that have values
            const parameters = {
                A: atlasId, // Primary key
            };

            // Map incoming data to Foundry parameter IDs
            if (profileData.firstName !== undefined) parameters.first_name = profileData.firstName;
            if (profileData.lastName !== undefined) parameters.last_name = profileData.lastName;
            if (profileData.email !== undefined) parameters.email = profileData.email;
            if (profileData.phoneNumber !== undefined) parameters.phonenumber = profileData.phoneNumber;
            if (profileData.address !== undefined) parameters.address = profileData.address;
            if (profileData.userId !== undefined) parameters.user_id = profileData.userId;
            
            // New demographic fields
            if (profileData.dateOfBirth !== undefined) parameters.date_of_birth = profileData.dateOfBirth;
            if (profileData.birthSex !== undefined) parameters.birth_sex = profileData.birthSex;
            if (profileData.pronouns !== undefined) parameters.pronouns = profileData.pronouns;
            
            // Emergency contact
            if (profileData.emergencyContactName !== undefined) {
                parameters.emergency_contact_name = profileData.emergencyContactName;
            }
            if (profileData.emergencyContactPhone !== undefined) {
                parameters.emergency_contact_phone = profileData.emergencyContactPhone;
            }
            
            // Medical history - convert array to string if needed
            if (profileData.familyMedicalHistory !== undefined) {
                parameters.family_medical_history = Array.isArray(profileData.familyMedicalHistory) 
                    ? profileData.familyMedicalHistory.join(', ')
                    : profileData.familyMedicalHistory;
            }
            
            // HealthKit fields - convert boolean to string
            if (profileData.healthKitAuthorized !== undefined) {
                parameters.health_kit_authorized = String(profileData.healthKitAuthorized);
            }
            if (profileData.healthKitAuthorizationDate !== undefined) {
                parameters.health_kit_authorization_date = profileData.healthKitAuthorizationDate;
            }
            
            // Media reference for photo (if provided)
            if (profileData.photo !== undefined) {
                parameters.photo = profileData.photo;
            }
            
            // Always update timestamp
            parameters.timestamp = new Date().toISOString();

            const requestBody = {
                parameters,
                options: {
                    returnEdits: 'ALL' // Return the updated object
                }
            };

            logger.info('Applying edit-a action', { 
                atlasId, 
                parameterKeys: Object.keys(parameters) 
            });

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.foundryToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error('Failed to apply edit-a action', { 
                    status: response.status, 
                    error: errorText,
                    atlasId 
                });
                throw new Error(`Failed to update profile: ${response.statusText}`);
            }

            const result = await response.json();
            
            logger.info('Successfully applied edit-a action', { 
                atlasId,
                resultType: result.type 
            });

            return result;

        } catch (error) {
            logger.error('Error updating profile', { 
                error: error.message,
                atlasId 
            });
            throw error;
        }
    }

    /**
     * Create new patient profile
     * This assumes there's a create-a action or we use edit-a with a new atlasId
     */
    async createProfile(userId, profileData) {
        try {
            // Generate a new atlasId (you may have a different strategy)
            const atlasId = `atlas_${userId}_${Date.now()}`;
            
            // Use edit-a action to create (it will create if doesn't exist)
            const fullProfileData = {
                ...profileData,
                userId,
            };

            const result = await this.updateProfile(atlasId, fullProfileData);
            
            logger.info('Created new profile', { atlasId, userId });
            
            return result;

        } catch (error) {
            logger.error('Error creating profile', { 
                error: error.message,
                userId 
            });
            throw error;
        }
    }

    /**
     * Update or create patient profile (upsert operation)
     */
    async upsertProfile(userId, profileData) {
        try {
            // First, try to find existing profile
            const existingProfile = await this.findProfileByUserId(userId);

            if (existingProfile) {
                // Update existing profile
                logger.info('Updating existing profile', { 
                    atlasId: existingProfile.atlasId,
                    userId 
                });
                return await this.updateProfile(existingProfile.atlasId, profileData);
            } else {
                // Create new profile
                logger.info('Creating new profile', { userId });
                return await this.createProfile(userId, profileData);
            }

        } catch (error) {
            logger.error('Error upserting profile', { 
                error: error.message,
                userId 
            });
            throw error;
        }
    }

    /**
     * Batch update multiple profiles
     * Uses the applyBatch endpoint
     */
    async batchUpdateProfiles(updates) {
        try {
            const url = `${FOUNDRY_BASE_URL}/v2/ontologies/${ONTOLOGY_RID}/actions/edit-a/applyBatch`;
            
            const requests = updates.map(update => ({
                parameters: {
                    A: update.atlasId,
                    first_name: update.firstName,
                    last_name: update.lastName,
                    email: update.email,
                    phonenumber: update.phoneNumber,
                    address: update.address,
                    user_id: update.userId,
                    date_of_birth: update.dateOfBirth,
                    birth_sex: update.birthSex,
                    pronouns: update.pronouns,
                    emergency_contact_name: update.emergencyContactName,
                    emergency_contact_phone: update.emergencyContactPhone,
                    family_medical_history: Array.isArray(update.familyMedicalHistory)
                        ? update.familyMedicalHistory.join(', ')
                        : update.familyMedicalHistory,
                    health_kit_authorized: String(update.healthKitAuthorized),
                    health_kit_authorization_date: update.healthKitAuthorizationDate,
                    timestamp: new Date().toISOString()
                }
            }));

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.foundryToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    requests,
                    options: {
                        returnEdits: 'NONE' // Don't return edits for batch
                    }
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                logger.error('Failed to batch update profiles', { 
                    status: response.status, 
                    error: errorText 
                });
                throw new Error(`Failed to batch update: ${response.statusText}`);
            }

            const result = await response.json();
            logger.info('Successfully batch updated profiles', { 
                count: updates.length 
            });

            return result;

        } catch (error) {
            logger.error('Error batch updating profiles', { 
                error: error.message 
            });
            throw error;
        }
    }
}

export default PatientProfileService;
