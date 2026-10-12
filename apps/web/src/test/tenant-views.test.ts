import test from 'node:test';
import assert from 'node:assert/strict';

// Setup mock localStorage before importing stores
const mockStorage = new Map<string, string>();
const storageMock = {
  getItem: (key: string) => mockStorage.get(key) ?? null,
  setItem: (key: string, val: string) => { mockStorage.set(key, String(val)); },
  removeItem: (key: string) => { mockStorage.delete(key); },
  clear: () => { mockStorage.clear(); },
  key: (i: number) => Array.from(mockStorage.keys())[i] ?? null,
  get length() { return mockStorage.size; },
};

(globalThis as any).localStorage = storageMock;
if (typeof window === 'undefined') {
  (globalThis as any).window = globalThis;
}

import { useTenantStore } from '../store/useTenantStore.ts';
import type { TenantDto, OrgNodeDto } from '../store/useTenantStore.ts';
import {
  calculateTenantStats,
  filterTenants,
  calculateQuotaUsage,
  validateQuotaAdjustment,
  validateTenantForm,
  buildOrgTree,
  filterOrgTree,
  canDisableOrg,
  findOrgNodeById,
  type OrgTreeNode,
} from '../views/tenant/tenant-core.ts';

test('Tenant & Org Management Center Logic Test Suite (TDD)', async (t) => {
  t.beforeEach(() => {
    storageMock.clear();
    useTenantStore.getState().clearTenant();
  });

  const mockTenants: TenantDto[] = [
    {
      id: 'tenant-001',
      name: '华东极速车队',
      code: 'SPEED_EAST',
      status: 'ACTIVE',
      quotaDeviceCount: 1000,
      usedDeviceCount: 920, // 92% -> WARNING
      quotaVehicleCount: 800,
      usedVehicleCount: 750,
      creditCode: '91330100MA2ABCDE11',
      contactPerson: '张经理',
      contactPhone: '13800138001',
      createdAt: '2026-01-15T08:00:00Z',
    },
    {
      id: 'tenant-002',
      name: '智行出行科技',
      code: 'ZHIXING_TECH',
      status: 'ACTIVE',
      quotaDeviceCount: 500,
      usedDeviceCount: 200, // 40% -> NORMAL
      quotaVehicleCount: 400,
      usedVehicleCount: 150,
      creditCode: '91330100MA2ABCDE22',
      contactPerson: '李总监',
      contactPhone: '13900139002',
      createdAt: '2026-02-10T09:30:00Z',
    },
    {
      id: 'tenant-003',
      name: '北方物流运输',
      code: 'NORTH_LOGISTICS',
      status: 'SUSPENDED',
      quotaDeviceCount: 2000,
      usedDeviceCount: 1950, // 97.5% -> WARNING & SUSPENDED
      quotaVehicleCount: 1500,
      usedVehicleCount: 1400,
      creditCode: '91110100MA2ABCDE33',
      contactPerson: '王队长',
      contactPhone: '13700137003',
      createdAt: '2026-03-01T12:00:00Z',
    },
    {
      id: 'tenant-004',
      name: '安途汽车租赁',
      code: 'ANTU_RENTAL',
      status: 'DISABLED',
      quotaDeviceCount: 300,
      usedDeviceCount: 0,
      quotaVehicleCount: 200,
      usedVehicleCount: 0,
      creditCode: '91440100MA2ABCDE44',
      contactPerson: '赵主管',
      contactPhone: '13600136004',
      createdAt: '2026-04-01T10:00:00Z',
    },
  ];

  // 1. 统计看板计算逻辑测试
  await t.test('calculateTenantStats accurately computes summary metrics', () => {
    const stats = calculateTenantStats(mockTenants);
    assert.equal(stats.totalTenants, 4, '总入驻企业租户数应为 4');
    assert.equal(stats.activeTenants, 2, '有效活跃租户数应为 2 (tenant-001, tenant-002)');
    assert.equal(stats.totalDeviceQuota, 3800, '全网分配设备总配额应为 1000+500+2000+300 = 3800');
    assert.equal(stats.warningTenantsCount, 2, '即将超限(>=90%)租户预警数应为 2 (tenant-001, tenant-003)');

    // 边界条件：空列表
    const emptyStats = calculateTenantStats([]);
    assert.equal(emptyStats.totalTenants, 0);
    assert.equal(emptyStats.activeTenants, 0);
    assert.equal(emptyStats.totalDeviceQuota, 0);
    assert.equal(emptyStats.warningTenantsCount, 0);
  });

  // 2. 筛选过滤逻辑测试
  await t.test('filterTenants handles keyword and status filters correctly', () => {
    // 关键字搜索：名称匹配
    const resByName = filterTenants(mockTenants, '极速', 'ALL');
    assert.equal(resByName.length, 1);
    assert.equal(resByName[0]?.id, 'tenant-001');

    // 关键字搜索：代码匹配 (大小写不敏感)
    const resByCode = filterTenants(mockTenants, 'zhixing', 'ALL');
    assert.equal(resByCode.length, 1);
    assert.equal(resByCode[0]?.code, 'ZHIXING_TECH');

    // 状态过滤：仅 ACTIVE
    const resActive = filterTenants(mockTenants, '', 'ACTIVE');
    assert.equal(resActive.length, 2);

    // 状态过滤：仅 SUSPENDED
    const resSuspended = filterTenants(mockTenants, '', 'SUSPENDED');
    assert.equal(resSuspended.length, 1);
    assert.equal(resSuspended[0]?.id, 'tenant-003');

    // 特殊状态过滤：WARNING (>= 90% 配额占用)
    const resWarning = filterTenants(mockTenants, '', 'WARNING');
    assert.equal(resWarning.length, 2);

    // 组合筛选：既有关键字又有状态
    const resCombined = filterTenants(mockTenants, '物流', 'WARNING');
    assert.equal(resCombined.length, 1);
    assert.equal(resCombined[0]?.id, 'tenant-003');

    const resNone = filterTenants(mockTenants, '物流', 'ACTIVE');
    assert.equal(resNone.length, 0);
  });

  // 3. 配额计算与预警色标测试
  await t.test('calculateQuotaUsage computes percentage and warning flag correctly', () => {
    // 正常占用 40%
    const q1 = calculateQuotaUsage(200, 500);
    assert.equal(q1.percentage, 40);
    assert.equal(q1.isWarning, false);
    assert.equal(q1.statusColor, '#1677ff');

    // 预警临界点 90%
    const q2 = calculateQuotaUsage(900, 1000);
    assert.equal(q2.percentage, 90);
    assert.equal(q2.isWarning, true);
    assert.equal(q2.statusColor, '#fa541c');

    // 超限/接近满载 98%
    const q3 = calculateQuotaUsage(490, 500);
    assert.equal(q3.percentage, 98);
    assert.equal(q3.isWarning, true);
    assert.equal(q3.statusColor, '#ff4d4f');

    // 容错处理：总额为0或无效值
    const q0 = calculateQuotaUsage(0, 0);
    assert.equal(q0.percentage, 0);
    assert.equal(q0.isWarning, false);
  });

  // 4. 配额扩容与调整校验测试
  await t.test('validateQuotaAdjustment checks and rejects quotas smaller than current used counts', () => {
    // 场景：tenant-001 已占用设备 920，已占用车辆 750
    // 尝试调低设备配额至 900 -> 应被拦截
    const res1 = validateQuotaAdjustment({
      newDeviceQuota: 900,
      currentUsedDevices: 920,
      newVehicleQuota: 800,
      currentUsedVehicles: 750,
    });
    assert.equal(res1.valid, false);
    assert.ok(res1.error?.includes('设备配额'));
    assert.ok(res1.error?.includes('920'));

    // 尝试调低车辆配额至 700 -> 应被拦截
    const res2 = validateQuotaAdjustment({
      newDeviceQuota: 1000,
      currentUsedDevices: 920,
      newVehicleQuota: 700,
      currentUsedVehicles: 750,
    });
    assert.equal(res2.valid, false);
    assert.ok(res2.error?.includes('车辆配额'));
    assert.ok(res2.error?.includes('750'));

    // 合法调高配额
    const res3 = validateQuotaAdjustment({
      newDeviceQuota: 1500,
      currentUsedDevices: 920,
      newVehicleQuota: 1000,
      currentUsedVehicles: 750,
    });
    assert.equal(res3.valid, true);
    assert.equal(res3.error, undefined);
  });

  // 5. 租户创建表单校验
  await t.test('validateTenantForm validates required fields and codes', () => {
    // 缺少必填字段
    const v1 = validateTenantForm({
      name: '',
      code: 'TEST',
      quotaDeviceCount: 100,
    });
    assert.equal(v1.valid, false);
    assert.ok(v1.error?.includes('企业名称'));

    // 租户唯一代码格式校验（仅限大写字母、数字、下划线）
    const v2 = validateTenantForm({
      name: '测试企业',
      code: 'invalid-code!',
      quotaDeviceCount: 100,
    });
    assert.equal(v2.valid, false);
    assert.ok(v2.error?.includes('租户代码'));

    // 配额必须大于 0
    const v3 = validateTenantForm({
      name: '测试企业',
      code: 'VALID_CODE',
      quotaDeviceCount: 0,
    });
    assert.equal(v3.valid, false);
    assert.ok(v3.error?.includes('初始设备配额'));

    // 合法表单
    const v4 = validateTenantForm({
      name: '测试企业',
      code: 'VALID_CODE',
      quotaDeviceCount: 500,
      adminUsername: 'admin_test',
    });
    assert.equal(v4.valid, true);
  });

  // 6. 机构树构建与层级聚合算法测试
  await t.test('buildOrgTree builds recursive hierarchy and aggregates sub-resource counts', () => {
    const flatOrgs: OrgNodeDto[] = [
      {
        id: 'org-root',
        tenantId: 'tenant-001',
        name: '总部',
        code: 'HQ',
        parentId: null,
        deviceCount: 10,
        vehicleCount: 5,
        userCount: 3,
      },
      {
        id: 'org-east',
        tenantId: 'tenant-001',
        name: '华东大区',
        code: 'EAST',
        parentId: 'org-root',
        deviceCount: 20,
        vehicleCount: 15,
        userCount: 8,
      },
      {
        id: 'org-hz',
        tenantId: 'tenant-001',
        name: '杭州运营中心',
        code: 'HZ_OPS',
        parentId: 'org-east',
        deviceCount: 50,
        vehicleCount: 40,
        userCount: 12,
      },
      {
        id: 'org-nb',
        tenantId: 'tenant-001',
        name: '宁波分部',
        code: 'NB_BRANCH',
        parentId: 'org-east',
        deviceCount: 0,
        vehicleCount: 0,
        userCount: 2,
      },
    ];

    const tree = buildOrgTree(flatOrgs);
    assert.equal(tree.length, 1, '顶级机构应有 1 个');
    const root = tree[0]!;
    assert.equal(root.id, 'org-root');
    assert.equal(root.children?.length, 1);

    const east = root.children![0]!;
    assert.equal(east.id, 'org-east');
    assert.equal(east.children?.length, 2);

    // 资源聚合检验：
    // 华东大区 (east) 下属及本级聚合:
    // 本级(20, 15, 8) + 杭州(50, 40, 12) + 宁波(0, 0, 2) = 设备 70, 车辆 55, 用户 22
    assert.equal(east.aggregatedDeviceCount, 70);
    assert.equal(east.aggregatedVehicleCount, 55);
    assert.equal(east.aggregatedUserCount, 22);

    // 总部 (root) 汇总: 10 + 70 = 80 台设备, 5 + 55 = 60 辆车, 3 + 22 = 25 个用户
    assert.equal(root.aggregatedDeviceCount, 80);
    assert.equal(root.aggregatedVehicleCount, 60);
    assert.equal(root.aggregatedUserCount, 25);
  });

  // 7. 机构树搜索与匹配节点高亮展开测试
  await t.test('filterOrgTree matches nodes and generates expanded keys along the branch', () => {
    const flatOrgs: OrgNodeDto[] = [
      { id: 'org-root', tenantId: 'tenant-001', name: '总部', code: 'HQ', parentId: null },
      { id: 'org-east', tenantId: 'tenant-001', name: '华东大区', code: 'EAST', parentId: 'org-root' },
      { id: 'org-hz', tenantId: 'tenant-001', name: '杭州运营中心', code: 'HZ_OPS', parentId: 'org-east' },
      { id: 'org-west', tenantId: 'tenant-001', name: '华西大区', code: 'WEST', parentId: 'org-root' },
    ];
    const tree = buildOrgTree(flatOrgs);

    // 搜索“杭州”
    const { filteredTree, expandedKeys, matchedKeys } = filterOrgTree(tree, '杭州');
    assert.equal(matchedKeys.includes('org-hz'), true);
    // 为了展示“杭州”，其祖先 org-root 和 org-east 必须展开
    assert.ok(expandedKeys.includes('org-root'));
    assert.ok(expandedKeys.includes('org-east'));
    assert.equal(filteredTree.length, 1);
    // 华西大区没有匹配，不应出现在 filteredTree 中
    assert.equal(filteredTree[0]?.children?.some((c) => c.id === 'org-west'), false);
  });

  // 8. 机构安全停用前置校验测试（资产阻断）
  await t.test('canDisableOrg blocks disabling if devices or vehicles are associated', () => {
    const flatOrgs: OrgNodeDto[] = [
      { id: 'org-root', tenantId: 'tenant-001', name: '总部', code: 'HQ', parentId: null },
      { id: 'org-east', tenantId: 'tenant-001', name: '华东大区', code: 'EAST', parentId: 'org-root' },
      { id: 'org-hz', tenantId: 'tenant-001', name: '杭州运营中心', code: 'HZ_OPS', parentId: 'org-east', deviceCount: 15, vehicleCount: 5 },
      { id: 'org-empty', tenantId: 'tenant-001', name: '空分支机构', code: 'EMPTY', parentId: 'org-root', deviceCount: 0, vehicleCount: 0 },
    ];
    const tree = buildOrgTree(flatOrgs);

    // 1. 尝试停用“杭州运营中心” (拥有 15 台设备与 5 辆车) -> 应当阻断
    const hzNode = findOrgNodeById(tree, 'org-hz');
    assert.ok(hzNode);
    const check1 = canDisableOrg(hzNode);
    assert.equal(check1.allowed, false);
    assert.ok(check1.message?.includes('仍有'));
    assert.ok(check1.message?.includes('15'));
    assert.ok(check1.message?.includes('5'));
    assert.ok(check1.message?.includes('迁移资产'));

    // 2. 尝试停用“华东大区” (本级虽为0，但下属杭州有设备和车) -> 应当阻断
    const eastNode = findOrgNodeById(tree, 'org-east');
    assert.ok(eastNode);
    const check2 = canDisableOrg(eastNode);
    assert.equal(check2.allowed, false);
    assert.ok(check2.message?.includes('仍有'));

    // 3. 尝试停用“空分支机构” (0 设备 0 车辆) -> 允许停用
    const emptyNode = findOrgNodeById(tree, 'org-empty');
    assert.ok(emptyNode);
    const check3 = canDisableOrg(emptyNode);
    assert.equal(check3.allowed, true);
    assert.equal(check3.message, undefined);
  });

  // 9. 租户数据隔离防线与 Store 状态同步测试
  await t.test('useTenantStore correctly maintains tenant and org state isolation', () => {
    // 初始状态
    assert.equal(useTenantStore.getState().currentTenantId, null);
    assert.equal(useTenantStore.getState().tenantList.length, 0);

    // 设置租户列表
    useTenantStore.getState().setTenantList(mockTenants);
    assert.equal(useTenantStore.getState().tenantList.length, 4);

    // 选中租户
    useTenantStore.getState().setCurrentTenantId('tenant-001');
    assert.equal(useTenantStore.getState().currentTenantId, 'tenant-001');

    // 选中机构
    useTenantStore.getState().setCurrentOrgId('org-east');
    assert.equal(useTenantStore.getState().currentOrgId, 'org-east');

    // 清理租户上下文
    useTenantStore.getState().clearTenant();
    assert.equal(useTenantStore.getState().currentTenantId, null);
    assert.equal(useTenantStore.getState().currentOrgId, null);
    assert.equal(useTenantStore.getState().tenantList.length, 0);
    assert.equal(useTenantStore.getState().orgTree.length, 0);
  });
});
