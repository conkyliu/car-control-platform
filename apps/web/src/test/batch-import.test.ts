import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateDeviceImportTemplate,
  parseDeviceImportCsv,
  generateSkippedErrorsCsv,
  type ImportValidationResult,
  type ImportInvalidRow,
} from '../views/device/excel-import-core.ts';
import {
  batchImportDevicesApi,
  type BatchImportResultDto,
} from '../api/device.ts';
import type { CreateDeviceInput } from '../views/device/device-core.ts';

describe('Batch Device Import Core and Pre-validation Test Suite (TDD)', () => {
  it('1. generateDeviceImportTemplate generates spec-compliant UTF-8 BOM CSV template with valid headers and sample rows', () => {
    const template = generateDeviceImportTemplate();

    // Must start with UTF-8 BOM
    assert.ok(template.startsWith('\uFEFF'), 'Template must start with UTF-8 BOM (\\uFEFF)');

    const cleanContent = template.slice(1);
    const lines = cleanContent.split(/\r?\n/).filter((line) => line.trim().length > 0);

    // Assert header integrity
    const header = lines[0];
    assert.ok(header, 'Template must have a header');
    assert.equal(
      header,
      '设备编号(必填),IMEI(必填15位),硬件型号ProductKey(必填),归属项目ID(选填),ICCID(选填20位)'
    );

    // Assert at least 2 sample rows
    assert.ok(lines.length >= 3, `Expected at least 3 lines (1 header + 2 samples), got ${lines.length}`);
    const sample1 = lines[1]!;
    const sample2 = lines[2]!;

    assert.ok(sample1.includes('DEV_SZ_001'));
    assert.ok(sample1.includes('868123045678901'));
    assert.ok(sample1.includes('TBOX-G4-STD'));

    assert.ok(sample2.includes('868123045678902'));
    assert.ok(sample2.includes('TBOX-G5-PRO'));
  });

  it('2. parseDeviceImportCsv parses normal multi-row CSV with quoted cells, project defaults, and valid ICCID', () => {
    const csvContent =
      '\uFEFF设备编号(必填),IMEI(必填15位),硬件型号ProductKey(必填),归属项目ID(选填),ICCID(选填20位)\r\n' +
      'DEV_IMPORT_001,868123045678901,TBOX-G4-STD,proj-sz-01,89860401123456789001\r\n' +
      '"DEV_IMPORT_002",868123045678902,TBOX-G5-PRO,"proj-gz-02","89860401123456789002"\r\n' +
      'DEV_IMPORT_003,868123045678903,OBD-II-PLUS,,89860401123456789003\r\n';

    const result = parseDeviceImportCsv(csvContent, { remainingQuota: 50 });

    assert.equal(result.totalRows, 3);
    assert.equal(result.validItems.length, 3);
    assert.equal(result.invalidRows.length, 0);
    assert.equal(result.duplicateCount, 0);
    assert.equal(result.isQuotaExceeded, false);
    assert.equal(result.quotaRequired, 3);
    assert.equal(result.quotaAvailable, 50);
    assert.equal(result.maxRowsExceeded, false);

    const first = result.validItems[0]!;
    assert.equal(first.deviceNo, 'DEV_IMPORT_001');
    assert.equal(first.imei, '868123045678901');
    assert.equal(first.productKey, 'TBOX-G4-STD');
    assert.equal(first.projectId, 'proj-sz-01');
    assert.equal(first.iccid, '89860401123456789001');

    // DEV_IMPORT_003 has omitted project ID, should fallback to default
    const third = result.validItems[2]!;
    assert.equal(third.deviceNo, 'DEV_IMPORT_003');
    assert.ok(third.projectId.length > 0, 'Project ID should default when omitted');
  });

  it('3. parseDeviceImportCsv intercepts row format errors (IMEI, deviceNo, ProductKey, ICCID) and preserves row index', () => {
    const csvContent = [
      '设备编号(必填),IMEI(必填15位),硬件型号ProductKey(必填),归属项目ID(选填),ICCID(选填20位)',
      'DEV_OK,868123045678901,TBOX-G4-STD,proj-sz-01,89860401123456789001', // Row 2: OK
      'NO,868123045678902,TBOX-G4-STD,proj-sz-01,', // Row 3: deviceNo too short (< 3)
      'DEV_BAD_IMEI,1234567890,TBOX-G4-STD,proj-sz-01,', // Row 4: IMEI only 10 digits
      'DEV_ALPHA_IMEI,86812304567890A,TBOX-G4-STD,proj-sz-01,', // Row 5: IMEI contains letter
      'DEV_BAD_PROD,868123045678905,UNKNOWN_PRODUCT_KEY,proj-sz-01,', // Row 6: Invalid ProductKey
      'DEV_BAD_ICCID,868123045678906,TBOX-G4-STD,proj-sz-01,12345', // Row 7: ICCID too short (< 19)
    ].join('\n');

    const result = parseDeviceImportCsv(csvContent);

    assert.equal(result.totalRows, 6);
    assert.equal(result.validItems.length, 1);
    assert.equal(result.invalidRows.length, 5);

    // Row 3: deviceNo too short
    const errRow3 = result.invalidRows.find((r) => r.rowNumber === 3);
    assert.ok(errRow3, 'Should have error for line 3');
    assert.ok(errRow3.reason.includes('设备编号'));

    // Row 4: IMEI short
    const errRow4 = result.invalidRows.find((r) => r.rowNumber === 4);
    assert.ok(errRow4, 'Should have error for line 4');
    assert.ok(errRow4.reason.includes('IMEI'));

    // Row 5: IMEI alpha
    const errRow5 = result.invalidRows.find((r) => r.rowNumber === 5);
    assert.ok(errRow5, 'Should have error for line 5');
    assert.ok(errRow5.reason.includes('IMEI'));

    // Row 6: invalid ProductKey
    const errRow6 = result.invalidRows.find((r) => r.rowNumber === 6);
    assert.ok(errRow6, 'Should have error for line 6');
    assert.ok(errRow6.reason.includes('ProductKey') || errRow6.reason.includes('产品型号'));

    // Row 7: invalid ICCID
    const errRow7 = result.invalidRows.find((r) => r.rowNumber === 7);
    assert.ok(errRow7, 'Should have error for line 7');
    assert.ok(errRow7.reason.includes('ICCID'));
  });

  it('4. parseDeviceImportCsv detects intra-batch duplicate deviceNo and IMEI within the same batch', () => {
    const csvContent = [
      '设备编号(必填),IMEI(必填15位),硬件型号ProductKey(必填),归属项目ID(选填),ICCID(选填20位)',
      'DEV_DUP_001,868123045678901,TBOX-G4-STD,proj-sz-01,', // Row 2: first entry, valid
      'DEV_DUP_001,868123045678902,TBOX-G4-STD,proj-sz-01,', // Row 3: duplicate deviceNo
      'DEV_DUP_003,868123045678901,TBOX-G4-STD,proj-sz-01,', // Row 4: duplicate IMEI
      'DEV_DUP_004,868123045678904,TBOX-G4-STD,proj-sz-01,', // Row 5: valid entry
    ].join('\n');

    const result = parseDeviceImportCsv(csvContent);

    assert.equal(result.totalRows, 4);
    assert.equal(result.validItems.length, 2);
    assert.equal(result.invalidRows.length, 2);
    assert.equal(result.duplicateCount, 2);

    const dupDeviceRow = result.invalidRows.find((r) => r.rowNumber === 3);
    assert.ok(dupDeviceRow);
    assert.ok(dupDeviceRow.reason.includes('批内重复') && dupDeviceRow.reason.includes('设备编号'));

    const dupImeiRow = result.invalidRows.find((r) => r.rowNumber === 4);
    assert.ok(dupImeiRow);
    assert.ok(dupImeiRow.reason.includes('批内重复') && dupImeiRow.reason.includes('IMEI'));
  });

  it('5. parseDeviceImportCsv enforces 1000-row batch hard limit gate', () => {
    const header = '设备编号(必填),IMEI(必填15位),硬件型号ProductKey(必填),归属项目ID(选填),ICCID(选填20位)\n';
    const rows: string[] = [];

    // Generate 1001 rows
    for (let i = 1; i <= 1001; i++) {
      const padded = String(i).padStart(6, '0');
      rows.push(`DEV_${padded},868000000000000,TBOX-G4-STD,proj-sz-01,`);
    }

    const csvContent = header + rows.join('\n');
    const result = parseDeviceImportCsv(csvContent);

    assert.equal(result.totalRows, 1001);
    assert.equal(result.maxRowsExceeded, true);
  });

  it('6. parseDeviceImportCsv detects tenant remaining quota overflow and blocks', () => {
    const csvContent = [
      '设备编号(必填),IMEI(必填15位),硬件型号ProductKey(必填),归属项目ID(选填),ICCID(选填20位)',
      'DEV_Q_001,868123045678901,TBOX-G4-STD,proj-sz-01,',
      'DEV_Q_002,868123045678902,TBOX-G4-STD,proj-sz-01,',
      'DEV_Q_003,868123045678903,TBOX-G4-STD,proj-sz-01,',
      'DEV_Q_004,868123045678904,TBOX-G4-STD,proj-sz-01,',
      'DEV_Q_005,868123045678905,TBOX-G4-STD,proj-sz-01,',
    ].join('\n');

    // Case A: Quota is 3, valid items is 5 -> exceeded
    const exceededResult = parseDeviceImportCsv(csvContent, { remainingQuota: 3 });
    assert.equal(exceededResult.validItems.length, 5);
    assert.equal(exceededResult.isQuotaExceeded, true);
    assert.equal(exceededResult.quotaRequired, 5);
    assert.equal(exceededResult.quotaAvailable, 3);

    // Case B: Quota is 10, valid items is 5 -> sufficient
    const sufficientResult = parseDeviceImportCsv(csvContent, { remainingQuota: 10 });
    assert.equal(sufficientResult.validItems.length, 5);
    assert.equal(sufficientResult.isQuotaExceeded, false);
    assert.equal(sufficientResult.quotaRequired, 5);
    assert.equal(sufficientResult.quotaAvailable, 10);
  });

  it('7. generateSkippedErrorsCsv exports standard UTF-8 BOM CSV with error reasons and formula injection defense', () => {
    const sampleErrors: ImportInvalidRow[] = [
      {
        rowNumber: 3,
        deviceNo: 'DEV_BAD',
        imei: '12345',
        productKey: 'TBOX-G4-STD',
        reason: 'IMEI 必须为严格 15 位数字',
      },
      {
        rowNumber: 7,
        deviceNo: '=CMD|calc.exe',
        imei: '+868123045678901',
        reason: '潜在恶意命令注入与格式错误',
      },
      {
        rowNumber: 12,
        deviceNo: 'DEV_TRICKY',
        imei: '868123045678999',
        reason: '包含逗号, 与 "引号" 的复杂错误原因',
      },
    ];

    const errorCsv = generateSkippedErrorsCsv(sampleErrors);

    // BOM
    assert.ok(errorCsv.startsWith('\uFEFF'), 'Error CSV must have UTF-8 BOM');

    const lines = errorCsv.slice(1).split(/\r?\n/).filter((l) => l.trim().length > 0);
    assert.equal(lines[0], '行号,设备编号,IMEI,失败或跳过原因');

    // Formula injection hardening
    assert.ok(
      errorCsv.includes("''=CMD|calc.exe") || errorCsv.includes("'=CMD|calc.exe"),
      'Leading = should be escaped'
    );
    assert.ok(
      errorCsv.includes("'+868123045678901") || errorCsv.includes("''+868123045678901"),
      'Leading + should be escaped'
    );

    // Special characters escaping
    assert.ok(errorCsv.includes('""引号""'));
    assert.ok(errorCsv.includes('"包含逗号, 与 ""引号"" 的复杂错误原因"'));
  });

  it('8. batchImportDevicesApi performs batch creation and handles offline fallback with duplicate detection', async () => {
    const uniqueSuffix = Date.now().toString().slice(-6);
    const newDevices: CreateDeviceInput[] = [
      {
        deviceNo: `DEV_IMPORT_T_${uniqueSuffix}_1`,
        imei: `8689990456${uniqueSuffix.slice(-5)}1`,
        productKey: 'TBOX-G4-STD',
        projectId: 'proj-sz-01',
      },
      {
        deviceNo: `DEV_IMPORT_T_${uniqueSuffix}_2`,
        imei: `8689990456${uniqueSuffix.slice(-5)}2`,
        productKey: 'TBOX-G5-PRO',
        projectId: 'proj-sz-01',
      },
    ];

    const result = await batchImportDevicesApi(newDevices);

    assert.equal(result.total, 2);
    assert.equal(result.successCount, 2);
    assert.equal(result.errors.length, 0);

    // Re-importing same items should trigger duplicate detection in offline pool
    const dupResult = await batchImportDevicesApi([newDevices[0]!]);
    assert.equal(dupResult.total, 1);
    assert.equal(dupResult.successCount, 0);
    assert.equal(dupResult.errors.length, 1);
    assert.ok(dupResult.errors[0]?.reason.includes('已存在'));
  });
});
