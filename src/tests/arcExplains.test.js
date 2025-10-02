import express from 'express';
import { jest } from '@jest/globals';
import request from 'supertest';

import arcExplainsRouter from '../routes/arcExplains.js';
import { ArcExplainService } from '../services/arcExplainService.js';

const createApp = ({ user, context } = {}) => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    if (user === null) {
      delete req.user;
    } else if (user !== undefined) {
      req.user = user;
    } else {
      req.user = { sub: 'auth0|test-user' };
    }

    if (context !== undefined) {
      req.context = context;
    } else if (!req.context) {
      req.context = { username: req.user?.sub };
    }

    req.correlationId = req.correlationId || 'test-correlation-id';
    next();
  });

  app.use('/api/v1/foundry/arc-explains', arcExplainsRouter);
  return app;
};

describe('Arc Explains API', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns explanation using resolved Auth0 identifier', async () => {
    const explainSpy = jest
      .spyOn(ArcExplainService.prototype, 'explain')
      .mockResolvedValue('Mocked explanation text');

    const app = createApp({
      user: { sub: 'auth0|user-123', scope: 'read:patient execute:actions' },
      context: { username: 'auth0|user-123' }
    });

    const response = await request(app)
      .post('/api/v1/foundry/arc-explains')
      .send({
        chartReview: ' Procedure details here ',
        auth0Id: 'auth0|user-override'
      })
      .expect(200);

    expect(explainSpy).toHaveBeenCalledWith({
      auth0Id: 'auth0|user-123',
      chartReview: ' Procedure details here ',
      correlationId: 'test-correlation-id'
    });

    expect(response.body).toMatchObject({
      success: true,
      data: 'Mocked explanation text'
    });
  });

  it('returns 400 when chartReview missing', async () => {
    const explainSpy = jest.spyOn(ArcExplainService.prototype, 'explain');

    const app = createApp({
      user: { sub: 'auth0|user-123' },
      context: { username: 'auth0|user-123' }
    });

    const response = await request(app)
      .post('/api/v1/foundry/arc-explains')
      .send({})
      .expect(400);

    expect(explainSpy).not.toHaveBeenCalled();
    expect(response.body).toMatchObject({
      error: expect.objectContaining({
        code: 'INVALID_REQUEST'
      })
    });
  });

  it('returns 400 when identity cannot be resolved', async () => {
    const explainSpy = jest.spyOn(ArcExplainService.prototype, 'explain');

    const app = createApp({
      user: null,
      context: {}
    });

    const response = await request(app)
      .post('/api/v1/foundry/arc-explains')
      .send({ chartReview: 'Some text' })
      .expect(400);

    expect(explainSpy).not.toHaveBeenCalled();
    expect(response.body).toMatchObject({
      error: expect.objectContaining({
        code: 'MISSING_IDENTITY'
      })
    });
  });
});
