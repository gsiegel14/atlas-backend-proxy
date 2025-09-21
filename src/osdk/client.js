import dotenv from 'dotenv';
import { createClient as createOSDKClient } from '@osdk/client';
import { createConfidentialOauthClient } from '@osdk/oauth';

dotenv.config();

const DEFAULT_HOST = 'https://atlasengine.palantirfoundry.com';
const host = process.env.FOUNDRY_HOST ?? DEFAULT_HOST;

// Ontology RID must be provided via environment variable
const ontologyRid = process.env.FOUNDRY_ONTOLOGY_RID;
if (!ontologyRid) {
    throw new Error('FOUNDRY_ONTOLOGY_RID environment variable is required');
}

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

const tokenProvider = createTokenProvider();

// createClient returns a function that can be invoked with an object type export from the SDK
const client = createOSDKClient(host, ontologyRid, tokenProvider);

export { client, host as osdkHost, ontologyRid as osdkOntologyRid };
