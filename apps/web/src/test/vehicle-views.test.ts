import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  VIN_REGEX,
  PLATE_REGEX,
  validateVin,
  validatePlateNumber,
  generateSampleVin,
  maskPhone,
  formatVoltage,
  calculateVehicleStats,
  filterVehicles,
  getVehicleStatusMeta,
  isValidVehicleStatusTransition,
  isApiError,
  SEED_BRANDS,
  SEED_MODELS,
  SEED_VEHICLES,
  type VehicleDto,
  type VehicleStatus,
  type VehicleQueryParams,
  type BrandDto,
  type ModelDto,
} from '../views/vehicle/vehicle-core.ts';
import {
  fetchVehiclesApi,
  fetchVehicleDetailApi,
  createVehicleApi,
  updateVehicleStatusApi,
  fetchBrandsApi,
  fetchModelsApi,
  type CreateVehicleInput,
} from '../api/vehicle.ts';
import { ApiError } from '../api/client.ts';

describe('Vehicle Asset Management Center Core & TDD Test Suite', () => {
  const sampleVehicles: VehicleDto[] = [
    {
      id: 'veh-001',
      vin: 'LFPH2E023N1000001',
      plateNumber: '粤B·88888',
      tenantId: 'tenant-001',
      projectId: 'proj-sz-01',
      projectName: '深圳极速智慧车队',
      brandId: 'brand-byd',
      brandName: '比亚迪',
      modelId: 'model-byd-han',
      modelName: '汉 EV',
      deviceId: 'dev-001',
      deviceNo: 'DEV_1001',
      deviceOnlineStatus: 'ONLINE',
      status: 'NORMAL',
      telemetry: {
        doorLocked: true,
        trunkLocked: true,
        engineStarted: false,
        batteryVoltage: 12.6,
        mileage: 15200,
        speed: 0,
        fuelOrBatteryLevel: 85,
        location: '深圳市南山区科技园南区',
        lastReportedAt: '2026-10-12 10:00:00',
      },
      ownerName: '张伟',
      ownerPhone: '13800138888',
      createdAt: '2026-03-01 10:00:00',
      updatedAt: '2026-10-12 10:00:00',
    },
    {
      id: 'veh-002',
      vin: 'LFPH2E023N1000002',
      plateNumber: '粤B·D12345',
      tenantId: 'tenant-001',
      projectId: 'proj-sz-01',
      projectName: '深圳极速智慧车队',
      brandId: 'brand-tesla',
      brandName: '特斯拉',
      modelId: 'model-tesla-modely',
      modelName: 'Model Y',
      deviceId: 'dev-002',
      deviceNo: 'DEV_1002',
      deviceOnlineStatus: 'ONLINE',
      status: 'NORMAL',
      telemetry: {
        doorLocked: true,
        trunkLocked: true,
        engineStarted: true,
        batteryVoltage: 13.8,
        mileage: 8920,
        speed: 45,
        fuelOrBatteryLevel: 72,
        location: '深圳市福田区深南大道',
        lastReportedAt: '2026-10-12 10:02:00',
      },
      ownerName: '李敏',
      ownerPhone: '13912345678',
      createdAt: '2026-03-02 11:00:00',
      updatedAt: '2026-10-12 10:02:00',
    },
    {
      id: 'veh-003',
      vin: 'LFPH2E023N1000003',
      plateNumber: '粤A·99887',
      tenantId: 'tenant-001',
      projectId: 'proj-gz-02',
      projectName: '广州网约出行运营二期',
      brandId: 'brand-aion',
      brandName: '广汽埃安',
      modelId: 'model-aion-s',
      modelName: 'AION S',
      deviceId: 'dev-003',
      deviceNo: 'DEV_1003',
      deviceOnlineStatus: 'OFFLINE',
      status: 'MAINTENANCE',
      telemetry: {
        doorLocked: false,
        trunkLocked: true,
        engineStarted: false,
        batteryVoltage: 11.2,
        mileage: 42100,
        speed: 0,
        fuelOrBatteryLevel: 30,
        location: '广州市天河区车陂检修厂',
        lastReportedAt: '2026-10-11 18:30:00',
      },
      ownerName: '王强',
      ownerPhone: '13788889988',
      createdAt: '2026-03-05 14:00:00',
      updatedAt: '2026-10-11 18:30:00',
    },
    {
      id: 'veh-004',
      vin: 'LFPH2E023N1000004',
      plateNumber: '沪A·12345',
      tenantId: 'tenant-001',
      projectId: 'proj-sh-03',
      projectName: '华东城际物流专线',
      brandId: 'brand-byd',
      brandName: '比亚迪',
      modelId: 'model-byd-han',
      modelName: '汉 EV',
      deviceId: 'dev-004',
      deviceNo: 'DEV_1004',
      deviceOnlineStatus: 'ONLINE',
      status: 'LOCKED',
      telemetry: {
        doorLocked: true,
        trunkLocked: true,
        engineStarted: false,
        batteryVoltage: 12.4,
        mileage: 31200,
        speed: 0,
        fuelOrBatteryLevel: 45,
        location: '上海市浦东新区张江高科',
        lastReportedAt: '2026-10-12 09:50:00',
      },
      ownerName: '陈晨',
      ownerPhone: '13500004321',
      createdAt: '2026-03-10 09:00:00',
      updatedAt: '2026-10-12 09:50:00',
    },
    {
      id: 'veh-005',
      vin: 'LFPH2E023N1000005',
      plateNumber: '京A·88990',
      tenantId: 'tenant-001',
      projectId: 'proj-bj-04',
      projectName: '北京高端政企车队',
      brandId: 'brand-tesla',
      brandName: '特斯拉',
      modelId: 'model-tesla-modely',
      modelName: 'Model Y',
      deviceId: null,
      deviceNo: null,
      deviceOnlineStatus: undefined,
      status: 'SCRAPPED',
      telemetry: undefined,
      ownerName: '孙权',
      ownerPhone: '13900008890',
      createdAt: '2026-01-15 10:00:00',
      updatedAt: '2026-09-01 10:00:00',
    },
    {
      id: 'veh-006',
      vin: 'LFPH2E023N1000006',
      plateNumber: '粤B·55443',
      tenantId: 'tenant-001',
      projectId: 'proj-sz-01',
      projectName: '深圳极速智慧车队',
      brandId: 'brand-zeekr',
      brandName: '吉利极氪',
      modelId: 'model-zeekr-001',
      modelName: '极氪 001',
      deviceId: null,
      deviceNo: null,
      deviceOnlineStatus: undefined,
      status: 'NORMAL',
      telemetry: {
        doorLocked: true,
        trunkLocked: true,
        engineStarted: false,
        batteryVoltage: 12.5,
        mileage: 1200,
        speed: 0,
        fuelOrBatteryLevel: 90,
      },
      ownerName: '周杰',
      ownerPhone: '13700005544',
      createdAt: '2026-04-01 15:00:00',
      updatedAt: '2026-10-12 08:00:00',
    },
  ];

  describe('1. ISO 3779 VIN 17-Char Validation (validateVin)', () => {
    it('accepts strictly valid 17-char VIN strings', () => {
      assert.equal(validateVin('LFPH2E023N1000001'), true);
      assert.equal(validateVin('LSVAA2180E2000002'), true);
      assert.equal(validateVin('1HGCR2F83HA000000'), true);
      assert.equal(validateVin('WP0AA29961S600000'), true);
    });

    it('intercepts VIN containing excluded characters I, O, Q', () => {
      // Contains 'I'
      assert.equal(validateVin('LFPH2E023NI000001'), false);
      // Contains 'O'
      assert.equal(validateVin('LFPH2E023NO000001'), false);
      // Contains 'Q'
      assert.equal(validateVin('LFPH2E023NQ000001'), false);
    });

    it('rejects VIN with incorrect lengths or invalid symbols', () => {
      // 16 chars (too short)
      assert.equal(validateVin('LFPH2E023N100000'), false);
      // 18 chars (too long)
      assert.equal(validateVin('LFPH2E023N10000001'), false);
      // Contains special symbols
      assert.equal(validateVin('LFPH2E023N10000-1'), false);
      assert.equal(validateVin('LFPH2E023N10000@1'), false);
      // Empty, null, non-string
      assert.equal(validateVin(''), false);
      assert.equal(validateVin(null as any), false);
      assert.equal(validateVin(undefined as any), false);
    });

    it('automatically trims whitespace and converts lowercase to uppercase', () => {
      assert.equal(validateVin('  lfph2e023n1000001  '), true);
    });

    it('generateSampleVin creates valid 17-char VIN passing validateVin', () => {
      for (let i = 0; i < 5; i++) {
        const vin = generateSampleVin();
        assert.equal(vin.length, 17);
        assert.equal(validateVin(vin), true);
        assert.equal(/[IOQ]/.test(vin), false);
      }
    });
  });

  describe('2. Chinese Vehicle Plate Number Validation (validatePlateNumber)', () => {
    it('accepts standard 7-char fuel vehicle plates with or without dot', () => {
      assert.equal(validatePlateNumber('粤B88888'), true);
      assert.equal(validatePlateNumber('粤B·88888'), true);
      assert.equal(validatePlateNumber('京A·12345'), true);
      assert.equal(validatePlateNumber('沪A12345'), true);
      assert.equal(validatePlateNumber('苏E·8888A'), true);
    });

    it('accepts standard 8-char new energy vehicle green plates with or without dot', () => {
      assert.equal(validatePlateNumber('粤B·D12345'), true);
      assert.equal(validatePlateNumber('粤BD12345'), true);
      assert.equal(validatePlateNumber('京A·F66666'), true);
      assert.equal(validatePlateNumber('沪A·D12345'), true);
      assert.equal(validatePlateNumber('浙A·DF1234'), true);
    });

    it('rejects invalid province initials, illegal lengths, or symbols', () => {
      // Invalid province
      assert.equal(validatePlateNumber('美A·88888'), false);
      assert.equal(validatePlateNumber('1A·88888'), false);
      // Too short
      assert.equal(validatePlateNumber('粤B888'), false);
      // Too long
      assert.equal(validatePlateNumber('粤B·12345678'), false);
      // Invalid characters
      assert.equal(validatePlateNumber('粤B·8888I'), false); // I is excluded in plates
      assert.equal(validatePlateNumber('粤B·8888O'), false); // O is excluded in plates
      // Empty or non-string
      assert.equal(validatePlateNumber(''), false);
      assert.equal(validatePlateNumber(null as any), false);
    });

    it('handles whitespace trimming and dot normalization', () => {
      assert.equal(validatePlateNumber('  粤B·88888  '), true);
      assert.equal(validatePlateNumber('粤b·88888'), true);
    });
  });

  describe('3. Vehicle Summary Metrics Calculation (calculateVehicleStats)', () => {
    it('calculates total, status counts, bound rate, and online rate accurately', () => {
      const stats = calculateVehicleStats(sampleVehicles, 10);
      assert.equal(stats.totalCount, 6);
      assert.equal(stats.normalCount, 3); // veh-001, veh-002, veh-006
      assert.equal(stats.maintenanceCount, 1); // veh-003
      assert.equal(stats.lockedCount, 1); // veh-004
      assert.equal(stats.scrappedCount, 1); // veh-005

      // Bound: veh-001, veh-002, veh-003, veh-004 (4 out of 6 => 66.7%)
      assert.equal(stats.boundCount, 4);
      assert.equal(stats.boundRate, 66.7);

      // Online: veh-001, veh-002, veh-004 (3 out of 6 => 50.0%)
      assert.equal(stats.onlineCount, 3);
      assert.equal(stats.onlineRate, 50.0);

      // Quota: 6 / 10 = 60.0%, no warning
      assert.equal(stats.quotaTotal, 10);
      assert.equal(stats.quotaUsed, 6);
      assert.equal(stats.quotaUsage, 60.0);
      assert.equal(stats.isQuotaWarning, false);
    });

    it('triggers isQuotaWarning when quota usage >= 90%', () => {
      // 6 vehicles with quota of 6 => 100%
      const stats = calculateVehicleStats(sampleVehicles, 6);
      assert.equal(stats.quotaUsage, 100.0);
      assert.equal(stats.isQuotaWarning, true);

      // 6 vehicles with quota of 6.5 => round
      const stats90 = calculateVehicleStats(sampleVehicles, 6.6);
      assert.equal(stats90.quotaUsage >= 90, true);
      assert.equal(stats90.isQuotaWarning, true);
    });

    it('handles empty vehicle list safely without NaN', () => {
      const emptyStats = calculateVehicleStats([], 100);
      assert.equal(emptyStats.totalCount, 0);
      assert.equal(emptyStats.boundRate, 0);
      assert.equal(emptyStats.onlineRate, 0);
      assert.equal(emptyStats.quotaUsage, 0);
      assert.equal(emptyStats.isQuotaWarning, false);
    });
  });

  describe('4. Multi-dimensional Vehicle Filtering (filterVehicles)', () => {
    it('filters by keyword across plate, vin, device, owner, phone', () => {
      // Match plate
      const byPlate = filterVehicles(sampleVehicles, { keyword: '粤B·88888' });
      assert.equal(byPlate.length, 1);
      assert.equal(byPlate[0].id, 'veh-001');

      // Match VIN
      const byVin = filterVehicles(sampleVehicles, { keyword: '1000003' });
      assert.equal(byVin.length, 1);
      assert.equal(byVin[0].id, 'veh-003');

      // Match device
      const byDev = filterVehicles(sampleVehicles, { keyword: 'DEV_1002' });
      assert.equal(byDev.length, 1);
      assert.equal(byDev[0].id, 'veh-002');

      // Match owner name
      const byOwner = filterVehicles(sampleVehicles, { keyword: '陈晨' });
      assert.equal(byOwner.length, 1);
      assert.equal(byOwner[0].id, 'veh-004');

      // Match owner phone
      const byPhone = filterVehicles(sampleVehicles, { keyword: '5544' });
      assert.equal(byPhone.length, 1);
      assert.equal(byPhone[0].id, 'veh-006');
    });

    it('filters by project, brand, and model', () => {
      const byProj = filterVehicles(sampleVehicles, { projectId: 'proj-sz-01' });
      assert.equal(byProj.length, 3); // veh-001, veh-002, veh-006

      const byBrand = filterVehicles(sampleVehicles, { brandId: 'brand-byd' });
      assert.equal(byBrand.length, 2); // veh-001, veh-004

      const byModel = filterVehicles(sampleVehicles, { modelId: 'model-tesla-modely' });
      assert.equal(byModel.length, 2); // veh-002, veh-005
    });

    it('filters by vehicle status', () => {
      const normal = filterVehicles(sampleVehicles, { status: 'NORMAL' });
      assert.equal(normal.length, 3);

      const maint = filterVehicles(sampleVehicles, { status: 'MAINTENANCE' });
      assert.equal(maint.length, 1);
      assert.equal(maint[0].id, 'veh-003');

      const locked = filterVehicles(sampleVehicles, { status: 'LOCKED' });
      assert.equal(locked.length, 1);

      const scrapped = filterVehicles(sampleVehicles, { status: 'SCRAPPED' });
      assert.equal(scrapped.length, 1);
    });

    it('filters by bindStatus (BOUND / UNBOUND)', () => {
      const bound = filterVehicles(sampleVehicles, { bindStatus: 'BOUND' });
      assert.equal(bound.length, 4); // veh-001, 002, 003, 004

      const unbound = filterVehicles(sampleVehicles, { bindStatus: 'UNBOUND' });
      assert.equal(unbound.length, 2); // veh-005, 006
    });

    it('filters by onlineStatus (ONLINE / OFFLINE)', () => {
      const online = filterVehicles(sampleVehicles, { onlineStatus: 'ONLINE' });
      assert.equal(online.length, 3); // veh-001, 002, 004

      const offline = filterVehicles(sampleVehicles, { onlineStatus: 'OFFLINE' });
      assert.equal(offline.length, 3); // veh-003, 005, 006
    });
  });

  describe('5. Lifecycle State Transition Guard (isValidVehicleStatusTransition)', () => {
    it('allows transition from NORMAL, MAINTENANCE, LOCKED to any state', () => {
      assert.equal(isValidVehicleStatusTransition('NORMAL', 'MAINTENANCE'), true);
      assert.equal(isValidVehicleStatusTransition('NORMAL', 'LOCKED'), true);
      assert.equal(isValidVehicleStatusTransition('NORMAL', 'SCRAPPED'), true);

      assert.equal(isValidVehicleStatusTransition('MAINTENANCE', 'NORMAL'), true);
      assert.equal(isValidVehicleStatusTransition('MAINTENANCE', 'LOCKED'), true);
      assert.equal(isValidVehicleStatusTransition('MAINTENANCE', 'SCRAPPED'), true);

      assert.equal(isValidVehicleStatusTransition('LOCKED', 'NORMAL'), true);
      assert.equal(isValidVehicleStatusTransition('LOCKED', 'MAINTENANCE'), true);
      assert.equal(isValidVehicleStatusTransition('LOCKED', 'SCRAPPED'), true);
    });

    it('strictly protects SCRAPPED as terminal irreversible state', () => {
      assert.equal(isValidVehicleStatusTransition('SCRAPPED', 'SCRAPPED'), true);
      assert.equal(isValidVehicleStatusTransition('SCRAPPED', 'NORMAL'), false);
      assert.equal(isValidVehicleStatusTransition('SCRAPPED', 'MAINTENANCE'), false);
      assert.equal(isValidVehicleStatusTransition('SCRAPPED', 'LOCKED'), false);
    });
  });

  describe('6. Status Metadata and Telemetry Formatting Helpers', () => {
    it('getVehicleStatusMeta returns standardized theme colors and tags', () => {
      const normal = getVehicleStatusMeta('NORMAL');
      assert.equal(normal.label, '正常运营');
      assert.equal(normal.color, '#52c41a');

      const maint = getVehicleStatusMeta('MAINTENANCE');
      assert.equal(maint.label, '维保检修');
      assert.equal(maint.color, '#fa8c16');

      const locked = getVehicleStatusMeta('LOCKED');
      assert.equal(locked.label, '风控锁死');
      assert.equal(locked.color, '#722ed1');

      const scrapped = getVehicleStatusMeta('SCRAPPED');
      assert.equal(scrapped.label, '已报废');
      assert.equal(scrapped.color, '#8c8c8c');
    });

    it('formatVoltage formats voltage and flags low voltage (<11.5V)', () => {
      const normal = formatVoltage(12.6);
      assert.equal(normal.text, '12.6V');
      assert.equal(normal.isWarning, false);
      assert.equal(normal.color, '#52c41a');

      const low = formatVoltage(11.2);
      assert.equal(low.text, '11.2V');
      assert.equal(low.isWarning, true);
      assert.equal(low.color, '#fa8c16');

      const missing = formatVoltage(undefined);
      assert.equal(missing.text, '-');
      assert.equal(missing.isWarning, false);
    });

    it('maskPhone masks middle 4 digits of 11-digit mobile phones', () => {
      assert.equal(maskPhone('13800138888'), '138****8888');
      assert.equal(maskPhone('13912345678'), '139****5678');
      assert.equal(maskPhone('12345'), '12345');
      assert.equal(maskPhone(''), '-');
    });

    it('isApiError identifies ApiError instances and duck-typed objects', () => {
      const apiErr = new ApiError('VIN already exists', 400);
      assert.equal(isApiError(apiErr), true);
      assert.equal(isApiError({ statusCode: 409, message: 'Conflict' }), true);
      assert.equal(isApiError(new Error('Network error')), false);
      assert.equal(isApiError(null), false);
    });
  });

  describe('7. Vehicle API Client Integration & Offline Fallback', () => {
    it('fetchBrandsApi and fetchModelsApi return seed brands and cascade models', async () => {
      const brands = await fetchBrandsApi();
      assert.equal(brands.length >= 4, true);
      assert.equal(brands.some((b) => b.name === '比亚迪'), true);
      assert.equal(brands.some((b) => b.name === '特斯拉'), true);

      const bydModels = await fetchModelsApi('brand-byd');
      assert.equal(bydModels.length >= 1, true);
      assert.equal(bydModels.every((m) => m.brandId === 'brand-byd'), true);
      assert.equal(bydModels[0].name, '汉 EV');
    });

    it('fetchVehiclesApi returns vehicle records and filters', async () => {
      const list = await fetchVehiclesApi();
      assert.equal(list.length >= 10, true);

      const filtered = await fetchVehiclesApi({ keyword: '汉 EV' });
      assert.equal(filtered.length >= 1, true);
    });

    it('createVehicleApi creates a vehicle and adds to in-memory state pool', async () => {
      const newVin = generateSampleVin();
      const input: CreateVehicleInput = {
        vin: newVin,
        plateNumber: '粤B·99999',
        projectId: 'proj-sz-01',
        brandId: 'brand-byd',
        modelId: 'model-byd-han',
        ownerName: '测试车主',
        ownerPhone: '13811112222',
      };

      const created = await createVehicleApi(input);
      assert.equal(created.vin, newVin);
      assert.equal(created.plateNumber, '粤B·99999');
      assert.equal(created.brandName, '比亚迪');
      assert.equal(created.status, 'NORMAL');

      // Verify it's queryable
      const detail = await fetchVehicleDetailApi(created.id);
      assert.equal(detail.id, created.id);
      assert.equal(detail.vin, newVin);
    });

    it('updateVehicleStatusApi updates vehicle lifecycle status with guard', async () => {
      const vehicles = await fetchVehiclesApi();
      const target = vehicles.find((v) => v.status === 'NORMAL')!;

      const updated = await updateVehicleStatusApi(target.id, 'MAINTENANCE');
      assert.equal(updated.status, 'MAINTENANCE');

      // Update to SCRAPPED
      const scrapped = await updateVehicleStatusApi(target.id, 'SCRAPPED');
      assert.equal(scrapped.status, 'SCRAPPED');

      // Updating SCRAPPED back to NORMAL must reject
      await assert.rejects(
        async () => {
          await updateVehicleStatusApi(target.id, 'NORMAL');
        },
        {
          message: /终态|报废|不可逆/i,
        }
      );
    });
  });
});
