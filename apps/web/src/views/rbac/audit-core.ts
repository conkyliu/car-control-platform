import { ApiError } from '../../api/client.ts';

export type AuditLogRiskLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type AuditLogStatus = 'SUCCESS' | 'FAILED';

export interface AuditLogDto {
  id: string;
  traceId: string;
  tenantId?: string;
  tenantName?: string;
  operatorId: string;
  operatorName: string;
  operatorUsername: string;
  orgId?: string;
  orgName?: string;
  clientIp: string;
  clientLocation?: string;
  userAgent?: string;
  module: string;
  action: string;
  actionName?: string;
  resourceType: string;
  resourceId: string;
  status: AuditLogStatus;
  executionTimeMs: number;
  requestPayload?: any;
  responsePayload?: any;
  errorMessage?: string;
  signatureHash?: string;
  createdAt: string;
}

export interface AuditLogQueryParams {
  keyword?: string;
  module?: string;
  action?: string;
  status?: string;
  riskLevel?: string;
  startTime?: string;
  endTime?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditLogStatsDto {
  totalCount: number;
  controlCount: number;
  highRiskCount: number;
  failedCount: number;
}

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

/**
 * 业务模块字典
 */
export const AUDIT_MODULES: Array<{ label: string; value: string; color: string }> = [
  { label: '远程车控', value: 'VEHICLE_CONTROL', color: 'blue' },
  { label: '用户权限', value: 'USER_IAM', color: 'purple' },
  { label: '车辆资产', value: 'VEHICLE_ASSET', color: 'cyan' },
  { label: '设备管理', value: 'DEVICE_MANAGE', color: 'geekblue' },
  { label: '固件升级', value: 'OTA_UPDATE', color: 'magenta' },
  { label: '电子围栏', value: 'GEOFENCE', color: 'green' },
  { label: '租户配置', value: 'TENANT_CONFIG', color: 'orange' },
];

/**
 * 操作行为字典
 */
export const AUDIT_ACTIONS: Array<{ label: string; value: string }> = [
  { label: '登录认证', value: 'LOGIN' },
  { label: '注销登出', value: 'LOGOUT' },
  { label: '新增建档', value: 'CREATE' },
  { label: '修改更新', value: 'UPDATE' },
  { label: '删除注销', value: 'DELETE' },
  { label: '删除用户', value: 'USER_DELETE' },
  { label: '重置密码', value: 'PASSWORD_RESET' },
  { label: '远程熄火', value: 'REMOTE_ENGINE_STOP' },
  { label: '远程点火', value: 'REMOTE_ENGINE_START' },
  { label: '远程加锁', value: 'REMOTE_LOCK' },
  { label: '远程解锁', value: 'REMOTE_UNLOCK' },
  { label: '空调控制', value: 'REMOTE_AC_CONTROL' },
  { label: '后备箱控制', value: 'REMOTE_TRUNK' },
  { label: '执行指令', value: 'EXECUTE_COMMAND' },
  { label: '数据导出', value: 'EXPORT' },
  { label: '批量固件升级', value: 'OTA_BATCH_TRIGGER' },
  { label: '设备解绑', value: 'DEVICE_UNBIND' },
  { label: '停用租户', value: 'TENANT_DISABLE' },
  { label: '围栏规则修改', value: 'GEOFENCE_UPDATE' },
];

/**
 * 操作风险等级评估算法 (HIGH, MEDIUM, LOW)
 */
export function getRiskLevel(
  moduleOrLog: string | Pick<AuditLogDto, 'module' | 'action'>,
  action?: string
): AuditLogRiskLevel {
  let module = '';
  let act = '';

  if (typeof moduleOrLog === 'object' && moduleOrLog !== null) {
    module = moduleOrLog.module || '';
    act = moduleOrLog.action || '';
  } else {
    module = moduleOrLog || '';
    act = action || '';
  }

  const upperAct = act.toUpperCase();

  // 高危操作：删除/注销、密码重置、强控/熄火、批量OTA升级、解绑设备、停用租户
  const highRiskActions = [
    'DELETE',
    'USER_DELETE',
    'ROLE_DELETE',
    'TENANT_DELETE',
    'TENANT_DISABLE',
    'PASSWORD_RESET',
    'RESET_PASSWORD',
    'FORCE_STOP',
    'REMOTE_ENGINE_STOP',
    'DEVICE_UNBIND',
    'OTA_BATCH_TRIGGER',
  ];

  if (
    highRiskActions.includes(upperAct) ||
    upperAct.includes('DELETE') ||
    upperAct.includes('RESET_PASSWORD') ||
    upperAct.includes('ENGINE_STOP') ||
    upperAct.includes('FORCE_STOP')
  ) {
    return 'HIGH';
  }

  // 中危操作：远程解锁/开窗/空调/车控操作、创建、更新、围栏配置变更、数据导出
  const mediumRiskActions = [
    'UPDATE',
    'CREATE',
    'EXPORT',
    'STATUS_CHANGE',
    'GEOFENCE_UPDATE',
    'CONFIG_CHANGE',
    'REMOTE_UNLOCK',
    'REMOTE_LOCK',
    'REMOTE_ENGINE_START',
    'REMOTE_AC_CONTROL',
    'REMOTE_TRUNK',
    'EXECUTE_COMMAND',
  ];

  if (
    mediumRiskActions.includes(upperAct) ||
    module === 'VEHICLE_CONTROL' ||
    upperAct.includes('UPDATE') ||
    upperAct.includes('CREATE') ||
    upperAct.includes('EXPORT')
  ) {
    return 'MEDIUM';
  }

  // 低危操作：登录、注销、查询、列表浏览
  return 'LOW';
}

/**
 * 计算审计汇总统计指标
 */
export function calculateAuditStats(logs: AuditLogDto[]): AuditLogStatsDto {
  let controlCount = 0;
  let highRiskCount = 0;
  let failedCount = 0;

  for (const log of logs) {
    if (log.module === 'VEHICLE_CONTROL' || log.module === '远程车控') {
      controlCount++;
    }
    if (getRiskLevel(log.module, log.action) === 'HIGH') {
      highRiskCount++;
    }
    if (log.status === 'FAILED') {
      failedCount++;
    }
  }

  return {
    totalCount: logs.length,
    controlCount,
    highRiskCount,
    failedCount,
  };
}

/**
 * 多维组合过滤审计日志
 */
export function filterAuditLogs(
  logs: AuditLogDto[],
  filters?: AuditLogQueryParams
): AuditLogDto[] {
  if (!filters) return [...logs];

  const { keyword, module, action, status, riskLevel, startTime, endTime } = filters;
  const kw = keyword?.trim().toLowerCase();

  const startMs = startTime ? new Date(startTime.replace(/-/g, '/')).getTime() : undefined;
  const endMs = endTime ? new Date(endTime.replace(/-/g, '/')).getTime() : undefined;

  return logs.filter((log) => {
    // 关键字搜索
    if (kw) {
      const match =
        log.id.toLowerCase().includes(kw) ||
        log.traceId.toLowerCase().includes(kw) ||
        log.operatorName.toLowerCase().includes(kw) ||
        log.operatorUsername.toLowerCase().includes(kw) ||
        log.clientIp.toLowerCase().includes(kw) ||
        log.resourceId.toLowerCase().includes(kw) ||
        (log.resourceType && log.resourceType.toLowerCase().includes(kw)) ||
        (log.actionName && log.actionName.toLowerCase().includes(kw)) ||
        (log.orgName && log.orgName.toLowerCase().includes(kw));
      if (!match) return false;
    }

    // 模块筛选
    if (module && module !== 'ALL') {
      if (log.module.toLowerCase() !== module.toLowerCase()) {
        return false;
      }
    }

    // 操作行为筛选
    if (action && action !== 'ALL') {
      if (log.action.toLowerCase() !== action.toLowerCase()) {
        return false;
      }
    }

    // 执行状态筛选
    if (status && status !== 'ALL') {
      if (log.status !== status) {
        return false;
      }
    }

    // 风险等级筛选
    if (riskLevel && riskLevel !== 'ALL') {
      if (getRiskLevel(log.module, log.action) !== riskLevel) {
        return false;
      }
    }

    // 时间范围筛选
    if (startMs || endMs) {
      const logMs = new Date(log.createdAt.replace(/-/g, '/')).getTime();
      if (startMs && !Number.isNaN(startMs) && logMs < startMs) {
        return false;
      }
      if (endMs && !Number.isNaN(endMs) && logMs > endMs) {
        return false;
      }
    }

    return true;
  });
}

/**
 * 转义 CSV 单一字段内容 (符合 RFC 4180 并防范 Excel 公式注入)
 */
function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) {
    return '';
  }
  let str = String(val);
  // CSV 公式注入防护：以 =, +, -, @, \t, \r 开头时添加单引号转义防范恶意宏执行
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * 生成符合 RFC 4180 标准且包含 UTF-8 BOM 的 CSV 文本
 */
export function generateAuditLogCsv(logs: AuditLogDto[]): string {
  const headers = [
    '日志ID',
    'Trace ID',
    '操作时间',
    '操作人',
    '用户名',
    '所属机构',
    '客户端IP',
    'IP归属地',
    '业务模块',
    '操作行为',
    '风险等级',
    '目标资源',
    '状态',
    '耗时(ms)',
    '防篡改哈希',
  ];

  const moduleMap: Record<string, string> = {
    VEHICLE_CONTROL: '远程车控',
    USER_IAM: '用户权限',
    VEHICLE_ASSET: '车辆资产',
    DEVICE_MANAGE: '设备管理',
    OTA_UPDATE: '固件升级',
    GEOFENCE: '电子围栏',
    TENANT_CONFIG: '租户配置',
  };

  const actionMap: Record<string, string> = {
    LOGIN: '登录认证',
    LOGOUT: '注销登出',
    CREATE: '新增建档',
    UPDATE: '修改更新',
    DELETE: '删除注销',
    USER_DELETE: '删除用户',
    PASSWORD_RESET: '重置密码',
    REMOTE_ENGINE_STOP: '远程发动机熄火',
    REMOTE_ENGINE_START: '远程发动机启动',
    REMOTE_LOCK: '远程加锁',
    REMOTE_UNLOCK: '远程解锁',
    REMOTE_AC_CONTROL: '空调控制',
    REMOTE_TRUNK: '尾箱控制',
    EXECUTE_COMMAND: '执行指令',
    EXPORT: '数据导出',
    OTA_BATCH_TRIGGER: '批量固件升级',
    DEVICE_UNBIND: '设备解绑',
    TENANT_DISABLE: '停用租户',
    GEOFENCE_UPDATE: '电子围栏修改',
  };

  const rows = logs.map((log) => {
    const risk = getRiskLevel(log.module, log.action);
    const modLabel = moduleMap[log.module] || log.module;
    const actLabel = log.actionName || actionMap[log.action] || log.action;
    const statusLabel = log.status === 'SUCCESS' ? '成功' : '失败';
    const resource = `${log.resourceType || ''}:${log.resourceId || ''}`;

    return [
      escapeCsvField(log.id),
      escapeCsvField(log.traceId),
      escapeCsvField(log.createdAt),
      escapeCsvField(log.operatorName),
      escapeCsvField(log.operatorUsername),
      escapeCsvField(log.orgName || '-'),
      escapeCsvField(log.clientIp),
      escapeCsvField(log.clientLocation || '-'),
      escapeCsvField(modLabel),
      escapeCsvField(actLabel),
      escapeCsvField(risk),
      escapeCsvField(resource),
      escapeCsvField(statusLabel),
      escapeCsvField(log.executionTimeMs),
      escapeCsvField(log.signatureHash || '-'),
    ].join(',');
  });

  // 添加 UTF-8 BOM 确保 Excel 打开无乱码
  return `\uFEFF${[headers.join(','), ...rows].join('\n')}`;
}

/**
 * 生产级真实操作审计日志种子数据（覆盖车控、权限、设备、固件、围栏及高危异常）
 */
export const SEED_AUDIT_LOGS: AuditLogDto[] = [
  {
    id: 'log-20261012-001',
    traceId: 'trace-4bf92f3577b34da6a3ce929d0e0e4736',
    tenantId: 'tenant-default',
    tenantName: '默认总平台租户',
    operatorId: 'usr-admin-01',
    operatorName: '超级管理员',
    operatorUsername: 'admin',
    orgId: 'org-hq-01',
    orgName: '平台运营总部',
    clientIp: '192.168.1.100',
    clientLocation: '广东省深圳市 (电信)',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130.0.0.0 Safari/537.36',
    module: 'VEHICLE_CONTROL',
    action: 'REMOTE_ENGINE_STOP',
    actionName: '远程发动机熄火',
    resourceType: 'Vehicle',
    resourceId: 'VIN: LFPH2E023N1000888',
    status: 'SUCCESS',
    executionTimeMs: 1420,
    requestPayload: {
      vin: 'LFPH2E023N1000888',
      command: 'ENGINE_STOP',
      securityCode: '******',
      forceTimeout: 15,
      reason: '涉嫌租赁违约强管控',
    },
    responsePayload: {
      code: 0,
      message: '终端确认熄火执行成功 (ACK 耗时 1.38s)',
      engineState: 'STOPPED',
      fuelCutOff: true,
    },
    signatureHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    createdAt: '2026-10-12 11:30:18',
  },
  {
    id: 'log-20261012-002',
    traceId: 'trace-9af83c1188c24da6b2fe818e1f1f5847',
    tenantId: 'tenant-default',
    tenantName: '默认总平台租户',
    operatorId: 'usr-fleet-02',
    operatorName: '张伟',
    operatorUsername: 'zhangwei',
    orgId: 'org-south-02',
    orgName: '华南车队调度中心',
    clientIp: '113.108.88.22',
    clientLocation: '广东省广州市 (联通)',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0.0.0 Safari/537.36',
    module: 'VEHICLE_CONTROL',
    action: 'REMOTE_UNLOCK',
    actionName: '远程车门解锁',
    resourceType: 'Vehicle',
    resourceId: 'VIN: LFPH2E023N1000999',
    status: 'FAILED',
    executionTimeMs: 10050,
    requestPayload: {
      vin: 'LFPH2E023N1000999',
      doors: ['ALL'],
      unlockDurationSec: 30,
    },
    errorMessage: '终端应答超时 (超过 10,000ms 未收到 T-Box 响应)',
    signatureHash: '8f434346648f6b96df89dda901c5176b10e6d83961dd3c1ac88b59b2dc327aa4',
    createdAt: '2026-10-12 11:25:04',
  },
  {
    id: 'log-20261012-003',
    traceId: 'trace-1ab42d7654a13cb7c1de727c2d2d6958',
    tenantId: 'tenant-default',
    tenantName: '默认总平台租户',
    operatorId: 'usr-admin-01',
    operatorName: '超级管理员',
    operatorUsername: 'admin',
    orgId: 'org-hq-01',
    orgName: '平台运营总部',
    clientIp: '192.168.1.100',
    clientLocation: '广东省深圳市 (电信)',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130.0.0.0 Safari/537.36',
    module: 'USER_IAM',
    action: 'PASSWORD_RESET',
    actionName: '重置管理员密码',
    resourceType: 'User',
    resourceId: 'USER: usr-ops-05',
    status: 'SUCCESS',
    executionTimeMs: 92,
    requestPayload: {
      targetUserId: 'usr-ops-05',
      targetUsername: 'chenming',
      forcePasswordChangeOnNextLogin: true,
      notifyViaSms: true,
    },
    responsePayload: {
      code: 0,
      message: '密码重置成功，已向操作员手机发送临时凭证',
    },
    signatureHash: 'a7c5b62908f9d0c2e684073e86c0e86b240ffae71221b016e788c0ab4164b38d',
    createdAt: '2026-10-12 10:48:32',
  },
  {
    id: 'log-20261012-004',
    traceId: 'trace-7bc53e8765b24dc8d2ef838d3e3e7069',
    tenantId: 'tenant-default',
    tenantName: '默认总平台租户',
    operatorId: 'usr-sec-03',
    operatorName: '李强',
    operatorUsername: 'liqiang',
    orgId: 'org-sec-03',
    orgName: '安全合规审计部',
    clientIp: '14.23.112.50',
    clientLocation: '广东省东莞市 (电信)',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edge/130.0.0.0',
    module: 'USER_IAM',
    action: 'USER_DELETE',
    actionName: '注销违规员工账号',
    resourceType: 'User',
    resourceId: 'USER: usr-temp-09',
    status: 'FAILED',
    executionTimeMs: 145,
    requestPayload: {
      targetUserId: 'usr-temp-09',
      deleteReason: '离职权限回收',
    },
    errorMessage: '无法删除用户：该用户当前关联 15 台在途车辆调度责任，需先完成业务交接',
    signatureHash: 'c1b4b62908f9d0c2e684073e86c0e86b240ffae71221b016e788c0ab4164b99a',
    createdAt: '2026-10-12 10:15:12',
  },
  {
    id: 'log-20261012-005',
    traceId: 'trace-2cd64f9876c35ed9e3fa949e4f4f8170',
    tenantId: 'tenant-default',
    tenantName: '默认总平台租户',
    operatorId: 'usr-ops-04',
    operatorName: '王芳',
    operatorUsername: 'wangfang',
    orgId: 'org-east-04',
    orgName: '华东大区调度中心',
    clientIp: '222.73.156.88',
    clientLocation: '上海市浦东新区 (电信)',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Firefox/131.0',
    module: 'VEHICLE_CONTROL',
    action: 'REMOTE_AC_CONTROL',
    actionName: '远程开启座舱空调',
    resourceType: 'Vehicle',
    resourceId: 'VIN: LFPH2E023N1000666',
    status: 'SUCCESS',
    executionTimeMs: 680,
    requestPayload: {
      vin: 'LFPH2E023N1000666',
      targetTemperature: 24.5,
      mode: 'AUTO',
      durationMinutes: 15,
    },
    responsePayload: {
      code: 0,
      cabinTempBefore: 36.2,
      acPower: 'ON',
      targetTemp: 24.5,
    },
    signatureHash: 'd2e5c730190a01d3f795184f97d1f97c35100bf82332c127f899d1bc5275c49e',
    createdAt: '2026-10-12 09:40:55',
  },
  {
    id: 'log-20261012-006',
    traceId: 'trace-3de75a0987d46fe0f4ab050f5a5a9281',
    tenantId: 'tenant-default',
    tenantName: '默认总平台租户',
    operatorId: 'usr-admin-01',
    operatorName: '超级管理员',
    operatorUsername: 'admin',
    orgId: 'org-hq-01',
    orgName: '平台运营总部',
    clientIp: '192.168.1.100',
    clientLocation: '广东省深圳市 (电信)',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130.0.0.0 Safari/537.36',
    module: 'OTA_UPDATE',
    action: 'OTA_BATCH_TRIGGER',
    actionName: '触发整车固件批量升级',
    resourceType: 'OtaTask',
    resourceId: 'TASK: OTA_20261012_V201',
    status: 'SUCCESS',
    executionTimeMs: 2150,
    requestPayload: {
      taskId: 'OTA_20261012_V201',
      targetFirmwareVersion: 'v2.1.0-rel',
      batchSize: 50,
      minBatteryLevel: 30,
      prohibitDrivingCheck: true,
    },
    responsePayload: {
      code: 0,
      dispatchedCount: 50,
      queueStatus: 'EXECUTING',
    },
    signatureHash: 'e3f6d841201b12e4a806295a08e2a08d46211cf93443d238a900e2cd6386d5af',
    createdAt: '2026-10-12 08:30:00',
  },
  {
    id: 'log-20261012-007',
    traceId: 'trace-4ef86b1098e57af1a5bc161a6b6ba392',
    tenantId: 'tenant-default',
    tenantName: '默认总平台租户',
    operatorId: 'usr-ops-04',
    operatorName: '王芳',
    operatorUsername: 'wangfang',
    orgId: 'org-east-04',
    orgName: '华东大区调度中心',
    clientIp: '222.73.156.88',
    clientLocation: '上海市浦东新区 (电信)',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Firefox/131.0',
    module: 'GEOFENCE',
    action: 'GEOFENCE_UPDATE',
    actionName: '调整电子围栏多边形边界',
    resourceType: 'Geofence',
    resourceId: 'FENCE: GF_SH_AIRPORT_01',
    status: 'SUCCESS',
    executionTimeMs: 340,
    requestPayload: {
      fenceId: 'GF_SH_AIRPORT_01',
      name: '上海虹桥枢纽运营围栏',
      pointsCount: 8,
      alarmTriggers: ['OUT_OF_FENCE', 'SPEED_LIMIT_EXCEEDED'],
    },
    responsePayload: {
      code: 0,
      message: '电子围栏边界更新成功，已同步至 240 台关联车辆',
    },
    signatureHash: 'f4a7e952312c23f5b917306b19f3b19e57322da04554e349ba11f3de7497e6b0',
    createdAt: '2026-10-11 16:20:41',
  },
  {
    id: 'log-20261012-008',
    traceId: 'trace-5fa97c2109f68ba2b6cd272b7c7cb403',
    tenantId: 'tenant-default',
    tenantName: '默认总平台租户',
    operatorId: 'usr-dev-08',
    operatorName: '赵强',
    operatorUsername: 'zhaoqiang',
    orgId: 'org-tech-05',
    orgName: '智能终端研发部',
    clientIp: '183.14.32.99',
    clientLocation: '广东省深圳市南山区 (移动)',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0.0.0 Safari/537.36',
    module: 'DEVICE_MANAGE',
    action: 'DEVICE_UNBIND',
    actionName: '解除终端硬件绑定',
    resourceType: 'Device',
    resourceId: 'DEVICE: DEV_TBOX_881920',
    status: 'SUCCESS',
    executionTimeMs: 510,
    requestPayload: {
      deviceId: 'DEV_TBOX_881920',
      vin: 'LFPH2E023N1000333',
      forceUnbind: true,
      reason: '设备返厂硬件检修',
    },
    responsePayload: {
      code: 0,
      message: '设备解除绑定成功，车辆档案已置为无设备就绪态',
    },
    signatureHash: '05b8fa63423d3406ca28417c2a04c2af68433eb15665f45acb2204ef8508f7c1',
    createdAt: '2026-10-11 14:15:10',
  },
  {
    id: 'log-20261012-009',
    traceId: 'trace-6ab08d3210a79cb3c7de383c8d8dc514',
    tenantId: 'tenant-default',
    tenantName: '默认总平台租户',
    operatorId: 'usr-sec-03',
    operatorName: '李强',
    operatorUsername: 'liqiang',
    orgId: 'org-sec-03',
    orgName: '安全合规审计部',
    clientIp: '14.23.112.50',
    clientLocation: '广东省东莞市 (电信)',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edge/130.0.0.0',
    module: 'TENANT_CONFIG',
    action: 'UPDATE',
    actionName: '调整租户设备接入硬配额',
    resourceType: 'Tenant',
    resourceId: 'TENANT: tenant-guangzhou-taxi',
    status: 'SUCCESS',
    executionTimeMs: 180,
    requestPayload: {
      tenantId: 'tenant-guangzhou-taxi',
      quotaAdjustment: {
        maxDevices: 2500,
        maxUsers: 100,
      },
    },
    responsePayload: {
      code: 0,
      message: '租户配额修改完成并生效',
    },
    signatureHash: '16c90b74534e4517db39528d3b15d3b079544fc26776056bdc3315f0961908d2',
    createdAt: '2026-10-11 11:05:22',
  },
  {
    id: 'log-20261012-010',
    traceId: 'trace-7bc19e4321b80dc4d8ef494d9e9ed625',
    tenantId: 'tenant-default',
    tenantName: '默认总平台租户',
    operatorId: 'usr-admin-01',
    operatorName: '超级管理员',
    operatorUsername: 'admin',
    orgId: 'org-hq-01',
    orgName: '平台运营总部',
    clientIp: '192.168.1.100',
    clientLocation: '广东省深圳市 (电信)',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130.0.0.0 Safari/537.36',
    module: 'USER_IAM',
    action: 'LOGIN',
    actionName: '管理后台身份登录认证',
    resourceType: 'Auth',
    resourceId: 'SESSION: SES_891024_001',
    status: 'SUCCESS',
    executionTimeMs: 45,
    requestPayload: {
      username: 'admin',
      loginType: 'PASSWORD_WITH_CAPTCHA',
    },
    responsePayload: {
      code: 0,
      tokenIssued: true,
      roles: ['SUPER_ADMIN'],
    },
    signatureHash: '27da1c85645f5628ec4a639e4c26e4c18a6550d37887167ced442601a72a19e3',
    createdAt: '2026-10-11 08:30:11',
  },
  {
    id: 'log-20261012-011',
    traceId: 'trace-8cd20f5432c91ed5e9fa505ea0afe736',
    tenantId: 'tenant-default',
    tenantName: '默认总平台租户',
    operatorId: 'usr-fleet-02',
    operatorName: '张伟',
    operatorUsername: 'zhangwei',
    orgId: 'org-south-02',
    orgName: '华南车队调度中心',
    clientIp: '113.108.88.22',
    clientLocation: '广东省广州市 (联通)',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/129.0.0.0 Safari/537.36',
    module: 'VEHICLE_ASSET',
    action: 'CREATE',
    actionName: '新增车辆资产建档',
    resourceType: 'Vehicle',
    resourceId: 'VIN: LFPH2E023N1000777',
    status: 'SUCCESS',
    executionTimeMs: 230,
    requestPayload: {
      vin: 'LFPH2E023N1000777',
      plateNumber: '粤B·A8888',
      model: '旗舰尊享智行版 EV',
      batteryCapacityKwh: 82.5,
    },
    responsePayload: {
      code: 0,
      vehicleId: 'VEH_88771',
    },
    signatureHash: '38eb2d9675606739fd5b74af5d37f5d29b7661e48998278dfe553712b83b2af4',
    createdAt: '2026-10-10 15:42:00',
  },
  {
    id: 'log-20261012-012',
    traceId: 'trace-9de31a6543da2fe6faab616fb1b0f847',
    tenantId: 'tenant-default',
    tenantName: '默认总平台租户',
    operatorId: 'usr-ops-04',
    operatorName: '王芳',
    operatorUsername: 'wangfang',
    orgId: 'org-east-04',
    orgName: '华东大区调度中心',
    clientIp: '222.73.156.88',
    clientLocation: '上海市浦东新区 (电信)',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Firefox/131.0',
    module: 'VEHICLE_CONTROL',
    action: 'REMOTE_LOCK',
    actionName: '远程车门闭锁设防',
    resourceType: 'Vehicle',
    resourceId: 'VIN: LFPH2E023N1000555',
    status: 'SUCCESS',
    executionTimeMs: 820,
    requestPayload: {
      vin: 'LFPH2E023N1000555',
      action: 'LOCK_AND_ARM',
    },
    responsePayload: {
      code: 0,
      armState: 'ARMED',
      allDoorsLocked: true,
    },
    signatureHash: '49fc3ea78671784a0e6c85b06e4806e3ac8772f59aa9389e0f664823c94c3ba5',
    createdAt: '2026-10-10 10:20:15',
  },
];
