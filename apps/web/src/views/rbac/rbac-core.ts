import { ApiError } from '../../api/client.ts';
import type { UserDto } from '../../api/user.ts';
import type { RoleDto, RoleDataScope, PermissionTreeNode } from '../../api/role.ts';

/**
 * 判断捕获的异常是否为带有 HTTP 状态码的后端业务 ApiError
 */
export function isApiError(err: unknown): err is ApiError {
  if (err instanceof ApiError) return true;
  if (typeof err === 'object' && err !== null) {
    const candidate = err as Record<string, unknown>;
    return (
      typeof candidate.statusCode === 'number' &&
      typeof candidate.message === 'string'
    );
  }
  return false;
}

// -------------------------------------------------------------
// 正则表达式规范与表单校验
// -------------------------------------------------------------

/**
 * 中国大陆 11 位手机号码强校验正则 (以 13-19 开头)
 */
export const PHONE_REGEX = /^1[3-9]\d{9}$/;

/**
 * 标准电子邮箱格式正则
 */
export const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * 用户名规范：4-20 位字母、数字、下划线或连字符
 */
export const USERNAME_REGEX = /^[a-zA-Z0-9_-]{4,20}$/;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * 校验中国大陆手机号格式
 */
export function validatePhone(phone?: string): ValidationResult {
  if (!phone || !phone.trim()) {
    return { valid: false, error: '手机号码不能为空' };
  }
  const trimmed = phone.trim();
  if (!PHONE_REGEX.test(trimmed)) {
    return { valid: false, error: '请输入有效的11位中国大陆手机号码 (如 13800138000)' };
  }
  return { valid: true };
}

/**
 * 校验电子邮箱（选填，填入时必须符合规范）
 */
export function validateEmail(email?: string): ValidationResult {
  if (!email || !email.trim()) {
    return { valid: true };
  }
  const trimmed = email.trim();
  if (!EMAIL_REGEX.test(trimmed)) {
    return { valid: false, error: '请输入合法的电子邮箱地址 (如 user@domain.com)' };
  }
  return { valid: true };
}

/**
 * 校验用户名格式规范
 */
export function validateUsername(username?: string): ValidationResult {
  if (!username || !username.trim()) {
    return { valid: false, error: '用户名不能为空' };
  }
  const trimmed = username.trim();
  if (!USERNAME_REGEX.test(trimmed)) {
    return { valid: false, error: '用户名仅限4-20位英文、数字、下划线或连字符' };
  }
  return { valid: true };
}

/**
 * 校验密码强度：至少 8 位，包含英文字母与数字
 */
export function validatePassword(password?: string): ValidationResult {
  if (!password) {
    return { valid: false, error: '密码不能为空' };
  }
  if (password.length < 8) {
    return { valid: false, error: '密码长度至少需8位以上' };
  }
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  if (!hasLetter || !hasDigit) {
    return { valid: false, error: '密码必须同时包含英文字母和数字' };
  }
  return { valid: true };
}

/**
 * 生成高强度随机密码 (默认12位，包含大小写、数字与特殊字符)
 */
export function generateRandomPassword(length = 12): string {
  const lettersUpper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lettersLower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*';

  // 保证每种类别至少各选1位
  const guaranteed = [
    lettersUpper[Math.floor(Math.random() * lettersUpper.length)]!,
    lettersLower[Math.floor(Math.random() * lettersLower.length)]!,
    digits[Math.floor(Math.random() * digits.length)]!,
    symbols[Math.floor(Math.random() * symbols.length)]!,
  ];

  const allChars = lettersUpper + lettersLower + digits + symbols;
  for (let i = guaranteed.length; i < length; i++) {
    guaranteed.push(allChars[Math.floor(Math.random() * allChars.length)]!);
  }

  // 洗牌打乱顺序
  return guaranteed.sort(() => Math.random() - 0.5).join('');
}

/**
 * 手机号脱敏显示：保留前 3 后 4 位，中间 4 位替换为星号 (如 138****1234)
 */
export function maskPhone(phone?: string): string {
  if (!phone) return '-';
  const trimmed = phone.trim();
  if (trimmed.length === 11) {
    return `${trimmed.slice(0, 3)}****${trimmed.slice(7)}`;
  }
  return trimmed;
}

// -------------------------------------------------------------
// 数据权限范围 (Data Scope) 规格与色彩映射
// -------------------------------------------------------------

export interface DataScopeOption {
  value: RoleDataScope;
  label: string;
  description: string;
  color: string;
}

export const DATA_SCOPE_OPTIONS: DataScopeOption[] = [
  {
    value: 'ALL',
    label: '全部数据权限',
    description: '跨租户/跨机构全部车辆与监控数据',
    color: '#722ed1', // 紫色
  },
  {
    value: 'ORG_AND_CHILDREN',
    label: '本机构及子机构',
    description: '当前归属机构及所有分支下级机构资产',
    color: '#1677ff', // 科技蓝
  },
  {
    value: 'ORG_ONLY',
    label: '仅本机构直属',
    description: '仅当前归属机构直属资产与用户数据',
    color: '#13c2c2', // 青色
  },
  {
    value: 'SELF_ONLY',
    label: '仅本人数据',
    description: '仅本人创建或绑定的车辆与操作流水',
    color: '#fa8c16', // 橙色
  },
];

export function getDataScopeLabel(scope?: RoleDataScope): string {
  const found = DATA_SCOPE_OPTIONS.find((opt) => opt.value === scope);
  return found ? found.label : (scope ?? '未配置');
}

export function getDataScopeColor(scope?: RoleDataScope): string {
  const found = DATA_SCOPE_OPTIONS.find((opt) => opt.value === scope);
  return found ? found.color : 'default';
}

// -------------------------------------------------------------
// 用户统计指标与多维过滤
// -------------------------------------------------------------

export interface UserStats {
  totalUsers: number;
  activeUsers: number;
  disabledUsers: number;
  unassignedOrgUsers: number;
}

/**
 * 计算用户总览核心统计指标
 */
export function calculateUserStats(users: UserDto[]): UserStats {
  if (!users || users.length === 0) {
    return {
      totalUsers: 0,
      activeUsers: 0,
      disabledUsers: 0,
      unassignedOrgUsers: 0,
    };
  }

  let activeCount = 0;
  let disabledCount = 0;
  let unassignedCount = 0;

  for (const u of users) {
    if (u.status === 'ACTIVE') {
      activeCount += 1;
    } else {
      disabledCount += 1;
    }

    if (!u.orgId || u.orgId.trim() === '') {
      unassignedCount += 1;
    }
  }

  return {
    totalUsers: users.length,
    activeUsers: activeCount,
    disabledUsers: disabledCount,
    unassignedOrgUsers: unassignedCount,
  };
}

export interface UserFilterOptions {
  keyword?: string;
  orgId?: string;
  status?: string;
  role?: string;
}

/**
 * 多维组合筛选用户列表
 */
export function filterUsers(users: UserDto[], filter: UserFilterOptions): UserDto[] {
  if (!users) return [];

  const kw = filter.keyword?.trim().toLowerCase() ?? '';
  const orgFilter = filter.orgId?.trim() ?? '';
  const statusFilter = filter.status?.trim() ?? '';
  const roleFilter = filter.role?.trim() ?? '';

  return users.filter((user) => {
    // 关键字匹配：用户名、真实姓名、手机号
    if (kw) {
      const matchUsername = user.username?.toLowerCase().includes(kw);
      const matchRealName = user.realName?.toLowerCase().includes(kw);
      const matchPhone = user.phone?.toLowerCase().includes(kw);
      if (!matchUsername && !matchRealName && !matchPhone) {
        return false;
      }
    }

    // 所属机构筛选
    if (orgFilter && orgFilter !== 'ALL') {
      if (orgFilter === 'UNASSIGNED') {
        if (user.orgId && user.orgId.trim() !== '') return false;
      } else if (user.orgId !== orgFilter) {
        return false;
      }
    }

    // 状态筛选
    if (statusFilter && statusFilter !== 'ALL') {
      if (user.status !== statusFilter) {
        return false;
      }
    }

    // 角色筛选
    if (roleFilter && roleFilter !== 'ALL') {
      if (!user.roles || !user.roles.includes(roleFilter)) {
        return false;
      }
    }

    return true;
  });
}

// -------------------------------------------------------------
// 角色指标与关联计算
// -------------------------------------------------------------

export interface RoleStats {
  totalRoles: number;
  systemRoles: number;
  customRoles: number;
}

export function calculateRoleStats(roles: RoleDto[]): RoleStats {
  if (!roles || roles.length === 0) {
    return { totalRoles: 0, systemRoles: 0, customRoles: 0 };
  }

  let sysCount = 0;
  for (const r of roles) {
    if (r.isSystem) {
      sysCount += 1;
    }
  }

  return {
    totalRoles: roles.length,
    systemRoles: sysCount,
    customRoles: roles.length - sysCount,
  };
}

/**
 * 汇总计算各角色关联的实际用户数
 */
export function aggregateRoleUserCounts(roles: RoleDto[], users: UserDto[]): RoleDto[] {
  const countMap = new Map<string, number>();

  for (const u of users) {
    if (Array.isArray(u.roles)) {
      for (const rCode of u.roles) {
        countMap.set(rCode, (countMap.get(rCode) ?? 0) + 1);
      }
    }
  }

  return roles.map((role) => {
    const calculatedCount = countMap.get(role.code) ?? 0;
    return {
      ...role,
      userCount: role.userCount !== undefined ? Math.max(role.userCount, calculatedCount) : calculatedCount,
    };
  });
}

// -------------------------------------------------------------
// 安全门禁规则 (Safety Guards)
// -------------------------------------------------------------

export function isSuperAdminAccount(user: Partial<UserDto>): boolean {
  if (user.username === 'admin') return true;
  if (Array.isArray(user.roles) && user.roles.includes('SUPER_ADMIN')) return true;
  return false;
}

/**
 * 用户删除操作安全门禁
 */
export function canDeleteUser(
  targetUser: UserDto,
  currentUserId?: string,
  currentUsername?: string
): { allowed: boolean; message?: string } {
  // 禁止删除自身
  if (
    (currentUserId && targetUser.id === currentUserId) ||
    (currentUsername && targetUser.username === currentUsername)
  ) {
    return {
      allowed: false,
      message: '禁止删除当前登录的自身账号',
    };
  }

  // 禁止删除超级管理员账号
  if (isSuperAdminAccount(targetUser)) {
    return {
      allowed: false,
      message: '超级管理员账户属于系统内置关键账号，禁止删除',
    };
  }

  return { allowed: true };
}

/**
 * 用户停用操作安全门禁
 */
export function canDisableUser(
  targetUser: UserDto,
  currentUserId?: string,
  currentUsername?: string
): { allowed: boolean; message?: string } {
  if (
    (currentUserId && targetUser.id === currentUserId) ||
    (currentUsername && targetUser.username === currentUsername)
  ) {
    return {
      allowed: false,
      message: '禁止停用当前登录的自身账号',
    };
  }

  return { allowed: true };
}

/**
 * 角色删除操作安全门禁
 */
export function canDeleteRole(targetRole: RoleDto): { allowed: boolean; message?: string } {
  if (
    targetRole.isSystem === true ||
    targetRole.code === 'SUPER_ADMIN' ||
    targetRole.code === 'TENANT_ADMIN'
  ) {
    return {
      allowed: false,
      message: '系统内置角色禁止删除',
    };
  }

  if (targetRole.userCount && targetRole.userCount > 0) {
    return {
      allowed: false,
      message: `当前角色仍关联 ${targetRole.userCount} 名用户，请先解除用户角色绑定后再删除`,
    };
  }

  return { allowed: true };
}

// -------------------------------------------------------------
// 6 大业务集群细粒度权限树体系
// -------------------------------------------------------------

export const PERMISSION_TREE_DATA: PermissionTreeNode[] = [
  // 1. 概览看板
  {
    key: 'cluster-dashboard',
    title: '概览看板',
    type: 'cluster',
    description: '综合运营态势、设备在线率与指令成功率可视化',
    children: [
      {
        key: 'menu-dashboard',
        code: 'dashboard:read',
        title: '运营看板查看',
        type: 'menu',
        children: [
          {
            key: 'action-dashboard-export',
            code: 'dashboard:export',
            title: '报表与指标导出',
            type: 'action',
          },
        ],
      },
    ],
  },

  // 2. 平台中枢
  {
    key: 'cluster-platform',
    title: '平台中枢',
    type: 'cluster',
    description: 'SaaS多租户、多级机构与RBAC用户角色中枢',
    children: [
      {
        key: 'menu-tenant',
        code: 'tenant:manage',
        title: '租户管理',
        type: 'menu',
        children: [
          {
            key: 'action-tenant-create',
            code: 'tenant:create',
            title: '创建租户',
            type: 'action',
          },
          {
            key: 'action-tenant-quota',
            code: 'tenant:quota:adjust',
            title: '调整设备配额',
            type: 'action',
          },
          {
            key: 'action-tenant-status',
            code: 'tenant:status:toggle',
            title: '启停租户生命周期',
            type: 'action',
          },
        ],
      },
      {
        key: 'menu-org',
        code: 'org:manage',
        title: '机构管理',
        type: 'menu',
        children: [
          {
            key: 'action-org-create',
            code: 'org:create',
            title: '新建机构节点',
            type: 'action',
          },
          {
            key: 'action-org-edit',
            code: 'org:edit',
            title: '修改机构拓扑',
            type: 'action',
          },
          {
            key: 'action-org-delete',
            code: 'org:delete',
            title: '删除停用机构',
            type: 'action',
          },
        ],
      },
      {
        key: 'menu-user',
        code: 'user:manage',
        title: '用户管理',
        type: 'menu',
        children: [
          {
            key: 'action-user-create',
            code: 'user:create',
            title: '新增用户账号',
            type: 'action',
          },
          {
            key: 'action-user-edit',
            code: 'user:edit',
            title: '编辑用户信息',
            type: 'action',
          },
          {
            key: 'action-user-delete',
            code: 'user:delete',
            title: '删除用户账号',
            type: 'action',
          },
          {
            key: 'action-user-password',
            code: 'user:password:reset',
            title: '重置用户登录密码',
            type: 'action',
          },
          {
            key: 'action-user-status',
            code: 'user:status:toggle',
            title: '启停用户账号状态',
            type: 'action',
          },
        ],
      },
      {
        key: 'menu-role',
        code: 'role:manage',
        title: '角色与权限配置',
        type: 'menu',
        children: [
          {
            key: 'action-role-create',
            code: 'role:create',
            title: '新建角色',
            type: 'action',
          },
          {
            key: 'action-role-edit',
            code: 'role:edit',
            title: '修改角色定义',
            type: 'action',
          },
          {
            key: 'action-role-delete',
            code: 'role:delete',
            title: '删除角色',
            type: 'action',
          },
          {
            key: 'action-role-permission',
            code: 'role:permission:assign',
            title: '分配角色功能权限',
            type: 'action',
          },
        ],
      },
    ],
  },

  // 3. 资产管理
  {
    key: 'cluster-assets',
    title: '资产管理',
    type: 'cluster',
    description: 'T-Box/车机硬件终端与车辆档案台账资产',
    children: [
      {
        key: 'menu-device',
        code: 'device:read',
        title: '设备档案查看',
        type: 'menu',
        children: [
          {
            key: 'action-device-write',
            code: 'device:write',
            title: '设备建档与批量导入',
            type: 'action',
          },
          {
            key: 'action-device-config',
            code: 'device:config:write',
            title: '下发终端运行参数',
            type: 'action',
          },
          {
            key: 'action-device-reboot',
            code: 'device:reboot',
            title: '远程重启设备',
            type: 'action',
          },
        ],
      },
      {
        key: 'menu-vehicle',
        code: 'vehicle:read',
        title: '车辆档案管理',
        type: 'menu',
        children: [
          {
            key: 'action-vehicle-write',
            code: 'vehicle:write',
            title: '车辆录入与信息修改',
            type: 'action',
          },
          {
            key: 'action-vehicle-bind',
            code: 'vehicle:bind',
            title: '绑定/解绑设备终端',
            type: 'action',
          },
          {
            key: 'action-vehicle-delete',
            code: 'vehicle:delete',
            title: '注销车辆档案',
            type: 'action',
          },
        ],
      },
    ],
  },

  // 4. 车控运营
  {
    key: 'cluster-control',
    title: '车控运营',
    type: 'cluster',
    description: '13类远程车控指令下发、安全码校验与实时状态机流水',
    children: [
      {
        key: 'menu-control',
        code: 'vehicle:control',
        title: '远程车控控制台',
        type: 'menu',
        children: [
          {
            key: 'action-control-lock',
            code: 'car:control:lock',
            title: '远程开门 / 闭锁',
            type: 'action',
          },
          {
            key: 'action-control-engine',
            code: 'car:control:engine',
            title: '远程启动 / 熄火 (L2高危)',
            type: 'action',
          },
          {
            key: 'action-control-ac',
            code: 'car:control:ac',
            title: '空调冷暖开启与温控',
            type: 'action',
          },
          {
            key: 'action-control-trunk',
            code: 'car:control:trunk',
            title: '后备箱开闭',
            type: 'action',
          },
          {
            key: 'action-control-search',
            code: 'car:control:search',
            title: '双闪鸣笛寻车',
            type: 'action',
          },
          {
            key: 'action-control-window',
            code: 'car:control:window',
            title: '一键升降车窗',
            type: 'action',
          },
          {
            key: 'action-control-seat',
            code: 'car:control:seat',
            title: '座椅加热与通风',
            type: 'action',
          },
        ],
      },
    ],
  },

  // 5. 位置与围栏
  {
    key: 'cluster-location',
    title: '位置与围栏',
    type: 'cluster',
    description: '多车实时地图打点聚合、轨迹回放与电子围栏规则',
    children: [
      {
        key: 'menu-telemetry',
        code: 'telemetry:read',
        title: '实时定位与轨迹回放',
        type: 'menu',
        children: [
          {
            key: 'action-telemetry-export',
            code: 'telemetry:export',
            title: '历史轨迹打点导出',
            type: 'action',
          },
        ],
      },
      {
        key: 'menu-geofence',
        code: 'geofence:read',
        title: '电子围栏管理',
        type: 'menu',
        children: [
          {
            key: 'action-geofence-write',
            code: 'geofence:write',
            title: '绘制并保存围栏区域',
            type: 'action',
          },
          {
            key: 'action-geofence-delete',
            code: 'geofence:delete',
            title: '删除电子围栏规则',
            type: 'action',
          },
        ],
      },
    ],
  },

  // 6. 运维保障
  {
    key: 'cluster-operations',
    title: '运维保障',
    type: 'cluster',
    description: '安防车况告警、固件OTA升级、TCP通讯日志与微服务监控',
    children: [
      {
        key: 'menu-alarm',
        code: 'alarm:read',
        title: '报警中心查看',
        type: 'menu',
        children: [
          {
            key: 'action-alarm-ack',
            code: 'alarm:ack',
            title: '人工确认与告警消警闭环',
            type: 'action',
          },
          {
            key: 'action-alarm-config',
            code: 'alarm:config',
            title: '告警规则策略配置',
            type: 'action',
          },
        ],
      },
      {
        key: 'menu-ota',
        code: 'ota:manage',
        title: '固件 OTA 升级',
        type: 'menu',
        children: [
          {
            key: 'action-ota-firmware-upload',
            code: 'ota:firmware:upload',
            title: '固件包上传与完整性校验',
            type: 'action',
          },
          {
            key: 'action-ota-push',
            code: 'ota:push:execute',
            title: '执行分批固件升级下发',
            type: 'action',
          },
        ],
      },
      {
        key: 'menu-audit',
        code: 'audit:read',
        title: '通讯与操作日志查看',
        type: 'menu',
        children: [
          {
            key: 'action-audit-export',
            code: 'audit:export',
            title: '底层 TCP/MQTT 报文导出',
            type: 'action',
          },
        ],
      },
      {
        key: 'menu-monitor',
        code: 'monitor:read',
        title: '系统运维监控面板',
        type: 'menu',
      },
    ],
  },
];

/**
 * 超级管理员受保护的核心权限（只读勾选不可取消）
 */
export const SUPER_ADMIN_LOCKED_PERMISSIONS = [
  'dashboard:read',
  'tenant:manage',
  'org:manage',
  'user:manage',
  'role:manage',
  'device:read',
  'vehicle:read',
  'vehicle:control',
  'telemetry:read',
  'geofence:read',
  'alarm:read',
  'ota:manage',
  'audit:read',
  'monitor:read',
];

/**
 * 递归收集权限树中所有的功能代码 (叶子节点和菜单节点的 code)
 */
export function flattenPermissionKeys(nodes: PermissionTreeNode[] = PERMISSION_TREE_DATA): string[] {
  const keys: string[] = [];

  function traverse(list: PermissionTreeNode[]) {
    for (const node of list) {
      if (node.code) {
        keys.push(node.code);
      }
      if (node.children && node.children.length > 0) {
        traverse(node.children);
      }
    }
  }

  traverse(nodes);
  return Array.from(new Set(keys));
}

/**
 * 递归收集权限树中的所有节点 key (用于展开全部)
 */
export function getAllPermissionNodeKeys(nodes: PermissionTreeNode[] = PERMISSION_TREE_DATA): string[] {
  const keys: string[] = [];

  function traverse(list: PermissionTreeNode[]) {
    for (const node of list) {
      keys.push(node.key);
      if (node.children && node.children.length > 0) {
        traverse(node.children);
      }
    }
  }

  traverse(nodes);
  return keys;
}

/**
 * 判断是否为超级管理员角色
 */
export function isSuperAdminRole(roleCode?: string): boolean {
  return roleCode === 'SUPER_ADMIN';
}

// -------------------------------------------------------------
// 生产级内置种子数据 (Seed Data)
// -------------------------------------------------------------

export const SEED_ROLES: RoleDto[] = [
  {
    id: 'role-001',
    name: '超级系统管理员',
    code: 'SUPER_ADMIN',
    description: '系统最高权限管理者，具备全模块操作、安全审计与全局租户管理能力',
    dataScope: 'ALL',
    permissions: flattenPermissionKeys(PERMISSION_TREE_DATA),
    userCount: 1,
    isSystem: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'role-002',
    name: '企业租户管理员',
    code: 'TENANT_ADMIN',
    description: '租户企业最高主管，负责本租户组织架构、账号分配与车队资产配置',
    dataScope: 'ORG_AND_CHILDREN',
    permissions: [
      'dashboard:read',
      'dashboard:export',
      'org:manage',
      'org:create',
      'org:edit',
      'user:manage',
      'user:create',
      'user:edit',
      'user:password:reset',
      'user:status:toggle',
      'role:manage',
      'device:read',
      'device:write',
      'vehicle:read',
      'vehicle:write',
      'vehicle:bind',
      'vehicle:control',
      'car:control:lock',
      'car:control:ac',
      'car:control:search',
      'telemetry:read',
      'geofence:read',
      'alarm:read',
      'alarm:ack',
      'ota:manage',
    ],
    userCount: 1,
    isSystem: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'role-003',
    name: '车控调度运维员',
    code: 'OPERATOR',
    description: '负责车队一线日常调度、远程车控指令触发、异常告警消警与轨迹跟踪',
    dataScope: 'ORG_ONLY',
    permissions: [
      'dashboard:read',
      'device:read',
      'vehicle:read',
      'vehicle:control',
      'car:control:lock',
      'car:control:ac',
      'car:control:trunk',
      'car:control:search',
      'car:control:window',
      'telemetry:read',
      'geofence:read',
      'alarm:read',
      'alarm:ack',
    ],
    userCount: 2,
    isSystem: false,
    createdAt: '2026-01-10T08:00:00Z',
  },
  {
    id: 'role-004',
    name: '安全合规审计员',
    code: 'AUDITOR',
    description: '安全合规专员，只读调阅通讯底层上行下行报文日志、操作轨迹与系统审计',
    dataScope: 'ALL',
    permissions: [
      'dashboard:read',
      'device:read',
      'vehicle:read',
      'telemetry:read',
      'alarm:read',
      'audit:read',
      'audit:export',
    ],
    userCount: 1,
    isSystem: false,
    createdAt: '2026-02-01T09:00:00Z',
  },
  {
    id: 'role-005',
    name: '车主驾驶员',
    code: 'CAR_OWNER',
    description: '仅绑定单一车辆，允许查看个人行驶里程、续航里程与基础遥控',
    dataScope: 'SELF_ONLY',
    permissions: [
      'vehicle:read',
      'vehicle:control',
      'car:control:lock',
      'car:control:search',
      'telemetry:read',
    ],
    userCount: 1,
    isSystem: true,
    createdAt: '2026-03-01T10:00:00Z',
  },
];

export const SEED_USERS: UserDto[] = [
  {
    id: 'user-001',
    username: 'admin',
    realName: '平台超级管理员',
    phone: '13800000000',
    email: 'admin@car-control.com',
    orgId: 'org-root',
    orgName: '华东总部集团',
    roles: ['SUPER_ADMIN'],
    status: 'ACTIVE',
    lastLoginAt: '2026-10-12 10:20:15',
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'user-002',
    username: 'zhangsan',
    realName: '张建国',
    phone: '13912345678',
    email: 'zhangjg@speed-east.com',
    orgId: 'org-fleet-sh',
    orgName: '上海干线运营车队',
    roles: ['TENANT_ADMIN'],
    status: 'ACTIVE',
    lastLoginAt: '2026-10-11 16:45:00',
    createdAt: '2026-01-15T09:00:00Z',
  },
  {
    id: 'user-003',
    username: 'lisi',
    realName: '李调度',
    phone: '13798765432',
    email: 'lisi@speed-east.com',
    orgId: 'org-fleet-sh',
    orgName: '上海干线运营车队',
    roles: ['OPERATOR'],
    status: 'ACTIVE',
    lastLoginAt: '2026-10-12 09:12:33',
    createdAt: '2026-02-01T10:00:00Z',
  },
  {
    id: 'user-004',
    username: 'wangwu',
    realName: '王审计',
    phone: '13611223344',
    email: 'wangwu@audit.com',
    orgId: 'org-audit',
    orgName: '安全审计合规部',
    roles: ['AUDITOR'],
    status: 'ACTIVE',
    lastLoginAt: '2026-10-08 14:00:21',
    createdAt: '2026-02-15T11:00:00Z',
  },
  {
    id: 'user-005',
    username: 'zhaoliu',
    realName: '赵暂离',
    phone: '13555667788',
    email: 'zhao@speed-east.com',
    orgId: 'org-fleet-hz',
    orgName: '杭州冷链分队',
    roles: ['OPERATOR'],
    status: 'DISABLED',
    lastLoginAt: '2026-09-15 11:20:00',
    createdAt: '2026-03-01T08:00:00Z',
  },
  {
    id: 'user-006',
    username: 'newuser',
    realName: '孙未分配',
    phone: '13388990011',
    email: 'sun@temp.com',
    orgId: '',
    orgName: '',
    roles: ['CAR_OWNER'],
    status: 'ACTIVE',
    lastLoginAt: undefined,
    createdAt: '2026-10-01T15:30:00Z',
  },
];
