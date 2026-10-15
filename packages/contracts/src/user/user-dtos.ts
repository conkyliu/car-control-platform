/**
 * 角色数据管辖范围类型
 */
export type RoleDataScope = 'ALL' | 'ORG_AND_CHILDREN' | 'ORG_ONLY' | 'SELF_ONLY';

/**
 * 用户数据传输对象 Dto
 */
export interface UserDto {
  id: string;
  tenantId?: string;
  username: string;
  realName: string;
  phone?: string;
  email?: string;
  orgId?: string;
  orgName?: string;
  roles: string[];
  status: 'ACTIVE' | 'DISABLED';
  lastLoginAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * 用户分页与条件查询参数
 */
export interface UserQueryParams {
  keyword?: string;
  orgId?: string;
  status?: string;
  role?: string;
  page?: number;
  pageSize?: number;
}

/**
 * 创建用户入参
 */
export interface CreateUserInput {
  username: string;
  realName: string;
  phone: string;
  email?: string;
  orgId?: string;
  orgName?: string;
  roles: string[];
  password?: string;
  status?: 'ACTIVE' | 'DISABLED';
}

/**
 * 更新用户入参
 */
export interface UpdateUserInput {
  realName?: string;
  phone?: string;
  email?: string;
  orgId?: string;
  orgName?: string;
  roles?: string[];
  status?: 'ACTIVE' | 'DISABLED';
}

/**
 * 角色定义 Dto
 */
export interface RoleDto {
  id: string;
  tenantId?: string;
  name: string;
  code: string;
  description?: string;
  dataScope: RoleDataScope;
  permissions: string[];
  userCount?: number;
  isSystem?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * 创建角色入参
 */
export interface CreateRoleInput {
  name: string;
  code: string;
  description?: string;
  dataScope?: RoleDataScope;
  permissions?: string[];
}

/**
 * 更新角色入参
 */
export interface UpdateRoleInput {
  name?: string;
  description?: string;
  dataScope?: RoleDataScope;
  permissions?: string[];
}

/**
 * 更新角色细粒度权限入参
 */
export interface UpdateRolePermissionsInput {
  permissions: string[];
  dataScope?: RoleDataScope;
}

/**
 * 树形权限节点定义
 */
export interface PermissionTreeNode {
  key: string;
  title: string;
  code?: string;
  type?: 'cluster' | 'menu' | 'action';
  description?: string;
  disabled?: boolean;
  children?: PermissionTreeNode[];
}

/**
 * 6 大业务集群细粒度权限树体系常量
 */
export const DEFAULT_PERMISSION_TREE: PermissionTreeNode[] = [
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
