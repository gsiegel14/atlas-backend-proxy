import express from 'express';
import request from 'supertest';
import { jest } from '@jest/globals';
import {
    HEALTHKIT_TEXT_SCHEMA_VERSION
} from '../utils/healthkitPlaintext.js';

let testApp;
let createHealthkitSpy;

const buildTestApp = (router) => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        req.user = {
            sub: 'auth0|test-user',
            scope: 'read:patient execute:actions'
        };
        req.correlationId = 'test-correlation-id';
        next();
    });
    app.use('/api/v1/healthkit', router);
    return app;
};

describe('POST /api/v1/healthkit/export', () => {
    const sampleRecord = {
        sampleClass: 'HKQuantitySample',
        sampleType: 'HKQuantityTypeIdentifierStepCount',
        uuid: '12345678-90ab-cdef-1234-567890abcdef',
        startDate: '2024-11-01T10:00:00Z',
        endDate: '2024-11-01T10:05:00Z',
        dataType: 'quantity',
        quantityType: 'HKQuantityTypeIdentifierStepCount',
        valueDouble: 42,
        unit: 'count',
        sourceName: 'iPhone'
    };

    beforeAll(async () => {
        process.env.HEALTHKIT_EXPORT_ENABLE_PLAINTEXT = 'true';
        process.env.HEALTHKIT_PLAINTEXT_MAX_MD_ROWS = '10';

        const foundryModule = await import('../services/foundryService.js');
        createHealthkitSpy = jest.spyOn(foundryModule.FoundryService.prototype, 'createHealthkitRaw')
            .mockResolvedValue({ ok: true });

        const { healthkitRouter } = await import('../routes/healthkit.js');
        testApp = buildTestApp(healthkitRouter);
    });

    afterEach(() => {
        createHealthkitSpy.mockClear();
    });

    afterAll(() => {
        createHealthkitSpy.mockRestore();
        delete process.env.HEALTHKIT_EXPORT_ENABLE_PLAINTEXT;
        delete process.env.HEALTHKIT_PLAINTEXT_MAX_MD_ROWS;
    });

    it('forwards plaintext artifact alongside raw payload when feature flag enabled', async () => {
        const ndjson = `${JSON.stringify(sampleRecord)}`;
        const base64 = Buffer.from(ndjson, 'utf8').toString('base64');

        const response = await request(testApp)
            .post('/api/v1/healthkit/export')
            .send({ rawhealthkit: base64 });

        expect(response.status).toBe(200);

        expect(createHealthkitSpy).toHaveBeenCalledTimes(1);
        const payload = createHealthkitSpy.mock.calls[0][0];

        expect(payload.rawhealthkit).toBe(base64);
        expect(payload.plaintexthealthkit).toBeDefined();
        expect(payload.plaintexthealthkit.schemaVersion).toBe(HEALTHKIT_TEXT_SCHEMA_VERSION);
        expect(payload.plaintexthealthkit.recordCount).toBe(1);
        expect(payload.plaintexthealthkit.ndjsonSha256).toBeDefined();
        expect(payload.plaintexthealthkit.csvBase64).toBeDefined();
        expect(payload.plaintexthealthkit.markdownBase64).toBeDefined();

        expect(response.body.plaintext).toMatchObject({
            schemaVersion: HEALTHKIT_TEXT_SCHEMA_VERSION,
            recordCount: 1,
            ndjsonSha256: payload.plaintexthealthkit.ndjsonSha256
        });
    });
});
