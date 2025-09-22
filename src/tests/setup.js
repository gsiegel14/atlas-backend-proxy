// Test setup file
import { jest } from '@jest/globals';
import dotenv from 'dotenv';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Set test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise in tests

// Mock Redis client for tests
jest.mock('redis', () => ({
  createClient: jest.fn(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    ping: jest.fn().mockResolvedValue('PONG'),
    quit: jest.fn().mockResolvedValue(undefined),
    sendCommand: jest.fn().mockResolvedValue(undefined)
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
