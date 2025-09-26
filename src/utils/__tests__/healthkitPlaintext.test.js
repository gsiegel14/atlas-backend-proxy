import crypto from 'crypto';
import {
    transformHealthkitNdjson,
    getHealthkitTableColumns,
    HEALTHKIT_TEXT_SCHEMA_VERSION
} from '../healthkitPlaintext.js';

describe('transformHealthkitNdjson', () => {
    const quantityRecord = {
        sampleClass: 'HKQuantitySample',
        sampleType: 'HKQuantityTypeIdentifierStepCount',
        uuid: '11111111-2222-3333-4444-555555555555',
        startDate: '2024-11-01T10:00:00Z',
        endDate: '2024-11-01T10:05:00Z',
        dataType: 'quantity',
        quantityType: 'HKQuantityTypeIdentifierStepCount',
        valueDouble: 1240,
        unit: 'count',
        sourceName: 'iPhone',
        sourceBundleId: 'com.example.app',
        metadata: {
            HKWasUserEntered: true,
            SyncIdentifier: 'sample-sync-id'
        },
        device: {
            name: 'Apple Watch',
            manufacturer: 'Apple'
        }
    };

    const categoryRecord = {
        sampleClass: 'HKCategorySample',
        sampleType: 'HKCategoryTypeIdentifierSleepAnalysis',
        uuid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        startDate: '2024-11-01T01:00:00Z',
        endDate: '2024-11-01T07:00:00Z',
        dataType: 'category',
        categoryType: 'HKCategoryTypeIdentifierSleepAnalysis',
        valueInteger: 1,
        sleepStage: 'asleepCore',
        sourceName: 'Apple Watch',
        sourceBundleId: 'com.apple.health.bundle',
        metadata: {
            HKWasUserEntered: false,
            SleepAnalysisInBed: false
        }
    };

    const ndjson = `${JSON.stringify(quantityRecord)}\n${JSON.stringify(categoryRecord)}`;
    const buffer = Buffer.from(ndjson, 'utf8');
    const expectedSha = crypto.createHash('sha256').update(buffer).digest('hex');

    it('produces flattened rows, markdown, and csv with schema metadata', () => {
        const result = transformHealthkitNdjson(buffer, { maxMarkdownRows: 10 });

        expect(result.schemaVersion).toBe(HEALTHKIT_TEXT_SCHEMA_VERSION);
        expect(result.recordCount).toBe(2);
        expect(result.ndjsonSha256).toBe(expectedSha);
        expect(result.columns).toEqual(getHealthkitTableColumns());
        expect(result.errors).toHaveLength(0);
        expect(result.markdownTable).toContain('UUID');
        expect(result.csv).toContain('Sample Type');

        expect(result.rows[0].uuid).toBe(quantityRecord.uuid);
        expect(result.rows[0].quantityType).toBe(quantityRecord.quantityType);
        expect(result.rows[0].valueDouble).toBe(quantityRecord.valueDouble);
        expect(result.rows[0].metadataJSON).toBe(JSON.stringify(quantityRecord.metadata));
        expect(result.rows[0].rawJson).toBe(JSON.stringify(quantityRecord));

        expect(result.rows[1].sleepStage).toBe(categoryRecord.sleepStage);
        expect(result.rows[1].valueInteger).toBe(categoryRecord.valueInteger);
        expect(result.rows[1].metadataJSON).toBe(JSON.stringify(categoryRecord.metadata));
        expect(result.rows[1].rawJson).toBe(JSON.stringify(categoryRecord));
    });

    it('reports errors for malformed lines but continues processing', () => {
        const malformed = `${JSON.stringify(quantityRecord)}\nnot-json`;
        const malformedBuffer = Buffer.from(malformed, 'utf8');

        const result = transformHealthkitNdjson(malformedBuffer, { maxMarkdownRows: 10 });

        expect(result.recordCount).toBe(1);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain('Line 2');
    });
});
