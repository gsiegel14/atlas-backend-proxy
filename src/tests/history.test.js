import { jest } from '@jest/globals';
import request from 'supertest';
import { FoundryService } from '../services/foundryService.js';

let app;

beforeAll(async () => {
  process.env.FOUNDRY_ONTOLOGY_RID = process.env.FOUNDRY_ONTOLOGY_RID
    || 'ri.ontology.main.ontology.00000000-0000-0000-0000-000000000000';

  if (!app) {
    ({ default: app } = await import('../server.js'));
  }
});

describe('Chat history API', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('POST /api/v1/history/chat', () => {
    it('creates a chat history entry via Foundry service', async () => {
      const spy = jest
        .spyOn(FoundryService.prototype, 'createChatHistoryEntry')
        .mockResolvedValue({
          rid: 'ri.ontology.test.object.chatHistory.1',
          status: 'ok'
        });

      const body = {
        transcript: '   How are you today?   ',
        timestamp: '2024-10-01T12:00:00.123Z'
      };

      const response = await request(app)
        .post('/api/v1/history/chat')
        .set('Authorization', 'Bearer test-token')
        .send(body)
        .expect(201);

      expect(spy).toHaveBeenCalledWith({
        userId: 'test.user@example.com',
        transcript: 'How are you today?',
        timestamp: '2024-10-01T12:00:00.123Z',
        additionalParameters: {},
        options: {}
      });

      expect(response.body).toMatchObject({
        success: true,
        data: { status: 'ok' }
      });
    });

    it('returns 400 when transcript is missing', async () => {
      const response = await request(app)
        .post('/api/v1/history/chat')
        .set('Authorization', 'Bearer test-token')
        .send({ timestamp: '2024-10-01T12:00:00.123Z' })
        .expect(400);

      expect(response.body).toMatchObject({
        error: expect.objectContaining({
          code: 'INVALID_REQUEST'
        })
      });
    });

    it('returns 400 when unable to resolve user identity', async () => {
      const authModule = require('../middleware/auth0.js');
      const tokenSpy = jest
        .spyOn(authModule, 'validateAuth0Token')
        .mockImplementation((req, res, next) => {
          req.user = { sub: 'auth0|test-user', scope: 'execute:actions' };
          next();
        });

      const response = await request(app)
        .post('/api/v1/history/chat')
        .set('Authorization', 'Bearer test-token')
        .send({ transcript: 'Hello there!' })
        .expect(400);

      expect(response.body).toMatchObject({
        error: expect.objectContaining({
          code: 'MISSING_IDENTITY'
        })
      });

      tokenSpy.mockRestore();
    });
  });
});
