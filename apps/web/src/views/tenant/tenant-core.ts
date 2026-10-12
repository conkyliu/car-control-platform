import type { TenantDto, OrgNodeDto } from '../../store/useTenantStore.ts';

export interface TenantStats {
  totalTenants: number;
  activeTenants: number;
  totalDeviceQuota: number;
  warningTenantsCount: number;
}

export interface QuotaUsageResult {
  percentage: number;
  isWarning: boolean;
  statusColor: string;
}

export interface QuotaAdjustmentInput {
  newDeviceQuota: number;
  currentUsedDevices: number;
  newVehicleQuota?: number;
  currentUsedVehicles?: number;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export interface TenantFormInput {
  name: string;
  code: string;
  quotaDeviceCount: number;
  quotaVehicleCount?: number;
  creditCode?: string;
  contactPerson?: string;
  contactPhone?: string;
  adminUsername?: string;
  adminPassword?: string;
  description?: string;
}

export interface OrgTreeNode extends OrgNodeDto {
  key: string;
  title: string;
  aggregatedDeviceCount: number;
  aggregatedVehicleCount: number;
  aggregatedUserCount: number;
  children?: OrgTreeNode[];
}

/**
 * 计算租户概览统计指标
 */
export function calculateTenantStats(tenants: TenantDto[]): TenantStats {
  if (!tenants || tenants.length === 0) {
    return {
      totalTenants: 0,
      activeTenants: 0,
      totalDeviceQuota: 0,
      warningTenantsCount: 0,
    };
  }

  let activeCount = 0;
  let totalQuota = 0;
  let warningCount = 0;

  for (const t of tenants) {
    if (t.status === 'ACTIVE') {
      activeCount += 1;
    }
    const quota = t.quotaDeviceCount ?? 0;
    totalQuota += quota;

    const used = t.usedDeviceCount ?? 0;
    if (quota > 0 && (used / quota) >= 0.9) {
      warningCount += 1;
    }
  }

  return {
    totalTenants: tenants.length,
    activeTenants: activeCount,
    totalDeviceQuota: totalQuota,
    warningTenantsCount: warningCount,
  };
}

/**
 * 筛选过滤租户列表（按关键字模糊搜索与状态匹配）
 */
export function filterTenants(
  tenants: TenantDto[],
  keyword: string,
  statusFilter: string
): TenantDto[] {
  const kw = keyword.trim().toLowerCase();
  const filter = statusFilter.trim();

  return tenants.filter((tenant) => {
    // 关键字匹配：名称、代码、社会信用代码、联系人
    if (kw) {
      const matchName = tenant.name?.toLowerCase().includes(kw);
      const matchCode = tenant.code?.toLowerCase().includes(kw);
      const matchCredit = tenant.creditCode?.toLowerCase().includes(kw);
      const matchPerson = tenant.contactPerson?.toLowerCase().includes(kw);
      if (!matchName && !matchCode && !matchCredit && !matchPerson) {
        return false;
      }
    }

    // 状态过滤
    if (!filter || filter === 'ALL') {
      return true;
    }

    if (filter === 'WARNING') {
      const quota = tenant.quotaDeviceCount ?? 0;
      const used = tenant.usedDeviceCount ?? 0;
      return quota > 0 && (used / quota) >= 0.9;
    }

    return tenant.status === filter;
  });
}

/**
 * 计算配额使用率与预警色彩标准
 * >= 90% 呈现高危橙色，>= 95% 呈现紧急红色
 */
export function calculateQuotaUsage(used: number, total: number): QuotaUsageResult {
  if (total <= 0) {
    return {
      percentage: 0,
      isWarning: false,
      statusColor: '#1677ff',
    };
  }

  const rawPercent = (used / total) * 100;
  const percentage = Math.round(rawPercent * 10) / 10;
  const isWarning = percentage >= 90;

  let statusColor = '#1677ff'; // 科技蓝常规态
  if (percentage >= 95) {
    statusColor = '#ff4d4f'; // 紧急红
  } else if (percentage >= 90) {
    statusColor = '#fa541c'; // 警告橙红
  }

  return {
    percentage,
    isWarning,
    statusColor,
  };
}

/**
 * 校验配额扩容/缩容调整：新配额不得小于当前已使用数
 */
export function validateQuotaAdjustment(input: QuotaAdjustmentInput): ValidationResult {
  if (input.newDeviceQuota <= 0) {
    return {
      valid: false,
      error: '设备配额上限必须大于 0',
    };
  }

  if (input.newDeviceQuota < input.currentUsedDevices) {
    return {
      valid: false,
      error: `调整后的设备配额 (${input.newDeviceQuota} 台) 不能小于当前已占用的设备数量 (${input.currentUsedDevices} 台)`,
    };
  }

  if (
    input.newVehicleQuota !== undefined &&
    input.currentUsedVehicles !== undefined &&
    input.newVehicleQuota < input.currentUsedVehicles
  ) {
    return {
      valid: false,
      error: `调整后的车辆配额 (${input.newVehicleQuota} 辆) 不能小于当前已占用的车辆数量 (${input.currentUsedVehicles} 辆)`,
    };
  }

  return { valid: true };
}

/**
 * 校验创建租户表单输入
 */
export function validateTenantForm(input: Partial<TenantFormInput>): ValidationResult {
  if (!input.name || input.name.trim() === '') {
    return { valid: false, error: '企业名称不能为空，请输入企业合法注册全称' };
  }

  if (!input.code || input.code.trim() === '') {
    return { valid: false, error: '租户代码不能为空' };
  }

  // 租户唯一标识码仅限大写英文字母、数字和下划线
  const codeRegex = /^[A-Z0-9_]{2,32}$/;
  if (!codeRegex.test(input.code.trim())) {
    return { valid: false, error: '租户代码必须为2-32位大写英文字母、数字或下划线 (如 SPEED_EAST)' };
  }

  if (input.quotaDeviceCount === undefined || input.quotaDeviceCount <= 0) {
    return { valid: false, error: '初始设备配额必须大于 0' };
  }

  return { valid: true };
}

/**
 * 将扁平机构列表构建为多级拓扑树，并向上递归汇总设备、车辆、用户下属资源
 */
export function buildOrgTree(flatOrgs: OrgNodeDto[]): OrgTreeNode[] {
  if (!flatOrgs || flatOrgs.length === 0) {
    return [];
  }

  // 1. 初始化所有节点
  const nodeMap = new Map<string, OrgTreeNode>();
  for (const org of flatOrgs) {
    nodeMap.set(org.id, {
      ...org,
      key: org.id,
      title: org.name,
      aggregatedDeviceCount: org.deviceCount ?? 0,
      aggregatedVehicleCount: org.vehicleCount ?? 0,
      aggregatedUserCount: org.userCount ?? 0,
      children: [],
    });
  }

  // 2. 组装父子层级
  const rootNodes: OrgTreeNode[] = [];
  for (const org of flatOrgs) {
    const node = nodeMap.get(org.id)!;
    if (org.parentId && nodeMap.has(org.parentId)) {
      const parent = nodeMap.get(org.parentId)!;
      parent.children = parent.children || [];
      parent.children.push(node);
    } else {
      rootNodes.push(node);
    }
  }

  // 3. 递归向上聚合下属资源
  function aggregateMetrics(node: OrgTreeNode): {
    devices: number;
    vehicles: number;
    users: number;
  } {
    let devSum = node.deviceCount ?? 0;
    let vehSum = node.vehicleCount ?? 0;
    let usrSum = node.userCount ?? 0;

    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        const childMetrics = aggregateMetrics(child);
        devSum += childMetrics.devices;
        vehSum += childMetrics.vehicles;
        usrSum += childMetrics.users;
      }
    }

    node.aggregatedDeviceCount = devSum;
    node.aggregatedVehicleCount = vehSum;
    node.aggregatedUserCount = usrSum;

    return { devices: devSum, vehicles: vehSum, users: usrSum };
  }

  for (const root of rootNodes) {
    aggregateMetrics(root);
  }

  return rootNodes;
}

/**
 * 递归搜索机构树，并高亮匹配节点与返回祖先节点的展开 Keys
 */
export function filterOrgTree(
  tree: OrgTreeNode[],
  keyword: string
): {
  filteredTree: OrgTreeNode[];
  expandedKeys: string[];
  matchedKeys: string[];
} {
  const kw = keyword.trim().toLowerCase();
  if (!kw) {
    return {
      filteredTree: tree,
      expandedKeys: [],
      matchedKeys: [],
    };
  }

  const expandedSet = new Set<string>();
  const matchedList: string[] = [];

  function filterNodes(nodes: OrgTreeNode[], ancestorKeys: string[]): OrgTreeNode[] {
    const result: OrgTreeNode[] = [];

    for (const node of nodes) {
      const isMatch =
        node.name?.toLowerCase().includes(kw) ||
        node.code?.toLowerCase().includes(kw);

      if (isMatch) {
        matchedList.push(node.id);
        ancestorKeys.forEach((k) => expandedSet.add(k));
      }

      const nextAncestors = [...ancestorKeys, node.id];
      const matchedChildren = node.children
        ? filterNodes(node.children, nextAncestors)
        : [];

      if (isMatch || matchedChildren.length > 0) {
        result.push({
          ...node,
          children: matchedChildren,
        });
      }
    }

    return result;
  }

  const filteredTree = filterNodes(tree, []);

  return {
    filteredTree,
    expandedKeys: Array.from(expandedSet),
    matchedKeys: matchedList,
  };
}

/**
 * 机构停用前置安全校验：若机构及下级仍有关联设备或车辆，阻断操作并提示迁移资产
 */
export function canDisableOrg(org: OrgTreeNode): { allowed: boolean; message?: string } {
  const totalDevices = org.aggregatedDeviceCount ?? org.deviceCount ?? 0;
  const totalVehicles = org.aggregatedVehicleCount ?? org.vehicleCount ?? 0;

  if (totalDevices > 0 || totalVehicles > 0) {
    return {
      allowed: false,
      message: `该机构或其下级机构下仍有 ${totalDevices} 台设备与 ${totalVehicles} 辆车辆，请先迁移资产后再停用`,
    };
  }

  return { allowed: true };
}

/**
 * 在树中递归查找指定 ID 的机构节点
 */
export function findOrgNodeById(nodes: OrgTreeNode[], id: string): OrgTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node;
    }
    if (node.children && node.children.length > 0) {
      const found = findOrgNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}
