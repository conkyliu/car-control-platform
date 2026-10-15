import { ApiError } from '../../api/client.ts';

/**
 * 核心车载通讯协议类型
 */
export const CommProtocolType = {
  JT808: 'JT808',
  CAR_CONTROL_0X02: 'CAR_CONTROL_0X02',
  MQTT_TELEMETRY: 'MQTT_TELEMETRY',
  GB32960: 'GB32960',
} as const;

export type CommProtocolType = (typeof CommProtocolType)[keyof typeof CommProtocolType];

/**
 * 通讯流向
 */
export const CommDirection = {
  UPLINK: 'UPLINK',
  DOWNLINK: 'DOWNLINK',
} as const;

export type CommDirection = (typeof CommDirection)[keyof typeof CommDirection];

/**
 * 协议类型元数据与语义配置
 */
export interface ProtocolMetadata {
  label: string;
  shortLabel: string;
  color: string;
  tagColor: string;
  badgeStatus: 'processing' | 'default' | 'success' | 'warning' | 'error';
  description: string;
  framingDelimiter?: string;
}

export const COMM_PROTOCOL_METADATA: Record<CommProtocolType, ProtocolMetadata> = {
  [CommProtocolType.JT808]: {
    label: 'JT/T 808 部标车联网协议',
    shortLabel: 'JT/T 808',
    color: '#1677ff',
    tagColor: 'blue',
    badgeStatus: 'processing',
    description: '交通运输部营运车辆卫星定位系统终端通讯协议 (2013/2019 标准)',
    framingDelimiter: '0x7E',
  },
  [CommProtocolType.CAR_CONTROL_0X02]: {
    label: '0x02 私有车控协议',
    shortLabel: '0x02 车控',
    color: '#722ed1',
    tagColor: 'purple',
    badgeStatus: 'warning',
    description: '高安全双向远程车控下发与终端 ACK 状态应答专用协议',
    framingDelimiter: '0x02',
  },
  [CommProtocolType.MQTT_TELEMETRY]: {
    label: 'MQTT 遥测数据流',
    shortLabel: 'MQTT 遥测',
    color: '#13c2c2',
    tagColor: 'cyan',
    badgeStatus: 'success',
    description: '轻量级发布/订阅物联网遥测工况指标与高频传感器数据流',
    framingDelimiter: 'MQTT Packet',
  },
  [CommProtocolType.GB32960]: {
    label: 'GB/T 32960 国标新能源',
    shortLabel: 'GB/T 32960',
    color: '#52c41a',
    tagColor: 'green',
    badgeStatus: 'default',
    description: '电动汽车远程服务与管理系统国家标准通讯协议 (2016)',
    framingDelimiter: '0x23 0x23 (##)',
  },
};

/**
 * 通讯流向元数据
 */
export interface DirectionMetadata {
  label: string;
  shortLabel: string;
  arrow: string;
  color: string;
  tagColor: string;
  description: string;
}

export const COMM_DIRECTION_METADATA: Record<CommDirection, DirectionMetadata> = {
  [CommDirection.UPLINK]: {
    label: '上行 (车端 -> 平台)',
    shortLabel: '上行',
    arrow: '⬆️',
    color: '#1677ff',
    tagColor: 'blue',
    description: '车辆终端上报位置、传感器状态、执行结果应答等流水',
  },
  [CommDirection.DOWNLINK]: {
    label: '下行 (平台 -> 车端)',
    shortLabel: '下行',
    arrow: '⬇️',
    color: '#fa8c16',
    tagColor: 'orange',
    description: '平台主动下发控制指令、参数配置、OTA 升级指示等流水',
  },
};

/**
 * 报文头属性拆解模型
 */
export interface MessageHeaderFields {
  protocolType?: CommProtocolType;
  messageId?: string;
  messageName?: string;
  bodyLength?: number;
  phoneOrDevice?: string;
  sequenceNo?: number;
  isSubpackage?: boolean;
  version?: string;
  encryption?: string;
  rawHeaderHex?: string;
  [key: string]: any;
}

/**
 * 报文体结构化字段明细
 */
export interface BodyPayloadField {
  name: string;
  dataType: string;
  rawHex: string;
  parsedValue: string | number | boolean;
  unit?: string;
  description?: string;
}

/**
 * 原始通讯日志实体模型
 */
export interface CommLogRecord {
  id: string;
  timestamp: number;
  timestampFormatted: string;
  direction: CommDirection;
  protocolType: CommProtocolType;
  deviceNo: string;
  vin: string;
  plateNumber?: string;
  messageId: string;
  messageName: string;
  rawHex: string;
  byteLength: number;
  checksumValid: boolean;
  calculatedChecksum: string;
  actualChecksum: string;
  headerFields?: MessageHeaderFields;
  bodyPayload?: Record<string, any>;
  bodyFieldsList?: BodyPayloadField[];
  errorMessage?: string;
}

/**
 * Wireshark 风格 16-字节 Hex Dump 行数据
 */
export interface HexDumpRow {
  offset: string;
  hexBytes: string[];
  asciiText: string;
}

/**
 * 通讯日志检索查询参数
 */
export interface CommLogQueryParams {
  keyword?: string;
  protocolType?: CommProtocolType | 'ALL';
  direction?: CommDirection | 'ALL';
  checksumStatus?: 'ALL' | 'VALID' | 'INVALID';
  messageId?: string;
  startTime?: number | string;
  endTime?: number | string;
  page?: number;
  pageSize?: number;
}

/**
 * 通讯日志综合统计指标
 */
export interface CommLogStats {
  totalLogs: number;
  uplinkCount: number;
  downlinkCount: number;
  protocolDistribution: Record<CommProtocolType, number>;
  checksumAnomaliesCount: number;
  checksumAnomalyRate: number; // 百分比, 0 ~ 100
  avgByteLength: number;
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
 * 交通部 JT/T 808 异或校验码标准算法
 * 计算从消息头到消息体所有字节的连续异或校验码 (XOR Checksum)
 *
 * @param hexStr 待计算十六进制字符串 (支持包含空格或分界符)
 * @param autoUnframe 是否自动剥离 0x7E 标识符及尾部原校验码 (若为完整帧 7E ... CC 7E)
 * @returns 2 字符大写十六进制字符串 (例如 'DE')
 */
export function calculateXorChecksum(hexStr: string, autoUnframe: boolean = false): string {
  const cleanHex = hexStr.replace(/[^0-9a-fA-F]/g, '');
  if (cleanHex.length === 0) {
    return '00';
  }

  // 格式化为合法偶数长度
  const normalizedHex = cleanHex.length % 2 !== 0 ? '0' + cleanHex : cleanHex;
  const bytes: number[] = [];
  for (let i = 0; i < normalizedHex.length; i += 2) {
    bytes.push(parseInt(normalizedHex.substring(i, i + 2), 16));
  }

  let targetBytes = bytes;
  // 若要求自动剥帧且首尾为 0x7E 且至少包含 起始(1)+数据(1)+校验(1)+结束(1) = 4 字节
  if (autoUnframe && bytes.length >= 4 && bytes[0] === 0x7e && bytes[bytes.length - 1] === 0x7e) {
    // 校验计算范围：首 0x7E 之后，至尾 0x7E 之前的校验码之前 (排除首0x7E和尾部校验+0x7E)
    targetBytes = bytes.slice(1, bytes.length - 2);
  }

  let xor = 0;
  for (const b of targetBytes) {
    xor ^= b;
  }

  return xor.toString(16).padStart(2, '0').toUpperCase();
}

/**
 * JT/T 808 协议转义还原算法 (Unescape)
 * 规则：
 * 0x7D 0x02 -> 0x7E
 * 0x7D 0x01 -> 0x7D
 *
 * @param hexStr 含转义的十六进制字符串
 * @returns 还原后的连续无空格十六进制字符串 (大写)
 */
export function unescapeJt808Hex(hexStr: string): string {
  const cleanHex = hexStr.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (cleanHex.length === 0) {
    return '';
  }

  const normalizedHex = cleanHex.length % 2 !== 0 ? '0' + cleanHex : cleanHex;
  let result = '';
  let i = 0;

  while (i < normalizedHex.length) {
    const currentByte = normalizedHex.substring(i, i + 2);
    if (currentByte === '7D' && i + 4 <= normalizedHex.length) {
      const nextByte = normalizedHex.substring(i + 2, i + 4);
      if (nextByte === '02') {
        result += '7E';
        i += 4;
        continue;
      } else if (nextByte === '01') {
        result += '7D';
        i += 4;
        continue;
      }
    }
    result += currentByte;
    i += 2;
  }

  return result;
}

/**
 * 将十六进制长串转换为 Wireshark 风格的专业 Hex Dump 矩阵
 *
 * @param hexStr 十六进制字符串
 * @param bytesPerRow 每行字节数 (标准默认 16 字节)
 * @returns HexDumpRow 数组，包含 4 位十六进制 Offset、16 列 Hex、右侧 ASCII 字符映射
 */
export function formatHexDump(hexStr: string, bytesPerRow: number = 16): HexDumpRow[] {
  const cleanHex = hexStr.replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  if (cleanHex.length === 0) {
    return [];
  }

  const normalized = cleanHex.length % 2 !== 0 ? '0' + cleanHex : cleanHex;
  const bytes: string[] = [];
  for (let i = 0; i < normalized.length; i += 2) {
    bytes.push(normalized.substring(i, i + 2));
  }

  const rows: HexDumpRow[] = [];
  const totalBytes = bytes.length;
  let offsetIndex = 0;

  while (offsetIndex < totalBytes) {
    const rowBytes = bytes.slice(offsetIndex, offsetIndex + bytesPerRow);
    const offsetHex = offsetIndex.toString(16).padStart(4, '0').toUpperCase();

    let asciiText = '';
    for (const b of rowBytes) {
      const code = parseInt(b, 16);
      if (code >= 32 && code <= 126) {
        asciiText += String.fromCharCode(code);
      } else {
        asciiText += '.';
      }
    }

    rows.push({
      offset: offsetHex,
      hexBytes: rowBytes,
      asciiText,
    });

    offsetIndex += bytesPerRow;
  }

  return rows;
}

/**
 * 协议报文头深度拆解
 */
export function parseMessageHeader(record: CommLogRecord): MessageHeaderFields {
  const baseHeader: MessageHeaderFields = {
    protocolType: record.protocolType,
    messageId: record.messageId,
    messageName: record.messageName,
    deviceNo: record.deviceNo,
    vin: record.vin,
    bodyLength: record.byteLength,
    ...(record.headerFields || {}),
  };

  switch (record.protocolType) {
    case CommProtocolType.JT808:
      return {
        ...baseHeader,
        version: record.headerFields?.version || '2019',
        sequenceNo: record.headerFields?.sequenceNo ?? 1024,
        phoneOrDevice: record.headerFields?.phoneOrDevice || record.deviceNo,
        isSubpackage: record.headerFields?.isSubpackage ?? false,
        rawHeaderHex: record.rawHex.substring(0, 24),
      };

    case CommProtocolType.CAR_CONTROL_0X02:
      return {
        ...baseHeader,
        commandCode: record.messageId,
        sequenceNo: record.headerFields?.sequenceNo ?? 2048,
        rawHeaderHex: record.rawHex.substring(0, 16),
      };

    case CommProtocolType.MQTT_TELEMETRY:
      return {
        ...baseHeader,
        topic: record.headerFields?.topic || `telemetry/v1/${record.deviceNo}`,
        qos: record.headerFields?.qos ?? 1,
        clientId: record.headerFields?.clientId || `client-${record.deviceNo}`,
      };

    case CommProtocolType.GB32960:
      return {
        ...baseHeader,
        commandId: record.messageId,
        vin: record.vin,
        encryption: record.headerFields?.encryption || '不加密 (0x01)',
        rawHeaderHex: record.rawHex.substring(0, 60),
      };

    default:
      return baseHeader;
  }
}

/**
 * 统计报文总览 KPI
 */
export function calculateCommLogStats(logs: CommLogRecord[]): CommLogStats {
  const totalLogs = logs.length;
  if (totalLogs === 0) {
    return {
      totalLogs: 0,
      uplinkCount: 0,
      downlinkCount: 0,
      protocolDistribution: {
        [CommProtocolType.JT808]: 0,
        [CommProtocolType.CAR_CONTROL_0X02]: 0,
        [CommProtocolType.MQTT_TELEMETRY]: 0,
        [CommProtocolType.GB32960]: 0,
      },
      checksumAnomaliesCount: 0,
      checksumAnomalyRate: 0,
      avgByteLength: 0,
    };
  }

  let uplinkCount = 0;
  let downlinkCount = 0;
  let checksumAnomaliesCount = 0;
  let totalBytes = 0;

  const protocolDistribution: Record<CommProtocolType, number> = {
    [CommProtocolType.JT808]: 0,
    [CommProtocolType.CAR_CONTROL_0X02]: 0,
    [CommProtocolType.MQTT_TELEMETRY]: 0,
    [CommProtocolType.GB32960]: 0,
  };

  for (const log of logs) {
    if (log.direction === CommDirection.UPLINK) {
      uplinkCount++;
    } else {
      downlinkCount++;
    }

    if (protocolDistribution[log.protocolType] !== undefined) {
      protocolDistribution[log.protocolType]++;
    }

    if (!log.checksumValid) {
      checksumAnomaliesCount++;
    }

    totalBytes += log.byteLength || 0;
  }

  const checksumAnomalyRate =
    totalLogs > 0 ? Number(((checksumAnomaliesCount / totalLogs) * 100).toFixed(1)) : 0;
  const avgByteLength = totalLogs > 0 ? Math.round(totalBytes / totalLogs) : 0;

  return {
    totalLogs,
    uplinkCount,
    downlinkCount,
    protocolDistribution,
    checksumAnomaliesCount,
    checksumAnomalyRate,
    avgByteLength,
  };
}

/**
 * 多维通讯日志筛选
 */
export function filterCommLogs(logs: CommLogRecord[], query?: CommLogQueryParams): CommLogRecord[] {
  if (!query) return [...logs];

  const keyword = query.keyword?.trim().toLowerCase();
  const protocol = query.protocolType;
  const direction = query.direction;
  const checksumStatus = query.checksumStatus;
  const messageId = query.messageId?.trim().toLowerCase();
  const startTime = query.startTime ? new Date(query.startTime).getTime() : undefined;
  const endTime = query.endTime ? new Date(query.endTime).getTime() : undefined;

  return logs.filter((log) => {
    // 关键字检索：匹配 VIN, 车牌, 设备号, 消息ID, 消息名称, 日志ID
    if (keyword) {
      const matchVin = log.vin.toLowerCase().includes(keyword);
      const matchPlate = log.plateNumber?.toLowerCase().includes(keyword) ?? false;
      const matchDevice = log.deviceNo.toLowerCase().includes(keyword);
      const matchMsgId = log.messageId.toLowerCase().includes(keyword);
      const matchMsgName = log.messageName.toLowerCase().includes(keyword);
      const matchId = log.id.toLowerCase().includes(keyword);

      if (!matchVin && !matchPlate && !matchDevice && !matchMsgId && !matchMsgName && !matchId) {
        return false;
      }
    }

    // 协议类型过滤
    if (protocol && protocol !== 'ALL') {
      if (log.protocolType !== protocol) return false;
    }

    // 流向过滤
    if (direction && direction !== 'ALL') {
      if (log.direction !== direction) return false;
    }

    // 校验状态过滤
    if (checksumStatus && checksumStatus !== 'ALL') {
      if (checksumStatus === 'VALID' && !log.checksumValid) return false;
      if (checksumStatus === 'INVALID' && log.checksumValid) return false;
    }

    // 消息 ID 过滤
    if (messageId) {
      if (!log.messageId.toLowerCase().includes(messageId)) return false;
    }

    // 时间范围过滤
    if (startTime !== undefined && !Number.isNaN(startTime) && log.timestamp < startTime) {
      return false;
    }
    if (endTime !== undefined && !Number.isNaN(endTime) && log.timestamp > endTime) {
      return false;
    }

    return true;
  });
}

/**
 * CWE-1236 CSV 注入防御单元格清洗
 */
function sanitizeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  let str = String(val);

  // 防御 CWE-1236 公式注入: 若以 =,+,-,@,\t,\r 开头，则添加单引号前缀转义
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }

  // RFC 4180 双引号转义
  if (/[",\r\n]/.test(str)) {
    str = `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * 生成符合 RFC 4180 标准、携带 UTF-8 BOM 且具备 CWE-1236 防御的 CSV 文本
 */
export function generateCommLogsCsv(logs: CommLogRecord[]): string {
  const headers = [
    '日志ID',
    '时间戳',
    '通讯流向',
    '协议类型',
    '车牌号',
    '车辆VIN码',
    '终端设备号',
    '消息ID',
    '消息名称',
    '报文长度(Bytes)',
    '校验状态',
    '计算校验码',
    '实际校验码',
    '十六进制摘要(前32字节)',
    '异常说明',
  ];

  const rows = logs.map((log) => [
    log.id,
    log.timestampFormatted,
    COMM_DIRECTION_METADATA[log.direction].label,
    COMM_PROTOCOL_METADATA[log.protocolType].shortLabel,
    log.plateNumber || '--',
    log.vin,
    log.deviceNo,
    log.messageId,
    log.messageName,
    log.byteLength,
    log.checksumValid ? '校验通过' : '校验失败',
    `0x${log.calculatedChecksum}`,
    `0x${log.actualChecksum}`,
    log.rawHex.length > 64 ? `${log.rawHex.substring(0, 64)}...` : log.rawHex,
    log.errorMessage || '正常',
  ]);

  const csvContent = [
    headers.map(sanitizeCsvCell).join(','),
    ...rows.map((row) => row.map(sanitizeCsvCell).join(',')),
  ].join('\r\n');

  // \uFEFF 为 UTF-8 BOM 标志
  return `\uFEFF${csvContent}`;
}

/**
 * 14+ 条生产级车载通讯日志种子数据
 */
export const SEED_COMM_LOGS: CommLogRecord[] = [
  // 1. JT/T 808 位置信息汇报 (0x0200) - 上行 (正常)
  {
    id: 'log-jt808-0200-01',
    timestamp: 1792030800000, // 2026-10-15 10:20:00.000
    timestampFormatted: '2026-10-15 10:20:00.124',
    direction: CommDirection.UPLINK,
    protocolType: CommProtocolType.JT808,
    deviceNo: 'DEV_TBOX_1001',
    vin: 'LSGJA52U1NF018888',
    plateNumber: '粤B·12345',
    messageId: '0x0200',
    messageName: '位置信息汇报',
    rawHex: '7E0200002A013800138000007C00000000000000010156994006CA31B000780000014B26101510203000DE7E',
    byteLength: 43,
    checksumValid: true,
    calculatedChecksum: 'DE',
    actualChecksum: 'DE',
    headerFields: {
      messageId: '0x0200',
      bodyLength: 42,
      phoneOrDevice: '013800138000',
      sequenceNo: 124,
      version: '2019',
      isSubpackage: false,
    },
    bodyPayload: {
      lat: 22.5431,
      lng: 114.0579,
      speed: 65.4,
      altitude: 120,
      direction: 180,
      time: '2026-10-15 10:20:00',
      status: 'ACC ON, 定位有效, 未设防',
    },
    bodyFieldsList: [
      { name: '报警标志', dataType: 'DWORD', rawHex: '00000000', parsedValue: 0, description: '无异常报警' },
      { name: '状态标志', dataType: 'DWORD', rawHex: '00000001', parsedValue: 'ACC ON', description: '定位有效且ACC开启' },
      { name: '纬度 (Lat)', dataType: 'DWORD', rawHex: '01569940', parsedValue: 22.5431, unit: '°', description: '高精度北纬度数' },
      { name: '经度 (Lng)', dataType: 'DWORD', rawHex: '06CA31B0', parsedValue: 114.0579, unit: '°', description: '高精度东经度数' },
      { name: '高程 (Alt)', dataType: 'WORD', rawHex: '0078', parsedValue: 120, unit: 'm', description: '海拔高度' },
      { name: '速度 (Speed)', dataType: 'WORD', rawHex: '014B', parsedValue: 65.4, unit: 'km/h', description: '瞬时行驶车速' },
    ],
  },

  // 2. JT/T 808 平台通用应答 (0x8001) - 下行 (正常)
  {
    id: 'log-jt808-8001-01',
    timestamp: 1792030800050,
    timestampFormatted: '2026-10-15 10:20:00.174',
    direction: CommDirection.DOWNLINK,
    protocolType: CommProtocolType.JT808,
    deviceNo: 'DEV_TBOX_1001',
    vin: 'LSGJA52U1NF018888',
    plateNumber: '粤B·12345',
    messageId: '0x8001',
    messageName: '平台通用应答',
    rawHex: '7E800100050138001380000001007C020000457E',
    byteLength: 20,
    checksumValid: true,
    calculatedChecksum: '45',
    actualChecksum: '45',
    headerFields: {
      messageId: '0x8001',
      bodyLength: 5,
      phoneOrDevice: '013800138000',
      sequenceNo: 1,
      version: '2019',
    },
    bodyPayload: {
      responseSequence: 124,
      responseMessageId: '0x0200',
      resultCode: 0,
      resultText: '成功 / 确认',
    },
    bodyFieldsList: [
      { name: '应答流水号', dataType: 'WORD', rawHex: '007C', parsedValue: 124, description: '对应上行位置汇报流水' },
      { name: '应答消息ID', dataType: 'WORD', rawHex: '0200', parsedValue: '0x0200', description: '位置信息汇报' },
      { name: '结果标识', dataType: 'BYTE', rawHex: '00', parsedValue: '成功/确认 (0)', description: '平台处理成功' },
    ],
  },

  // 3. JT/T 808 终端鉴权 (0x0102) - 上行 (正常)
  {
    id: 'log-jt808-0102-01',
    timestamp: 1792030801000,
    timestampFormatted: '2026-10-15 10:20:01.002',
    direction: CommDirection.UPLINK,
    protocolType: CommProtocolType.JT808,
    deviceNo: 'DEV_TBOX_1002',
    vin: 'LGDCA3129NF002345',
    plateNumber: '粤B·D12345',
    messageId: '0x0102',
    messageName: '终端鉴权',
    rawHex: '7E010200080139001390000010415554483132338B7E',
    byteLength: 22,
    checksumValid: true,
    calculatedChecksum: '8B',
    actualChecksum: '8B',
    headerFields: {
      messageId: '0x0102',
      bodyLength: 8,
      phoneOrDevice: '013900139000',
      sequenceNo: 16,
      version: '2019',
    },
    bodyPayload: {
      authCode: 'AUTH123',
    },
    bodyFieldsList: [
      { name: '鉴权码', dataType: 'STRING', rawHex: '41555448313233', parsedValue: 'AUTH123', description: '设备合法性凭据' },
    ],
  },

  // 4. JT/T 808 设置终端参数 (0x8103) - 下行 (正常)
  {
    id: 'log-jt808-8103-01',
    timestamp: 1792030802000,
    timestampFormatted: '2026-10-15 10:20:02.340',
    direction: CommDirection.DOWNLINK,
    protocolType: CommProtocolType.JT808,
    deviceNo: 'DEV_TBOX_1002',
    vin: 'LGDCA3129NF002345',
    plateNumber: '粤B·D12345',
    messageId: '0x8103',
    messageName: '设置终端参数',
    rawHex: '7E8103000901390013900000110100000001040000001E3C7E',
    byteLength: 26,
    checksumValid: true,
    calculatedChecksum: '3C',
    actualChecksum: '3C',
    headerFields: {
      messageId: '0x8103',
      bodyLength: 9,
      sequenceNo: 17,
      phoneOrDevice: '013900139000',
    },
    bodyPayload: {
      paramCount: 1,
      paramId: '0x0001',
      paramVal: 30,
      paramDesc: '心跳间隔 30 秒',
    },
    bodyFieldsList: [
      { name: '参数总数', dataType: 'BYTE', rawHex: '01', parsedValue: 1, description: '下发单项配置' },
      { name: '参数项ID', dataType: 'DWORD', rawHex: '00000001', parsedValue: '0x0001', description: '心跳上报间隔' },
      { name: '参数值', dataType: 'DWORD', rawHex: '0000001E', parsedValue: 30, unit: 's', description: '30秒心跳' },
    ],
  },

  // 5. 0x02 车控下发: 远程解锁车门 (0x02_01) - 下行 (正常)
  {
    id: 'log-ctrl-0201-01',
    timestamp: 1792030805000,
    timestampFormatted: '2026-10-15 10:20:05.512',
    direction: CommDirection.DOWNLINK,
    protocolType: CommProtocolType.CAR_CONTROL_0X02,
    deviceNo: 'DEV_TBOX_1001',
    vin: 'LSGJA52U1NF018888',
    plateNumber: '粤B·12345',
    messageId: '0x02_01',
    messageName: '远程车门解锁下发',
    rawHex: '0201080001AABBCCDDEEFF00015A',
    byteLength: 15,
    checksumValid: true,
    calculatedChecksum: '5A',
    actualChecksum: '5A',
    headerFields: {
      commandCode: '0x02_01',
      sequenceNo: 301,
      securityToken: 'AABBCCDDEEFF',
    },
    bodyPayload: {
      action: 'UNLOCK_DOORS',
      durationSeconds: 120,
      doors: ['FL', 'FR', 'RL', 'RR'],
    },
    bodyFieldsList: [
      { name: '控制指令字', dataType: 'BYTE', rawHex: '01', parsedValue: '车门解锁', description: '解开全车门锁' },
      { name: '安全校验Token', dataType: 'BYTES(6)', rawHex: 'AABBCCDDEEFF', parsedValue: 'AA:BB:CC:DD:EE:FF', description: '动态签名' },
      { name: '时效约束', dataType: 'BYTE', rawHex: '01', parsedValue: 120, unit: 's', description: '防重放有效期' },
    ],
  },

  // 6. 0x02 车控应答: 车门解锁成功 ACK (0x02_81) - 上行 (正常)
  {
    id: 'log-ctrl-0281-01',
    timestamp: 1792030806200,
    timestampFormatted: '2026-10-15 10:20:06.712',
    direction: CommDirection.UPLINK,
    protocolType: CommProtocolType.CAR_CONTROL_0X02,
    deviceNo: 'DEV_TBOX_1001',
    vin: 'LSGJA52U1NF018888',
    plateNumber: '粤B·12345',
    messageId: '0x02_81',
    messageName: '车门解锁结果应答',
    rawHex: '028108000100AABBCCDDEEFF009C',
    byteLength: 15,
    checksumValid: true,
    calculatedChecksum: '9C',
    actualChecksum: '9C',
    headerFields: {
      commandCode: '0x02_81',
      sequenceNo: 301,
      responseStatus: 'SUCCESS',
    },
    bodyPayload: {
      ackCode: 0,
      executionDurationMs: 1200,
      doorState: 'ALL_UNLOCKED',
    },
    bodyFieldsList: [
      { name: '执行结果码', dataType: 'BYTE', rawHex: '00', parsedValue: '成功 (0)', description: '车门中控锁已全部开启' },
      { name: '执行耗时', dataType: 'WORD', rawHex: '04B0', parsedValue: 1200, unit: 'ms', description: '车端执行耗时' },
    ],
  },

  // 7. 0x02 车控下发: 开启空调 (0x02_02) - 下行 (正常)
  {
    id: 'log-ctrl-0202-01',
    timestamp: 1792030810000,
    timestampFormatted: '2026-10-15 10:20:10.100',
    direction: CommDirection.DOWNLINK,
    protocolType: CommProtocolType.CAR_CONTROL_0X02,
    deviceNo: 'DEV_TBOX_1003',
    vin: 'LB3782164MA098765',
    plateNumber: '京A·88888',
    messageId: '0x02_02',
    messageName: '远程空调开启下发',
    rawHex: '02020800021A02FF000000000062',
    byteLength: 15,
    checksumValid: true,
    calculatedChecksum: '62',
    actualChecksum: '62',
    headerFields: {
      commandCode: '0x02_02',
      sequenceNo: 302,
    },
    bodyPayload: {
      targetTemp: 26.0,
      mode: 'AUTO',
      blowerLevel: 2,
    },
    bodyFieldsList: [
      { name: '目标温度', dataType: 'BYTE', rawHex: '1A', parsedValue: 26.0, unit: '℃', description: '驾驶舱设定温度' },
      { name: '风量挡位', dataType: 'BYTE', rawHex: '02', parsedValue: 2, description: '自动中速风' },
    ],
  },

  // 8. 0x02 车控应答: 空调开启成功 ACK (0x02_82) - 上行 (正常)
  {
    id: 'log-ctrl-0282-01',
    timestamp: 1792030811500,
    timestampFormatted: '2026-10-15 10:20:11.600',
    direction: CommDirection.UPLINK,
    protocolType: CommProtocolType.CAR_CONTROL_0X02,
    deviceNo: 'DEV_TBOX_1003',
    vin: 'LB3782164MA098765',
    plateNumber: '京A·88888',
    messageId: '0x02_82',
    messageName: '空调开启结果应答',
    rawHex: '0282080002001A020000000000E6',
    byteLength: 15,
    checksumValid: true,
    calculatedChecksum: 'E6',
    actualChecksum: 'E6',
    headerFields: {
      commandCode: '0x02_82',
      sequenceNo: 302,
    },
    bodyPayload: {
      ackCode: 0,
      currentTemp: 31.5,
      blowerState: 'RUNNING',
    },
    bodyFieldsList: [
      { name: '执行结果码', dataType: 'BYTE', rawHex: '00', parsedValue: '成功 (0)', description: '压缩机启动成功' },
      { name: '当前车温', dataType: 'BYTE', rawHex: '1F', parsedValue: 31.5, unit: '℃', description: '开启前车内环境温度' },
    ],
  },

  // 9. MQTT 遥测上报: 传感器与电池实时数据 - 上行 (正常)
  {
    id: 'log-mqtt-sensor-01',
    timestamp: 1792030820000,
    timestampFormatted: '2026-10-15 10:20:20.880',
    direction: CommDirection.UPLINK,
    protocolType: CommProtocolType.MQTT_TELEMETRY,
    deviceNo: 'DEV_TBOX_1001',
    vin: 'LSGJA52U1NF018888',
    plateNumber: '粤B·12345',
    messageId: 'telemetry/v1/sensors',
    messageName: '车辆高频工况遥测',
    rawHex: '3046001574656C656D657472792F76312F73656E736F72737B22736F63223A38352E322C22766F6C74223A31322E362C2274656D70223A32342E357D',
    byteLength: 60,
    checksumValid: true,
    calculatedChecksum: '7D',
    actualChecksum: '7D',
    headerFields: {
      topic: 'telemetry/v1/sensors',
      qos: 0,
      retain: false,
    },
    bodyPayload: {
      soc: 85.2,
      volt: 12.6,
      temp: 24.5,
      tirePressure: { fl: 2.3, fr: 2.3, rl: 2.4, rr: 2.4 },
    },
    bodyFieldsList: [
      { name: '电池电量 (SOC)', dataType: 'FLOAT', rawHex: '38352E32', parsedValue: 85.2, unit: '%', description: '高压动力蓄电池剩余电量' },
      { name: '小电瓶电压', dataType: 'FLOAT', rawHex: '31322E36', parsedValue: 12.6, unit: 'V', description: '12V 铅酸/低压蓄电池' },
      { name: '电机温度', dataType: 'FLOAT', rawHex: '32342E35', parsedValue: 24.5, unit: '℃', description: '驱动电机定子温度' },
    ],
  },

  // 10. MQTT 下发: 遥测采集频率配置 - 下行 (正常)
  {
    id: 'log-mqtt-config-01',
    timestamp: 1792030825000,
    timestampFormatted: '2026-10-15 10:20:25.105',
    direction: CommDirection.DOWNLINK,
    protocolType: CommProtocolType.MQTT_TELEMETRY,
    deviceNo: 'DEV_TBOX_1002',
    vin: 'LGDCA3129NF002345',
    plateNumber: '粤B·D12345',
    messageId: 'telemetry/v1/config',
    messageName: '遥测采样频率动态配置',
    rawHex: '322F001474656C656D657472792F76312F636F6E66696700017B2273616D706C6552617465223A313030307D',
    byteLength: 43,
    checksumValid: true,
    calculatedChecksum: '7D',
    actualChecksum: '7D',
    headerFields: {
      topic: 'telemetry/v1/config',
      qos: 1,
      packetId: 1,
    },
    bodyPayload: {
      sampleRate: 1000,
      reportingInterval: 5000,
    },
    bodyFieldsList: [
      { name: '采样频率', dataType: 'INTEGER', rawHex: '31303030', parsedValue: 1000, unit: 'ms', description: 'CAN 总线采样周期' },
      { name: '上报周期', dataType: 'INTEGER', rawHex: '35303030', parsedValue: 5000, unit: 'ms', description: '4G 批量封包上报频率' },
    ],
  },

  // 11. GB/T 32960 车辆登入 (0x01) - 上行 (正常)
  {
    id: 'log-gb32960-01-01',
    timestamp: 1792030830000,
    timestampFormatted: '2026-10-15 10:20:30.010',
    direction: CommDirection.UPLINK,
    protocolType: CommProtocolType.GB32960,
    deviceNo: 'DEV_TBOX_1001',
    vin: 'LSGJA52U1NF018888',
    plateNumber: '粤B·12345',
    messageId: '0x01',
    messageName: '车辆登入上报',
    rawHex: '232301FE4C53474A41353255314E4630313838383801001E20261015102030000149434349443132333435363738393030010141',
    byteLength: 46,
    checksumValid: true,
    calculatedChecksum: '41',
    actualChecksum: '41',
    headerFields: {
      commandId: '0x01',
      responseFlag: '0xFE',
      vin: 'LSGJA52U1NF018888',
      encryption: '不加密 (0x01)',
      bodyLength: 30,
    },
    bodyPayload: {
      loginTime: '2026-10-15 10:20:30',
      loginSeq: 1,
      iccid: 'ICCID12345678900',
    },
    bodyFieldsList: [
      { name: '登入时间', dataType: 'BCD(6)', rawHex: '20261015102030', parsedValue: '2026-10-15 10:20:30', description: '车载终端系统授时' },
      { name: '登入流水号', dataType: 'WORD', rawHex: '0001', parsedValue: 1, description: '本次开机第1次登入' },
      { name: 'ICCID 号', dataType: 'STRING(20)', rawHex: '49434349443132333435363738393030', parsedValue: 'ICCID12345678900', description: 'eSIM 卡唯一身份码' },
    ],
  },

  // 12. GB/T 32960 实时数据上报 (0x02) - 上行 (正常)
  {
    id: 'log-gb32960-02-01',
    timestamp: 1792030835000,
    timestampFormatted: '2026-10-15 10:20:35.402',
    direction: CommDirection.UPLINK,
    protocolType: CommProtocolType.GB32960,
    deviceNo: 'DEV_TBOX_1001',
    vin: 'LSGJA52U1NF018888',
    plateNumber: '粤B·12345',
    messageId: '0x02',
    messageName: '实时数据上报',
    rawHex: '232302FE4C53474A41353255314E46303138383838010025202610151020350101003C0000000000000156994006CA31B00000001B',
    byteLength: 53,
    checksumValid: true,
    calculatedChecksum: '1B',
    actualChecksum: '1B',
    headerFields: {
      commandId: '0x02',
      responseFlag: '0xFE',
      vin: 'LSGJA52U1NF018888',
      encryption: '不加密 (0x01)',
      bodyLength: 37,
    },
    bodyPayload: {
      vehicleStatus: '启动 (0x01)',
      chargingStatus: '未充电 (0x03)',
      speed: 60.0,
      totalMileage: 12580,
    },
    bodyFieldsList: [
      { name: '车辆状态', dataType: 'BYTE', rawHex: '01', parsedValue: '启动 (0x01)', description: '主接触器吸合，整车 Ready' },
      { name: '充电状态', dataType: 'BYTE', rawHex: '03', parsedValue: '未充电', description: '无直流/交流充电机插入' },
      { name: '车速', dataType: 'WORD', rawHex: '003C', parsedValue: 60.0, unit: 'km/h', description: '实际车速' },
    ],
  },

  // 13. 【安全诊断样本】JT/T 808 异或校验码篡改/通信误码异常报文 - 上行 (异常)
  {
    id: 'log-jt808-err-01',
    timestamp: 1792030840000,
    timestampFormatted: '2026-10-15 10:20:40.910',
    direction: CommDirection.UPLINK,
    protocolType: CommProtocolType.JT808,
    deviceNo: 'DEV_TBOX_1001',
    vin: 'LSGJA52U1NF018888',
    plateNumber: '粤B·12345',
    messageId: '0x0200',
    messageName: '位置信息汇报(校验异常)',
    rawHex: '7E0200002A013800138000007D00000000000000010156994006CA31B000780000014B261015102030009A7E',
    byteLength: 43,
    checksumValid: false,
    calculatedChecksum: '4E',
    actualChecksum: '9A',
    headerFields: {
      messageId: '0x0200',
      bodyLength: 42,
      phoneOrDevice: '013800138000',
      sequenceNo: 125,
      version: '2019',
    },
    bodyPayload: {
      lat: 22.5431,
      lng: 114.0579,
      speed: 65.4,
      status: '传输篡改或网络噪音导致异或码异常',
    },
    errorMessage: '校验码不一致 (网关计算值 0x4E, 报文携带值 0x9A)',
    bodyFieldsList: [
      { name: '异常诊断', dataType: 'STRING', rawHex: '9A', parsedValue: 'CHECKSUM_MISMATCH', description: 'CRC/XOR 校验和不匹配，疑似空中无线传输抖动或数据帧截断' },
    ],
  },

  // 14. GB/T 32960 补发数据上报 (0x03) - 上行 (正常)
  {
    id: 'log-gb32960-03-01',
    timestamp: 1792030845000,
    timestampFormatted: '2026-10-15 10:20:45.300',
    direction: CommDirection.UPLINK,
    protocolType: CommProtocolType.GB32960,
    deviceNo: 'DEV_TBOX_1003',
    vin: 'LB3782164MA098765',
    plateNumber: '京A·88888',
    messageId: '0x03',
    messageName: '历史工况补发数据',
    rawHex: '232303FE4C42333738323136344D4130393837363501001A20261015101900010000000000000000003F',
    byteLength: 42,
    checksumValid: true,
    calculatedChecksum: '3F',
    actualChecksum: '3F',
    headerFields: {
      commandId: '0x03',
      vin: 'LB3782164MA098765',
    },
    bodyPayload: {
      retransmitCount: 1,
      offlineTimestamp: '2026-10-15 10:19:00',
    },
    bodyFieldsList: [
      { name: '补发标志', dataType: 'BYTE', rawHex: '03', parsedValue: '盲区补报', description: '地下车库无信号期间暂存数据' },
    ],
  },
];
