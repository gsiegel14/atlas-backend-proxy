import dotenv from 'dotenv';
import { createClient as createOSDKClient } from '@osdk/client';
import { createConfidentialOauthClient } from '@osdk/oauth';

// Import generated SDK object types
// Note: These imports will only work after running 'npm install' with FOUNDRY_TOKEN set
let A, FastenClinicalNotes, AiChatHistoryProduction, AtlasIntraencounterProduction;
try {
    const sdk = await import('@atlas-dev/sdk');
    A = sdk.A;
    FastenClinicalNotes = sdk.FastenClinicalNotes;
    AiChatHistoryProduction = sdk.AiChatHistoryProduction;
    AtlasIntraencounterProduction = sdk.AtlasIntraencounterProduction;
    console.log('✅ Successfully imported @atlas-dev/sdk object types');
} catch (error) {
    console.warn('⚠️ Could not import @atlas-dev/sdk:', error.message);
    console.warn('⚠️ OSDK will operate in fallback mode. Run: npm install with FOUNDRY_TOKEN set');
    // Set to undefined so we can check later
    A = undefined;
    FastenClinicalNotes = undefined;
    AiChatHistoryProduction = undefined;
    AtlasIntraencounterProduction = undefined;
}

dotenv.config();

const DEFAULT_HOST = 'https://atlasengine.palantirfoundry.com';
const host = process.env.FOUNDRY_HOST ?? DEFAULT_HOST;
const bypassInitialization = process.env.NODE_ENV === 'test'
    || (process.env.OSDK_CLIENT_DISABLE ?? '').toLowerCase() === 'true';

// Ontology RID must be provided unless we are bypassing for tests
const ontologyRid = process.env.FOUNDRY_ONTOLOGY_RID
    ?? (bypassInitialization ? 'ontology-test-bypass' : undefined);
if (!ontologyRid) {
    throw new Error('FOUNDRY_ONTOLOGY_RID environment variable is required');
}

console.log('OSDK Client Configuration:', {
    host,
    ontologyRid,
    hasClientId: !!process.env.FOUNDRY_CLIENT_ID,
    hasClientSecret: !!process.env.FOUNDRY_CLIENT_SECRET
});

// Scopes from Foundry documentation (includes admin scopes)
const DEFAULT_SCOPES = [
    'api:use-ontologies-read',
    'api:use-ontologies-write',
    'api:use-admin-read',           // Added from Foundry docs
    'api:use-admin-write',          // Added from Foundry docs
    'api:use-datasets-read',
    'api:use-datasets-write',
    'api:use-filesystem-read',
    'api:use-filesystem-write',
    'api:use-aip-agents-read',
    'api:use-aip-agents-write',
    'api:use-streams-read',
    'api:use-streams-write',
    'api:use-connectivity-read',
    'api:use-connectivity-write',
    'api:use-connectivity-execute',
    'api:use-orchestration-read',
    'api:use-orchestration-write',
    'api:use-mediasets-read',
    'api:use-mediasets-write',
    'api:use-sql-queries-read',
    'api:use-sql-queries-execute'
];

function createTokenProvider() {
    const token = process.env.FOUNDRY_TOKEN;
    const clientId = process.env.FOUNDRY_CLIENT_ID;
    const clientSecret = process.env.FOUNDRY_CLIENT_SECRET;

    if (clientId && clientSecret) {
        const scopes = process.env.FOUNDRY_SCOPES
            ? process.env.FOUNDRY_SCOPES.split(',').map(scope => scope.trim()).filter(Boolean)
            : DEFAULT_SCOPES;
        return createConfidentialOauthClient(clientId, clientSecret, host, scopes);
    }

    if (token) {
        return async () => token;
    }

    throw new Error('OSDK client requires FOUNDRY_TOKEN or FOUNDRY_CLIENT_ID/FOUNDRY_CLIENT_SECRET environment variables.');
}

let client;

if (bypassInitialization) {
    console.log('Skipping OSDK client initialization (test mode)');
    client = {};
} else {
    const tokenProvider = createTokenProvider();

    // OSDK client uses the original RID format
    console.log('Using original ontology RID for OSDK client:', {
        ontologyRid: ontologyRid
    });

    // OSDK v2 createClient returns a function that is called with object types
    // Example: client(FastenClinicalNotes).fetchPage()
    try {
        console.log('Creating OSDK client with:', { 
            host, 
            ontologyRid: ontologyRid.substring(0, 30) + '...',
            hasClientId: !!process.env.FOUNDRY_CLIENT_ID,
            hasClientSecret: !!process.env.FOUNDRY_CLIENT_SECRET
        });
        
        const baseClient = createOSDKClient(host, ontologyRid, tokenProvider);
        
        // OSDK v2 returns a function - wrap it to provide both direct call and legacy .ontology() method
        if (baseClient && typeof baseClient === 'function') {
            // Create a wrapper that provides both patterns:
            // 1. Direct call: client(ObjectType).fetchPage() - OSDK v2 pattern
            // 2. Legacy: client.ontology(rid).objects(type) - for backward compatibility
            client = Object.assign(baseClient, {
                ontology: (rid) => ({
                    objects: (objectType) => baseClient(objectType),
                    action: (actionType) => ({
                        applyAction: async (params, options) => {
                            // For actions, we need to use the action API
                            throw new Error('Action API not implemented via OSDK wrapper - use REST API fallback');
                        }
                    })
                })
            });
            
            console.log('✅ OSDK client created and wrapped successfully');
            console.log('✅ Supports both client(ObjectType) and client.ontology(rid).objects(type) patterns');
            
            // Check if SDK types are available
            if (A && FastenClinicalNotes) {
                console.log('✅ OSDK object types available: A, FastenClinicalNotes');
            } else {
                console.warn('⚠️ OSDK client created but SDK types not available');
                console.warn('⚠️ Install @atlas-dev/sdk with: FOUNDRY_TOKEN=xxx npm install');
            }
        } else {
            console.warn('⚠️ OSDK client created but has unexpected structure:', {
                clientType: typeof baseClient,
                clientKeys: baseClient ? Object.keys(baseClient).slice(0, 5) : []
            });
            client = null;
        }
    } catch (error) {
        console.error('WARNING: Failed to create OSDK client (continuing with REST API only):', {
            error: error.message,
            stack: error.stack,
            host,
            ontologyRid,
            ontologyRidLength: ontologyRid.length,
            ontologyRidType: typeof ontologyRid,
            hasCredentials: !!(process.env.FOUNDRY_CLIENT_ID && process.env.FOUNDRY_CLIENT_SECRET)
        });
        // Don't throw - allow the service to start with REST API endpoints only
        client = null; // Use null instead of {} to make checks clearer
        console.log('OSDK client disabled - REST API endpoints will still work');
    }
}

// Export the API name for REST API calls - use explicit FOUNDRY_ONTOLOGY_API_NAME if provided
// This allows using a different ontology for REST API vs OSDK client
const exportedOntologyRid = process.env.FOUNDRY_ONTOLOGY_API_NAME || (() => {
    if (!bypassInitialization && ontologyRid.startsWith('ri.ontology.main.ontology.')) {
        const uuid = ontologyRid.replace('ri.ontology.main.ontology.', '');
        return `ontology-${uuid}`;
    }
    return ontologyRid;
})();

// Export client, host, ontology RID, and object types
export { 
    client, 
    host as osdkHost, 
    exportedOntologyRid as osdkOntologyRid,
    A,                              // AtlasCarePatientProfile object type
    FastenClinicalNotes,            // FastenClinicalNotes object type
    AiChatHistoryProduction,        // AiChatHistoryProduction object type
    AtlasIntraencounterProduction   // AtlasIntraencounterProduction object type
};
