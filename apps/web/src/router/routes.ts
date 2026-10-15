export const RoutePath = {
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  TENANTS: '/tenants',
  ORGS: '/orgs',
  USERS: '/users',
  ROLES: '/roles',
  DEVICES: '/devices',
  VEHICLES: '/vehicles',
  COMMANDS: '/commands',
  TELEMETRY: '/telemetry',
  GEOFENCE: '/geofence',
  ALARMS: '/alarms',
  OTA: '/ota',
  LOGS: '/logs',
  MONITOR: '/monitor',
  MODELS: '/models',
  PROJECTS: '/projects',
  CAPABILITIES: '/capabilities',
  DIGITAL_KEYS: '/digital-keys',
  COMMAND_DICTIONARY: '/command-dictionary',
} as const;

export type RoutePathType = (typeof RoutePath)[keyof typeof RoutePath];

export const RouteCategory = {
  OVERVIEW: '概览看板',
  PLATFORM_IAM: '平台中枢',
  ASSET_MANAGEMENT: '资产管理',
  VEHICLE_CONTROL: '车控运营',
  LOCATION_GEOFENCE: '位置与围栏',
  OPERATIONS_SECURITY: '运维保障',
} as const;

export type RouteCategoryType = (typeof RouteCategory)[keyof typeof RouteCategory];

export interface RouteMeta {
  path: string;
  title: string;
  icon?: string;
  permission?: string;
  category?: string;
  hideInMenu?: boolean;
  order?: number;
  description?: string;
}

export const routes: RouteMeta[] = [
  // 01 认证登录 (独立页面，无主布局)
  {
    path: RoutePath.LOGIN,
    title: '用户登录',
    hideInMenu: true,
    description: '手机控车运营管理中台账号身份鉴权与滑块人机验证',
  },

  // 11 运营数据大屏
  {
    path: RoutePath.DASHBOARD,
    title: '运营看板',
    icon: 'DashboardOutlined',
    category: RouteCategory.OVERVIEW,
    permission: 'dashboard:read',
    order: 10,
    description: '设备在线率、车控指令成功率与24小时告警趋势综合态势看板',
  },

  // 02 & 22 多租户与机构中枢
  {
    path: RoutePath.TENANTS,
    title: '租户管理',
    icon: 'ApartmentOutlined',
    category: RouteCategory.PLATFORM_IAM,
    permission: 'tenant:manage',
    order: 20,
    description: 'SaaS多租户配置、设备配额硬约束与租户生命周期管理',
  },
  {
    path: RoutePath.ORGS,
    title: '机构管理',
    icon: 'ClusterOutlined',
    category: RouteCategory.PLATFORM_IAM,
    permission: 'org:manage',
    order: 21,
    description: '多级组织树状拓扑、行政层级划分与数据隔离范围',
  },

  // 03 用户与角色权限
  {
    path: RoutePath.USERS,
    title: '用户管理',
    icon: 'UserOutlined',
    category: RouteCategory.PLATFORM_IAM,
    permission: 'user:manage',
    order: 22,
    description: '平台管理员账户增删改查、机构绑定与状态启停',
  },
  {
    path: RoutePath.ROLES,
    title: '角色权限',
    icon: 'SafetyCertificateOutlined',
    category: RouteCategory.PLATFORM_IAM,
    permission: 'role:manage',
    order: 23,
    description: 'RBAC细粒度权限配置、菜单及操作按钮级权限分配',
  },

  // 04 设备管理
  {
    path: RoutePath.DEVICES,
    title: '设备管理',
    icon: 'DesktopOutlined',
    category: RouteCategory.ASSET_MANAGEMENT,
    permission: 'device:read',
    order: 30,
    description: 'T-Box/车机硬件资产台账、批量导入、参数设置与网络状态诊断',
  },

  // 05 车辆管理
  {
    path: RoutePath.VEHICLES,
    title: '车辆管理',
    icon: 'CarOutlined',
    category: RouteCategory.ASSET_MANAGEMENT,
    permission: 'vehicle:read',
    order: 31,
    description: '车辆档案管理、VIN校验、软硬件一键绑定/转让与实时车况',
  },

  // 06 & 07 车控运营与能力继承
  {
    path: RoutePath.COMMANDS,
    title: '车控中心',
    icon: 'ControlOutlined',
    category: RouteCategory.VEHICLE_CONTROL,
    permission: 'vehicle:control',
    order: 40,
    description: '13类远程车控操作工作台、安全码校验与全生命周期实时流水',
  },

  // 10 定位与轨迹
  {
    path: RoutePath.TELEMETRY,
    title: '实时定位与轨迹',
    icon: 'AimOutlined',
    category: RouteCategory.LOCATION_GEOFENCE,
    permission: 'telemetry:read',
    order: 50,
    description: '多车实时地图打点聚合、抽稀历史轨迹回放播放器',
  },
  {
    path: RoutePath.GEOFENCE,
    title: '电子围栏',
    icon: 'CompassOutlined',
    category: RouteCategory.LOCATION_GEOFENCE,
    permission: 'geofence:read',
    order: 51,
    description: '圆形/多边形围栏地图交互编辑与出入告警联动规则',
  },

  // 08 报警中心
  {
    path: RoutePath.ALARMS,
    title: '报警中心',
    icon: 'AlertOutlined',
    category: RouteCategory.OPERATIONS_SECURITY,
    permission: 'alarm:read',
    order: 60,
    description: '8大车况告警检索、声光弹窗推送与人工闭环处置抽屉',
  },

  // 14 固件 OTA 升级
  {
    path: RoutePath.OTA,
    title: '固件升级',
    icon: 'CloudUploadOutlined',
    category: RouteCategory.OPERATIONS_SECURITY,
    permission: 'ota:manage',
    order: 61,
    description: '固件版本库完整性校验、分批升级调度向导与全链路进度追踪',
  },

  // 19 通讯日志中心
  {
    path: RoutePath.LOGS,
    title: '通讯日志',
    icon: 'FileTextOutlined',
    category: RouteCategory.OPERATIONS_SECURITY,
    permission: 'audit:read',
    order: 62,
    description: 'TCP/MQTT上行下行报文检索、Hex与明文JSON对照分析',
  },

  // 16 系统运维监控
  {
    path: RoutePath.MONITOR,
    title: '运维监控',
    icon: 'LineChartOutlined',
    category: RouteCategory.OPERATIONS_SECURITY,
    permission: 'monitor:read',
    order: 63,
    description: 'Prometheus微服务指标可视化、分布式锁与QPS吞吐监控',
  },
  {
    path: RoutePath.MODELS,
    title: '车型品牌管理',
    icon: 'CarOutlined',
    category: RouteCategory.ASSET_MANAGEMENT,
    permission: 'vehicle:read',
    hideInMenu: true,
    description: '车型档案、通讯协议0x02车型代码维护与品牌资产管理',
  },
  {
    path: RoutePath.PROJECTS,
    title: '项目归属配置',
    icon: 'ClusterOutlined',
    category: RouteCategory.ASSET_MANAGEMENT,
    permission: 'device:read',
    hideInMenu: true,
    description: '项目全生命周期运营、机构归属与设备调配中枢',
  },
  {
    path: RoutePath.CAPABILITIES,
    title: '车型能力配置',
    icon: 'ControlOutlined',
    category: RouteCategory.VEHICLE_CONTROL,
    permission: 'vehicle:control',
    hideInMenu: true,
    description: '车型级车控能力模板矩阵、安全等级与参数Schema约束中心',
  },
  {
    path: RoutePath.DIGITAL_KEYS,
    title: '数字钥匙授权',
    icon: 'KeyOutlined',
    category: RouteCategory.VEHICLE_CONTROL,
    permission: 'vehicle:control',
    hideInMenu: true,
    description: '数字钥匙授权分发、BLE/云端/NFC介质管控与安全吊销中心',
  },
  {
    path: RoutePath.COMMAND_DICTIONARY,
    title: '指令字典与协议参数',
    icon: 'BookOutlined',
    category: RouteCategory.VEHICLE_CONTROL,
    permission: 'vehicle:control',
    hideInMenu: true,
    description: '13类远程车控指令字典、下行Payload Schema与CAN总线信号映射中心',
  },
];

/**
 * 获取侧边栏/主导航可见的菜单路由列表
 */
export function getMenuRoutes(): RouteMeta[] {
  return routes
    .filter((route) => !route.hideInMenu)
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
}

/**
 * 根据所属分组对菜单项进行分类归集
 */
export function getRoutesByCategory(): Record<string, RouteMeta[]> {
  const menuRoutes = getMenuRoutes();
  const grouped: Record<string, RouteMeta[]> = {};

  for (const item of menuRoutes) {
    const cat = item.category || '其他';
    if (!grouped[cat]) {
      grouped[cat] = [];
    }
    grouped[cat].push(item);
  }

  return grouped;
}

/**
 * 根据路径匹配路由元信息
 */
export function findRouteByPath(path: string): RouteMeta | undefined {
  return routes.find((route) => route.path === path);
}

/**
 * 根据用户权限函数过滤可访问的菜单路由列表
 */
export function filterAccessibleRoutes(hasPermission: (code: string) => boolean): RouteMeta[] {
  return routes
    .filter((route) => {
      if (route.hideInMenu) return false;
      if (!route.permission) return true;
      return hasPermission(route.permission);
    })
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
}

/**
 * 根据所属分组对有权限的菜单项进行分类归集，自动剔除无任何权限项的空分组
 */
export function getAccessibleRoutesByCategory(
  hasPermission: (code: string) => boolean
): Record<string, RouteMeta[]> {
  const accessible = filterAccessibleRoutes(hasPermission);
  const grouped: Record<string, RouteMeta[]> = {};

  for (const item of accessible) {
    const cat = item.category || '其他';
    if (!grouped[cat]) {
      grouped[cat] = [];
    }
    grouped[cat].push(item);
  }

  return grouped;
}

/**
 * 根据当前激活路径计算层级面包屑列表
 */
export function computeBreadcrumbs(path: string): Array<{ title: string; path?: string }> {
  if (path === RoutePath.DASHBOARD) {
    return [
      { title: '首页', path: RoutePath.DASHBOARD },
      { title: '运营看板', path: RoutePath.DASHBOARD },
    ];
  }

  const currentRoute = findRouteByPath(path);
  if (!currentRoute) {
    return [
      { title: '首页', path: RoutePath.DASHBOARD },
      { title: '未知页面' },
    ];
  }

  const items: Array<{ title: string; path?: string }> = [
    { title: '首页', path: RoutePath.DASHBOARD },
  ];

  if (currentRoute.category) {
    items.push({ title: currentRoute.category });
  }

  items.push({ title: currentRoute.title, path: currentRoute.path });
  return items;
}
