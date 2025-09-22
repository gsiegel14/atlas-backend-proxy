import request from 'supertest';

let app;

beforeAll(async () => {
  process.env.FOUNDRY_ONTOLOGY_RID = process.env.FOUNDRY_ONTOLOGY_RID
    || 'ri.ontology.main.ontology.00000000-0000-0000-0000-000000000000';
  process.env.FOUNDRY_TOKEN = process.env.FOUNDRY_TOKEN || 'test-token';

  if (!app) {
    ({ default: app } = await import('../server.js'));
  }
});

describe('Health Endpoints', () => {
  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        timestamp: expect.any(String),
        version: expect.any(String),
        correlationId: expect.any(String)
      });
    });
  });

  describe('GET /health/ready', () => {
    it('should return readiness status', async () => {
      const response = await request(app)
        .get('/health/ready')
        .expect(200);

      expect(response.body).toMatchObject({
        status: expect.stringMatching(/ready|not ready/),
        checks: expect.objectContaining({
          foundry: expect.any(Boolean),
          redis: expect.any(Boolean),
          auth0: expect.any(Boolean)
        }),
        timestamp: expect.any(String),
        correlationId: expect.any(String)
      });
    });
  });

  describe('GET /health/live', () => {
    it('should return liveness status', async () => {
      const response = await request(app)
        .get('/health/live')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'alive',
        uptime: expect.any(Number),
        memory: expect.objectContaining({
          rss: expect.any(Number),
          heapTotal: expect.any(Number),
          heapUsed: expect.any(Number),
          external: expect.any(Number)
        }),
        timestamp: expect.any(String),
        correlationId: expect.any(String)
      });
    });
  });
});
