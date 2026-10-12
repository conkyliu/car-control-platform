import {
  IMEI_REGEX,
  ICCID_REGEX,
  PRODUCT_KEY_OPTIONS,
  type CreateDeviceInput,
} from './device-core.ts';

/**
 * 默认单批次上限
 */
export const DEFAULT_MAX_IMPORT_ROWS = 1000;

/**
 * 有效产品型号列表
 */
export const VALID_PRODUCT_KEYS: readonly string[] = PRODUCT_KEY_OPTIONS.map((o) => o.value);

/**
 * 导入错误记录项接口
 */
export interface ImportInvalidRow {
  rowNumber: number;
  deviceNo?: string;
  imei?: string;
  productKey?: string;
  projectId?: string;
  iccid?: string;
  reason: string;
}

/**
 * 导入预校验结果接口
 */
export interface ImportValidationResult {
  totalRows: number;
  validItems: CreateDeviceInput[];
  invalidRows: ImportInvalidRow[];
  duplicateCount: number;
  isQuotaExceeded: boolean;
  quotaRequired: number;
  quotaAvailable: number;
  maxRowsExceeded: boolean;
}

/**
 * 解析参数选项
 */
export interface ParseDeviceImportOptions {
  maxRows?: number;
  remainingQuota?: number;
  defaultProjectId?: string;
  validProductKeys?: readonly string[];
}

/**
 * CSV 单元格防注入与规范转义纯函数
 */
export function escapeCsvCell(val: unknown): string {
  if (val === undefined || val === null) {
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
 * 生成带 UTF-8 BOM 的标准设备导入 CSV 模板
 */
export function generateDeviceImportTemplate(): string {
  const headers = ['设备编号(必填)', 'IMEI(必填15位)', '硬件型号ProductKey(必填)', '归属项目ID(选填)', 'ICCID(选填20位)'];
  const sampleRows = [
    ['DEV_SZ_001', '868123045678901', 'TBOX-G4-STD', 'proj-sz-01', '89860401123456789001'],
    ['DEV_SZ_002', '868123045678902', 'TBOX-G5-PRO', 'proj-gz-02', '89860401123456789002'],
  ];

  const lines = [
    headers.join(','),
    ...sampleRows.map((row) => row.map(escapeCsvCell).join(',')),
  ];

  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/**
 * RFC 4180 标准 CSV 行与字段解析器
 */
export function parseCsvRows(content: string): string[][] {
  const text = content.startsWith('\uFEFF') ? content.slice(1) : content;
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
        i++;
        continue;
      } else if (char === '\r') {
        if (i + 1 < text.length && text[i + 1] === '\n') {
          i++;
        }
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++;
        continue;
      } else if (char === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  // 过滤完全为空白字符的无效行
  return rows.filter((row) => row.some((field) => field.trim().length > 0));
}

/**
 * 校验设备导入 CSV 内容并执行批内去重与配额检查
 */
export function parseDeviceImportCsv(
  content: string,
  options?: ParseDeviceImportOptions
): ImportValidationResult {
  const maxRows = options?.maxRows ?? DEFAULT_MAX_IMPORT_ROWS;
  const remainingQuota = options?.remainingQuota;
  const defaultProjectId = options?.defaultProjectId ?? 'proj-sz-01';
  const validProductKeys = options?.validProductKeys ?? VALID_PRODUCT_KEYS;

  const rawRows = parseCsvRows(content);
  if (rawRows.length === 0) {
    return {
      totalRows: 0,
      validItems: [],
      invalidRows: [],
      duplicateCount: 0,
      isQuotaExceeded: false,
      quotaRequired: 0,
      quotaAvailable: typeof remainingQuota === 'number' && Number.isFinite(remainingQuota) ? remainingQuota : 0,
      maxRowsExceeded: false,
    };
  }

  // 检测首行是否为表头
  const firstRow = rawRows[0]!;
  const isHeader =
    firstRow.some((col) => col.includes('设备编号') || col.includes('IMEI') || col.includes('ProductKey'));

  const dataRows = isHeader ? rawRows.slice(1) : rawRows;
  const headerOffset = isHeader ? 1 : 0;
  const totalRows = dataRows.length;
  const maxRowsExceeded = totalRows > maxRows;

  const validItems: CreateDeviceInput[] = [];
  const invalidRows: ImportInvalidRow[] = [];
  let duplicateCount = 0;

  const seenDeviceNos = new Set<string>();
  const seenImeis = new Set<string>();

  for (let index = 0; index < dataRows.length; index++) {
    const row = dataRows[index]!;
    const rowNumber = headerOffset + index + 1;

    const rawDeviceNo = (row[0] ?? '').trim();
    const rawImei = (row[1] ?? '').trim();
    const rawProductKey = (row[2] ?? '').trim();
    const rawProjectId = (row[3] ?? '').trim();
    const rawIccid = (row[4] ?? '').trim();

    const errors: string[] = [];
    let isDuplicate = false;

    // 1. 校验设备编号 (3~32 字符)
    if (!rawDeviceNo) {
      errors.push('设备编号不能为空');
    } else if (rawDeviceNo.length < 3 || rawDeviceNo.length > 32) {
      errors.push('设备编号必须为 3~32 位字符');
    }

    // 2. 校验 IMEI (15 位纯数字)
    if (!rawImei) {
      errors.push('IMEI 不能为空');
    } else if (!IMEI_REGEX.test(rawImei)) {
      errors.push('IMEI 必须为严格 15 位数字');
    }

    // 3. 校验 ProductKey
    if (!rawProductKey) {
      errors.push('硬件型号ProductKey不能为空');
    } else if (validProductKeys.length > 0 && !validProductKeys.includes(rawProductKey)) {
      errors.push(`无效的硬件型号ProductKey: ${rawProductKey}`);
    }

    // 4. 校验 ICCID (选填，若填写则 19~20 位字母数字)
    if (rawIccid && !ICCID_REGEX.test(rawIccid)) {
      errors.push('ICCID 必须为 19~20 位字母数字');
    }

    // 5. 批内去重检查
    if (rawDeviceNo && seenDeviceNos.has(rawDeviceNo)) {
      errors.push(`批内重复的设备编号: ${rawDeviceNo}`);
      isDuplicate = true;
    }

    if (rawImei && seenImeis.has(rawImei)) {
      errors.push(`批内重复的IMEI: ${rawImei}`);
      isDuplicate = true;
    }

    if (errors.length > 0) {
      if (isDuplicate) {
        duplicateCount++;
      }
      invalidRows.push({
        rowNumber,
        deviceNo: rawDeviceNo || undefined,
        imei: rawImei || undefined,
        productKey: rawProductKey || undefined,
        projectId: rawProjectId || undefined,
        iccid: rawIccid || undefined,
        reason: errors.join('；'),
      });
    } else {
      seenDeviceNos.add(rawDeviceNo);
      seenImeis.add(rawImei);

      validItems.push({
        deviceNo: rawDeviceNo,
        imei: rawImei,
        productKey: rawProductKey,
        projectId: rawProjectId || defaultProjectId,
        iccid: rawIccid || undefined,
        status: 'ACTIVE',
      });
    }
  }

  // 6. 租户配额预检
  const quotaAvailable =
    typeof remainingQuota === 'number' && Number.isFinite(remainingQuota) ? remainingQuota : Infinity;
  const quotaRequired = validItems.length;
  const isQuotaExceeded = quotaRequired > quotaAvailable;

  return {
    totalRows,
    validItems,
    invalidRows,
    duplicateCount,
    isQuotaExceeded,
    quotaRequired,
    quotaAvailable: Number.isFinite(quotaAvailable) ? quotaAvailable : 0,
    maxRowsExceeded,
  };
}

/**
 * 汇总失败或跳过的行，生成带 UTF-8 BOM 的 CSV 文本以供下载
 */
export function generateSkippedErrorsCsv(
  errors: Array<{
    rowNumber?: number;
    deviceNo?: string;
    imei?: string;
    reason: string;
  }>
): string {
  const headers = ['行号', '设备编号', 'IMEI', '失败或跳过原因'];
  const lines = [
    headers.join(','),
    ...errors.map((item) =>
      [
        escapeCsvCell(item.rowNumber !== undefined ? item.rowNumber : '-'),
        escapeCsvCell(item.deviceNo ?? '-'),
        escapeCsvCell(item.imei ?? '-'),
        escapeCsvCell(item.reason),
      ].join(',')
    ),
  ];

  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
