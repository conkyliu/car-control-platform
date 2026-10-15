import { http, ApiError } from './client.ts';
import {
  type FirmwarePackageDto,
  type FirmwareQueryParams,
  type CreateFirmwareInput,
  FirmwareStatus,
  validateSemver,
  validateSha256,
  formatFileSize,
  isValidFirmwareStatusTransition,
  filterFirmwarePackages,
  SEED_FIRMWARE_PACKAGES,
  isApiError,
} from '../views/ota/firmware-core.ts';

// 导出入参类型方便复用
export type { FirmwareQueryParams, CreateFirmwareInput };

// 内存固件包持久化池 (离线降级与前端独立演练)
let inMemoryPackages: FirmwarePackageDto[] = JSON.parse(
  JSON.stringify(SEED_FIRMWARE_PACKAGES)
);

/**
 * 获取当前内存固件包快照
 */
export function getInMemoryFirmwarePackages(): FirmwarePackageDto[] {
  return inMemoryPackages;
}

/**
 * 设置内存固件包列表
 */
export function setInMemoryFirmwarePackages(list: FirmwarePackageDto[]): void {
  inMemoryPackages = list;
}

/**
 * 重置内存固件池为原始种子数据
 */
export function resetInMemoryFirmwarePackages(): void {
  inMemoryPackages = JSON.parse(JSON.stringify(SEED_FIRMWARE_PACKAGES));
}

/**
 * 多维过滤检索固件包列表
 */
export async function fetchFirmwarePackagesApi(
  params?: FirmwareQueryParams
): Promise<FirmwarePackageDto[]> {
  try {
    const res = await http.get<FirmwarePackageDto[]>('/ota/firmwares', { params });
    if (Array.isArray(res)) {
      return res;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线/开发环境降级：从内存池中过滤
  const filtered = filterFirmwarePackages(inMemoryPackages, params);
  return JSON.parse(JSON.stringify(filtered));
}

/**
 * 获取指定固件包详情
 */
export async function fetchFirmwareDetailApi(id: string): Promise<FirmwarePackageDto> {
  try {
    const res = await http.get<FirmwarePackageDto>(`/ota/firmwares/${encodeURIComponent(id)}`);
    if (res && res.id) {
      return res;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  const found = inMemoryPackages.find((p) => p.id === id);
  if (!found) {
    throw new ApiError(`未找到 ID 为 [${id}] 的固件包记录`, 404);
  }

  return JSON.parse(JSON.stringify(found));
}

/**
 * 创建/录入新固件包
 */
export async function createFirmwarePackageApi(
  data: CreateFirmwareInput
): Promise<FirmwarePackageDto> {
  // 1. SemVer 语义化版本校验
  const semverCheck = validateSemver(data.version);
  if (!semverCheck.valid) {
    throw new ApiError(
      semverCheck.error || '固件版本号必须符合 SemVer 语义化规范 (如 v1.2.0 或 2.0.1-rc.1)',
      400
    );
  }

  // 2. SHA-256 完整性哈希校验
  if (!validateSha256(data.sha256)) {
    throw new ApiError('SHA-256 校验和必须为 64 位十六进制字符', 400);
  }

  // 3. 重复性校验 (同类型同包名不可存在相同版本)
  const isDuplicate = inMemoryPackages.some(
    (p) => p.name.trim() === data.name.trim() && p.version.trim() === data.version.trim()
  );
  if (isDuplicate) {
    throw new ApiError(
      `已存在同名且版本号为 [${data.version}] 的固件包，禁止重复录入`,
      409
    );
  }

  try {
    const res = await http.post<FirmwarePackageDto>('/ota/firmwares', {
      body: data,
    });
    if (res && res.id) {
      return res;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  // 离线降级录入
  const now = new Date().toISOString();
  const newPackage: FirmwarePackageDto = {
    id: `fw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: data.name.trim(),
    firmwareType: data.firmwareType,
    version: data.version.trim(),
    fileSize: data.fileSize,
    fileSizeFormatted: formatFileSize(data.fileSize),
    sha256: data.sha256.trim().toLowerCase(),
    applicableModelIds: [...data.applicableModelIds],
    applicableModelNames: data.applicableModelNames ? [...data.applicableModelNames] : [],
    status: FirmwareStatus.DRAFT,
    releaseNotes: data.releaseNotes.trim(),
    uploadedBy: data.uploadedBy || '系统管理员_当前用户',
    createdAt: now,
    updatedAt: now,
    tenantId: data.tenantId,
    fileUrl: data.fileUrl,
  };

  inMemoryPackages.unshift(newPackage);
  return JSON.parse(JSON.stringify(newPackage));
}

/**
 * 正式发布固件包至生产版本库
 */
export async function publishFirmwarePackageApi(id: string): Promise<FirmwarePackageDto> {
  const index = inMemoryPackages.findIndex((p) => p.id === id);
  if (index === -1) {
    throw new ApiError(`未找到 ID 为 [${id}] 的固件包记录`, 404);
  }

  const current = inMemoryPackages[index]!;
  if (!isValidFirmwareStatusTransition(current.status, FirmwareStatus.PUBLISHED)) {
    throw new ApiError(
      `固件当前状态 [${current.status}] 不允许执行发布上线操作 (仅草稿状态支持发布)`,
      400
    );
  }

  try {
    const res = await http.post<FirmwarePackageDto>(
      `/ota/firmwares/${encodeURIComponent(id)}/publish`
    );
    if (res && res.id) {
      return res;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  const now = new Date().toISOString();
  const updated: FirmwarePackageDto = {
    ...current,
    status: FirmwareStatus.PUBLISHED,
    publishedAt: now,
    updatedAt: now,
  };

  inMemoryPackages[index] = updated;
  return JSON.parse(JSON.stringify(updated));
}

/**
 * 废弃下线固件包
 */
export async function deprecateFirmwarePackageApi(id: string): Promise<FirmwarePackageDto> {
  const index = inMemoryPackages.findIndex((p) => p.id === id);
  if (index === -1) {
    throw new ApiError(`未找到 ID 为 [${id}] 的固件包记录`, 404);
  }

  const current = inMemoryPackages[index]!;
  if (!isValidFirmwareStatusTransition(current.status, FirmwareStatus.DEPRECATED)) {
    throw new ApiError(
      `固件 [${id}] 已处于终态 [${current.status}]，禁止重复执行废弃操作`,
      400
    );
  }

  try {
    const res = await http.post<FirmwarePackageDto>(
      `/ota/firmwares/${encodeURIComponent(id)}/deprecate`
    );
    if (res && res.id) {
      return res;
    }
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  const now = new Date().toISOString();
  const updated: FirmwarePackageDto = {
    ...current,
    status: FirmwareStatus.DEPRECATED,
    updatedAt: now,
  };

  inMemoryPackages[index] = updated;
  return JSON.parse(JSON.stringify(updated));
}

/**
 * 删除草稿固件包 (仅 DRAFT 状态允许物理移除)
 */
export async function deleteFirmwarePackageApi(
  id: string
): Promise<{ success: boolean; message: string }> {
  const index = inMemoryPackages.findIndex((p) => p.id === id);
  if (index === -1) {
    throw new ApiError(`未找到 ID 为 [${id}] 的固件包记录`, 404);
  }

  const current = inMemoryPackages[index]!;
  if (current.status !== FirmwareStatus.DRAFT) {
    throw new ApiError(
      `仅草稿状态的固件包支持删除，已发布上线或已废弃固件禁止物理删除以确保固件可追溯性`,
      400
    );
  }

  try {
    await http.delete(`/ota/firmwares/${encodeURIComponent(id)}`);
  } catch (err) {
    if (isApiError(err)) {
      throw err;
    }
  }

  inMemoryPackages.splice(index, 1);
  return {
    success: true,
    message: `固件包 [${current.name} (${current.version})] 删除成功`,
  };
}
