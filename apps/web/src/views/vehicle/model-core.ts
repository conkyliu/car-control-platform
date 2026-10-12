/**
 * 车型档案、通讯协议 0x02 代号映射与品牌维护纯领域模型
 */

/**
 * 协议车型代号 0x02 严格正则表达式
 * 必须以 0x 开头，后跟 4 位十六进制字符 (如 0x0101, 0x0201, 0x00FF)
 */
export const PROTOCOL_CODE_REGEX = /^0x[0-9a-fA-F]{4}$/;

/**
 * 品牌大写代号正则表达式 (2~12 位大写英文字母、数字或下划线)
 */
export const BRAND_CODE_REGEX = /^[A-Z0-9_]{2,12}$/;

/**
 * 校验协议车型代号 0x02 格式是否合法
 */
export function validateProtocolCode(code?: string | null): boolean {
  if (!code || typeof code !== 'string') return false;
  return PROTOCOL_CODE_REGEX.test(code.trim());
}

/**
 * 统一标准化协议车型代号为小写 0x 格式 (如 0X01AB -> 0x01ab)
 */
export function formatProtocolCode(code?: string | null): string {
  if (!code || typeof code !== 'string') return '';
  const trimmed = code.trim();
  if (/^0[xX][0-9a-fA-F]{4}$/.test(trimmed)) {
    return '0x' + trimmed.slice(2).toLowerCase();
  }
  return trimmed;
}

/**
 * 校验品牌大写英文代号格式
 */
export function validateBrandCode(code?: string | null): boolean {
  if (!code || typeof code !== 'string') return false;
  return BRAND_CODE_REGEX.test(code.trim());
}

/**
 * 动力类型定义：EV 纯电动 / PHEV 插电混动 / ICE 燃油 / REEV 增程式
 */
export type PowertrainType = 'EV' | 'PHEV' | 'ICE' | 'REEV';

export interface PowertrainMeta {
  label: string;
  color: string;
  tagColor: string;
  description: string;
}

export const POWERTRAIN_MAP: Record<PowertrainType, PowertrainMeta> = {
  EV: {
    label: '纯电动',
    color: '#52c41a',
    tagColor: 'green',
    description: '纯电力驱动，具备电池BMS/电机控制器透传',
  },
  PHEV: {
    label: '插电混动',
    color: '#1677ff',
    tagColor: 'blue',
    description: '具备发动机与电池双动力总成协同车控',
  },
  ICE: {
    label: '燃油',
    color: '#8c8c8c',
    tagColor: 'default',
    description: '传统内燃机，支持远程点火与小电瓶电压监控',
  },
  REEV: {
    label: '增程式',
    color: '#722ed1',
    tagColor: 'purple',
    description: '增程发电机补能架构，双补能状态链路',
  },
};

export const POWERTRAIN_OPTIONS = [
  { label: '纯电动 (EV)', value: 'EV' },
  { label: '插电混动 (PHEV)', value: 'PHEV' },
  { label: '燃油 (ICE)', value: 'ICE' },
  { label: '增程式 (REEV)', value: 'REEV' },
];

export interface CapabilityTemplateOption {
  id: string;
  name: string;
  code: string;
  description: string;
}

export const CAPABILITY_TEMPLATE_OPTIONS: CapabilityTemplateOption[] = [
  {
    id: 'tpl-std-ev',
    name: '纯电标准控车模板',
    code: 'STD_EV',
    description: '支持双门、后备箱、空调、寻车与电量监控',
  },
  {
    id: 'tpl-perf-ev',
    name: '纯电高性能双电机模板',
    code: 'PERF_EV',
    description: '支持全车门窗、电池预热、双温区空调、哨兵模式',
  },
  {
    id: 'tpl-phev-std',
    name: '插电混动旗舰模板',
    code: 'PHEV_STD',
    description: '支持油电双动力诊断、发动机预热、远程锁止',
  },
  {
    id: 'tpl-ice-std',
    name: '传统燃油标准模板',
    code: 'ICE_STD',
    description: '支持远程启动、点火/熄火时长控制、低电压告警',
  },
  {
    id: 'tpl-reev-ext',
    name: '增程超长续航模板',
    code: 'REEV_EXT',
    description: '支持增程器启闭、油量电池双冗余状态透传',
  },
];

export interface BrandDto {
  id: string;
  name: string;
  code: string;
  country: string;
  modelCount?: number;
  logoUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ModelDto {
  id: string;
  brandId: string;
  brandName?: string;
  name: string;
  code: string; // 协议 0x02 十六进制代号 (如 0x0101)
  powertrain: PowertrainType;
  capabilityTemplateId?: string;
  capabilityTemplateName?: string;
  vehicleCount?: number;
  template?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateModelInput {
  brandId: string;
  name: string;
  code: string;
  powertrain: PowertrainType;
  capabilityTemplateId?: string;
  capabilityTemplateName?: string;
}

export interface UpdateModelInput {
  brandId?: string;
  name?: string;
  code?: string;
  powertrain?: PowertrainType;
  capabilityTemplateId?: string;
  capabilityTemplateName?: string;
}

export interface CreateBrandInput {
  name: string;
  code: string;
  country: string;
  logoUrl?: string;
}

export interface UpdateBrandInput {
  name?: string;
  code?: string;
  country?: string;
  logoUrl?: string;
}

/**
 * 车型防删除安全守卫纯函数
 * 若已有关联车辆引用该车型，禁止物理删除
 */
export function canDeleteModel(model: { vehicleCount?: number }): {
  allowed: boolean;
  reason?: string;
  message?: string;
} {
  if (model.vehicleCount && model.vehicleCount > 0) {
    const msg = `已有 ${model.vehicleCount} 辆车引用该车型，禁止删除`;
    return {
      allowed: false,
      reason: msg,
      message: msg,
    };
  }
  return { allowed: true };
}

/**
 * 品牌防删除安全守卫纯函数
 * 若该品牌下仍有登记车型，禁止物理删除
 */
export function canDeleteBrand(brand: { modelCount?: number }): {
  allowed: boolean;
  reason?: string;
  message?: string;
} {
  if (brand.modelCount && brand.modelCount > 0) {
    const msg = `该品牌下存在 ${brand.modelCount} 个车型，禁止删除`;
    return {
      allowed: false,
      reason: msg,
      message: msg,
    };
  }
  return { allowed: true };
}

// ---------------- 种子基础数据 ----------------

export const SEED_BRANDS: BrandDto[] = [
  {
    id: 'brand-byd',
    name: '比亚迪',
    code: 'BYD',
    country: '自主品牌',
    modelCount: 2,
    createdAt: '2026-01-01 10:00:00',
    updatedAt: '2026-01-01 10:00:00',
  },
  {
    id: 'brand-tesla',
    name: '特斯拉',
    code: 'TESLA',
    country: '外资独资',
    modelCount: 1,
    createdAt: '2026-01-02 11:00:00',
    updatedAt: '2026-01-02 11:00:00',
  },
  {
    id: 'brand-aion',
    name: '广汽埃安',
    code: 'AION',
    country: '自主品牌',
    modelCount: 1,
    createdAt: '2026-01-03 14:00:00',
    updatedAt: '2026-01-03 14:00:00',
  },
  {
    id: 'brand-zeekr',
    name: '吉利极氪',
    code: 'ZEEKR',
    country: '自主新势力',
    modelCount: 1,
    createdAt: '2026-01-05 09:30:00',
    updatedAt: '2026-01-05 09:30:00',
  },
];

export const SEED_MODELS: ModelDto[] = [
  {
    id: 'model-byd-han',
    brandId: 'brand-byd',
    brandName: '比亚迪',
    name: '汉 EV',
    code: '0x0101',
    powertrain: 'EV',
    capabilityTemplateId: 'tpl-perf-ev',
    capabilityTemplateName: '纯电高性能双电机模板',
    vehicleCount: 3,
    createdAt: '2026-01-10 10:00:00',
    updatedAt: '2026-01-10 10:00:00',
  },
  {
    id: 'model-byd-tang-dmi',
    brandId: 'brand-byd',
    brandName: '比亚迪',
    name: '唐 DM-i',
    code: '0x0102',
    powertrain: 'PHEV',
    capabilityTemplateId: 'tpl-phev-std',
    capabilityTemplateName: '插电混动旗舰模板',
    vehicleCount: 0,
    createdAt: '2026-01-11 15:00:00',
    updatedAt: '2026-01-11 15:00:00',
  },
  {
    id: 'model-tesla-modely',
    brandId: 'brand-tesla',
    brandName: '特斯拉',
    name: 'Model Y',
    code: '0x0201',
    powertrain: 'EV',
    capabilityTemplateId: 'tpl-std-ev',
    capabilityTemplateName: '纯电标准控车模板',
    vehicleCount: 3,
    createdAt: '2026-01-12 11:00:00',
    updatedAt: '2026-01-12 11:00:00',
  },
  {
    id: 'model-aion-s',
    brandId: 'brand-aion',
    brandName: '广汽埃安',
    name: 'AION S',
    code: '0x0301',
    powertrain: 'EV',
    capabilityTemplateId: 'tpl-std-ev',
    capabilityTemplateName: '纯电标准控车模板',
    vehicleCount: 3,
    createdAt: '2026-01-15 14:00:00',
    updatedAt: '2026-01-15 14:00:00',
  },
  {
    id: 'model-zeekr-001',
    brandId: 'brand-zeekr',
    brandName: '吉利极氪',
    name: '极氪 001',
    code: '0x0401',
    powertrain: 'EV',
    capabilityTemplateId: 'tpl-perf-ev',
    capabilityTemplateName: '纯电高性能双电机模板',
    vehicleCount: 3,
    createdAt: '2026-01-18 09:30:00',
    updatedAt: '2026-01-18 09:30:00',
  },
];
