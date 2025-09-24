import { jest } from '@jest/globals';
import request from 'supertest';
import { FoundryService } from '../services/foundryService.js';

let app;

beforeAll(async () => {
  process.env.FOUNDRY_ONTOLOGY_RID = process.env.FOUNDRY_ONTOLOGY_RID
    || 'ri.ontology.main.ontology.00000000-0000-0000-0000-000000000000';
  process.env.FOUNDRY_VITALS_OBJECT_TYPE = 'FastenVitals';
  process.env.FOUNDRY_OBSERVATIONS_OBJECT_TYPE = 'FastenObservations';

  if (!app) {
    ({ default: app } = await import('../server.js'));
  }
});

describe('Observations API', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses FastenVitals object type for vital-signs category and normalizes payload', async () => {
    const searchSpy = jest
      .spyOn(FoundryService.prototype, 'searchOntologyObjects')
      .mockResolvedValue({
        data: [
          {
            properties: {
              vitalId: 'vital-123',
              auth0id: 'auth0|test-user',
              date: '2024-10-18T12:34:00.000Z',
              category: 'Vital Signs',
              vitalType: 'Blood Pressure Systolic',
              codeDisplay: 'Systolic Blood Pressure',
              valueNumeric: 120,
              valueString: '120',
              unit: 'mmHg'
            }
          }
        ],
        nextPageToken: null
      });

    const response = await request(app)
      .get('/api/v1/foundry/observations')
      .set('Authorization', 'Bearer test-token')
      .query({ patientId: 'auth0|test-user', category: 'vital-signs', pageSize: 5 })
      .expect(200);

    expect(searchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^ontology-/),
      'FastenVitals',
      expect.objectContaining({
        where: expect.any(Object),
        pageSize: 5
      })
    );

    expect(response.body).toMatchObject({
      success: true,
      data: [
        expect.objectContaining({
          id: 'vital-123',
          observationDate: '2024-10-18T12:34:00.000Z',
          category: 'Vital Signs',
          codeDisplay: 'Systolic Blood Pressure',
          valueNumeric: 120,
          valueUnit: 'mmHg'
        })
      ]
    });
  });
});
