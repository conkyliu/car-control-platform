import { ApiError } from '../../api/client.ts';

/**
 * 固件类型 (四大约束领域)
 */
export const FirmwareType = {
  TBOX: 'TBOX',
  MCU: 'MCU',
  BCM: 'BCM',
  BMS: 'BMS',
} as const;

export type FirmwareType = (typeof FirmwareType)[keyof typeof FirmwareType];

/**
 * 固件生命周期发布状态
 */
export const FirmwareStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  DEPRECATED: 'DEPRECATED',
} as const;

export type FirmwareStatus = (typeof FirmwareStatus)[keyof typeof FirmwareStatus];

/**
 * 固件包数据传输对象
 */
export interface FirmwarePackageDto {
  id: string;
  name: string;
  firmwareType: FirmwareType;
  version: string;
  fileSize: number;
  fileSizeFormatted: string;
  sha256: string;
  applicableModelIds: string[];
  applicableModelNames: string[];
  status: FirmwareStatus;
  releaseNotes: string;
  uploadedBy: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
  tenantId?: string;
  fileUrl?: string;
}

/**
 * 固件创建请求入参
 */
export interface CreateFirmwareInput {
  name: string;
  firmwareType: FirmwareType;
  version: string;
  fileSize: number;
  sha256: string;
  applicableModelIds: string[];
  applicableModelNames?: string[];
  releaseNotes: string;
  uploadedBy?: string;
  tenantId?: string;
  fileUrl?: string;
}

/**
 * 固件多维检索过滤入参
 */
export interface FirmwareQueryParams {
  keyword?: string;
  firmwareType?: FirmwareType | string;
  status?: FirmwareStatus | string;
  modelId?: string;
  tenantId?: string;
}

/**
 * 固件类型视觉与业务元数据
 */
export interface FirmwareTypeMeta {
  type: FirmwareType;
  label: string;
  enLabel: string;
  color: string;
  tagColor: string;
  icon: string;
  description: string;
}

/**
 * 固件类型元数据全集字典
 */
export const FIRMWARE_TYPE_METADATA: Record<FirmwareType, FirmwareTypeMeta> = {
  [FirmwareType.TBOX]: {
    type: FirmwareType.TBOX,
    label: '车载通信终端 (T-Box)',
    enLabel: 'Telematics Box',
    color: '#1677ff',
    tagColor: 'blue',
    icon: 'WifiOutlined',
    description: '车载无线通信网关，负责整车云端双向通信、远程控车指令下发与高精卫星定位',
  },
  [FirmwareType.MCU]: {
    type: FirmwareType.MCU,
    label: '动力底盘域控 (MCU)',
    enLabel: 'Microcontroller Unit',
    color: '#13c2c2',
    tagColor: 'cyan',
    icon: 'ControlOutlined',
    description: '动力总成与底盘控制核心微控制器，负责高实时控制、电机扭矩分配与毫秒级制动响应',
  },
  [FirmwareType.BCM]: {
    type: FirmwareType.BCM,
    label: '车身电子控制 (BCM)',
    enLabel: 'Body Control Module',
    color: '#722ed1',
    tagColor: 'purple',
    icon: 'CarOutlined',
    description: '智能车身电子舒适域模块，负责门锁闭锁、车窗升降、车灯总成、雨刮与自动恒温空调',
  },
  [FirmwareType.BMS]: {
    type: FirmwareType.BMS,
    label: '电池管理系统 (BMS)',
    enLabel: 'Battery Management System',
    color: '#52c41a',
    tagColor: 'green',
    icon: 'ThunderboltOutlined',
    description: '高压动力电池能量管理中枢，负责电芯荷电(SOC)、健康度(SOH)、主动均衡与热失控防护',
  },
};

/**
 * 固件生命周期状态元数据
 */
export interface FirmwareStatusMeta {
  status: FirmwareStatus;
  label: string;
  badgeStatus: 'default' | 'success' | 'error' | 'processing' | 'warning';
  color: string;
  tagColor: string;
  description: string;
}

/**
 * 固件状态元数据字典
 */
export const FIRMWARE_STATUS_METADATA: Record<FirmwareStatus, FirmwareStatusMeta> = {
  [FirmwareStatus.DRAFT]: {
    status: FirmwareStatus.DRAFT,
    label: '草稿待发布',
    badgeStatus: 'default',
    color: '#faad14',
    tagColor: 'warning',
    description: '固件包已上传建档，处于研发测试验证阶段，尚未正式投产',
  },
  [FirmwareStatus.PUBLISHED]: {
    status: FirmwareStatus.PUBLISHED,
    label: '已发布上线',
    badgeStatus: 'success',
    color: '#52c41a',
    tagColor: 'success',
    description: '固件包已通过安全审计，已在生产环境生效，可作为 OTA 升级任务目标版本',
  },
  [FirmwareStatus.DEPRECATED]: {
    status: FirmwareStatus.DEPRECATED,
    label: '已废弃下线',
    badgeStatus: 'error',
    color: '#8c8c8c',
    tagColor: 'default',
    description: '固件包已停止运维或存在旧版已知安全风险，禁止在新的 OTA 任务中选用',
  },
};

/**
 * SemVer 解析结果接口
 */
export interface SemverParseResult {
  valid: boolean;
  raw: string;
  major?: number;
  minor?: number;
  patch?: number;
  prerelease?: string;
  error?: string;
}

// 严格 SemVer 语义化规范正则 (兼容可选 'v' 前缀)
const SEMVER_REGEX =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/**
 * 校验并解析 SemVer 语义化版本号
 */
export function validateSemver(version: string): SemverParseResult {
  if (version === null || version === undefined || typeof version !== 'string') {
    return {
      valid: false,
      raw: '',
      error: '固件版本号不能为空',
    };
  }

  const trimmed = version.trim();
  if (trimmed.length === 0) {
    return {
      valid: false,
      raw: '',
      error: '固件版本号不能为空，请遵循 SemVer 规范 (如 v1.2.0 或 2.0.1-rc.1)',
    };
  }

  const match = trimmed.match(SEMVER_REGEX);
  if (!match) {
    return {
      valid: false,
      raw: trimmed,
      error: '版本号格式不符合 SemVer 语义化规范，正确示例：v1.2.0、2.0.1-rc.1、v3.0.0-beta.2',
    };
  }

  return {
    valid: true,
    raw: trimmed,
    major: parseInt(match[1]!, 10),
    minor: parseInt(match[2]!, 10),
    patch: parseInt(match[3]!, 10),
    prerelease: match[4] || undefined,
  };
}

/**
 * 快速判断版本号是否符合 SemVer 规范
 */
export function isValidSemver(version: string): boolean {
  return validateSemver(version).valid;
}

// 64 位十六进制 SHA-256 正则
const SHA256_REGEX = /^[a-fA-F0-9]{64}$/;

/**
 * 校验 SHA-256 完整性哈希 (64 位纯十六进制)
 */
export function validateSha256(hash: string): boolean {
  if (!hash || typeof hash !== 'string') {
    return false;
  }
  const trimmed = hash.trim();
  return SHA256_REGEX.test(trimmed);
}

/**
 * 人性化文件大小格式化转换 (Bytes -> B / KB / MB / GB)
 */
export function formatFileSize(bytes: number): string {
  if (bytes === null || bytes === undefined || isNaN(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const unitIndex = Math.min(i, units.length - 1);
  const size = bytes / Math.pow(k, unitIndex);

  if (unitIndex === 0) {
    return `${Math.round(size)} B`;
  }

  // 格式化输出：对于大于等于 100 整数显示，其余保留1至2位
  const formatted = size >= 100 ? size.toFixed(0) : size >= 10 ? size.toFixed(1) : size.toFixed(2);
  return `${parseFloat(formatted)} ${units[unitIndex]}`;
}

/**
 * 固件生命周期状态转移守卫
 * DRAFT -> PUBLISHED / DEPRECATED
 * PUBLISHED -> DEPRECATED
 * DEPRECATED -> 终态不可逆
 */
export function isValidFirmwareStatusTransition(
  from: FirmwareStatus,
  to: FirmwareStatus
): boolean {
  if (from === to) {
    return false;
  }

  if (from === FirmwareStatus.DEPRECATED) {
    return false;
  }

  if (from === FirmwareStatus.DRAFT) {
    return to === FirmwareStatus.PUBLISHED || to === FirmwareStatus.DEPRECATED;
  }

  if (from === FirmwareStatus.PUBLISHED) {
    return to === FirmwareStatus.DEPRECATED;
  }

  return false;
}

/**
 * 判断固件是否已处于不可逆终态
 */
export function isTerminalFirmwareStatus(status: FirmwareStatus): boolean {
  return status === FirmwareStatus.DEPRECATED;
}

/**
 * 固件指标统计汇总对象
 */
export interface FirmwareStats {
  total: number;
  published: number;
  draft: number;
  deprecated: number;
  typeDistribution: Record<FirmwareType, number>;
  coveredModelsCount: number;
  coveredModelNames: string[];
  totalSizeBytes: number;
  totalSizeFormatted: string;
}

/**
 * 汇总计算固件包关键 KPI 与类型覆盖率
 */
export function calculateFirmwareStats(packages: FirmwarePackageDto[]): FirmwareStats {
  const typeDistribution: Record<FirmwareType, number> = {
    [FirmwareType.TBOX]: 0,
    [FirmwareType.MCU]: 0,
    [FirmwareType.BCM]: 0,
    [FirmwareType.BMS]: 0,
  };

  let published = 0;
  let draft = 0;
  let deprecated = 0;
  let totalSizeBytes = 0;
  const modelIdSet = new Set<string>();
  const modelNameSet = new Set<string>();

  for (const pkg of packages) {
    if (pkg.status === FirmwareStatus.PUBLISHED) published++;
    else if (pkg.status === FirmwareStatus.DRAFT) draft++;
    else if (pkg.status === FirmwareStatus.DEPRECATED) deprecated++;

    if (typeDistribution[pkg.firmwareType] !== undefined) {
      typeDistribution[pkg.firmwareType]++;
    }

    totalSizeBytes += pkg.fileSize || 0;

    for (const mId of pkg.applicableModelIds || []) {
      modelIdSet.add(mId);
    }
    for (const mName of pkg.applicableModelNames || []) {
      modelNameSet.add(mName);
    }
  }

  return {
    total: packages.length,
    published,
    draft,
    deprecated,
    typeDistribution,
    coveredModelsCount: modelIdSet.size > 0 ? modelIdSet.size : modelNameSet.size,
    coveredModelNames: Array.from(modelNameSet),
    totalSizeBytes,
    totalSizeFormatted: formatFileSize(totalSizeBytes),
  };
}

/**
 * 多维组合条件筛选固件包列表
 */
export function filterFirmwarePackages(
  packages: FirmwarePackageDto[],
  query?: FirmwareQueryParams
): FirmwarePackageDto[] {
  if (!query) {
    return packages;
  }

  const { keyword, firmwareType, status, modelId } = query;
  const kw = keyword ? keyword.trim().toLowerCase() : '';

  return packages.filter((pkg) => {
    // 1. 关键词匹配 (包名、版本号、哈希、发布说明)
    if (kw) {
      const matchName = pkg.name.toLowerCase().includes(kw);
      const matchVer = pkg.version.toLowerCase().includes(kw);
      const matchHash = pkg.sha256.toLowerCase().includes(kw);
      const matchNotes = pkg.releaseNotes ? pkg.releaseNotes.toLowerCase().includes(kw) : false;
      if (!matchName && !matchVer && !matchHash && !matchNotes) {
        return false;
      }
    }

    // 2. 固件类型过滤
    if (firmwareType && firmwareType !== 'ALL') {
      if (pkg.firmwareType !== firmwareType) {
        return false;
      }
    }

    // 3. 状态过滤
    if (status && status !== 'ALL') {
      if (pkg.status !== status) {
        return false;
      }
    }

    // 4. 适用车型过滤
    if (modelId && modelId !== 'ALL') {
      const matchModelId = pkg.applicableModelIds.includes(modelId);
      const matchModelName = pkg.applicableModelNames.includes(modelId);
      if (!matchModelId && !matchModelName) {
        return false;
      }
    }

    return true;
  });
}

/**
 * 判断是否为 ApiError 异常实例
 */
export function isApiError(err: unknown): err is ApiError {
  return (
    err instanceof ApiError ||
    (typeof err === 'object' &&
      err !== null &&
      'statusCode' in err &&
      'name' in err &&
      (err as any).name === 'ApiError')
  );
}

/**
 * 平台支持适配的车型字典
 */
export const SUPPORTED_VEHICLE_MODELS: Array<{ id: string; name: string }> = [
  { id: 'model-et7', name: '蔚来 ET7 2024款' },
  { id: 'model-es8', name: '蔚来 ES8 旗舰版' },
  { id: 'model-g9', name: '小鹏 G9 性能版' },
  { id: 'model-han-ev', name: '比亚迪 汉EV 智尊版' },
  { id: 'model-001', name: '极氪 001 YOU版' },
  { id: 'model-l9', name: '理想 L9 Ultra' },
];

/**
 * 8+ 真实生产级固件包种子数据
 */
export const SEED_FIRMWARE_PACKAGES: FirmwarePackageDto[] = [
  {
    id: 'fw-tbox-241',
    name: 'T-Box 5G双频高精定位通信终端固件',
    firmwareType: FirmwareType.TBOX,
    version: 'v2.4.1',
    fileSize: 16567808, // ~15.8 MB
    fileSizeFormatted: '15.8 MB',
    sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    applicableModelIds: ['model-et7', 'model-es8', 'model-g9'],
    applicableModelNames: ['蔚来 ET7 2024款', '蔚来 ES8 旗舰版', '小鹏 G9 性能版'],
    status: FirmwareStatus.PUBLISHED,
    releaseNotes: '升级 MQTT v5.0 双向压缩心跳协议，支持北斗三号+GPS 双频 RTK 厘米级差分定位；修复弱信号隧道心跳丢包异常。',
    uploadedBy: '系统架构师_王工',
    publishedAt: '2026-09-18T10:30:00Z',
    createdAt: '2026-09-15T08:20:00Z',
    updatedAt: '2026-09-18T10:30:00Z',
  },
  {
    id: 'fw-tbox-250-rc1',
    name: 'T-Box 5G RedCap 低功耗下代固件',
    firmwareType: FirmwareType.TBOX,
    version: 'v2.5.0-rc.1',
    fileSize: 17825792, // ~17 MB
    fileSizeFormatted: '17 MB',
    sha256: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
    applicableModelIds: ['model-et7', 'model-han-ev'],
    applicableModelNames: ['蔚来 ET7 2024款', '比亚迪 汉EV 智尊版'],
    status: FirmwareStatus.DRAFT,
    releaseNotes: '预研版本：集成 3GPP Rel-17 RedCap 轻量化模组驱动，驻车待机电流降至 2.5mA，新增卫星直连紧急呼叫能力。',
    uploadedBy: '通信研发_李工',
    createdAt: '2026-10-10T14:15:00Z',
    updatedAt: '2026-10-10T14:15:00Z',
  },
  {
    id: 'fw-tbox-198-dep',
    name: 'T-Box 4G 历史基线固件 (旧版)',
    firmwareType: FirmwareType.TBOX,
    version: 'v1.9.8',
    fileSize: 12582912, // 12 MB
    fileSizeFormatted: '12 MB',
    sha256: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
    applicableModelIds: ['model-et7', 'model-001'],
    applicableModelNames: ['蔚来 ET7 2024款', '极氪 001 YOU版'],
    status: FirmwareStatus.DEPRECATED,
    releaseNotes: '旧版 4G 固件：因加密证书过期及 TLS 1.1 弃用，已全量停运下线，全面升级至 v2.4+。',
    uploadedBy: '系统架构师_王工',
    publishedAt: '2025-11-01T09:00:00Z',
    createdAt: '2025-10-20T11:00:00Z',
    updatedAt: '2026-08-30T17:00:00Z',
  },
  {
    id: 'fw-mcu-320',
    name: 'MCU 动力底盘双核控制器固件',
    firmwareType: FirmwareType.MCU,
    version: 'v3.2.0',
    fileSize: 4404019, // ~4.2 MB
    fileSizeFormatted: '4.2 MB',
    sha256: 'ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d',
    applicableModelIds: ['model-et7', 'model-es8', 'model-001'],
    applicableModelNames: ['蔚来 ET7 2024款', '蔚来 ES8 旗舰版', '极氪 001 YOU版'],
    status: FirmwareStatus.PUBLISHED,
    releaseNotes: '优化双电机矢量扭矩控制算法，降低零百加速扭矩过冲；CAN-FD 通讯波特率升至 5Mbps，提升 UDS 烧录容错。',
    uploadedBy: '控制算法_张工',
    publishedAt: '2026-08-25T16:00:00Z',
    createdAt: '2026-08-20T09:30:00Z',
    updatedAt: '2026-08-25T16:00:00Z',
  },
  {
    id: 'fw-mcu-330-beta1',
    name: 'MCU 电子稳定与线控制动迭代固件',
    firmwareType: FirmwareType.MCU,
    version: 'v3.3.0-beta.1',
    fileSize: 4508876, // ~4.3 MB
    fileSizeFormatted: '4.3 MB',
    sha256: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918',
    applicableModelIds: ['model-g9', 'model-001'],
    applicableModelNames: ['小鹏 G9 性能版', '极氪 001 YOU版'],
    status: FirmwareStatus.DRAFT,
    releaseNotes: '新增雨雪湿滑路面四轮独立防滑电子差速响应控制，提升弯道极限抓地力。',
    uploadedBy: '控制算法_张工',
    createdAt: '2026-10-12T11:20:00Z',
    updatedAt: '2026-10-12T11:20:00Z',
  },
  {
    id: 'fw-bcm-180',
    name: 'BCM 智能车身舒适域控主固件',
    firmwareType: FirmwareType.BCM,
    version: 'v1.8.0',
    fileSize: 6815744, // ~6.5 MB
    fileSizeFormatted: '6.5 MB',
    sha256: 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e',
    applicableModelIds: ['model-et7', 'model-es8', 'model-g9', 'model-han-ev', 'model-001'],
    applicableModelNames: [
      '蔚来 ET7 2024款',
      '蔚来 ES8 旗舰版',
      '小鹏 G9 性能版',
      '比亚迪 汉EV 智尊版',
      '极氪 001 YOU版',
    ],
    status: FirmwareStatus.PUBLISHED,
    releaseNotes: '支持手机无感蓝牙钥匙离车自动闭锁与折叠后视镜；修复极端高低温环境下隐藏式电动门把手防夹回缩逻辑。',
    uploadedBy: '车身域组长_赵工',
    publishedAt: '2026-09-01T14:00:00Z',
    createdAt: '2026-08-28T10:00:00Z',
    updatedAt: '2026-09-01T14:00:00Z',
  },
  {
    id: 'fw-bms-410',
    name: 'BMS 800V高压动力电池管理系统固件',
    firmwareType: FirmwareType.BMS,
    version: 'v4.1.0',
    fileSize: 8912896, // ~8.5 MB
    fileSizeFormatted: '8.5 MB',
    sha256: '2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae',
    applicableModelIds: ['model-et7', 'model-g9', 'model-001'],
    applicableModelNames: ['蔚来 ET7 2024款', '小鹏 G9 性能版', '极氪 001 YOU版'],
    status: FirmwareStatus.PUBLISHED,
    releaseNotes: '搭载新一代基于电化学阻抗谱(EIS)的微短路快速诊断算法，优化 4C 超快充曲线，大功率充电温升降低 3.2℃。',
    uploadedBy: '三电安全总监_陈工',
    publishedAt: '2026-09-20T11:00:00Z',
    createdAt: '2026-09-16T15:30:00Z',
    updatedAt: '2026-09-20T11:00:00Z',
  },
  {
    id: 'fw-bms-420-rc2',
    name: 'BMS 宽温域极寒主动脉冲自加热测试固件',
    firmwareType: FirmwareType.BMS,
    version: 'v4.2.0-rc.2',
    fileSize: 9123840, // ~8.7 MB
    fileSizeFormatted: '8.7 MB',
    sha256: 'fcde2b2edba56bf408601fb721fe9b5c338d10ee429ea04fae5511b68fbf8fb9',
    applicableModelIds: ['model-et7', 'model-es8'],
    applicableModelNames: ['蔚来 ET7 2024款', '蔚来 ES8 旗舰版'],
    status: FirmwareStatus.DRAFT,
    releaseNotes: '高寒冬季专用：利用电机高频脉冲交流充放电实现电芯内部自发热，-30℃ 电池预热时间缩短 45%。',
    uploadedBy: '三电安全总监_陈工',
    createdAt: '2026-10-14T09:00:00Z',
    updatedAt: '2026-10-14T09:00:00Z',
  },
];
