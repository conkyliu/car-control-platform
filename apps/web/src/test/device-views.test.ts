import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  IMEI_REGEX,
  ICCID_REGEX,
  validateImei,
  validateIccid,
  generateDeviceNo,
  calculateDeviceStats,
  filterDevices,
  getSignalQuality,
  getOnlineStatusMeta,
  getLifecycleStatusMeta,
  isValidStatusTransition,
  isApiError,
  SEED_PROJECTS,
  SEED_DEVICES,
  type DeviceDto,
  type DeviceQueryParams,
  type DeviceLifecycleStatus,
} from '../views/device/device-core.ts';
import {
  fetchDevicesApi,
  createDeviceApi,
  updateDeviceStatusApi,
  fetchProjectsApi,
  type CreateDeviceInput,
} from '../api/device.ts';
import { ApiError } from '../api/client.ts';

describe('Device Asset Management Center Core Logic Test Suite (TDD)', () => {
  const sampleDevices: DeviceDto[] = [
    {
      id: 'dev-001',
      deviceNo: 'DEV_TEST_001',
      imei: '868123045678901',
      iccid: '89860401123456789012',
      productKey: 'TBOX-G4-STD',
      productName: '4G 智慧车载终端 (标准版)',
      projectId: 'proj-sz-01',
      projectName: '深圳极速智慧车队',
      tenantId: 'tenant-001',
      boundVehiclePlate: '粤B·88888',
      boundVin: 'LFPH2E023N10001',
      onlineStatus: 'ONLINE',
      signalRsrp: -75,
      firmwareVersion: 'v2.1.0',
      status: 'ACTIVE',
      activatedAt: '2026-03-01 10:00:00',
      lastHeartbeatAt: '2026-10-12 10:00:00',
      createdAt: '2026-03-01 09:00:00',
    },
    {
      id: 'dev-002',
      deviceNo: 'DEV_TEST_002',
      imei: '868123045678902',
      iccid: '89860401123456789013',
      productKey: 'TBOX-G5-PRO',
      productName: '5G 高性能车载终端 (旗舰版)',
      projectId: 'proj-sz-01',
      projectName: '深圳极速智慧车队',
      tenantId: 'tenant-001',
      boundVehiclePlate: null,
      boundVin: null,
      onlineStatus: 'OFFLINE',
      signalRsrp: undefined,
      firmwareVersion: 'v2.0.8',
      status: 'ACTIVE',
      activatedAt: '2026-03-02 11:00:00',
      lastHeartbeatAt: '2026-10-11 12:00:00',
      createdAt: '2026-03-02 09:30:00',
    },
    {
      id: 'dev-003',
      deviceNo: 'DEV_TEST_003',
      imei: '868123045678903',
      iccid: '89860401123456789014',
      productKey: 'OBD-II-PLUS',
      productName: 'OBD-II 即插即用诊断仪',
      projectId: 'proj-gz-02',
      projectName: '广州网约出行运营二期',
      tenantId: 'tenant-001',
      boundVehiclePlate: '粤A·99887',
      boundVin: 'LFPH2E023N10003',
      onlineStatus: 'ALARMING',
      signalRsrp: -108,
      firmwareVersion: 'v2.0.8',
      status: 'ACTIVE',
      activatedAt: '2026-03-05 14:00:00',
      lastHeartbeatAt: '2026-10-12 09:55:00',
      createdAt: '2026-03-05 13:00:00',
    },
    {
      id: 'dev-004',
      deviceNo: 'DEV_TEST_004',
      imei: '868123045678904',
      iccid: '89860401123456789015',
      productKey: 'TBOX-G4-STD',
      productName: '4G 智慧车载终端 (标准版)',
      projectId: 'proj-sh-03',
      projectName: '上海城际新能源干线',
      tenantId: 'tenant-001',
      boundVehiclePlate: '沪A·E5678',
      boundVin: 'LFPH2E023N10004',
      onlineStatus: 'ONLINE',
      signalRsrp: -92,
      firmwareVersion: 'v2.1.0',
      status: 'INACTIVE',
      activatedAt: '2026-04-10 09:00:00',
      lastHeartbeatAt: '2026-10-12 08:30:00',
      createdAt: '2026-04-10 08:00:00',
    },
    {
      id: 'dev-005',
      deviceNo: 'DEV_TEST_005',
      imei: '868123045678905',
      iccid: '89860401123456789016',
      productKey: 'TCU-EV-100',
      productName: '新能源双路CAN控制器',
      projectId: 'proj-bj-04',
      projectName: '北方冷链特种运输项目',
      tenantId: 'tenant-001',
      boundVehiclePlate: null,
      boundVin: null,
      onlineStatus: 'OFFLINE',
      signalRsrp: -115,
      firmwareVersion: 'v1.9.0',
      status: 'DECOMMISSIONED',
      activatedAt: '2025-11-01 10:00:00',
      lastHeartbeatAt: '2026-01-10 10:00:00',
      createdAt: '2025-11-01 09:00:00',
    },
  ];

  it('IMEI and ICCID regexes strictly validate hardware identifiers', () => {
    // 1. Valid IMEI: exactly 15 digits
    assert.equal(validateImei('868123045678901'), true);
    assert.equal(validateImei('123456789012345'), true);
    assert.equal(IMEI_REGEX.test('868123045678901'), true);

    // Invalid IMEI: length != 15, contains letters, spaces, or symbols
    assert.equal(validateImei('86812304567890'), false); // 14 digits
    assert.equal(validateImei('8681230456789012'), false); // 16 digits
    assert.equal(validateImei('86812304567890a'), false); // contains letter
    assert.equal(validateImei(''), false);
    assert.equal(validateImei(' 868123045678901 '), false);

    // 2. Valid ICCID: 19 to 20 alphanumeric characters
    assert.equal(validateIccid('8986040112345678901'), true); // 19 chars
    assert.equal(validateIccid('89860401123456789012'), true); // 20 chars
    assert.equal(validateIccid('898604A112345678901F'), true); // contains letters
    assert.equal(ICCID_REGEX.test('89860401123456789012'), true);

    // Invalid ICCID: length < 19 or > 20, or contains special characters
    assert.equal(validateIccid('898604011234567890'), false); // 18 chars
    assert.equal(validateIccid('898604011234567890123'), false); // 21 chars
    assert.equal(validateIccid('89860401-12345678901'), false); // contains hyphen
    assert.equal(validateIccid(''), false);
  });

  it('generateDeviceNo produces unique sequential or randomized device serial numbers', () => {
    const dev1 = generateDeviceNo();
    const dev2 = generateDeviceNo();
    assert.ok(dev1.startsWith('DEV_'));
    assert.ok(dev2.startsWith('DEV_'));
    assert.notEqual(dev1, dev2);

    const customPrefix = generateDeviceNo('TBOX_');
    assert.ok(customPrefix.startsWith('TBOX_'));
  });

  it('calculateDeviceStats accurately computes summary metrics, online rate, and quota warning', () => {
    // 5 devices in sample: 2 Online, 2 Offline, 1 Alarming
    // With total quota = 10: 5/10 = 50% usage, isQuotaWarning = false
    const stats50 = calculateDeviceStats(sampleDevices, 10);
    assert.equal(stats50.totalCount, 5);
    assert.equal(stats50.onlineCount, 2);
    assert.equal(stats50.onlineRate, 40.0); // 2/5 = 40%
    assert.equal(stats50.offlineCount, 2);
    assert.equal(stats50.alarmingCount, 1);
    assert.equal(stats50.quotaUsage, 50.0);
    assert.equal(stats50.isQuotaWarning, false);

    // Edge case: 0 devices
    const emptyStats = calculateDeviceStats([], 100);
    assert.equal(emptyStats.totalCount, 0);
    assert.equal(emptyStats.onlineCount, 0);
    assert.equal(emptyStats.onlineRate, 0);
    assert.equal(emptyStats.quotaUsage, 0);
    assert.equal(emptyStats.isQuotaWarning, false);

    // Quota warning threshold: >= 90%
    // 5 devices with quota = 5 (100% usage) -> warning true
    const statsWarning100 = calculateDeviceStats(sampleDevices, 5);
    assert.equal(statsWarning100.quotaUsage, 100.0);
    assert.equal(statsWarning100.isQuotaWarning, true);

    // 9 devices with quota = 10 (90% usage) -> warning true
    const mock9 = Array.from({ length: 9 }, (_, i) => ({
      ...sampleDevices[0]!,
      id: `mock-${i}`,
      onlineStatus: 'ONLINE' as const,
    }));
    const statsWarning90 = calculateDeviceStats(mock9, 10);
    assert.equal(statsWarning90.quotaUsage, 90.0);
    assert.equal(statsWarning90.isQuotaWarning, true);

    // 8 devices with quota = 10 (80% usage) -> warning false
    const mock8 = Array.from({ length: 8 }, (_, i) => ({
      ...sampleDevices[0]!,
      id: `mock-${i}`,
      onlineStatus: 'ONLINE' as const,
    }));
    const statsWarning80 = calculateDeviceStats(mock8, 10);
    assert.equal(statsWarning80.quotaUsage, 80.0);
    assert.equal(statsWarning80.isQuotaWarning, false);
  });

  it('filterDevices filters across keyword, project, onlineStatus, firmwareVersion, and lifecycle status', () => {
    // 1. Keyword search by deviceNo
    const byDevNo = filterDevices(sampleDevices, { keyword: 'DEV_TEST_002' });
    assert.equal(byDevNo.length, 1);
    assert.equal(byDevNo[0]?.deviceNo, 'DEV_TEST_002');

    // 2. Keyword search by IMEI
    const byImei = filterDevices(sampleDevices, { keyword: '868123045678903' });
    assert.equal(byImei.length, 1);
    assert.equal(byImei[0]?.id, 'dev-003');

    // 3. Keyword search by ICCID
    const byIccid = filterDevices(sampleDevices, { keyword: '89860401123456789015' });
    assert.equal(byIccid.length, 1);
    assert.equal(byIccid[0]?.id, 'dev-004');

    // 4. Keyword search by license plate
    const byPlate = filterDevices(sampleDevices, { keyword: '88888' });
    assert.equal(byPlate.length, 1);
    assert.equal(byPlate[0]?.boundVehiclePlate, '粤B·88888');

    // 5. Keyword search by VIN
    const byVin = filterDevices(sampleDevices, { keyword: 'LFPH2E023N10004' });
    assert.equal(byVin.length, 1);
    assert.equal(byVin[0]?.boundVin, 'LFPH2E023N10004');

    // 6. Project filter
    const byProject = filterDevices(sampleDevices, { projectId: 'proj-sz-01' });
    assert.equal(byProject.length, 2);

    // 7. Online status filter
    const onlineDevs = filterDevices(sampleDevices, { onlineStatus: 'ONLINE' });
    assert.equal(onlineDevs.length, 2);
    const alarmingDevs = filterDevices(sampleDevices, { onlineStatus: 'ALARMING' });
    assert.equal(alarmingDevs.length, 1);
    assert.equal(alarmingDevs[0]?.id, 'dev-003');

    // 8. Firmware version filter
    const v210Devs = filterDevices(sampleDevices, { firmwareVersion: 'v2.1.0' });
    assert.equal(v210Devs.length, 2);

    // 9. Lifecycle status filter
    const activeDevs = filterDevices(sampleDevices, { status: 'ACTIVE' });
    assert.equal(activeDevs.length, 3);
    const decommissionedDevs = filterDevices(sampleDevices, { status: 'DECOMMISSIONED' });
    assert.equal(decommissionedDevs.length, 1);
    assert.equal(decommissionedDevs[0]?.id, 'dev-005');

    // 10. Multi-dimensional combined filter
    const combined = filterDevices(sampleDevices, {
      projectId: 'proj-sz-01',
      onlineStatus: 'ONLINE',
      status: 'ACTIVE',
      firmwareVersion: 'v2.1.0',
    });
    assert.equal(combined.length, 1);
    assert.equal(combined[0]?.id, 'dev-001');

    // 11. Empty filter returns all devices
    const all = filterDevices(sampleDevices, {});
    assert.equal(all.length, sampleDevices.length);
  });

  it('getSignalQuality maps RSRP values to 4G bar steps, labels, and theme colors', () => {
    // >= -85 dBm: 4 bars, excellent (green)
    const sig4 = getSignalQuality(-75);
    assert.equal(sig4.bars, 4);
    assert.equal(sig4.label, '极佳');
    assert.equal(sig4.color, '#52c41a');

    const sig4Border = getSignalQuality(-85);
    assert.equal(sig4Border.bars, 4);

    // -86 ~ -95 dBm: 3 bars, good (blue)
    const sig3 = getSignalQuality(-90);
    assert.equal(sig3.bars, 3);
    assert.equal(sig3.label, '良好');
    assert.equal(sig3.color, '#1677ff');

    const sig3Border = getSignalQuality(-95);
    assert.equal(sig3Border.bars, 3);

    // -96 ~ -105 dBm: 2 bars, moderate (orange)
    const sig2 = getSignalQuality(-100);
    assert.equal(sig2.bars, 2);
    assert.equal(sig2.label, '一般');
    assert.equal(sig2.color, '#faad14');

    const sig2Border = getSignalQuality(-105);
    assert.equal(sig2Border.bars, 2);

    // < -105 dBm: 1 bar, poor (red)
    const sig1 = getSignalQuality(-112);
    assert.equal(sig1.bars, 1);
    assert.equal(sig1.label, '极差');
    assert.equal(sig1.color, '#ff4d4f');

    // Missing / null / undefined RSRP: 0 bars (gray)
    const sig0 = getSignalQuality(undefined);
    assert.equal(sig0.bars, 0);
    assert.equal(sig0.label, '无信号');
    assert.equal(sig0.color, '#8c8c8c');
  });

  it('getOnlineStatusMeta and getLifecycleStatusMeta provide correct tags and badge colors', () => {
    const metaOnline = getOnlineStatusMeta('ONLINE');
    assert.equal(metaOnline.label, '在线');
    assert.equal(metaOnline.badgeColor, '#52c41a');

    const metaOffline = getOnlineStatusMeta('OFFLINE');
    assert.equal(metaOffline.label, '离线');
    assert.equal(metaOffline.badgeColor, '#8c8c8c');

    const metaAlarm = getOnlineStatusMeta('ALARMING');
    assert.equal(metaAlarm.label, '告警');
    assert.equal(metaAlarm.badgeColor, '#ff4d4f');

    const lifeActive = getLifecycleStatusMeta('ACTIVE');
    assert.equal(lifeActive.label, '正常启用');

    const lifeInactive = getLifecycleStatusMeta('INACTIVE');
    assert.equal(lifeInactive.label, '已停用');

    const lifeDecom = getLifecycleStatusMeta('DECOMMISSIONED');
    assert.equal(lifeDecom.label, '已报废');
  });

  it('isValidStatusTransition validates lifecycle state transitions correctly', () => {
    // ACTIVE can transition to INACTIVE or DECOMMISSIONED
    assert.equal(isValidStatusTransition('ACTIVE', 'INACTIVE'), true);
    assert.equal(isValidStatusTransition('ACTIVE', 'DECOMMISSIONED'), true);
    assert.equal(isValidStatusTransition('ACTIVE', 'ACTIVE'), true);

    // INACTIVE can transition to ACTIVE or DECOMMISSIONED
    assert.equal(isValidStatusTransition('INACTIVE', 'ACTIVE'), true);
    assert.equal(isValidStatusTransition('INACTIVE', 'DECOMMISSIONED'), true);
    assert.equal(isValidStatusTransition('INACTIVE', 'INACTIVE'), true);

    // DECOMMISSIONED is a terminal state; cannot transition back to ACTIVE or INACTIVE
    assert.equal(isValidStatusTransition('DECOMMISSIONED', 'ACTIVE'), false);
    assert.equal(isValidStatusTransition('DECOMMISSIONED', 'INACTIVE'), false);
    assert.equal(isValidStatusTransition('DECOMMISSIONED', 'DECOMMISSIONED'), true);
  });

  it('SEED_DEVICES contains production-grade sample entries with diverse projects and plates', () => {
    assert.ok(SEED_DEVICES.length >= 10);

    // Check presence of bound plates like 粤B·88888 and unbound devices
    const boundDevice = SEED_DEVICES.find((d) => d.boundVehiclePlate === '粤B·88888');
    assert.ok(boundDevice, 'Must contain sample device bound to 粤B·88888');

    const unboundDevice = SEED_DEVICES.find((d) => !d.boundVehiclePlate);
    assert.ok(unboundDevice, 'Must contain sample device with unbound vehicle');

    // All seed IMEIs must be valid 15-digit numbers
    for (const d of SEED_DEVICES) {
      assert.ok(validateImei(d.imei), `Device ${d.deviceNo} must have valid 15-digit IMEI`);
      if (d.iccid) {
        assert.ok(validateIccid(d.iccid), `Device ${d.deviceNo} must have valid ICCID`);
      }
    }
  });

  it('isApiError differentiates server ApiError instances correctly', () => {
    const realApiError = new ApiError('IMEI conflict', 409, 'Conflict', { imei: '868123045678901' });
    assert.equal(isApiError(realApiError), true);

    const genericError = new Error('Network timeout');
    assert.equal(isApiError(genericError), false);

    const plainObjectLikeApiError = { statusCode: 500, message: 'Server Internal' };
    assert.equal(isApiError(plainObjectLikeApiError), true);

    assert.equal(isApiError(null), false);
    assert.equal(isApiError(undefined), false);
    assert.equal(isApiError('error string'), false);
  });

  it('device API functions are exported and handle fallback gracefully', async () => {
    assert.equal(typeof fetchDevicesApi, 'function');
    assert.equal(typeof createDeviceApi, 'function');
    assert.equal(typeof updateDeviceStatusApi, 'function');
    assert.equal(typeof fetchProjectsApi, 'function');

    // Fetch projects falls back to SEED_PROJECTS when backend is offline
    const projects = await fetchProjectsApi();
    assert.ok(Array.isArray(projects));
    assert.ok(projects.length >= 2);

    // Fetch devices falls back to SEED_DEVICES when backend is offline
    const devices = await fetchDevicesApi();
    assert.ok(Array.isArray(devices));
    assert.ok(devices.length >= 10);

    // Create device falls back and returns newly created device
    const newDeviceInput: CreateDeviceInput = {
      deviceNo: 'DEV_AUTOTEST_999',
      imei: '868999045678901',
      productKey: 'TBOX-G4-STD',
      projectId: 'proj-sz-01',
      iccid: '89860401123456789099',
    };
    const created = await createDeviceApi(newDeviceInput);
    assert.equal(created.deviceNo, newDeviceInput.deviceNo);
    assert.equal(created.imei, newDeviceInput.imei);
    assert.equal(created.status, 'ACTIVE');

    // Update status falls back and updates status
    const updated = await updateDeviceStatusApi(created.id, 'INACTIVE');
    assert.equal(updated.status, 'INACTIVE');
  });
});
