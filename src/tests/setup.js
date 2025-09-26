// Test setup file
import { jest } from '@jest/globals';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise in tests

// Mock Redis client for tests
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn().mockRejectedValue(new Error('redis disabled in tests')),
    ping: jest.fn().mockResolvedValue('PONG'),
    quit: jest.fn().mockResolvedValue(undefined),
    sendCommand: jest.fn().mockResolvedValue('OK')
  }))
}));

jest.mock('../middleware/auth0.js', () => {
  const actual = jest.requireActual('../middleware/auth0.js');
  return {
    ...actual,
    validateAuth0Token: (req, res, next) => {
      req.user = req.user || {
        sub: 'auth0|test-user',
        scope: 'read:patient execute:actions',
        preferred_username: 'test.user@example.com',
        email: 'test.user@example.com'
      };
      next();
    }
  };
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authModuleAbsolutePath = path.resolve(__dirname, '../middleware/auth0.js');

jest.mock(authModuleAbsolutePath, () => {
  const actual = jest.requireActual('../middleware/auth0.js');
  return {
    ...actual,
    validateAuth0Token: (req, res, next) => {
      req.user = req.user || {
        sub: 'auth0|test-user',
        scope: 'read:patient execute:actions',
        preferred_username: 'test.user@example.com',
        email: 'test.user@example.com'
      };
      next();
    }
  };
});

jest.mock('../osdk/client.js', () => ({
  client: {},
  osdkHost: process.env.FOUNDRY_HOST || 'https://test.osdk',
  osdkOntologyRid: process.env.FOUNDRY_ONTOLOGY_RID || 'ontology-00000000-0000-0000-0000-000000000000'
}));
