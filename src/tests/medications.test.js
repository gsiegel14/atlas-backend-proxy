import { jest } from '@jest/globals';
import request from 'supertest';
import { FoundryService } from '../services/foundryService.js';

let app;

beforeAll(async () => {
  process.env.FOUNDRY_ONTOLOGY_RID = process.env.FOUNDRY_ONTOLOGY_RID
    || 'ri.ontology.main.ontology.00000000-0000-0000-0000-000000000000';
  process.env.FOUNDRY_TOKEN = process.env.FOUNDRY_TOKEN || 'test-token';

  if (!app) {
    ({ default: app } = await import('../server.js'));
  }
});

describe('Medications uploads API', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('GET /api/v1/medications/uploads', () => {
    it('returns uploads for the resolved Auth0 username', async () => {
      const uploads = [
        {
          rid: 'ri.ontology.test.object.medicationsUpload.1',
          medicationId: 'med-1',
          timestamp: '2024-09-20T12:00:00Z',
          userId: 'test.user@example.com',
          photolabel: { $rid: 'ri.media.item.1' },
          properties: {
            medicationId: 'med-1',
            timestamp: '2024-09-20T12:00:00Z',
            userId: 'test.user@example.com',
            photolabel: { $rid: 'ri.media.item.1' }
          },
          source: {
            ontologyId: 'ontology-test-rid',
            objectType: 'MedicationsUpload'
          }
        }
      ];

      const spy = jest
        .spyOn(FoundryService.prototype, 'listMedicationsUploads')
        .mockResolvedValue(uploads);

      const response = await request(app)
        .get('/api/v1/medications/uploads')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(spy).toHaveBeenCalledWith(['test.user@example.com'], { limit: 50 });
      expect(response.body).toMatchObject({
        success: true,
        count: 1,
        data: uploads
      });
    });

    it('returns 400 when no identifier can be resolved', async () => {
      const authModule = require('../middleware/auth0.js');
      const tokenSpy = jest
        .spyOn(authModule, 'validateAuth0Token')
        .mockImplementation((req, res, next) => {
          req.user = { scope: 'read:patient execute:actions' };
          next();
        });

      const response = await request(app)
        .get('/api/v1/medications/uploads')
        .set('Authorization', 'Bearer test-token')
        .expect(400);

      expect(response.body).toMatchObject({
        error: expect.objectContaining({
          code: 'MISSING_IDENTITY'
        })
      });

      tokenSpy.mockRestore();
    });
  });

  describe('POST /api/v1/medications/uploads', () => {
    it('applies the medications upload action', async () => {
      const spy = jest
        .spyOn(FoundryService.prototype, 'createMedicationsUpload')
        .mockResolvedValue({
          status: 'ok',
          rid: 'ri.ontology.test.object.medicationsUpload.2'
        });

      const body = {
        timestamp: '2024-09-22T00:09:43.854Z',
        photolabel: 'ri.media.item.123'
      };

      const response = await request(app)
        .post('/api/v1/medications/uploads')
        .set('Authorization', 'Bearer test-token')
        .send(body)
        .expect(201);

      expect(spy).toHaveBeenCalledWith({
        userId: 'test.user@example.com',
        timestamp: body.timestamp,
        photolabel: { $rid: 'ri.media.item.123' },
        additionalParameters: {},
        options: {}
      });

      expect(response.body).toMatchObject({
        success: true,
        data: { status: 'ok' }
      });
    });

    it('returns 400 when photolabel is missing', async () => {
      const response = await request(app)
        .post('/api/v1/medications/uploads')
        .set('Authorization', 'Bearer test-token')
        .send({})
        .expect(400);

      expect(response.body).toMatchObject({
        error: expect.objectContaining({
          code: 'INVALID_REQUEST'
        })
      });
    });
  });
});
