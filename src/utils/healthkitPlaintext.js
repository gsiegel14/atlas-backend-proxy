import crypto from 'crypto';

export const HEALTHKIT_TEXT_SCHEMA_VERSION = '1.0.0';

const DEFAULT_COLUMNS = [
    { key: 'index', header: '#'},
    { key: 'uuid', header: 'UUID' },
    { key: 'sampleClass', header: 'Sample Class' },
    { key: 'sampleType', header: 'Sample Type' },
    { key: 'dataType', header: 'Data Type' },
    { key: 'startDate', header: 'Start' },
    { key: 'endDate', header: 'End' },
    { key: 'quantityType', header: 'Quantity Type' },
    { key: 'valueNumeric', header: 'Value (Numeric)' },
    { key: 'valueDouble', header: 'Value (Double)' },
    { key: 'valueInteger', header: 'Value (Integer)' },
    { key: 'valueText', header: 'Value (Text)' },
    { key: 'unit', header: 'Unit' },
    { key: 'categoryType', header: 'Category Type' },
    { key: 'sleepStage', header: 'Sleep Stage' },
    { key: 'correlationType', header: 'Correlation Type' },
    { key: 'childSampleUUIDs', header: 'Child Sample UUIDs' },
    { key: 'workoutActivityType', header: 'Workout Activity Type' },
    { key: 'workoutDurationSeconds', header: 'Workout Duration (s)' },
    { key: 'workoutEventCount', header: 'Workout Event Count' },
    { key: 'activeEnergyKilocalories', header: 'Active Energy (kcal)' },
    { key: 'totalEnergyKilocalories', header: 'Total Energy (kcal)' },
    { key: 'totalDistanceMeters', header: 'Total Distance (m)' },
    { key: 'sourceName', header: 'Source Name' },
    { key: 'sourceBundleId', header: 'Source Bundle Id' },
    { key: 'sourceVersion', header: 'Source Version' },
    { key: 'deviceName', header: 'Device Name' },
    { key: 'deviceManufacturer', header: 'Device Manufacturer' },
    { key: 'deviceModel', header: 'Device Model' },
    { key: 'deviceHardwareVersion', header: 'Device Hardware Version' },
    { key: 'deviceFirmwareVersion', header: 'Device Firmware Version' },
    { key: 'deviceSoftwareVersion', header: 'Device Software Version' },
    { key: 'deviceLocalIdentifier', header: 'Device Local Identifier' },
    { key: 'deviceUDI', header: 'Device UDI' },
    { key: 'userProvidedFlag', header: 'User Provided' },
    { key: 'metadataJSON', header: 'Metadata (JSON)' },
    { key: 'deviceJSON', header: 'Device (JSON)' },
    { key: 'extraFieldsJSON', header: 'Extra Fields (JSON)' },
    { key: 'rawJson', header: 'Raw JSON' },
    { key: 'recordHashSha256', header: 'Record SHA256' }
];

const RECOGNIZED_FIELDS = new Set([
    'sampleClass',
    'sampleType',
    'uuid',
    'startDate',
    'endDate',
    'dataType',
    'sourceBundleId',
    'sourceName',
    'sourceVersion',
    'metadata',
    'device',
    'userProvidedFlag',
    'quantityType',
    'valueDouble',
    'unit',
    'valueText',
    'categoryType',
    'valueInteger',
    'sleepStage',
    'correlationType',
    'childSampleUUIDs',
    'activityType',
    'durationSeconds',
    'activeEnergyKilocalories',
    'totalEnergyKilocalories',
    'totalDistanceMeters',
    'workoutEventCount'
]);

function safeJsonStringify(value) {
    if (value === null || value === undefined) {
        return null;
    }
    try {
        return JSON.stringify(value);
    } catch (error) {
        return null;
    }
}

function flattenHealthkitRecord(record, index, rawLine) {
    const valueDouble = typeof record.valueDouble === 'number' ? record.valueDouble : null;
    const valueInteger = typeof record.valueInteger === 'number' ? record.valueInteger : null;
    const valueNumeric = valueDouble ?? valueInteger ?? null;
    const childSampleUUIDs = Array.isArray(record.childSampleUUIDs)
        ? record.childSampleUUIDs.join(';')
        : null;

    const device = typeof record.device === 'object' && record.device !== null ? record.device : null;
    const metadata = typeof record.metadata === 'object' && record.metadata !== null ? record.metadata : null;

    const extraFields = {};
    for (const [key, value] of Object.entries(record)) {
        if (!RECOGNIZED_FIELDS.has(key)) {
            extraFields[key] = value;
        }
    }

    const recordHashSha256 = rawLine
        ? crypto.createHash('sha256').update(rawLine, 'utf8').digest('hex')
        : null;

    return {
        index: index + 1,
        uuid: record.uuid ?? null,
        sampleClass: record.sampleClass ?? null,
        sampleType: record.sampleType ?? null,
        dataType: record.dataType ?? null,
        startDate: record.startDate ?? null,
        endDate: record.endDate ?? null,
        quantityType: record.quantityType ?? null,
        valueNumeric,
        valueDouble,
        valueInteger,
        valueText: record.valueText ?? null,
        unit: record.unit ?? null,
        categoryType: record.categoryType ?? null,
        sleepStage: record.sleepStage ?? null,
        correlationType: record.correlationType ?? null,
        childSampleUUIDs,
        workoutActivityType: record.activityType ?? null,
        workoutDurationSeconds: record.durationSeconds ?? null,
        workoutEventCount: record.workoutEventCount ?? null,
        activeEnergyKilocalories: record.activeEnergyKilocalories ?? null,
        totalEnergyKilocalories: record.totalEnergyKilocalories ?? null,
        totalDistanceMeters: record.totalDistanceMeters ?? null,
        sourceName: record.sourceName ?? null,
        sourceBundleId: record.sourceBundleId ?? null,
        sourceVersion: record.sourceVersion ?? null,
        deviceName: device?.name ?? null,
        deviceManufacturer: device?.manufacturer ?? null,
        deviceModel: device?.model ?? null,
        deviceHardwareVersion: device?.hardwareVersion ?? null,
        deviceFirmwareVersion: device?.firmwareVersion ?? null,
        deviceSoftwareVersion: device?.softwareVersion ?? null,
        deviceLocalIdentifier: device?.localIdentifier ?? null,
        deviceUDI: device?.udi ?? null,
        userProvidedFlag: typeof record.userProvidedFlag === 'boolean' ? String(record.userProvidedFlag) : null,
        metadataJSON: safeJsonStringify(metadata),
        deviceJSON: safeJsonStringify(device),
        extraFieldsJSON: Object.keys(extraFields).length > 0 ? safeJsonStringify(extraFields) : null,
        rawJson: safeJsonStringify(record),
        recordHashSha256
    };
}

function valueToCell(value) {
    if (value === null || value === undefined) {
        return '';
    }
    if (typeof value === 'string') {
        return value.replace(/\|/g, '\\|').replace(/\n/g, '<br>');
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
        return '';
    }
    if (typeof value === 'object') {
        return safeJsonStringify(value) ?? '';
    }
    return String(value);
}

function toMarkdownTable(columns, rows, maxRows) {
    const limit = typeof maxRows === 'number' && maxRows > 0 ? maxRows : rows.length;
    const effectiveRows = rows.slice(0, limit);
    const headerLine = `| ${columns.map((col) => col.header).join(' | ')} |`;
    const dividerLine = `|${columns.map(() => ' --- ').join('|')}|`;
    const bodyLines = effectiveRows.map((row) => {
        const cells = columns.map((col) => valueToCell(row[col.key]));
        return `| ${cells.join(' | ')} |`;
    });
    let table = [headerLine, dividerLine, ...bodyLines].join('\n');
    if (rows.length > limit) {
        table += `\n<!-- Truncated ${rows.length - limit} additional rows -->`;
    }
    return table;
}

function escapeCsvValue(value) {
    if (value === null || value === undefined) {
        return '';
    }
    const str = typeof value === 'string' ? value : String(value);
    if (str.includes('"') || str.includes(',') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function toCsv(columns, rows) {
    const header = columns.map((col) => escapeCsvValue(col.header)).join(',');
    const body = rows.map((row) => columns.map((col) => escapeCsvValue(row[col.key])).join(','));
    return [header, ...body].join('\n');
}

export function transformHealthkitNdjson(ndjsonBuffer, options = {}) {
    const buffer = ndjsonBuffer ?? Buffer.alloc(0);
    const ndjsonSha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    if (!ndjsonBuffer || ndjsonBuffer.length === 0) {
        return {
            schemaVersion: HEALTHKIT_TEXT_SCHEMA_VERSION,
            recordCount: 0,
            rows: [],
            markdownTable: '',
            csv: '',
            errors: ['Empty NDJSON payload'],
            columns: getHealthkitTableColumns(),
            ndjsonSha256
        };
    }

    const text = ndjsonBuffer.toString('utf8');
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);

    const rows = [];
    const errors = [];

    lines.forEach((line, index) => {
        try {
            const parsed = JSON.parse(line);
            const flattened = flattenHealthkitRecord(parsed, index, line);
            rows.push(flattened);
        } catch (error) {
            errors.push(`Line ${index + 1}: ${error.message}`);
        }
    });

    const markdownMaxRows = options.maxMarkdownRows ?? 200;
    const markdownTable = rows.length > 0
        ? toMarkdownTable(DEFAULT_COLUMNS, rows, markdownMaxRows)
        : '';
    const csv = rows.length > 0 ? toCsv(DEFAULT_COLUMNS, rows) : '';

    return {
        schemaVersion: HEALTHKIT_TEXT_SCHEMA_VERSION,
        recordCount: rows.length,
        rows,
        columns: getHealthkitTableColumns(),
        markdownTable,
        csv,
        errors,
        ndjsonSha256
    };
}

export function getHealthkitTableColumns() {
    return DEFAULT_COLUMNS.map((column) => ({ ...column }));
}
