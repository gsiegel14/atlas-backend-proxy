import dotenv from 'dotenv';
import { createClient as createOSDKClient } from '@osdk/client';
import { createConfidentialOauthClient } from '@osdk/oauth';

dotenv.config();

const DEFAULT_HOST = 'https://atlasengine.palantirfoundry.com';
const host = process.env.FOUNDRY_HOST ?? DEFAULT_HOST;
const bypassInitialization = process.env.NODE_ENV === 'test'
    || (process.env.OSDK_CLIENT_DISABLE ?? '').toLowerCase() === 'true'
    || true; // Always bypass OSDK client - using direct REST API calls instead

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

const DEFAULT_SCOPES = [
    'api:use-ontologies-read',
    'api:use-ontologies-write',
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

    // createClient returns a function that can be invoked with an object type export from the SDK
    try {
        console.log('Creating OSDK client with:', { host, ontologyRid: ontologyRid.substring(0, 30) + '...' });
        client = createOSDKClient(host, ontologyRid, tokenProvider);
        console.log('OSDK client created successfully');
    } catch (error) {
        console.error('WARNING: Failed to create OSDK client (continuing with REST API only):', {
            error: error.message,
            host,
            ontologyRid,
            ontologyRidLength: ontologyRid.length,
            ontologyRidType: typeof ontologyRid
        });
        // Don't throw - allow the service to start with REST API endpoints only
        client = {};
        console.log('OSDK client disabled - REST API endpoints will still work');
    }
}

// Export the converted API name for use in other services
let exportedOntologyRid = ontologyRid;
if (!bypassInitialization && ontologyRid.startsWith('ri.ontology.main.ontology.')) {
    const uuid = ontologyRid.replace('ri.ontology.main.ontology.', '');
    exportedOntologyRid = `ontology-${uuid}`;
}

export { client, host as osdkHost, exportedOntologyRid as osdkOntologyRid };
