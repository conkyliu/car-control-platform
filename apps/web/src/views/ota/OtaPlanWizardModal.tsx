import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Modal,
  Steps,
  Form,
  Input,
  Select,
  Radio,
  Slider,
  InputNumber,
  Switch,
  Table,
  Tag,
  Badge,
  Card,
  Row,
  Col,
  Space,
  Typography,
  Alert,
  Descriptions,
  Checkbox,
  Button,
  DatePicker,
  Tooltip,
  Progress,
  message,
} from 'antd';
import type { TableColumnsType } from 'antd';
import {
  RocketOutlined,
  SafetyCertificateOutlined,
  CarOutlined,
  CheckCircleOutlined,
  ThunderboltOutlined,
  WifiOutlined,
  ControlOutlined,
  AlertOutlined,
  InfoCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import {
  UpgradeMode,
  ScheduleType,
  type OtaSafetyPreconditions,
  type OtaExecutionConfig,
  type OtaPlanDto,
  type CreateOtaPlanInput,
  UPGRADE_MODE_METADATA,
  SCHEDULE_TYPE_METADATA,
  validatePlanBasicInfo,
  validateSafetyPreconditions,
  validateExecutionConfig,
  isVehicleModelCompatible,
  filterEligibleVehicles,
} from './ota-plan-core.ts';
import {
  FirmwareType,
  FirmwareStatus,
  type FirmwarePackageDto,
  FIRMWARE_TYPE_METADATA,
  SUPPORTED_VEHICLE_MODELS,
} from './firmware-core.ts';
import { fetchFirmwarePackagesApi } from '../../api/firmware.ts';
import { fetchVehiclesApi, type VehicleDto } from '../../api/vehicle.ts';
import { createOtaPlanApi } from '../../api/ota-plan.ts';
import { SEED_PROJECTS } from '../device/device-core.ts';

const { Text, Title, Paragraph } = Typography;
const { RangePicker } = DatePicker;

export interface OtaPlanWizardModalProps {
  open: boolean;
  onCancel: () => void;
  onSuccess: (plan: OtaPlanDto) => void;
  preselectedFirmwareId?: string | null;
}

/**
 * 固件类型彩色标签渲染器
 */
const renderFirmwareTypeTag = (type: FirmwareType) => {
  const meta = FIRMWARE_TYPE_METADATA[type];
  if (!meta) return <Tag>{type}</Tag>;
  return (
    <Tag color={meta.tagColor} style={{ fontWeight: 500, margin: 0 }}>
      {meta.label.split(' ')[0]}
    </Tag>
  );
};

export const OtaPlanWizardModal: React.FC<OtaPlanWizardModalProps> = ({
  open,
  onCancel,
  onSuccess,
  preselectedFirmwareId,
}) => {
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // 固件与车辆数据源
  const [firmwares, setFirmwares] = useState<FirmwarePackageDto[]>([]);
  const [vehicles, setVehicles] = useState<VehicleDto[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(false);

  // Step 1: 基础信息与固件选择
  const [planName, setPlanName] = useState<string>('');
  const [selectedFirmwareType, setSelectedFirmwareType] = useState<string>('ALL');
  const [selectedFirmwareId, setSelectedFirmwareId] = useState<string>('');

  // Step 2: 升级策略与安全门禁
  const [upgradeMode, setUpgradeMode] = useState<UpgradeMode>(UpgradeMode.SILENT);
  const [minBatterySoc, setMinBatterySoc] = useState<number>(30);
  const [requireStationary, setRequireStationary] = useState<boolean>(true);
  const [requireNotCharging, setRequireNotCharging] = useState<boolean>(true);
  const [downloadTimeoutMin, setDownloadTimeoutMin] = useState<number>(30);
  const [installTimeoutMin, setInstallTimeoutMin] = useState<number>(45);
  const [maxRetries, setMaxRetries] = useState<number>(2);
  const [failureThresholdPercent, setFailureThresholdPercent] = useState<number>(5);

  // Step 3: 目标车辆筛选
  const [vehicleProjectFilter, setVehicleProjectFilter] = useState<string>('ALL');
  const [vehicleModelFilter, setVehicleModelFilter] = useState<string>('ALL');
  const [vehicleKeyword, setVehicleKeyword] = useState<string>('');
  const [onlyOnlineVehicles, setOnlyOnlineVehicles] = useState<boolean>(false);
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([]);

  // Step 4: 计划确认与下发
  const [scheduleType, setScheduleType] = useState<ScheduleType>(ScheduleType.IMMEDIATE);
  const [scheduleTimeRange, setScheduleTimeRange] = useState<[string, string] | null>(null);
  const [safetyConfirmed, setSafetyConfirmed] = useState<boolean>(false);

  // 加载固件与车辆列表
  const loadData = useCallback(async () => {
    setLoadingData(true);
    try {
      const [fwList, vList] = await Promise.all([
        fetchFirmwarePackagesApi(),
        fetchVehiclesApi(),
      ]);
      setFirmwares(fwList);
      setVehicles(vList);
    } catch {
      message.error('加载固件或车辆列表数据失败');
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadData();
      setCurrentStep(0);
      setSubmitting(false);
      setSafetyConfirmed(false);
      setScheduleType(ScheduleType.IMMEDIATE);
      setScheduleTimeRange(null);
      setMinBatterySoc(30);
      setRequireStationary(true);
      setRequireNotCharging(true);
      setDownloadTimeoutMin(30);
      setInstallTimeoutMin(45);
      setMaxRetries(2);
      setFailureThresholdPercent(5);
      setSelectedVehicleIds([]);
      setVehicleProjectFilter('ALL');
      setVehicleModelFilter('ALL');
      setVehicleKeyword('');
      setOnlyOnlineVehicles(false);

      if (preselectedFirmwareId) {
        setSelectedFirmwareId(preselectedFirmwareId);
      } else {
        setSelectedFirmwareId('');
      }
    }
  }, [open, preselectedFirmwareId, loadData]);

  // 当固件列表加载完成且有预选时同步
  useEffect(() => {
    if (preselectedFirmwareId && firmwares.length > 0) {
      const found = firmwares.find((f) => f.id === preselectedFirmwareId);
      if (found) {
        setSelectedFirmwareId(found.id);
        setSelectedFirmwareType(found.firmwareType);
        if (!planName) {
          setPlanName(`${found.name} (${found.version}) 批量升级任务`);
        }
      }
    }
  }, [preselectedFirmwareId, firmwares, planName]);

  // 过滤后的已发布固件列表 (仅已发布固件可作为升级目标)
  const publishedFirmwares = useMemo(() => {
    return firmwares.filter((f) => {
      if (f.status !== FirmwareStatus.PUBLISHED) return false;
      if (selectedFirmwareType !== 'ALL' && f.firmwareType !== selectedFirmwareType) return false;
      return true;
    });
  }, [firmwares, selectedFirmwareType]);

  // 当前选中的固件对象
  const activeFirmware = useMemo(() => {
    return firmwares.find((f) => f.id === selectedFirmwareId) || null;
  }, [firmwares, selectedFirmwareId]);

  // 适用车辆过滤列表
  const displayedVehicles = useMemo(() => {
    if (!activeFirmware) return [];
    return filterEligibleVehicles(vehicles, activeFirmware, {
      projectId: vehicleProjectFilter,
      modelId: vehicleModelFilter,
      keyword: vehicleKeyword,
      onlyOnline: onlyOnlineVehicles,
    });
  }, [
    vehicles,
    activeFirmware,
    vehicleProjectFilter,
    vehicleModelFilter,
    vehicleKeyword,
    onlyOnlineVehicles,
  ]);

  // 统计已选车辆中的在线与电量指标
  const selectionStats = useMemo(() => {
    const selectedVehicles = vehicles.filter((v) => selectedVehicleIds.includes(v.id));
    const onlineCount = selectedVehicles.filter(
      (v) => v.deviceOnlineStatus === 'ONLINE'
    ).length;
    const batteryEligibleCount = selectedVehicles.filter(
      (v) => (v.telemetry?.fuelOrBatteryLevel ?? 0) >= minBatterySoc
    ).length;
    const incompatibleVehicles = activeFirmware
      ? selectedVehicles.filter((v) => !isVehicleModelCompatible(v, activeFirmware))
      : [];

    return {
      totalSelected: selectedVehicles.length,
      onlineCount,
      batteryEligibleCount,
      incompatibleCount: incompatibleVehicles.length,
      incompatibleVehicles,
    };
  }, [vehicles, selectedVehicleIds, minBatterySoc, activeFirmware]);

  // 步骤切换校验守卫
  const handleNext = () => {
    if (currentStep === 0) {
      const basicCheck = validatePlanBasicInfo({
        name: planName,
        firmware: activeFirmware,
      });
      if (!basicCheck.valid) {
        const firstErr = Object.values(basicCheck.errors)[0];
        message.warning(firstErr);
        return;
      }
    }

    if (currentStep === 1) {
      const safetyCheck = validateSafetyPreconditions({
        minBatterySoc,
        requireStationary,
        requireNotCharging,
      });
      if (!safetyCheck.valid) {
        const firstErr = Object.values(safetyCheck.errors)[0];
        message.warning(firstErr);
        return;
      }

      const cfgCheck = validateExecutionConfig({
        downloadTimeoutMin,
        installTimeoutMin,
        maxRetries,
        failureThresholdPercent,
      });
      if (!cfgCheck.valid) {
        const firstErr = Object.values(cfgCheck.errors)[0];
        message.warning(firstErr);
        return;
      }
    }

    if (currentStep === 2) {
      if (selectedVehicleIds.length === 0) {
        message.warning('请至少勾选一台目标升级车辆');
        return;
      }
    }

    setCurrentStep((prev) => Math.min(prev + 1, 3));
  };

  const handlePrev = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  // 提交并创建计划
  const handleCreatePlan = async () => {
    if (!safetyConfirmed) {
      message.warning('请阅读并勾选安全操作责任声明后方可确认下发');
      return;
    }

    if (!activeFirmware) {
      message.error('目标固件包不存在');
      return;
    }

    setSubmitting(true);
    try {
      const payload: CreateOtaPlanInput = {
        name: planName.trim(),
        firmwareId: activeFirmware.id,
        upgradeMode,
        scheduleType,
        scheduledStartTime: scheduleTimeRange ? scheduleTimeRange[0] : undefined,
        scheduledEndTime: scheduleTimeRange ? scheduleTimeRange[1] : undefined,
        safetyPreconditions: {
          minBatterySoc,
          requireStationary,
          requireNotCharging,
        },
        executionConfig: {
          downloadTimeoutMin,
          installTimeoutMin,
          maxRetries,
          failureThresholdPercent,
        },
        targetVehicleIds: selectedVehicleIds,
        createdBy: '系统管理员_当前账号',
      };

      const created = await createOtaPlanApi(payload);
      message.success(`OTA 升级计划 [${created.name}] 制定下发成功！`);
      onSuccess(created);
      onCancel();
    } catch (err: any) {
      message.error(err?.message || '创建 OTA 升级计划失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 车辆表格列配置
  const vehicleColumns: TableColumnsType<VehicleDto> = [
    {
      title: '车牌号',
      dataIndex: 'plateNumber',
      key: 'plateNumber',
      width: 130,
      render: (plate: string) => (
        <span style={{ fontWeight: 600, color: 'var(--ant-color-text)' }}>{plate}</span>
      ),
    },
    {
      title: '车架号 (VIN)',
      dataIndex: 'vin',
      key: 'vin',
      width: 170,
      render: (vin: string) => (
        <Text code style={{ fontSize: 11, fontFamily: 'monospace' }}>
          {vin}
        </Text>
      ),
    },
    {
      title: '车型 / 适配匹配',
      dataIndex: 'modelName',
      key: 'modelName',
      width: 170,
      render: (name: string, record) => {
        const isCompat = activeFirmware ? isVehicleModelCompatible(record, activeFirmware) : true;
        return (
          <Space orientation="vertical" size={2}>
            <span>{name || '未知车型'}</span>
            {isCompat ? (
              <Tag color="success" style={{ margin: 0, fontSize: 10 }}>
                适配兼容
              </Tag>
            ) : (
              <Tag color="error" style={{ margin: 0, fontSize: 10 }}>
                不符合适配
              </Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: '电池电量 SoC',
      key: 'soc',
      width: 120,
      render: (_, record) => {
        const soc = record.telemetry?.fuelOrBatteryLevel ?? 0;
        const isLow = soc < minBatterySoc;
        return (
          <Space orientation="vertical" size={2} style={{ width: '100%' }}>
            <Progress
              percent={soc}
              size="small"
              status={isLow ? 'exception' : 'normal'}
              strokeColor={isLow ? '#faad14' : '#52c41a'}
            />
            {isLow && (
              <Text type="warning" style={{ fontSize: 10 }}>
                低于门禁({minBatterySoc}%)
              </Text>
            )}
          </Space>
        );
      },
    },
    {
      title: '在线状态',
      dataIndex: 'deviceOnlineStatus',
      key: 'deviceOnlineStatus',
      width: 100,
      render: (st: string) => (
        <Badge
          status={st === 'ONLINE' ? 'success' : 'default'}
          text={st === 'ONLINE' ? '在线' : '离线'}
        />
      ),
    },
    {
      title: '所属项目',
      dataIndex: 'projectName',
      key: 'projectName',
      width: 140,
      ellipsis: true,
      render: (p: string) => <Text type="secondary">{p || '-'}</Text>,
    },
  ];

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      width={880}
      destroyOnClose
      styles={{
        body: {
          maxHeight: '72vh',
          overflowY: 'auto',
          padding: '16px 24px',
        },
      }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <RocketOutlined style={{ color: '#1677ff', fontSize: 20 }} />
          <span style={{ fontSize: 18, fontWeight: 600 }}>制定批量 OTA 升级计划向导</span>
        </div>
      }
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            第 {currentStep + 1} 步 / 共 4 步
          </Text>
          <Space>
            <Button onClick={onCancel}>取消</Button>
            {currentStep > 0 && <Button onClick={handlePrev}>上一步</Button>}
            {currentStep < 3 && (
              <Button type="primary" onClick={handleNext}>
                下一步
              </Button>
            )}
            {currentStep === 3 && (
              <Button
                type="primary"
                loading={submitting}
                disabled={!safetyConfirmed}
                onClick={handleCreatePlan}
                style={{ background: '#1677ff' }}
              >
                确认创建并下发
              </Button>
            )}
          </Space>
        </div>
      }
    >
      <Steps
        current={currentStep}
        size="small"
        style={{ marginBottom: 24 }}
        items={[
          { title: '基础信息与固件', description: '版本选择' },
          { title: '升级策略与安全门禁', description: '参数防御' },
          { title: '目标车辆筛选', description: '车型匹配' },
          { title: '计划确认与下发', description: '二次声明' },
        ]}
      />

      {/* Step 1: 基础信息与固件选择 */}
      {currentStep === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Alert
            type="info"
            showIcon
            message="固件发布状态约束规约"
            description="为防止测试版误刷入量产车辆，批量 OTA 升级任务仅允许选择已完成 SHA-256 校验和测试审计的【已发布上线 (PUBLISHED)】固件包。"
          />

          <Form layout="vertical">
            <Form.Item
              label={<span style={{ fontWeight: 600 }}>OTA 升级计划名称</span>}
              required
              help="建议包含领域模块、版本号及批次场景 (2~50 字符)"
            >
              <Input
                placeholder="例如: 2026年Q4全系T-Box固件双频高精定位优化分批升级"
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                maxLength={50}
                showCount
                allowClear
              />
            </Form.Item>

            <Row gutter={16}>
              <Col span={10}>
                <Form.Item label={<span style={{ fontWeight: 600 }}>固件领域类型过滤</span>}>
                  <Select
                    value={selectedFirmwareType}
                    onChange={(val) => {
                      setSelectedFirmwareType(val);
                      setSelectedFirmwareId('');
                    }}
                    options={[
                      { label: '全部领域类型', value: 'ALL' },
                      { label: '车载通信终端 (T-Box)', value: FirmwareType.TBOX },
                      { label: '动力底盘域控 (MCU)', value: FirmwareType.MCU },
                      { label: '车身电子控制 (BCM)', value: FirmwareType.BCM },
                      { label: '电池管理系统 (BMS)', value: FirmwareType.BMS },
                    ]}
                  />
                </Form.Item>
              </Col>

              <Col span={14}>
                <Form.Item
                  label={<span style={{ fontWeight: 600 }}>目标固件包 (仅限已发布)</span>}
                  required
                >
                  <Select
                    value={selectedFirmwareId || undefined}
                    onChange={(val) => {
                      setSelectedFirmwareId(val);
                      const fw = firmwares.find((f) => f.id === val);
                      if (fw && !planName) {
                        setPlanName(`${fw.name} (${fw.version}) 批量升级任务`);
                      }
                    }}
                    placeholder="请选择目标投产固件包..."
                    loading={loadingData}
                    options={publishedFirmwares.map((f) => ({
                      label: `${f.name} (${f.version}) - [${f.firmwareType}]`,
                      value: f.id,
                    }))}
                  />
                </Form.Item>
              </Col>
            </Row>
          </Form>

          {/* 选中固件参数详情卡片 */}
          {activeFirmware ? (
            <Card
              size="small"
              title={
                <Space>
                  <SafetyCertificateOutlined style={{ color: '#52c41a' }} />
                  <span style={{ fontWeight: 600 }}>已选固件规格契约</span>
                </Space>
              }
              style={{ background: '#fafafa', borderRadius: 8 }}
            >
              <Descriptions size="small" column={2} bordered>
                <Descriptions.Item label="固件包名称" span={2}>
                  <Text strong>{activeFirmware.name}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="领域类型">
                  {renderFirmwareTypeTag(activeFirmware.firmwareType)}
                </Descriptions.Item>
                <Descriptions.Item label="SemVer 版本">
                  <Tag color="blue" style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {activeFirmware.version}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="文件体积">
                  <Text>{activeFirmware.fileSizeFormatted}</Text>{' '}
                  <Text type="secondary">({activeFirmware.fileSize.toLocaleString()} 字节)</Text>
                </Descriptions.Item>
                <Descriptions.Item label="发布时间">
                  {activeFirmware.publishedAt
                    ? new Date(activeFirmware.publishedAt).toLocaleString()
                    : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="SHA-256 校验和" span={2}>
                  <Paragraph
                    code
                    copyable={{ text: activeFirmware.sha256 }}
                    style={{
                      margin: 0,
                      fontSize: 11,
                      wordBreak: 'break-all',
                      fontFamily: 'monospace',
                    }}
                  >
                    {activeFirmware.sha256}
                  </Paragraph>
                </Descriptions.Item>
                <Descriptions.Item label="适配车型" span={2}>
                  {activeFirmware.applicableModelNames?.length > 0 ? (
                    <Space wrap size={[4, 4]}>
                      {activeFirmware.applicableModelNames.map((m) => (
                        <Tag key={m} color="geekblue" style={{ fontSize: 11 }}>
                          {m}
                        </Tag>
                      ))}
                    </Space>
                  ) : (
                    <Text type="secondary">通用全适配 (无限制)</Text>
                  )}
                </Descriptions.Item>
                <Descriptions.Item label="发布说明" span={2}>
                  <Text type="secondary">{activeFirmware.releaseNotes || '无发布说明'}</Text>
                </Descriptions.Item>
              </Descriptions>
            </Card>
          ) : (
            <Card size="small" style={{ textAlign: 'center', padding: '24px 0', color: '#8c8c8c' }}>
              请在上方下拉列表中选取已发布的生产固件包以继续制定计划
            </Card>
          )}
        </div>
      )}

      {/* Step 2: 升级策略与安全门禁 */}
      {currentStep === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* 升级模式单选 */}
          <div>
            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>
              升级交互模式 (Upgrade Mode)
            </div>
            <Radio.Group
              value={upgradeMode}
              onChange={(e) => setUpgradeMode(e.target.value)}
              style={{ width: '100%' }}
            >
              <Row gutter={[16, 16]}>
                <Col span={12}>
                  <Card
                    hoverable
                    size="small"
                    style={{
                      borderColor: upgradeMode === UpgradeMode.SILENT ? '#1677ff' : '#d9d9d9',
                      background: upgradeMode === UpgradeMode.SILENT ? '#e6f4ff' : '#fff',
                      cursor: 'pointer',
                    }}
                    onClick={() => setUpgradeMode(UpgradeMode.SILENT)}
                  >
                    <Radio value={UpgradeMode.SILENT}>
                      <Space direction="vertical" size={2}>
                        <div style={{ fontWeight: 600 }}>
                          {UPGRADE_MODE_METADATA[UpgradeMode.SILENT].label}
                          <Tag color="purple" style={{ marginLeft: 8 }}>
                            推荐夜间
                          </Tag>
                        </div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {UPGRADE_MODE_METADATA[UpgradeMode.SILENT].description}
                        </Text>
                      </Space>
                    </Radio>
                  </Card>
                </Col>

                <Col span={12}>
                  <Card
                    hoverable
                    size="small"
                    style={{
                      borderColor:
                        upgradeMode === UpgradeMode.USER_CONFIRM ? '#1677ff' : '#d9d9d9',
                      background: upgradeMode === UpgradeMode.USER_CONFIRM ? '#e6f4ff' : '#fff',
                      cursor: 'pointer',
                    }}
                    onClick={() => setUpgradeMode(UpgradeMode.USER_CONFIRM)}
                  >
                    <Radio value={UpgradeMode.USER_CONFIRM}>
                      <Space direction="vertical" size={2}>
                        <div style={{ fontWeight: 600 }}>
                          {UPGRADE_MODE_METADATA[UpgradeMode.USER_CONFIRM].label}
                          <Tag color="blue" style={{ marginLeft: 8 }}>
                            大版本变更
                          </Tag>
                        </div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {UPGRADE_MODE_METADATA[UpgradeMode.USER_CONFIRM].description}
                        </Text>
                      </Space>
                    </Radio>
                  </Card>
                </Col>
              </Row>
            </Radio.Group>
          </div>

          {/* 硬性安全前置门禁 */}
          <Card
            size="small"
            title={
              <Space>
                <SafetyCertificateOutlined style={{ color: '#faad14' }} />
                <span style={{ fontWeight: 600 }}>硬件安全前置门禁 (Hard Safety Preconditions)</span>
              </Space>
            }
            style={{ borderRadius: 8 }}
          >
            <Alert
              type="warning"
              showIcon
              message="硬性安全门禁保障刷写供电与人身安全"
              description="车机终端将在刷写前逐项校验门禁，若车辆正在行驶或电量不足，升级将被自动阻断并上报原因。"
              style={{ marginBottom: 16 }}
            />

            <Form layout="vertical">
              <Row gutter={24}>
                <Col span={14}>
                  <Form.Item
                    label={
                      <Space>
                        <ThunderboltOutlined style={{ color: '#52c41a' }} />
                        <span>动力电池最低电量门禁 (Min Battery SoC)</span>
                      </Space>
                    }
                    help="电量低于该设定值将阻断刷写，防止因供电不足导致微控制器变砖 (20% ~ 80%)"
                  >
                    <Row gutter={12} align="middle">
                      <Col span={16}>
                        <Slider
                          min={20}
                          max={80}
                          step={5}
                          value={minBatterySoc}
                          onChange={setMinBatterySoc}
                          marks={{
                            20: '20%',
                            30: '30%(推荐)',
                            50: '50%',
                            80: '80%',
                          }}
                        />
                      </Col>
                      <Col span={8}>
                        <InputNumber
                          min={20}
                          max={80}
                          step={5}
                          value={minBatterySoc}
                          onChange={(val) => val && setMinBatterySoc(val)}
                          addonAfter="%"
                          style={{ width: '100%' }}
                        />
                      </Col>
                    </Row>
                  </Form.Item>
                </Col>

                <Col span={10}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600 }}>车辆静止与P档强制门禁</span>
                        <Switch
                          checked={requireStationary}
                          onChange={(checked) => {
                            if (!checked) {
                              message.warning('为了行驶安全，车辆静止与P档必须强制开启');
                            }
                            setRequireStationary(checked);
                          }}
                        />
                      </div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        车速必须为 0 km/h 且挂入 P 档，严禁在行车过程中执行 OTA 刷写
                      </Text>
                      {!requireStationary && (
                        <div style={{ color: '#ff4d4f', fontSize: 12, marginTop: 4 }}>
                          ⚠️ 静止条件必须开启方可继续下一步！
                        </div>
                      )}
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600 }}>非高压充电中状态限制</span>
                        <Switch
                          checked={requireNotCharging}
                          onChange={setRequireNotCharging}
                        />
                      </div>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        避免大功率快充直流波动干扰 ECU 烧录过程
                      </Text>
                    </div>
                  </div>
                </Col>
              </Row>
            </Form>
          </Card>

          {/* 执行与熔断参数 */}
          <Card
            size="small"
            title={
              <Space>
                <ControlOutlined style={{ color: '#1677ff' }} />
                <span style={{ fontWeight: 600 }}>执行时限与自动熔断参数配置</span>
              </Space>
            }
            style={{ borderRadius: 8 }}
          >
            <Row gutter={16}>
              <Col span={6}>
                <Form.Item label="下载超时限时 (分钟)">
                  <InputNumber
                    min={5}
                    max={120}
                    value={downloadTimeoutMin}
                    onChange={(val) => val && setDownloadTimeoutMin(val)}
                    addonAfter="min"
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Col>
              <Col span={6}>
                <Form.Item label="安装烧录超时 (分钟)">
                  <InputNumber
                    min={5}
                    max={180}
                    value={installTimeoutMin}
                    onChange={(val) => val && setInstallTimeoutMin(val)}
                    addonAfter="min"
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item label="失败重试次数">
                  <Select
                    value={maxRetries}
                    onChange={setMaxRetries}
                    options={[
                      { label: '0 次 (不重试)', value: 0 },
                      { label: '1 次', value: 1 },
                      { label: '2 次 (推荐)', value: 2 },
                      { label: '3 次', value: 3 },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  label="失败率自动熔断阈值"
                  help="整批次失败率达标时系统自动挂起计划，防止故障蔓延"
                >
                  <Row gutter={8} align="middle">
                    <Col span={14}>
                      <Slider
                        min={1}
                        max={20}
                        value={failureThresholdPercent}
                        onChange={setFailureThresholdPercent}
                        marks={{ 1: '1%', 5: '5%', 10: '10%', 20: '20%' }}
                      />
                    </Col>
                    <Col span={10}>
                      <InputNumber
                        min={1}
                        max={20}
                        value={failureThresholdPercent}
                        onChange={(val) => val && setFailureThresholdPercent(val)}
                        addonAfter="%"
                        style={{ width: '100%' }}
                      />
                    </Col>
                  </Row>
                </Form.Item>
              </Col>
            </Row>
          </Card>
        </div>
      )}

      {/* Step 3: 目标车辆筛选 */}
      {currentStep === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* 车型匹配提示或警告 */}
          {selectionStats.incompatibleCount > 0 && (
            <Alert
              type="error"
              showIcon
              message={`已选车辆中包含 ${selectionStats.incompatibleCount} 台车型不兼容车辆`}
              description={`固件 [${activeFirmware?.name}] 仅适配 [${
                activeFirmware?.applicableModelNames?.join('、') || '全部'
              }]，强行刷入可能导致硬件变砖，请取消勾选不兼容车辆。`}
            />
          )}

          {/* 筛选过滤条 */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
              background: '#fafafa',
              padding: '12px 16px',
              borderRadius: 6,
            }}
          >
            <Space wrap size={10}>
              <Select
                value={vehicleProjectFilter}
                onChange={setVehicleProjectFilter}
                style={{ width: 160 }}
                options={[
                  { label: '全部运营项目', value: 'ALL' },
                  ...SEED_PROJECTS.map((p) => ({ label: p.name, value: p.id })),
                ]}
              />

              <Select
                value={vehicleModelFilter}
                onChange={setVehicleModelFilter}
                style={{ width: 160 }}
                options={[
                  { label: '全部车型', value: 'ALL' },
                  ...SUPPORTED_VEHICLE_MODELS.map((m) => ({ label: m.name, value: m.id })),
                ]}
              />

              <Input
                placeholder="搜索车牌号或 VIN 码..."
                value={vehicleKeyword}
                onChange={(e) => setVehicleKeyword(e.target.value)}
                allowClear
                style={{ width: 180 }}
              />

              <Checkbox
                checked={onlyOnlineVehicles}
                onChange={(e) => setOnlyOnlineVehicles(e.target.checked)}
              >
                仅显示在线车辆
              </Checkbox>
            </Space>

            <Button
              size="small"
              onClick={() => {
                const eligibleIds = displayedVehicles.map((v) => v.id);
                setSelectedVehicleIds(Array.from(new Set([...selectedVehicleIds, ...eligibleIds])));
              }}
            >
              全选当前筛选车辆
            </Button>
          </div>

          {/* 目标车辆表格 */}
          <Table
            rowKey="id"
            size="small"
            columns={vehicleColumns}
            dataSource={displayedVehicles}
            pagination={{
              defaultPageSize: 5,
              pageSizeOptions: ['5', '10', '20'],
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 台符合车型条件车辆`,
            }}
            rowSelection={{
              selectedRowKeys: selectedVehicleIds,
              onChange: (keys) => setSelectedVehicleIds(keys as string[]),
            }}
            scroll={{ x: 800 }}
          />

          {/* 选中车辆统计栏 */}
          <div
            style={{
              padding: '8px 16px',
              background: '#e6f4ff',
              border: '1px solid #91caff',
              borderRadius: 6,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Space size={16}>
              <span>
                已选中目标车辆: <Text strong style={{ color: '#1677ff', fontSize: 16 }}>{selectionStats.totalSelected}</Text> 台
              </span>
              <span>
                当前在线: <Text strong style={{ color: '#52c41a' }}>{selectionStats.onlineCount}</Text> 台
              </span>
              <span>
                满足电量门禁 (≥{minBatterySoc}%): <Text strong>{selectionStats.batteryEligibleCount}</Text> 台
              </span>
            </Space>

            {selectedVehicleIds.length > 0 && (
              <Button type="link" size="small" onClick={() => setSelectedVehicleIds([])}>
                清空已选
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Step 4: 计划确认与下发 */}
      {currentStep === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 下发调度模式选择 */}
          <Card size="small" title={<span style={{ fontWeight: 600 }}>下发调度时间安排</span>}>
            <Radio.Group
              value={scheduleType}
              onChange={(e) => setScheduleType(e.target.value)}
              style={{ marginBottom: 12 }}
            >
              <Radio value={ScheduleType.IMMEDIATE}>
                <Space>
                  <RocketOutlined style={{ color: '#1677ff' }} />
                  <span style={{ fontWeight: 600 }}>立即启动下发</span>
                  <Text type="secondary">(任务创建后立即向目标车辆推送升级指令)</Text>
                </Space>
              </Radio>
              <Radio value={ScheduleType.SCHEDULED}>
                <Space>
                  <ClockCircleOutlined style={{ color: '#faad14' }} />
                  <span style={{ fontWeight: 600 }}>定时预约执行</span>
                  <Text type="secondary">(在设定的低谷时间窗口内自动触发)</Text>
                </Space>
              </Radio>
            </Radio.Group>

            {scheduleType === ScheduleType.SCHEDULED && (
              <div style={{ marginTop: 8 }}>
                <Text style={{ marginRight: 8 }}>执行时间窗口:</Text>
                <RangePicker
                  showTime
                  format="YYYY-MM-DD HH:mm:ss"
                  onChange={(_, dateStrings) => {
                    setScheduleTimeRange(
                      dateStrings[0] && dateStrings[1]
                        ? [dateStrings[0], dateStrings[1]]
                        : null
                    );
                  }}
                  style={{ width: 380 }}
                />
              </div>
            )}
          </Card>

          {/* 参数宏观摘要卡片 */}
          <Card
            size="small"
            title={
              <Space>
                <CheckCircleOutlined style={{ color: '#52c41a' }} />
                <span style={{ fontWeight: 600 }}>升级计划全要素参数宏观摘要</span>
              </Space>
            }
            style={{ borderRadius: 8 }}
          >
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="计划名称" span={2}>
                <Text strong>{planName}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="调度模式">
                <Tag color={scheduleType === ScheduleType.IMMEDIATE ? 'blue' : 'orange'}>
                  {SCHEDULE_TYPE_METADATA[scheduleType].label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="升级交互模式">
                <Tag color={UPGRADE_MODE_METADATA[upgradeMode].tagColor}>
                  {UPGRADE_MODE_METADATA[upgradeMode].label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="目标固件包">
                <Space>
                  <span>{activeFirmware?.name}</span>
                  <Tag color="blue" style={{ fontFamily: 'monospace' }}>
                    {activeFirmware?.version}
                  </Tag>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="固件领域类型">
                {activeFirmware && renderFirmwareTypeTag(activeFirmware.firmwareType)}
              </Descriptions.Item>
              <Descriptions.Item label="SHA-256 完整性哈希" span={2}>
                <Text code copyable style={{ fontSize: 11, fontFamily: 'monospace' }}>
                  {activeFirmware?.sha256}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="安全前置门禁">
                <Space direction="vertical" size={2}>
                  <span>最低电量 SoC: ≥ {minBatterySoc}%</span>
                  <span>车辆静止 P 档: {requireStationary ? '强制开启 (0 km/h)' : '关闭'}</span>
                  <span>非充电状态: {requireNotCharging ? '强制限制' : '不限制'}</span>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="执行与容错策略">
                <Space direction="vertical" size={2}>
                  <span>下载限时: {downloadTimeoutMin} 分钟</span>
                  <span>安装限时: {installTimeoutMin} 分钟</span>
                  <span>失败重试: {maxRetries} 次</span>
                  <span>
                    失败率熔断: <Tag color="error">{failureThresholdPercent}%</Tag>
                  </span>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="目标车辆规模" span={2}>
                <Space size={16}>
                  <span>
                    总覆盖车辆: <Text strong style={{ color: '#1677ff' }}>{selectionStats.totalSelected}</Text> 台
                  </span>
                  <span>
                    当前在线: <Text strong style={{ color: '#52c41a' }}>{selectionStats.onlineCount}</Text> 台
                  </span>
                  <span>
                    电量达标: <Text strong>{selectionStats.batteryEligibleCount}</Text> 台
                  </span>
                </Space>
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {/* L2 强安全二次确认防误触声明 */}
          <Alert
            type="warning"
            showIcon
            message="高危批量 OTA 升级操作安全确认门禁 (L2 确认)"
            description="OTA 升级将改写车端硬件 Flash 存储芯片。请确保固件已在台架及实车充分测试，并已预知可能的断网或升级失败风险。"
          />

          <div
            style={{
              padding: '12px 16px',
              border: '1px solid #ffd591',
              background: '#fffbe6',
              borderRadius: 6,
            }}
          >
            <Checkbox
              checked={safetyConfirmed}
              onChange={(e) => setSafetyConfirmed(e.target.checked)}
            >
              <span style={{ fontWeight: 600, color: '#d46b08' }}>
                我已充分知晓该 OTA 升级计划的影响范围与车型兼容性，已确认目标固件包经过完整性校验，并在严格安全前置门禁防护下授权下发。
              </span>
            </Checkbox>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default OtaPlanWizardModal;
