import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Drawer,
  Typography,
  Tag,
  Space,
  Alert,
  Table,
  Switch,
  Select,
  InputNumber,
  Input,
  Button,
  Popconfirm,
  Divider,
  Segmented,
  Tooltip,
  message,
  Spin,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  LockOutlined,
  UnlockOutlined,
  InboxOutlined,
  CarOutlined,
  BellOutlined,
  ThunderboltOutlined,
  PoweroffOutlined,
  FireOutlined,
  PauseCircleOutlined,
  HeatMapOutlined,
  DownSquareOutlined,
  UpSquareOutlined,
  BorderOutlined,
  UndoOutlined,
  SaveOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  SlidersOutlined,
} from '@ant-design/icons';
import { CommandCode, SecurityLevel } from '@car-control/contracts';
import {
  type CapabilityRule,
  type ModelTemplateDto,
  CommandCategory,
  COMMAND_CATEGORY_MAP,
  SEED_CAPABILITY_TEMPLATES,
} from './capability-core.ts';
import {
  type VehicleCapabilityOverrideDto,
  type VehicleEffectiveCommandItem,
  type VehicleOverrideSummaryDto,
  resolveVehicleEffectiveList,
  calculateOverrideSummary,
  cleanRedundantOverrides,
} from './vehicle-override-core.ts';
import { COMMAND_METADATA } from './command-core.ts';
import {
  fetchVehicleOverrideApi,
  saveVehicleOverrideApi,
  resetVehicleOverrideApi,
} from '../../api/vehicle-override.ts';
import { fetchCapabilityTemplateByModelApi } from '../../api/capability.ts';
import { fetchVehiclesApi } from '../../api/vehicle.ts';
import { type VehicleDto, SEED_VEHICLES } from '../vehicle/vehicle-core.ts';
import { POWERTRAIN_MAP, type PowertrainType } from '../vehicle/model-core.ts';

const { Text } = Typography;

// 指令图标映射字典
const COMMAND_ICON_MAP: Record<CommandCode, React.ReactNode> = {
  [CommandCode.CMD_LOCK]: <LockOutlined />,
  [CommandCode.CMD_UNLOCK]: <UnlockOutlined />,
  [CommandCode.CMD_TRUNK_OPEN]: <InboxOutlined />,
  [CommandCode.CMD_TRUNK_CLOSE]: <CarOutlined />,
  [CommandCode.CMD_FIND_VEHICLE]: <BellOutlined />,
  [CommandCode.CMD_ENGINE_START]: <ThunderboltOutlined />,
  [CommandCode.CMD_ENGINE_STOP]: <PoweroffOutlined />,
  [CommandCode.CMD_AC_START]: <FireOutlined />,
  [CommandCode.CMD_AC_STOP]: <PauseCircleOutlined />,
  [CommandCode.CMD_SEAT_HEAT]: <HeatMapOutlined />,
  [CommandCode.CMD_WINDOW_OPEN]: <DownSquareOutlined />,
  [CommandCode.CMD_WINDOW_CLOSE]: <UpSquareOutlined />,
  [CommandCode.CMD_SUNROOF_CONTROL]: <BorderOutlined />,
};

export interface VehicleOverrideDrawerProps {
  open: boolean;
  onClose: () => void;
  vehicleId?: string | null;
  vehicle?: VehicleDto | null;
  onSaved?: (override: VehicleCapabilityOverrideDto) => void;
  onReset?: () => void;
}

export const VehicleOverrideDrawer: React.FC<VehicleOverrideDrawerProps> = ({
  open,
  onClose,
  vehicleId,
  vehicle,
  onSaved,
  onReset,
}) => {
  // 当前目标车辆信息
  const [targetVehicle, setTargetVehicle] = useState<VehicleDto | null>(vehicle || null);
  // 当前车辆对应的基准车型能力模板
  const [template, setTemplate] = useState<ModelTemplateDto | null>(null);
  // 当前正在编辑的单车覆盖规则集合
  const [editingOverrides, setEditingOverrides] = useState<
    Partial<Record<CommandCode, CapabilityRule>>
  >({});

  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [resetting, setResetting] = useState<boolean>(false);

  // 过滤控制
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [filterOnlyDiff, setFilterOnlyDiff] = useState<boolean>(false);

  // 确定有效车辆 ID
  const effectiveVehId = vehicle?.id || vehicleId;

  // 加载单车背景数据、基准模板与覆盖配置
  const loadData = useCallback(async () => {
    if (!effectiveVehId) return;
    setLoading(true);

    try {
      // 1. 获取车辆基础信息
      let currentVeh: VehicleDto | null = vehicle || null;
      if (!currentVeh) {
        currentVeh = SEED_VEHICLES.find((v) => v.id === effectiveVehId) || null;
        if (!currentVeh) {
          try {
            const list = await fetchVehiclesApi();
            currentVeh = list.find((v) => v.id === effectiveVehId) || null;
          } catch {
            // fallback gracefully
          }
        }
      }
      setTargetVehicle(currentVeh);

      const modelId = currentVeh?.modelId || 'model-ev-flagship';

      // 2. 获取该车型的基准能力模板
      let tpl: ModelTemplateDto | null = null;
      try {
        tpl = await fetchCapabilityTemplateByModelApi(modelId);
      } catch {
        // fallback
      }
      if (!tpl) {
        tpl =
          SEED_CAPABILITY_TEMPLATES.find((t) => t.modelId === modelId) ||
          SEED_CAPABILITY_TEMPLATES[0];
      }
      setTemplate(tpl);

      // 3. 获取单车已持久化的覆盖配置
      const overrideRecord = await fetchVehicleOverrideApi(effectiveVehId);
      setEditingOverrides(
        overrideRecord?.overrides ? JSON.parse(JSON.stringify(overrideRecord.overrides)) : {}
      );
    } catch (err) {
      console.error('Failed to load vehicle override context:', err);
      message.error('加载单车能力覆盖数据异常，请刷新重试');
    } finally {
      setLoading(false);
    }
  }, [effectiveVehId, vehicle]);

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, loadData]);

  // 基准有效规则比对列表
  const effectiveList: VehicleEffectiveCommandItem[] = useMemo(() => {
    if (!template) return [];
    return resolveVehicleEffectiveList(template, {
      id: '',
      vehicleId: effectiveVehId || '',
      vin: targetVehicle?.vin || '',
      plateNumber: targetVehicle?.plateNumber || '',
      modelId: template.modelId,
      updatedAt: '',
      overrides: editingOverrides,
    });
  }, [template, editingOverrides, effectiveVehId, targetVehicle]);

  // KPI 概览统计
  const summary: VehicleOverrideSummaryDto = useMemo(() => {
    return calculateOverrideSummary(effectiveList);
  }, [effectiveList]);

  // 过滤后的表格展示数据
  const displayRows = useMemo(() => {
    let list = effectiveList;
    if (categoryFilter !== 'ALL') {
      list = list.filter((i) => i.category === categoryFilter);
    }
    if (filterOnlyDiff) {
      list = list.filter((i) => i.differsFromTemplate);
    }
    return list;
  }, [effectiveList, categoryFilter, filterOnlyDiff]);

  // 模式切换：继承 vs 覆盖
  const handleToggleMode = (code: CommandCode, isOverride: boolean) => {
    if (!template) return;
    setEditingOverrides((prev) => {
      const next = { ...prev };
      if (isOverride) {
        const baseRule = template.capabilities[code] || {
          supported: true,
          securityLevel: SecurityLevel.L1,
          timeoutMs: 10000,
          frequencyLimitSeconds: 5,
        };
        next[code] = { ...baseRule };
      } else {
        delete next[code];
      }
      return next;
    });
  };

  // 修改覆盖单项属性
  const handleUpdateRuleProp = <K extends keyof CapabilityRule>(
    code: CommandCode,
    prop: K,
    value: CapabilityRule[K]
  ) => {
    if (!template) return;
    setEditingOverrides((prev) => {
      const currentRule = prev[code] || template.capabilities[code];
      return {
        ...prev,
        [code]: {
          ...currentRule,
          [prop]: value,
        },
      };
    });
  };

  // 还原单项为继承
  const handleRevertItem = (code: CommandCode) => {
    setEditingOverrides((prev) => {
      const next = { ...prev };
      delete next[code];
      return next;
    });
    message.success(`指令 ${COMMAND_METADATA[code]?.name || code} 已恢复继承车型模板`);
  };

  // 全部重置为继承车型模板
  const handleResetAll = async () => {
    if (!effectiveVehId) return;
    setResetting(true);
    try {
      await resetVehicleOverrideApi(effectiveVehId);
      setEditingOverrides({});
      message.success('已清空单车覆盖规则，完全恢复继承车型默认模板');
      onReset?.();
    } catch (err) {
      console.error('Failed to reset overrides:', err);
      message.error('重置单车覆盖失败，请重试');
    } finally {
      setResetting(false);
    }
  };

  // 保存单车覆盖配置
  const handleSave = async () => {
    if (!effectiveVehId || !template) return;
    setSaving(true);
    try {
      // 清理与车型基准模板完全一致的冗余覆盖项
      const cleaned = cleanRedundantOverrides(editingOverrides, template);
      const saved = await saveVehicleOverrideApi(
        effectiveVehId,
        cleaned,
        '运营控制台单车能力覆盖配置更新'
      );
      setEditingOverrides(saved.overrides || {});
      message.success('单车专属能力覆盖配置已成功保存！');
      onSaved?.(saved);
      onClose();
    } catch (err) {
      console.error('Failed to save overrides:', err);
      message.error('保存单车能力覆盖配置失败');
    } finally {
      setSaving(false);
    }
  };

  // 动力类型元信息
  const powertrain = (template?.powertrain || 'EV') as PowertrainType;
  const ptMeta = POWERTRAIN_MAP[powertrain] || POWERTRAIN_MAP.EV;

  // 表格列定义
  const columns: ColumnsType<VehicleEffectiveCommandItem> = [
    {
      title: '指令与集群',
      key: 'commandInfo',
      width: 170,
      render: (_, record) => {
        const meta = COMMAND_METADATA[record.commandCode];
        const catMeta = COMMAND_CATEGORY_MAP[record.category];
        const icon = COMMAND_ICON_MAP[record.commandCode];

        return (
          <Space orientation="vertical" size={2} style={{ width: '100%' }}>
            <Space size={6} align="center">
              <span style={{ fontSize: 16, color: catMeta?.color || '#1677ff' }}>{icon}</span>
              <Text strong style={{ fontSize: 13 }}>
                {meta?.name || record.commandCode}
              </Text>
            </Space>
            <Space size={4} wrap>
              <Tag color={catMeta?.tagColor || 'blue'} style={{ margin: 0, fontSize: 11 }}>
                {catMeta?.label || '常规'}
              </Tag>
              <Text
                type="secondary"
                style={{ fontSize: 11, fontFamily: 'monospace' }}
              >
                {record.commandCode}
              </Text>
            </Space>
          </Space>
        );
      },
    },
    {
      title: '管控模式',
      key: 'mode',
      width: 120,
      render: (_, record) => (
        <Space orientation="vertical" size={4} align="center">
          <Switch
            checked={record.isOverridden}
            onChange={(checked) => handleToggleMode(record.commandCode, checked)}
            checkedChildren="覆盖"
            unCheckedChildren="继承"
            style={{
              backgroundColor: record.isOverridden ? '#722ed1' : undefined,
            }}
          />
          {record.isOverridden ? (
            <Tag color="purple" style={{ margin: 0, fontSize: 11 }}>
              单车专属
            </Tag>
          ) : (
            <Tag style={{ margin: 0, fontSize: 11 }}>继承模板</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '生效控车状态',
      key: 'supported',
      width: 110,
      render: (_, record) => {
        const isSupported = record.effectiveRule.supported;
        const differs =
          record.isOverridden && record.effectiveRule.supported !== record.templateRule.supported;

        return (
          <Space orientation="vertical" size={4} align="center">
            <Switch
              size="small"
              checked={isSupported}
              disabled={!record.isOverridden}
              onChange={(checked) =>
                handleUpdateRuleProp(record.commandCode, 'supported', checked)
              }
              checkedChildren="允许"
              unCheckedChildren="禁用"
            />
            {isSupported ? (
              <Tag color="success" style={{ margin: 0, fontSize: 11 }}>
                支持控车
              </Tag>
            ) : (
              <Tag color="error" style={{ margin: 0, fontSize: 11 }}>
                单车禁用
              </Tag>
            )}
            {differs && (
              <Tag color="warning" style={{ margin: 0, fontSize: 10 }}>
                差异已生效
              </Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: '安全等级',
      key: 'securityLevel',
      width: 110,
      render: (_, record) => {
        const differs =
          record.isOverridden &&
          record.effectiveRule.securityLevel !== record.templateRule.securityLevel;

        return (
          <Space orientation="vertical" size={2} style={{ width: '100%' }}>
            <Select
              size="small"
              value={record.effectiveRule.securityLevel}
              disabled={!record.isOverridden}
              onChange={(val) =>
                handleUpdateRuleProp(record.commandCode, 'securityLevel', val)
              }
              style={{ width: '100%' }}
              options={[
                { value: SecurityLevel.L0, label: 'L0 直发' },
                { value: SecurityLevel.L1, label: 'L1 确认' },
                { value: SecurityLevel.L2, label: 'L2 鉴权' },
              ]}
            />
            {differs && (
              <Tag color="warning" style={{ margin: 0, fontSize: 10 }}>
                原模板: {record.templateRule.securityLevel}
              </Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: '响应超时 / 频控',
      key: 'thresholds',
      width: 125,
      render: (_, record) => {
        const timeoutDiff =
          record.isOverridden &&
          record.effectiveRule.timeoutMs !== record.templateRule.timeoutMs;
        const freqDiff =
          record.isOverridden &&
          record.effectiveRule.frequencyLimitSeconds !==
            record.templateRule.frequencyLimitSeconds;

        return (
          <Space orientation="vertical" size={4} style={{ width: '100%' }}>
            <div>
              <InputNumber
                size="small"
                min={3000}
                max={60000}
                step={1000}
                addonAfter="ms"
                disabled={!record.isOverridden}
                value={record.effectiveRule.timeoutMs}
                onChange={(val) =>
                  handleUpdateRuleProp(record.commandCode, 'timeoutMs', Number(val) || 10000)
                }
                style={{ width: '100%' }}
              />
              {timeoutDiff && (
                <Text type="secondary" style={{ fontSize: 10, color: '#fa8c16' }}>
                  原: {record.templateRule.timeoutMs}ms
                </Text>
              )}
            </div>
            <div>
              <InputNumber
                size="small"
                min={0}
                max={300}
                step={1}
                addonAfter="s"
                disabled={!record.isOverridden}
                value={record.effectiveRule.frequencyLimitSeconds}
                onChange={(val) =>
                  handleUpdateRuleProp(
                    record.commandCode,
                    'frequencyLimitSeconds',
                    Number(val) || 0
                  )
                }
                style={{ width: '100%' }}
              />
              {freqDiff && (
                <Text type="secondary" style={{ fontSize: 10, color: '#fa8c16' }}>
                  原: {record.templateRule.frequencyLimitSeconds}s
                </Text>
              )}
            </div>
          </Space>
        );
      },
    },
    {
      title: '覆盖原因说明 / 操作',
      key: 'overrideReason',
      render: (_, record) => {
        if (!record.isOverridden) {
          return (
            <Text type="secondary" style={{ fontSize: 12 }}>
              完全遵循车型模板默认规则
            </Text>
          );
        }

        return (
          <Space orientation="vertical" size={4} style={{ width: '100%' }}>
            <Input
              size="small"
              placeholder="请输入单车覆盖管控原因/备注说明"
              value={record.effectiveRule.description || ''}
              onChange={(e) =>
                handleUpdateRuleProp(record.commandCode, 'description', e.target.value)
              }
            />
            <Button
              type="link"
              danger
              size="small"
              icon={<UndoOutlined />}
              onClick={() => handleRevertItem(record.commandCode)}
              style={{ padding: 0, height: 20, fontSize: 12 }}
            >
              还原为继承
            </Button>
          </Space>
        );
      },
    },
  ];

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <SlidersOutlined style={{ fontSize: 18, color: '#1677ff' }} />
            <Text strong style={{ fontSize: 16 }}>
              单车专属可控范围能力覆盖抽屉
            </Text>
            {targetVehicle?.plateNumber && (
              <Tag color="blue" style={{ fontSize: 13, fontWeight: 600 }}>
                {targetVehicle.plateNumber}
              </Tag>
            )}
            {targetVehicle?.vin && (
              <Text copyable style={{ fontFamily: 'monospace', fontSize: 12 }}>
                {targetVehicle.vin}
              </Text>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              基准车型：{template?.modelName || targetVehicle?.modelName || '未知车型'}
            </Text>
            <Tag color="purple" style={{ fontSize: 11 }}>
              0x02 协议: {template?.protocolCode || '0x0001'}
            </Tag>
            <Tag color={ptMeta.tagColor} style={{ fontSize: 11 }}>
              {ptMeta.label}
            </Tag>
          </div>
        </div>
      }
      placement="right"
      width={720}
      open={open}
      onClose={onClose}
      destroyOnClose
      styles={{
        body: {
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        },
      }}
      footer={
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
          }}
        >
          <Popconfirm
            title="清空重置确认"
            description="确定要清空该车辆所有专属覆盖，完全恢复继承基准车型能力模板吗？"
            onConfirm={handleResetAll}
            okText="确认重置"
            cancelText="取消"
            disabled={!summary.hasOverrides}
          >
            <Button
              danger
              icon={<UndoOutlined />}
              disabled={!summary.hasOverrides}
              loading={resetting}
            >
              全部重置为继承车型模板
            </Button>
          </Popconfirm>

          <Space size="middle">
            <Button onClick={onClose}>取消</Button>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              onClick={handleSave}
            >
              保存单车覆盖配置
              {summary.hasDifferences ? ` (${summary.differsCount} 项差异)` : ''}
            </Button>
          </Space>
        </div>
      }
    >
      <Spin spinning={loading}>
        {/* KPI 覆盖状态汇总 Alert Banner */}
        {summary.hasOverrides ? (
          <Alert
            type={summary.hasDifferences ? 'warning' : 'info'}
            showIcon
            icon={summary.hasDifferences ? <WarningOutlined /> : <CheckCircleOutlined />}
            message={
              <Space size="middle">
                <Text strong>
                  当前车辆已配置 {summary.overriddenCount} 项专属覆盖规则
                  {summary.hasDifferences ? `，其中 ${summary.differsCount} 项与车型模板产生实际属性差异` : ''}
                </Text>
              </Space>
            }
            description={
              <div style={{ marginTop: 4, fontSize: 12 }}>
                当前生效规则：
                <Tag color={summary.disabledCount > 0 ? 'error' : 'default'} style={{ marginLeft: 4 }}>
                  禁用控车 {summary.disabledCount} 项
                </Tag>
                <Tag color="orange">
                  L2 深度鉴权 {summary.l2GuardedCount} 项
                </Tag>
                <Tag color="processing">
                  继承保持 {summary.totalCommands - summary.overriddenCount} 项
                </Tag>
              </div>
            }
            style={{ borderRadius: 6 }}
          />
        ) : (
          <Alert
            type="success"
            showIcon
            message="当前车辆完全继承基准车型模板"
            description="未配置单车专属覆盖规则，该车所有车控功能、安全等级、超时阈值与冷却频控完全由车型基准模板统一管控。"
            style={{ borderRadius: 6 }}
          />
        )}

        {/* 顶部快速分类与差异过滤栏 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
            marginTop: 12,
            marginBottom: 8,
          }}
        >
          <Segmented
            size="small"
            value={categoryFilter}
            onChange={(val) => setCategoryFilter(val as string)}
            options={[
              { label: '全量指令 (13)', value: 'ALL' },
              { label: '门锁车身 (4)', value: CommandCategory.DOOR_BODY },
              { label: '动力寻车 (3)', value: CommandCategory.POWER_FIND },
              { label: '座舱温控 (3)', value: CommandCategory.CABIN_CLIMATE },
              { label: '车窗天窗 (3)', value: CommandCategory.WINDOW_ROOF },
            ]}
          />

          <Space size="middle">
            <Tooltip title="快速过滤出相比基准车型模板发生实质参数变更的指令项">
              <Space size={6}>
                <Text style={{ fontSize: 12 }}>仅看差异项：</Text>
                <Switch
                  size="small"
                  checked={filterOnlyDiff}
                  onChange={setFilterOnlyDiff}
                  disabled={!summary.hasDifferences}
                />
              </Space>
            </Tooltip>
          </Space>
        </div>

        {/* 核心能力覆盖对照矩阵 Table */}
        <Table<VehicleEffectiveCommandItem>
          rowKey="commandCode"
          columns={columns}
          dataSource={displayRows}
          pagination={false}
          size="small"
          bordered
          scroll={{ x: 670 }}
          style={{ borderRadius: 6 }}
        />
      </Spin>
    </Drawer>
  );
};
