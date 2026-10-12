import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateProtocolCode,
  formatProtocolCode,
  validateBrandCode,
  canDeleteModel,
  canDeleteBrand,
  POWERTRAIN_MAP,
  SEED_BRANDS,
  SEED_MODELS,
  type PowertrainType,
  type ModelDto,
  type BrandDto,
  type CreateModelInput,
  type CreateBrandInput,
} from '../views/vehicle/model-core.ts';
import {
  validateProjectCode,
  canArchiveProject,
  allocateDevices,
  SEED_PROJECT_DETAILS,
  type ProjectDto,
  type ProjectStatus,
  type CreateProjectInput,
} from '../views/device/project-core.ts';
import type { DeviceDto } from '../views/device/device-core.ts';
import {
  createModelApi,
  updateModelApi,
  deleteModelApi,
  createBrandApi,
  updateBrandApi,
  deleteBrandApi,
  fetchBrandsApi,
  fetchModelsApi,
} from '../api/vehicle.ts';
import {
  createProjectApi,
  updateProjectApi,
  updateProjectStatusApi,
  allocateDevicesToProjectApi,
  fetchProjectsApi,
  getInMemoryDevices,
} from '../api/device.ts';
import {
  RoutePath,
  routes,
  getMenuRoutes,
  filterAccessibleRoutes,
} from '../router/routes.ts';

describe('Sprint 2 Task 6: Model, Brand, and Project Asset Centers Test Suite (TDD)', () => {
  describe('1. Vehicle Control Protocol 0x02 Code Validation (validateProtocolCode)', () => {
    it('accepts valid 16-bit hex protocol codes prefixed with 0x', () => {
      assert.equal(validateProtocolCode('0x0101'), true);
      assert.equal(validateProtocolCode('0x0201'), true);
      assert.equal(validateProtocolCode('0x0301'), true);
      assert.equal(validateProtocolCode('0x0401'), true);
      assert.equal(validateProtocolCode('0x00FF'), true);
      assert.equal(validateProtocolCode('0xFFFF'), true);
      assert.equal(validateProtocolCode('0x12ab'), true);
    });

    it('rejects invalid hex codes, wrong length, or missing 0x prefix', () => {
      assert.equal(validateProtocolCode('0101'), false, 'Missing 0x prefix');
      assert.equal(validateProtocolCode('0x10'), false, 'Too short (8-bit)');
      assert.equal(validateProtocolCode('0x01010'), false, 'Too long (5 hex digits)');
      assert.equal(validateProtocolCode('0xGGGG'), false, 'Non-hex characters');
      assert.equal(validateProtocolCode('0xZZZZ'), false);
      assert.equal(validateProtocolCode(''), false);
      assert.equal(validateProtocolCode(null as any), false);
      assert.equal(validateProtocolCode(undefined as any), false);
    });

    it('formatProtocolCode standardizes code to lowercase 0x format', () => {
      assert.equal(formatProtocolCode('0X0101'), '0x0101');
      assert.equal(formatProtocolCode('0xABCD'), '0xabcd');
      assert.equal(formatProtocolCode('  0x0201  '), '0x0201');
    });
  });

  describe('2. Brand Code & Powertrain Types Validation', () => {
    it('validateBrandCode enforces uppercase alphanumeric and underscore (2-12 chars)', () => {
      assert.equal(validateBrandCode('BYD'), true);
      assert.equal(validateBrandCode('TESLA'), true);
      assert.equal(validateBrandCode('AION'), true);
      assert.equal(validateBrandCode('ZEEKR_01'), true);
      assert.equal(validateBrandCode('BMW'), true);

      assert.equal(validateBrandCode('b'), false, 'Too short (<2 chars)');
      assert.equal(validateBrandCode('byd'), false, 'Lowercase rejected');
      assert.equal(validateBrandCode('BRAND_CODE_TOO_LONG_123'), false, 'Too long (>12 chars)');
      assert.equal(validateBrandCode('BYD-01'), false, 'Dash not allowed');
      assert.equal(validateBrandCode(''), false);
    });

    it('defines standard powertrain metadata with colors and tags', () => {
      const types: PowertrainType[] = ['EV', 'PHEV', 'ICE', 'REEV'];
      for (const t of types) {
        assert.ok(POWERTRAIN_MAP[t], `Powertrain map should define ${t}`);
        assert.ok(POWERTRAIN_MAP[t].label, `Label should exist for ${t}`);
        assert.ok(POWERTRAIN_MAP[t].color, `Color should exist for ${t}`);
      }
      assert.equal(POWERTRAIN_MAP.EV.label, '纯电动');
      assert.equal(POWERTRAIN_MAP.PHEV.label, '插电混动');
      assert.equal(POWERTRAIN_MAP.ICE.label, '燃油');
      assert.equal(POWERTRAIN_MAP.REEV.label, '增程式');
    });
  });

  describe('3. Delete Safety Guards (canDeleteModel & canDeleteBrand)', () => {
    it('canDeleteModel rejects deletion if vehicleCount > 0', () => {
      const modelWithVehicles = {
        id: 'model-1',
        brandId: 'brand-byd',
        name: '汉 EV',
        code: '0x0101',
        vehicleCount: 3,
      };
      const check = canDeleteModel(modelWithVehicles);
      assert.equal(check.allowed, false);
      assert.ok(check.reason && check.reason.includes('3'));
      assert.ok(check.reason && check.reason.includes('禁止删除'));
    });

    it('canDeleteModel permits deletion when vehicleCount is 0', () => {
      const modelFree = {
        id: 'model-2',
        brandId: 'brand-byd',
        name: '海豹 06',
        code: '0x0105',
        vehicleCount: 0,
      };
      const check = canDeleteModel(modelFree);
      assert.equal(check.allowed, true);
    });

    it('canDeleteBrand rejects deletion if modelCount > 0', () => {
      const brandWithModels = {
        id: 'brand-byd',
        name: '比亚迪',
        code: 'BYD',
        modelCount: 4,
      };
      const check = canDeleteBrand(brandWithModels);
      assert.equal(check.allowed, false);
      assert.ok(check.reason && check.reason.includes('4'));
      assert.ok(check.reason && check.reason.includes('禁止删除'));
    });

    it('canDeleteBrand permits deletion when modelCount is 0', () => {
      const brandFree = {
        id: 'brand-new',
        name: '新创汽车',
        code: 'NEWCAR',
        modelCount: 0,
      };
      const check = canDeleteBrand(brandFree);
      assert.equal(check.allowed, true);
    });
  });

  describe('4. Project Code & Archival Safety Guard (canArchiveProject)', () => {
    it('validateProjectCode enforces uppercase alphanumeric and underscore (3-20 chars)', () => {
      assert.equal(validateProjectCode('SZ_SPEED_01'), true);
      assert.equal(validateProjectCode('GZ_RIDE_02'), true);
      assert.equal(validateProjectCode('PROJECT_NEW'), true);

      assert.equal(validateProjectCode('SZ'), false, 'Too short (<3 chars)');
      assert.equal(validateProjectCode('sz_speed_01'), false, 'Lowercase rejected');
      assert.equal(validateProjectCode('SZ-SPEED-01'), false, 'Dash not allowed');
      assert.equal(validateProjectCode('THIS_PROJECT_CODE_IS_WAY_TOO_LONG_FOR_VALIDATION'), false);
    });

    it('canArchiveProject blocks archival if project has online devices', () => {
      const project: ProjectDto = {
        id: 'proj-1',
        name: '测试项目',
        code: 'TEST_01',
        status: 'ACTIVE',
      };
      const check = canArchiveProject(project, 2, 0);
      assert.equal(check.allowed, false);
      assert.ok(check.reason && check.reason.includes('在线设备'));
    });

    it('canArchiveProject blocks archival if project has bound vehicles', () => {
      const project: ProjectDto = {
        id: 'proj-1',
        name: '测试项目',
        code: 'TEST_01',
        status: 'ACTIVE',
      };
      const check = canArchiveProject(project, 0, 3);
      assert.equal(check.allowed, false);
      assert.ok(check.reason && check.reason.includes('车辆'));
    });

    it('canArchiveProject allows archival when both online devices and vehicles are 0', () => {
      const project: ProjectDto = {
        id: 'proj-1',
        name: '闲置项目',
        code: 'IDLE_01',
        status: 'PAUSED',
      };
      const check = canArchiveProject(project, 0, 0);
      assert.equal(check.allowed, true);
    });
  });

  describe('5. Immutable Device Allocation Pool (allocateDevices)', () => {
    it('reassigns targeted devices to new project atomically and immutably', () => {
      const initialDevices: DeviceDto[] = [
        {
          id: 'dev-1',
          deviceNo: 'DEV_1',
          imei: '868123045678901',
          productKey: 'TBOX-G4-STD',
          projectId: 'proj-old',
          projectName: '旧项目',
          onlineStatus: 'OFFLINE',
          status: 'ACTIVE',
          firmwareVersion: 'v2.1.0',
        },
        {
          id: 'dev-2',
          deviceNo: 'DEV_2',
          imei: '868123045678902',
          productKey: 'TBOX-G4-STD',
          projectId: 'proj-old',
          projectName: '旧项目',
          onlineStatus: 'OFFLINE',
          status: 'ACTIVE',
          firmwareVersion: 'v2.1.0',
        },
        {
          id: 'dev-3',
          deviceNo: 'DEV_3',
          imei: '868123045678903',
          productKey: 'TBOX-G4-STD',
          projectId: 'proj-other',
          projectName: '其它项目',
          onlineStatus: 'OFFLINE',
          status: 'ACTIVE',
          firmwareVersion: 'v2.1.0',
        },
      ];

      const updated = allocateDevices(initialDevices, 'proj-new', '新调配项目', ['dev-1', 'dev-2']);

      assert.notEqual(updated, initialDevices, 'Must return new array instance');
      assert.equal(updated.length, 3);

      const d1 = updated.find((d) => d.id === 'dev-1')!;
      const d2 = updated.find((d) => d.id === 'dev-2')!;
      const d3 = updated.find((d) => d.id === 'dev-3')!;

      assert.equal(d1.projectId, 'proj-new');
      assert.equal(d1.projectName, '新调配项目');
      assert.equal(d2.projectId, 'proj-new');
      assert.equal(d2.projectName, '新调配项目');
      assert.equal(d3.projectId, 'proj-other', 'Unselected device remains unchanged');
      assert.equal(d3.projectName, '其它项目');

      // Original devices array was not mutated
      assert.equal(initialDevices[0]!.projectId, 'proj-old');
    });
  });

  describe('6. Vehicle & Brand API Client Operations', () => {
    it('creates, updates, and deletes model with validation in offline state pool', async () => {
      // 1. Create Model
      const input: CreateModelInput = {
        brandId: 'brand-byd',
        name: '方程豹 豹5',
        code: '0x0199',
        powertrain: 'PHEV',
        capabilityTemplateName: '插混四驱硬派模板',
      };
      const created = await createModelApi(input);
      assert.ok(created.id);
      assert.equal(created.name, '方程豹 豹5');
      assert.equal(created.code, '0x0199');
      assert.equal(created.powertrain, 'PHEV');

      // 2. Update Model
      const updated = await updateModelApi(created.id, {
        name: '方程豹 豹5 领航版',
      });
      assert.equal(updated.name, '方程豹 豹5 领航版');

      // 3. Delete Model (vehicleCount = 0)
      const deleted = await deleteModelApi(created.id);
      assert.equal(deleted, true);

      // Verify it was removed
      const allModels = await fetchModelsApi('brand-byd');
      assert.equal(allModels.some((m) => m.id === created.id), false);
    });

    it('rejects invalid protocol code when creating model', async () => {
      await assert.rejects(
        async () => {
          await createModelApi({
            brandId: 'brand-byd',
            name: '非法车型',
            code: 'INVALID_HEX',
            powertrain: 'EV',
          });
        },
        /协议车型代号/
      );
    });

    it('creates, updates, and deletes brand with validation in offline state pool', async () => {
      // 1. Create Brand
      const brandInput: CreateBrandInput = {
        name: '小鹏汽车',
        code: 'XPENG',
        country: '自主新势力',
      };
      const brand = await createBrandApi(brandInput);
      assert.ok(brand.id);
      assert.equal(brand.code, 'XPENG');
      assert.equal(brand.name, '小鹏汽车');

      // 2. Update Brand
      const updatedBrand = await updateBrandApi(brand.id, {
        country: '自主智能电动',
      });
      assert.equal(updatedBrand.country, '自主智能电动');

      // 3. Delete Brand (modelCount = 0)
      const deleted = await deleteBrandApi(brand.id);
      assert.equal(deleted, true);

      const allBrands = await fetchBrandsApi();
      assert.equal(allBrands.some((b) => b.id === brand.id), false);
    });
  });

  describe('7. Project API Client Operations & Lifecycle State Guard', () => {
    it('creates, updates, and allocates devices to project', async () => {
      // 1. Create Project
      const projInput: CreateProjectInput = {
        name: '大湾区无人配送试点',
        code: 'GBA_AUTONOMOUS',
        orgName: '智能网联创新事业部',
        contactName: '林工',
        contactPhone: '13800138000',
        description: '高等级车路协同示范项目',
      };
      const proj = await createProjectApi(projInput);
      assert.ok(proj.id);
      assert.equal(proj.code, 'GBA_AUTONOMOUS');
      assert.equal(proj.status, 'ACTIVE');

      // 2. Update Project
      const updatedProj = await updateProjectApi(proj.id, {
        contactName: '林总监',
      });
      assert.equal(updatedProj.contactName, '林总监');

      // 3. Allocate devices to project
      const allDevices = getInMemoryDevices();
      const targetDevIds = allDevices.slice(0, 2).map((d) => d.id);
      const allocSuccess = await allocateDevicesToProjectApi(proj.id, targetDevIds);
      assert.equal(allocSuccess, true);

      // Verify allocated devices
      const refreshedDevices = getInMemoryDevices();
      for (const devId of targetDevIds) {
        const d = refreshedDevices.find((item) => item.id === devId)!;
        assert.equal(d.projectId, proj.id);
      }

      // 4. Update status to PAUSED
      const paused = await updateProjectStatusApi(proj.id, 'PAUSED');
      assert.equal(paused.status, 'PAUSED');
    });

    it('rejects archiving project when active devices or bound vehicles are present', async () => {
      const projects = await fetchProjectsApi();
      const activeProjWithDevices = projects.find((p) => p.id === 'proj-sz-01');
      assert.ok(activeProjWithDevices);

      await assert.rejects(
        async () => {
          await updateProjectStatusApi(activeProjWithDevices.id, 'ARCHIVED');
        },
        /禁止直接归档/
      );
    });
  });

  describe('8. Router and Navigation Integration Verification', () => {
    it('defines MODELS and PROJECTS route paths with hideInMenu = true', () => {
      assert.equal(RoutePath.MODELS, '/models');
      assert.equal(RoutePath.PROJECTS, '/projects');

      const modelRoute = routes.find((r) => r.path === RoutePath.MODELS);
      const projectRoute = routes.find((r) => r.path === RoutePath.PROJECTS);

      assert.ok(modelRoute, 'RoutePath.MODELS must be defined in routes');
      assert.ok(projectRoute, 'RoutePath.PROJECTS must be defined in routes');

      assert.equal(modelRoute.hideInMenu, true, 'MODELS route must be hidden from main sidebar');
      assert.equal(projectRoute.hideInMenu, true, 'PROJECTS route must be hidden from main sidebar');
    });

    it('maintains exactly 14 sidebar menu items in getMenuRoutes() and filterAccessibleRoutes()', () => {
      const menuRoutes = getMenuRoutes();
      assert.equal(menuRoutes.length, 14, 'Sidebar menu count must remain exactly 14');

      const accessibleSuper = filterAccessibleRoutes(() => true);
      assert.equal(accessibleSuper.length, 14, 'Accessible routes for super admin must remain 14');
    });
  });
});
