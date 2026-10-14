import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Card,
  Row,
  Col,
  Typography,
  Button,
  Space,
  Tag,
  Badge,
  Input,
  Select,
  Switch,
  InputNumber,
  Table,
  Modal,
  Form,
  Checkbox,
  Popconfirm,
  message,
  Segmented,
  Tooltip,
  Alert,
  Divider,
} from 'antd';
import type { TableProps } from 'antd';
import {
  PlusOutlined,
  CopyOutlined,
  SaveOutlined,
  ReloadOutlined,
  DiffOutlined,
  CheckOutlined,
  StopOutlined,
  SettingOutlined,
  SearchOutlined,
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
  SafetyCertificateOutlined,
  InfoCircleOutlined,
  ExclamationCircleOutlined,
  AppstoreOutlined,
  SlidersOutlined,
} from '@ant-design/icons';
import { CommandCode, SecurityLevel } from '@car-control/contracts';
import {
  CommandCategory,
  COMMAND_CATEGORY_MAP,
  getCategoryForCommand,
  validateTimeoutMs,
  validateFrequencyLimit,
  validateParamConstraints,
  calculateTemplateStats,
  diffCapabilityTemplates,
  createDefaultCapabilities,
  type CapabilityRule,
  type ModelTemplateDto,
  type CreateCapabilityTemplateInput,
  type PowertrainType,
  type TemplateDiffResult,
} from './capability-core.ts';
import { COMMAND_METADATA } from './command-core.ts';
import {
  fetchCapabilityTemplatesApi,
  updateCapabilityTemplateApi,
  createCapabilityTemplateApi,
  cloneCapabilityTemplateApi,
} from '../../api/capability.ts';

const { Title, Text, Paragraph } = Typography;

// 指令图标字典
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

// 动力类型元信息
const POWERTRAIN_META: Record<
  PowertrainType,
  { label: string; tagColor: string; color: string }
> = {
  EV: { label: '纯电动 (EV)', tagColor: 'green', color: '#52c41a' },
  PHEV: { label: '插电混动 (PHEV)', tagColor: 'blue', color: '#1677ff' },
  ICE: { label: '燃油 (ICE)', tagColor: 'default', color: '#8c8c8c' },
  REEV: { label: '增程式 (REEV)', tagColor: 'purple', color: '#722ed1' },
};

// 表格展示数据项
interface CapabilityTableRow {
  commandCode: CommandCode;
  commandName: string;
  category: CommandCategory;
  categoryLabel: string;
  categoryColor: string;
  categoryTagColor: string;
  rule: CapabilityRule;
}

export const CapabilityTemplateView: React.FC = () => {
  // 模板数据池与加载态
  const [templates, setTemplates] = useState<ModelTemplateDto[]>([]);
  const [activeTemplateId, setActiveTemplateId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // 本地当前编辑的规则字典
  const [editingCapabilities, setEditingCapabilities] = useState<
    Record<CommandCode, CapabilityRule>
  >({} as Record<CommandCode, CapabilityRule>);

  // 筛选与视图状态
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<string>('ALL');

  // 弹窗状态
  const [createModalVisible, setCreateModalVisible] = useState<boolean>(false);
  const [cloneModalVisible, setCloneModalVisible] = useState<boolean>(false);
  const [paramModalVisible, setParamModalVisible] = useState<boolean>(false);
  const [diffModalVisible, setDiffModalVisible] = useState<boolean>(false);

  // 当前正在配置参数约束的指令代码
  const [paramEditingCode, setParamEditingCode] = useState<CommandCode | null>(null);

  // 差异对比基准与目标选择
  const [diffTargetTemplateId, setDiffTargetTemplateId] = useState<string>('');

  // 表单实例
  const [createForm] = Form.useForm();
  const [cloneForm] = Form.useForm();
  const [paramForm] = Form.useForm();

  // 加载模板数据
  const loadTemplates = useCallback(async (selectId?: string) => {
    setLoading(true);
    try {
      const data = await fetchCapabilityTemplatesApi();
      setTemplates(data);
      if (data.length > 0) {
        const targetId = selectId || (data.some((d) => d.id === activeTemplateId) ? activeTemplateId : data[0]!.id);
        setActiveTemplateId(targetId);
        const current = data.find((d) => d.id === targetId) || data[0]!;
        setEditingCapabilities(JSON.parse(JSON.stringify(current.capabilities)));
      }
    } catch (err: any) {
      message.error(err?.message || '获取车型能力模板失败');
    } finally {
      setLoading(false);
    }
  }, [activeTemplateId]);

  useEffect(() => {
    loadTemplates();
  }, []);

  // 当前激活的模板实例
  const currentTemplate = useMemo(() => {
    return templates.find((t) => t.id === activeTemplateId) || null;
  }, [templates, activeTemplateId]);

  // 当切换选中模板时同步本地草稿
  const handleSelectTemplate = (id: string) => {
    const t = templates.find((item) => item.id === id);
    if (t) {
      setActiveTemplateId(id);
      setEditingCapabilities(JSON.parse(JSON.stringify(t.capabilities)));
    }
  };

  // 统计概览指标
  const stats = useMemo(() => {
    return calculateTemplateStats(templates);
  }, [templates]);

  // 过滤后的车型模板列表
  const filteredTemplates = useMemo(() => {
    if (!searchKeyword.trim()) return templates;
    const kw = searchKeyword.trim().toLowerCase();
    return templates.filter(
      (t) =>
        t.modelName.toLowerCase().includes(kw) ||
        t.protocolCode.toLowerCase().includes(kw) ||
        t.modelId.toLowerCase().includes(kw)
    );
  }, [templates, searchKeyword]);

  // 构建矩阵表格数据
  const tableData: CapabilityTableRow[] = useMemo(() => {
    if (!currentTemplate || !editingCapabilities) return [];

    const rows: CapabilityTableRow[] = [];
    const allCodes = Object.keys(COMMAND_METADATA) as CommandCode[];

    for (const code of allCodes) {
      const cat = getCategoryForCommand(code);
      if (selectedCategoryTab !== 'ALL' && cat !== selectedCategoryTab) {
        continue;
      }
      const catMeta = COMMAND_CATEGORY_MAP[cat];
      const meta = COMMAND_METADATA[code];
      const rule = editingCapabilities[code] || {
        supported: false,
        securityLevel: meta.securityLevel,
        timeoutMs: meta.defaultTimeoutMs,
        frequencyLimitSeconds: 5,
      };

      rows.push({
        commandCode: code,
        commandName: meta.name,
        category: cat,
        categoryLabel: catMeta.label,
        categoryColor: catMeta.color,
        categoryTagColor: catMeta.tagColor,
        rule,
      });
    }

    return rows;
  }, [currentTemplate, editingCapabilities, selectedCategoryTab]);

  // 修改单个指令的能力规则
  const updateRuleField = <K extends keyof CapabilityRule>(
    code: CommandCode,
    field: K,
    val: CapabilityRule[K]
  ) => {
    setEditingCapabilities((prev) => ({
      ...prev,
      [code]: {
        ...prev[code]!,
        [field]: val,
      },
    }));
  };

  // 保存当前模板修改
  const handleSaveCapabilities = async () => {
    if (!currentTemplate) return;

    // 校验所有规则参数范围
    for (const [codeStr, rule] of Object.entries(editingCapabilities)) {
      const code = codeStr as CommandCode;
      const tValidation = validateTimeoutMs(rule.timeoutMs);
      if (!tValidation.valid) {
        message.error(`指令【${COMMAND_METADATA[code]?.name}】: ${tValidation.message}`);
        return;
      }
      const fValidation = validateFrequencyLimit(rule.frequencyLimitSeconds);
      if (!fValidation.valid) {
        message.error(`指令【${COMMAND_METADATA[code]?.name}】: ${fValidation.message}`);
        return;
      }
      const pValidation = validateParamConstraints(code, rule.paramConstraints);
      if (!pValidation.valid) {
        message.error(`指令【${COMMAND_METADATA[code]?.name}】: ${pValidation.message}`);
        return;
      }
    }

    setSaving(true);
    try {
      const updated = await updateCapabilityTemplateApi(currentTemplate.id, editingCapabilities);
      message.success(`车型能力模板【${currentTemplate.modelName}】配置已成功保存！`);
      setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err: any) {
      message.error(err?.message || '保存失败，请检查网络或配置项');
    } finally {
      setSaving(false);
    }
  };

  // 一键全部启用
  const handleEnableAll = () => {
    setEditingCapabilities((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next) as CommandCode[]) {
        next[k] = { ...next[k]!, supported: true };
      }
      return next;
    });
    message.info('已将当前模板所有 13 类指令设为启用');
  };

  // 一键全部禁用
  const handleDisableAll = () => {
    setEditingCapabilities((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next) as CommandCode[]) {
        next[k] = { ...next[k]!, supported: false };
      }
      return next;
    });
    message.warning('已将当前模板所有指令设为禁用状态');
  };

  // 恢复出厂默认能力
  const handleResetToDefaults = () => {
    const defaults = createDefaultCapabilities();
    setEditingCapabilities(defaults);
    message.success('已恢复标准出厂默认能力规则，请点击【保存】使之生效');
  };

  // 打开参数配置弹窗
  const handleOpenParamModal = (code: CommandCode) => {
    setParamEditingCode(code);
    const rule = editingCapabilities[code];
    const constraints = (rule?.paramConstraints || {}) as Record<string, any>;

    if (code === CommandCode.CMD_AC_START) {
      paramForm.setFieldsValue({
        tempMin: constraints.tempMin ?? 16,
        tempMax: constraints.tempMax ?? 30,
        allowedModes: constraints.allowedModes ?? ['AUTO', 'COOL', 'HEAT', 'VENT'],
        allowedWindSpeeds: constraints.allowedWindSpeeds ?? [1, 2, 3, 4, 5],
      });
    } else if (code === CommandCode.CMD_ENGINE_START) {
      paramForm.setFieldsValue({
        durationMin: constraints.durationMin ?? 5,
        durationMax: constraints.durationMax ?? 45,
        durationStep: constraints.durationStep ?? 5,
      });
    } else if (code === CommandCode.CMD_SEAT_HEAT) {
      paramForm.setFieldsValue({
        maxLevels: constraints.maxLevels ?? 3,
        allowedPositions: constraints.allowedPositions ?? ['DRIVER', 'PASSENGER'],
      });
    }

    setParamModalVisible(true);
  };

  // 保存参数配置
  const handleSaveParams = () => {
    if (!paramEditingCode) return;
    paramForm.validateFields().then((values) => {
      const validation = validateParamConstraints(paramEditingCode, values);
      if (!validation.valid) {
        message.error(validation.message || '参数约束校验不通过');
        return;
      }

      updateRuleField(paramEditingCode, 'paramConstraints', values);
      setParamModalVisible(false);
      message.success(`【${COMMAND_METADATA[paramEditingCode].name}】专属参数约束已更新`);
    });
  };

  // 提交新建模板
  const handleCreateTemplate = async () => {
    try {
      const values = await createForm.validateFields();
      const res = await createCapabilityTemplateApi(values);
      message.success(`成功创建车型模板【${res.modelName}】`);
      setCreateModalVisible(false);
      createForm.resetFields();
      await loadTemplates(res.id);
    } catch (err: any) {
      message.error(err?.message || '新建模板失败');
    }
  };

  // 提交克隆模板
  const handleCloneTemplate = async () => {
    if (!currentTemplate) return;
    try {
      const values = await cloneForm.validateFields();
      const res = await cloneCapabilityTemplateApi(
        currentTemplate.id,
        values.targetModelId,
        values.targetModelName,
        values.targetProtocolCode,
        values.targetPowertrain
      );
      message.success(`成功克隆车型模板【${res.modelName}】`);
      setCloneModalVisible(false);
      cloneForm.resetFields();
      await loadTemplates(res.id);
    } catch (err: any) {
      message.error(err?.message || '克隆模板失败');
    }
  };

  // 差异对比计算
  const diffResult: TemplateDiffResult | null = useMemo(() => {
    if (!diffModalVisible || !currentTemplate || !diffTargetTemplateId) return null;
    const target = templates.find((t) => t.id === diffTargetTemplateId);
    if (!target) return null;

    // 比对当前草稿状态与目标模板
    const draftBase: ModelTemplateDto = {
      ...currentTemplate,
      capabilities: editingCapabilities,
    };
    return diffCapabilityTemplates(draftBase, target);
  }, [diffModalVisible, currentTemplate, diffTargetTemplateId, editingCapabilities, templates]);

  // 表格列定义
  const columns: TableProps<CapabilityTableRow>['columns'] = [
    {
      title: '指令信息与业务集群',
      dataIndex: 'commandCode',
      key: 'commandInfo',
      width: 260,
      render: (_, record) => {
        const icon = COMMAND_ICON_MAP[record.commandCode] || <CarOutlined />;
        const meta = COMMAND_METADATA[record.commandCode];
        return (
          <Space direction="vertical" size={2}>
            <Space align="center" size={8}>
              <Tag color={record.categoryTagColor} style={{ marginRight: 0 }}>
                {record.categoryLabel}
              </Tag>
              <span style={{ fontSize: 16, color: record.categoryColor }}>{icon}</span>
              <Text strong style={{ fontSize: 14 }}>
                {record.commandName}
              </Text>
            </Space>
            <Space size={6}>
              <Text code style={{ fontSize: 11, color: 'rgba(0,0,0,0.65)' }}>
                {record.commandCode}
              </Text>
              <Tooltip title={meta?.description}>
                <InfoCircleOutlined style={{ color: 'rgba(0,0,0,0.35)', fontSize: 12, cursor: 'help' }} />
              </Tooltip>
            </Space>
          </Space>
        );
      },
    },
    {
      title: '指令支持状态',
      dataIndex: ['rule', 'supported'],
      key: 'supported',
      width: 140,
      render: (_, record) => (
        <Space align="center" size={10}>
          <Switch
            checked={record.rule.supported}
            onChange={(checked) => updateRuleField(record.commandCode, 'supported', checked)}
            checkedChildren="启用"
            unCheckedChildren="禁用"
          />
          <Badge
            status={record.rule.supported ? 'success' : 'default'}
            text={
              <Text type={record.rule.supported ? undefined : 'secondary'} style={{ fontSize: 12 }}>
                {record.rule.supported ? '支持控车' : '硬件不支持'}
              </Text>
            }
          />
        </Space>
      ),
    },
    {
      title: '安全防护等级',
      dataIndex: ['rule', 'securityLevel'],
      key: 'securityLevel',
      width: 170,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Select
            size="small"
            style={{ width: 140 }}
            value={record.rule.securityLevel}
            disabled={!record.rule.supported}
            onChange={(val) => updateRuleField(record.commandCode, 'securityLevel', val)}
            options={[
              { label: 'L0 · 普通无感', value: SecurityLevel.L0 },
              { label: 'L1 · 二次确认', value: SecurityLevel.L1 },
              { label: 'L2 · 强安全码', value: SecurityLevel.L2 },
            ]}
          />
          {record.rule.securityLevel === SecurityLevel.L2 && (
            <Tag color="error" style={{ fontSize: 11, marginRight: 0 }}>
              <SafetyCertificateOutlined /> 强制6位安全码
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: '响应超时阈值',
      dataIndex: ['rule', 'timeoutMs'],
      key: 'timeoutMs',
      width: 160,
      render: (_, record) => (
        <InputNumber
          size="small"
          min={3000}
          max={60000}
          step={1000}
          addonAfter="ms"
          style={{ width: 130 }}
          value={record.rule.timeoutMs}
          disabled={!record.rule.supported}
          onChange={(val) => {
            if (val !== null) updateRuleField(record.commandCode, 'timeoutMs', val);
          }}
        />
      ),
    },
    {
      title: '冷却频控限制',
      dataIndex: ['rule', 'frequencyLimitSeconds'],
      key: 'frequencyLimitSeconds',
      width: 150,
      render: (_, record) => (
        <InputNumber
          size="small"
          min={0}
          max={300}
          step={1}
          addonAfter="s"
          style={{ width: 120 }}
          value={record.rule.frequencyLimitSeconds}
          disabled={!record.rule.supported}
          onChange={(val) => {
            if (val !== null) updateRuleField(record.commandCode, 'frequencyLimitSeconds', val);
          }}
        />
      ),
    },
    {
      title: '专属参数 Schema 约束',
      key: 'paramConstraints',
      render: (_, record) => {
        const hasSchema = [
          CommandCode.CMD_AC_START,
          CommandCode.CMD_ENGINE_START,
          CommandCode.CMD_SEAT_HEAT,
        ].includes(record.commandCode);

        if (!hasSchema) {
          return <Text type="secondary" style={{ fontSize: 12 }}>标准固定指令（无动态参数约束）</Text>;
        }

        const constraints = (record.rule.paramConstraints || {}) as Record<string, any>;
        let summaryText = '默认约束参数';

        if (record.commandCode === CommandCode.CMD_AC_START) {
          summaryText = `温控 ${constraints.tempMin ?? 16}~${constraints.tempMax ?? 30}℃ · ${(constraints.allowedWindSpeeds ?? [1, 2, 3]).length}档风速`;
        } else if (record.commandCode === CommandCode.CMD_ENGINE_START) {
          summaryText = `时长 ${constraints.durationMin ?? 5}~${constraints.durationMax ?? 45}分 · 步长${constraints.durationStep ?? 5}分`;
        } else if (record.commandCode === CommandCode.CMD_SEAT_HEAT) {
          summaryText = `最高支持 ${constraints.maxLevels ?? 3} 档加热`;
        }

        return (
          <Space align="center" size={8}>
            <Tag color="cyan" style={{ fontSize: 12, padding: '2px 8px' }}>
              {summaryText}
            </Tag>
            <Button
              type="link"
              size="small"
              icon={<SlidersOutlined />}
              disabled={!record.rule.supported}
              onClick={() => handleOpenParamModal(record.commandCode)}
            >
              配置参数
            </Button>
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 4 大核心统计 KPI 看板卡片 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card styles={{ body: { padding: '16px 20px' } }} style={{ borderRadius: 8 }}>
            <Text type="secondary" style={{ fontSize: 13 }}>车型能力模板总数</Text>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#1677ff', marginTop: 4 }}>
              {stats.totalTemplates} <span style={{ fontSize: 14, fontWeight: 'normal', color: 'rgba(0,0,0,0.45)' }}>套</span>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(0,0,0,0.65)' }}>
              纯电 {stats.powertrainCounts.EV} · 混动 {stats.powertrainCounts.PHEV} · 燃油 {stats.powertrainCounts.ICE} · 增程 {stats.powertrainCounts.REEV}
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card styles={{ body: { padding: '16px 20px' } }} style={{ borderRadius: 8 }}>
            <Text type="secondary" style={{ fontSize: 13 }}>平均指令覆盖完备率</Text>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#52c41a', marginTop: 4 }}>
              {stats.averageCoveragePercent}%
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(0,0,0,0.65)' }}>
              覆盖 13 类业务指令集标准定义
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card styles={{ body: { padding: '16px 20px' } }} style={{ borderRadius: 8 }}>
            <Text type="secondary" style={{ fontSize: 13 }}>L2 强安全高危门禁数</Text>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#cf1322', marginTop: 4 }}>
              {stats.l2GuardedCount} <span style={{ fontSize: 14, fontWeight: 'normal', color: 'rgba(0,0,0,0.45)' }}>项</span>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(0,0,0,0.65)' }}>
              远程点火/熄火强制校验 6 位安全码
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card styles={{ body: { padding: '16px 20px' } }} style={{ borderRadius: 8 }}>
            <Text type="secondary" style={{ fontSize: 13 }}>专属参数约束配置模板</Text>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#722ed1', marginTop: 4 }}>
              {stats.customizedRulesCount} <span style={{ fontSize: 14, fontWeight: 'normal', color: 'rgba(0,0,0,0.45)' }}>款</span>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(0,0,0,0.65)' }}>
              具备温控区间、档位等专属约束
            </div>
          </Card>
        </Col>
      </Row>

      {/* 主工作台：Master 模板列表 + Detail 规则配置矩阵 */}
      <Row gutter={[16, 16]}>
        {/* 左栏 Master：车型模板选择列表 */}
        <Col xs={24} lg={7} xl={6}>
          <Card
            title={
              <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
                <Space align="center">
                  <AppstoreOutlined style={{ color: '#1677ff' }} />
                  <span>车型模板选择</span>
                </Space>
                <Button
                  type="primary"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => setCreateModalVisible(true)}
                >
                  新建
                </Button>
              </Space>
            }
            styles={{ body: { padding: '12px' } }}
            style={{ borderRadius: 8, height: '100%' }}
          >
            {/* 快速搜索框 */}
            <Input
              prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,0.35)' }} />}
              placeholder="搜索车型名称或 0x02 代号..."
              allowClear
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              style={{ marginBottom: 12 }}
            />

            {/* 模板列表 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 600, overflowY: 'auto' }}>
              {filteredTemplates.map((item) => {
                const isSelected = item.id === activeTemplateId;
                const supportedCount = Object.values(item.capabilities).filter((c) => c.supported).length;
                const pMeta = POWERTRAIN_META[item.powertrain];

                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelectTemplate(item.id)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 8,
                      cursor: 'pointer',
                      border: isSelected ? '1px solid #1677ff' : '1px solid #f0f0f0',
                      backgroundColor: isSelected ? '#e6f4ff' : '#ffffff',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text strong style={{ fontSize: 14, color: isSelected ? '#1677ff' : undefined }}>
                        {item.modelName}
                      </Text>
                      <Tag color={pMeta?.tagColor || 'default'} style={{ marginRight: 0, fontSize: 11 }}>
                        {item.powertrain}
                      </Tag>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                      <Text code style={{ fontSize: 12 }}>
                        {item.protocolCode}
                      </Text>
                      <Badge
                        status={supportedCount === 13 ? 'success' : supportedCount >= 10 ? 'processing' : 'warning'}
                        text={
                          <span style={{ fontSize: 12, fontWeight: 500 }}>
                            {supportedCount}/13 项支持
                          </span>
                        }
                      />
                    </div>
                  </div>
                );
              })}

              {filteredTemplates.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'rgba(0,0,0,0.45)' }}>
                  未检索到匹配的车型模板
                </div>
              )}
            </div>
          </Card>
        </Col>

        {/* 右栏 Detail：当前选中模板的能力矩阵配置 */}
        <Col xs={24} lg={17} xl={18}>
          <Card
            styles={{ body: { padding: '20px' } }}
            style={{ borderRadius: 8 }}
            loading={loading}
          >
            {currentTemplate ? (
              <div>
                {/* 顶部车型信息标头栏 */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                    paddingBottom: 16,
                    borderBottom: '1px solid #f0f0f0',
                  }}
                >
                  <Space direction="vertical" size={4}>
                    <Space align="center" size={10}>
                      <Title level={4} style={{ margin: 0 }}>
                        {currentTemplate.modelName}
                      </Title>
                      <Tag color="blue" style={{ fontSize: 12 }}>
                        协议代号 0x02: {currentTemplate.protocolCode}
                      </Tag>
                      <Tag color={POWERTRAIN_META[currentTemplate.powertrain]?.tagColor}>
                        {POWERTRAIN_META[currentTemplate.powertrain]?.label}
                      </Tag>
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {currentTemplate.description || '暂无详细描述'} · 最后修订: {currentTemplate.updatedAt}
                    </Text>
                  </Space>

                  <Space size={8}>
                    <Button
                      icon={<CopyOutlined />}
                      onClick={() => {
                        cloneForm.setFieldsValue({
                          targetPowertrain: currentTemplate.powertrain,
                        });
                        setCloneModalVisible(true);
                      }}
                    >
                      克隆复制此模板
                    </Button>
                    <Button
                      icon={<DiffOutlined />}
                      onClick={() => {
                        const other = templates.find((t) => t.id !== currentTemplate.id);
                        if (other) setDiffTargetTemplateId(other.id);
                        setDiffModalVisible(true);
                      }}
                    >
                      差异比对
                    </Button>
                    <Button
                      type="primary"
                      icon={<SaveOutlined />}
                      loading={saving}
                      onClick={handleSaveCapabilities}
                    >
                      保存能力配置
                    </Button>
                  </Space>
                </div>

                {/* 分类快捷标签栏 */}
                <div style={{ margin: '16px 0' }}>
                  <Segmented
                    value={selectedCategoryTab}
                    onChange={(val) => setSelectedCategoryTab(val as string)}
                    options={[
                      { label: '全部指令 (13)', value: 'ALL' },
                      { label: '车门与车身 (4)', value: CommandCategory.DOOR_BODY },
                      { label: '动力与寻车 (3)', value: CommandCategory.POWER_FIND },
                      { label: '座舱温控 (3)', value: CommandCategory.CABIN_CLIMATE },
                      { label: '车窗天窗 (3)', value: CommandCategory.WINDOW_ROOF },
                    ]}
                  />
                </div>

                {/* 主控能力配置矩阵表格 */}
                <Table<CapabilityTableRow>
                  rowKey="commandCode"
                  columns={columns}
                  dataSource={tableData}
                  pagination={false}
                  size="middle"
                  style={{ marginBottom: 16 }}
                />

                {/* 底部快速批量操作栏 */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    backgroundColor: '#fafafa',
                    borderRadius: 6,
                    border: '1px solid #f0f0f0',
                  }}
                >
                  <Space size={8}>
                    <Button size="small" icon={<CheckOutlined />} onClick={handleEnableAll}>
                      一键全部启用
                    </Button>
                    <Button size="small" danger icon={<StopOutlined />} onClick={handleDisableAll}>
                      一键全部禁用
                    </Button>
                    <Popconfirm
                      title="确认恢复出厂默认能力吗？"
                      description="将覆盖当前页面所有未保存的自定义参数与超时配置"
                      okText="确认恢复"
                      cancelText="取消"
                      onConfirm={handleResetToDefaults}
                    >
                      <Button size="small" icon={<ReloadOutlined />}>
                        恢复出厂默认
                      </Button>
                    </Popconfirm>
                  </Space>

                  <Space size={12}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      已启用 {Object.values(editingCapabilities).filter((c) => c.supported).length} / 13 项能力
                    </Text>
                    <Button
                      type="primary"
                      icon={<SaveOutlined />}
                      loading={saving}
                      onClick={handleSaveCapabilities}
                    >
                      保存能力配置
                    </Button>
                  </Space>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(0,0,0,0.45)' }}>
                请在左侧选择需要配置的车型模板
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* 模态框 1：新建车型能力模板 */}
      <Modal
        title="新建车型能力模板"
        open={createModalVisible}
        onOk={handleCreateTemplate}
        onCancel={() => {
          setCreateModalVisible(false);
          createForm.resetFields();
        }}
        okText="立即创建"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" initialValues={{ powertrain: 'EV' }}>
          <Form.Item
            name="modelId"
            label="车型唯一标识符 (Model ID)"
            rules={[{ required: true, message: '请输入车型英文标识 (如 model-zeekr-x)' }]}
          >
            <Input placeholder="例如: model-zeekr-x" />
          </Form.Item>

          <Form.Item
            name="modelName"
            label="车型名称"
            rules={[{ required: true, message: '请输入车型中文显示名称' }]}
          >
            <Input placeholder="例如: 极氪 X 旗舰四驱版" />
          </Form.Item>

          <Form.Item
            name="protocolCode"
            label="通讯协议 0x02 车型代号"
            rules={[
              { required: true, message: '请输入 0x 开头的 4 位十六进制代号 (如 0x0105)' },
              {
                pattern: /^0x[0-9a-fA-F]{4}$/,
                message: '必须以 0x 开头后跟 4 位 16 进制字符 (如 0x0105)',
              },
            ]}
          >
            <Input placeholder="例如: 0x0105" />
          </Form.Item>

          <Form.Item
            name="powertrain"
            label="动力总成类型"
            rules={[{ required: true, message: '请选择动力类型' }]}
          >
            <Select
              options={[
                { label: '纯电动 (EV)', value: 'EV' },
                { label: '插电混动 (PHEV)', value: 'PHEV' },
                { label: '燃油 (ICE)', value: 'ICE' },
                { label: '增程式 (REEV)', value: 'REEV' },
              ]}
            />
          </Form.Item>

          <Form.Item name="baseTemplateId" label="继承基准模板 (可选)">
            <Select
              allowClear
              placeholder="选择已有模板快速复制初始能力矩阵"
              options={templates.map((t) => ({
                label: `${t.modelName} (${t.protocolCode})`,
                value: t.id,
              }))}
            />
          </Form.Item>

          <Form.Item name="description" label="模板说明">
            <Input.TextArea rows={2} placeholder="简要说明此车型的配置特点及硬件搭载情况" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 模态框 2：克隆车型能力模板 */}
      <Modal
        title={`克隆复制模板: ${currentTemplate?.modelName}`}
        open={cloneModalVisible}
        onOk={handleCloneTemplate}
        onCancel={() => {
          setCloneModalVisible(false);
          cloneForm.resetFields();
        }}
        okText="确认克隆"
        cancelText="取消"
        destroyOnClose
      >
        <Alert
          type="info"
          showIcon
          message="基于源模板的能力矩阵深度克隆"
          description={`将完整复制【${currentTemplate?.modelName}】包含的全部指令开启状态、安全等级、超时阈值及专属参数约束，并绑定至新车型。`}
          style={{ marginBottom: 16 }}
        />
        <Form form={cloneForm} layout="vertical">
          <Form.Item
            name="targetModelId"
            label="目标车型唯一标识符 (Model ID)"
            rules={[{ required: true, message: '请输入目标车型英文标识' }]}
          >
            <Input placeholder="例如: model-zeekr-007" />
          </Form.Item>

          <Form.Item
            name="targetModelName"
            label="目标车型名称"
            rules={[{ required: true, message: '请输入目标车型中文名称' }]}
          >
            <Input placeholder="例如: 极氪 007 智驾版" />
          </Form.Item>

          <Form.Item
            name="targetProtocolCode"
            label="目标车型 0x02 协议代号"
            rules={[
              { required: true, message: '请输入 0x 开头的 4 位十六进制代号' },
              {
                pattern: /^0x[0-9a-fA-F]{4}$/,
                message: '必须以 0x 开头后跟 4 位 16 进制字符 (如 0x0106)',
              },
            ]}
          >
            <Input placeholder="例如: 0x0106" />
          </Form.Item>

          <Form.Item
            name="targetPowertrain"
            label="动力总成类型"
            rules={[{ required: true, message: '请选择动力类型' }]}
          >
            <Select
              options={[
                { label: '纯电动 (EV)', value: 'EV' },
                { label: '插电混动 (PHEV)', value: 'PHEV' },
                { label: '燃油 (ICE)', value: 'ICE' },
                { label: '增程式 (REEV)', value: 'REEV' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 模态框 3：专属参数 Schema 约束配置 */}
      <Modal
        title={`专属参数约束配置: ${paramEditingCode ? COMMAND_METADATA[paramEditingCode]?.name : ''}`}
        open={paramModalVisible}
        onOk={handleSaveParams}
        onCancel={() => setParamModalVisible(false)}
        okText="保存参数约束"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={paramForm} layout="vertical">
          {paramEditingCode === CommandCode.CMD_AC_START && (
            <>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item
                    name="tempMin"
                    label="最低可调节温度 (℃)"
                    rules={[{ required: true, message: '请输入最低温度' }]}
                  >
                    <InputNumber min={16} max={32} step={0.5} style={{ width: '100%' }} addonAfter="℃" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="tempMax"
                    label="最高可调节温度 (℃)"
                    rules={[{ required: true, message: '请输入最高温度' }]}
                  >
                    <InputNumber min={16} max={32} step={0.5} style={{ width: '100%' }} addonAfter="℃" />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item
                name="allowedModes"
                label="允许的工作模式"
                rules={[{ required: true, message: '请至少勾选一种工作模式' }]}
              >
                <Checkbox.Group
                  options={[
                    { label: '自动 (AUTO)', value: 'AUTO' },
                    { label: '制冷 (COOL)', value: 'COOL' },
                    { label: '制热 (HEAT)', value: 'HEAT' },
                    { label: '通风 (VENT)', value: 'VENT' },
                  ]}
                />
              </Form.Item>

              <Form.Item
                name="allowedWindSpeeds"
                label="支持的风速档位"
                rules={[{ required: true, message: '请至少勾选一个风速档位' }]}
              >
                <Checkbox.Group
                  options={[
                    { label: '1 档', value: 1 },
                    { label: '2 档', value: 2 },
                    { label: '3 档', value: 3 },
                    { label: '4 档', value: 4 },
                    { label: '5 档', value: 5 },
                  ]}
                />
              </Form.Item>
            </>
          )}

          {paramEditingCode === CommandCode.CMD_ENGINE_START && (
            <>
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item
                    name="durationMin"
                    label="点火最短运行时长 (分钟)"
                    rules={[{ required: true, message: '请输入点火最短时长' }]}
                  >
                    <InputNumber min={1} max={60} style={{ width: '100%' }} addonAfter="分钟" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="durationMax"
                    label="点火最长运行时长 (分钟)"
                    rules={[{ required: true, message: '请输入点火最长时长' }]}
                  >
                    <InputNumber min={1} max={60} style={{ width: '100%' }} addonAfter="分钟" />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item
                name="durationStep"
                label="运行时长调节步长 (分钟)"
                rules={[{ required: true, message: '请输入调节步长' }]}
              >
                <InputNumber min={1} max={15} style={{ width: '100%' }} addonAfter="分钟" />
              </Form.Item>
            </>
          )}

          {paramEditingCode === CommandCode.CMD_SEAT_HEAT && (
            <>
              <Form.Item
                name="maxLevels"
                label="最高加热档位"
                rules={[{ required: true, message: '请输入最高档位' }]}
              >
                <InputNumber min={1} max={5} style={{ width: '100%' }} addonAfter="档" />
              </Form.Item>

              <Form.Item
                name="allowedPositions"
                label="支持加热的座椅位置"
                rules={[{ required: true, message: '请至少选择一个位置' }]}
              >
                <Checkbox.Group
                  options={[
                    { label: '主驾驶座椅', value: 'DRIVER' },
                    { label: '副驾驶座椅', value: 'PASSENGER' },
                  ]}
                />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>

      {/* 模态框 4：模板差异比对 (TemplateDiffModal) */}
      <Modal
        title="车型模板能力差异比对 (Diff Viewer)"
        open={diffModalVisible}
        onCancel={() => setDiffModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDiffModalVisible(false)}>
            关闭
          </Button>,
        ]}
        width={800}
        destroyOnClose
      >
        <div style={{ marginBottom: 16 }}>
          <Space align="center" size={12}>
            <Text strong>基准模板 (当前编辑):</Text>
            <Tag color="blue">{currentTemplate?.modelName} ({currentTemplate?.protocolCode})</Tag>
            <span style={{ color: 'rgba(0,0,0,0.35)' }}>VS</span>
            <Text strong>对比目标模板:</Text>
            <Select
              style={{ width: 260 }}
              value={diffTargetTemplateId}
              onChange={(val) => setDiffTargetTemplateId(val)}
              options={templates
                .filter((t) => t.id !== currentTemplate?.id)
                .map((t) => ({
                  label: `${t.modelName} (${t.protocolCode})`,
                  value: t.id,
                }))}
            />
          </Space>
        </div>

        {diffResult ? (
          <div>
            <Alert
              type={diffResult.hasDifferences ? 'warning' : 'success'}
              showIcon
              message={
                diffResult.hasDifferences
                  ? `共检测到 ${diffResult.diffs.length} 项指令存在配置差异 (涉及 ${diffResult.totalChanges} 处属性变更)`
                  : '两套车型能力模板在 13 项指令上配置完全一致'
              }
              style={{ marginBottom: 16 }}
            />

            {diffResult.hasDifferences && (
              <Table
                rowKey="commandCode"
                pagination={false}
                size="small"
                dataSource={diffResult.diffs}
                columns={[
                  {
                    title: '指令名称',
                    dataIndex: 'commandCode',
                    render: (code: CommandCode) => (
                      <Space>
                        <Text strong>{COMMAND_METADATA[code]?.name}</Text>
                        <Text code style={{ fontSize: 11 }}>{code}</Text>
                      </Space>
                    ),
                  },
                  {
                    title: `基准: ${diffResult.baseModelName}`,
                    dataIndex: 'baseRule',
                    render: (r: CapabilityRule) => (
                      <Space direction="vertical" size={2}>
                        <Tag color={r.supported ? 'green' : 'default'}>
                          {r.supported ? '支持' : '不支持'}
                        </Tag>
                        <Text style={{ fontSize: 11 }}>等级: {r.securityLevel} · 超时: {r.timeoutMs}ms · 频控: {r.frequencyLimitSeconds}s</Text>
                      </Space>
                    ),
                  },
                  {
                    title: `目标: ${diffResult.targetModelName}`,
                    dataIndex: 'targetRule',
                    render: (r: CapabilityRule) => (
                      <Space direction="vertical" size={2}>
                        <Tag color={r.supported ? 'green' : 'default'}>
                          {r.supported ? '支持' : '不支持'}
                        </Tag>
                        <Text style={{ fontSize: 11 }}>等级: {r.securityLevel} · 超时: {r.timeoutMs}ms · 频控: {r.frequencyLimitSeconds}s</Text>
                      </Space>
                    ),
                  },
                  {
                    title: '差异属性',
                    dataIndex: 'changes',
                    render: (changes: string[]) => (
                      <Space wrap size={4}>
                        {changes.map((c) => (
                          <Tag color="orange" key={c} style={{ fontSize: 11 }}>
                            {c === 'supported'
                              ? '开启状态'
                              : c === 'securityLevel'
                              ? '安全等级'
                              : c === 'timeoutMs'
                              ? '超时阈值'
                              : c === 'frequencyLimitSeconds'
                              ? '冷却频控'
                              : '参数约束'}
                          </Tag>
                        ))}
                      </Space>
                    ),
                  },
                ]}
              />
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '30px 0', color: 'rgba(0,0,0,0.45)' }}>
            请选择需要对比的目标车型模板
          </div>
        )}
      </Modal>
    </div>
  );
};
