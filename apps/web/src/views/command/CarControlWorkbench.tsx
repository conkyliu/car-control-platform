import React, { useState, useEffect, useMemo } from 'react';
import {
  Card,
  Row,
  Col,
  Button,
  Space,
  Tag,
  Typography,
  Select,
  Badge,
  Descriptions,
  Modal,
  Form,
  Input,
  Slider,
  Radio,
  Tooltip,
  Popconfirm,
  Alert,
  Divider,
  message,
  notification,
  Empty,
  Switch,
} from 'antd';
import {
  LockOutlined,
  UnlockOutlined,
  CarOutlined,
  InboxOutlined,
  BellOutlined,
  ThunderboltOutlined,
  PoweroffOutlined,
  FireOutlined,
  PauseCircleOutlined,
  HeatMapOutlined,
  DownSquareOutlined,
  UpSquareOutlined,
  BorderOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  LoadingOutlined,
  SafetyCertificateOutlined,
  DashboardOutlined,
  ReloadOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import {
  CommandCode,
  SecurityLevel,
  CommandStatus,
  type EffectiveCapabilityDto,
} from '@car-control/contracts';
import {
  COMMAND_METADATA,
  validateSecurityCode,
  formatExecutionDuration,
  isCommandSupportedByCapability,
  evaluateVoltageHealth,
  isCommandLockError,
  SEED_WORKBENCH_VEHICLES,
  type VehicleWorkbenchItem,
  type VehicleTelemetryData,
} from './command-core.ts';
import {
  executeCommandApi,
  fetchVehicleCapabilitiesApi,
  fetchCommandHistoryApi,
  type CommandRecord,
} from '../../api/command.ts';
import { useVehicleStore } from '../../store/useVehicleStore.ts';
import { CommandStreamDrawer } from './CommandStreamDrawer.tsx';

const { Title, Text } = Typography;

// 图标映射表
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

export const CarControlWorkbench: React.FC = () => {
  // 当前选中的车辆 ID 与车辆列表
  const [vehicles, setVehicles] = useState<VehicleWorkbenchItem[]>(SEED_WORKBENCH_VEHICLES);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(SEED_WORKBENCH_VEHICLES[0]!.id);

  // 车辆能力映射字典
  const [capabilities, setCapabilities] = useState<Record<CommandCode, EffectiveCapabilityDto> | null>(null);

  // 实时执行流水记录
  const [commandLogs, setCommandLogs] = useState<CommandRecord[]>([]);

  // 正在执行的指令代码与 Loading 状态
  const [executingCommandCode, setExecutingCommandCode] = useState<CommandCode | null>(null);

  // 409 排他锁告警横幅提示
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);

  // 模态框显隐控制与上下文参数
  const [l2ModalOpen, setL2ModalOpen] = useState(false);
  const [l2TargetCode, setL2TargetCode] = useState<CommandCode | null>(null);
  const [l2Duration, setL2Duration] = useState<number>(15);
  const [l2Pin, setL2Pin] = useState<string>('');
  const [l2PinError, setL2PinError] = useState<string | null>(null);

  // 空调温控配置弹窗
  const [acModalOpen, setAcModalOpen] = useState(false);
  const [acTargetTemp, setAcTargetTemp] = useState<number>(24);
  const [acFanSpeed, setAcFanSpeed] = useState<number>(2);
  const [acLoopMode, setAcLoopMode] = useState<'INTERNAL' | 'EXTERNAL'>('INTERNAL');

  // 座椅加热配置弹窗
  const [seatModalOpen, setSeatModalOpen] = useState(false);
  const [seatTarget, setSeatTarget] = useState<'DRIVER' | 'PASSENGER' | 'BOTH'>('DRIVER');
  const [seatLevel, setSeatLevel] = useState<number>(2);

  // 后备箱财产风险二次确认弹窗
  const [trunkModalOpen, setTrunkModalOpen] = useState(false);

  // 指令全链路流水与状态机追踪抽屉
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedCommandId, setSelectedCommandId] = useState<string | null>(null);

  const handleOpenTraceDrawer = (cmdId?: string) => {
    setSelectedCommandId(cmdId || commandLogs[0]?.id || 'cmd-seed-01');
    setDrawerOpen(true);
  };

  // 全局车辆 store 联动
  const setGlobalVehicle = useVehicleStore((s) => s.setVehicle);

  // 当前激活车辆对象
  const currentVehicle = useMemo(() => {
    return vehicles.find((v) => v.id === selectedVehicleId) || vehicles[0]!;
  }, [vehicles, selectedVehicleId]);

  // 加载所选车辆能力模板与历史记录
  const loadVehicleContext = async (vehId: string) => {
    try {
      const [caps, hist] = await Promise.all([
        fetchVehicleCapabilitiesApi(vehId),
        fetchCommandHistoryApi(vehId),
      ]);
      setCapabilities(caps);
      setCommandLogs(hist);
    } catch (err) {
      console.error('Failed to load vehicle context:', err);
    }
  };

  useEffect(() => {
    setGlobalVehicle(selectedVehicleId);
    loadVehicleContext(selectedVehicleId);
  }, [selectedVehicleId]);

  // 切换车辆
  const handleSelectVehicle = (vehId: string) => {
    setSelectedVehicleId(vehId);
    setConflictWarning(null);
  };

  // 模拟切换在线状态 (供演示离线禁用及全景指标变化)
  const handleToggleOnline = (checked: boolean) => {
    setVehicles((prev) =>
      prev.map((v) => (v.id === selectedVehicleId ? { ...v, isOnline: checked } : v))
    );
    message.info(`车辆已切换为 ${checked ? '在线 🟢' : '离线 ⚪'} 状态`);
  };

  // 核心控车下发主流程
  const dispatchCommand = async (
    code: CommandCode,
    options?: {
      params?: Record<string, unknown>;
      securityCode?: string;
    }
  ) => {
    if (!currentVehicle.isOnline) {
      message.error('车载终端处于离线状态，无法下发指令！');
      return;
    }

    // 检查能力支持
    const capCheck = isCommandSupportedByCapability(code, capabilities);
    if (!capCheck.supported) {
      message.warning(capCheck.reason || '该车型硬件配置不支持此功能');
      return;
    }

    // 如果当前有指令正在执行，前端防抖阻止并发风暴
    if (executingCommandCode !== null) {
      const lockMsg = '该车辆已有指令正在执行中，请稍候';
      setConflictWarning(lockMsg);
      message.warning(lockMsg);
      return;
    }

    const meta = COMMAND_METADATA[code];
    setExecutingCommandCode(code);
    setConflictWarning(null);

    // 乐观插入一条 WAITING_ACK 流水记录
    const tempId = `cmd_optimistic_${Date.now()}`;
    const optimisticRecord: CommandRecord = {
      id: tempId,
      tenantId: 'tenant-demo',
      projectId: 'proj-01',
      vehicleId: currentVehicle.id,
      deviceId: currentVehicle.deviceId,
      deviceNo: currentVehicle.deviceNo,
      commandCode: code,
      status: CommandStatus.WAITING_ACK,
      securityLevel: meta.securityLevel,
      idempotencyKey: `idemp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      traceId: `trace_${Date.now()}`,
      requestId: `req_${Date.now()}`,
      params: options?.params,
      sentAt: new Date(),
      operatorId: 'operator-admin',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    setCommandLogs((prev) => [optimisticRecord, ...prev]);

    try {
      const res = await executeCommandApi(currentVehicle.id, {
        commandCode: code,
        idempotencyKey: optimisticRecord.idempotencyKey,
        securityCode: options?.securityCode,
        params: options?.params,
      });

      // 收到 ACK，更新流水记录
      setCommandLogs((prev) =>
        prev.map((log) => (log.id === tempId ? { ...res, id: res.id || tempId } : log))
      );

      message.success(`${meta.name} 执行成功！`);

      // 联动更新车辆遥测工况状态
      applyTelemetryStateChange(code, options?.params);
    } catch (err: unknown) {
      // 捕获 409 排他锁冲突
      if (isCommandLockError(err)) {
        const lockMsg = err.message || '该车辆已有指令正在执行中，请稍候';
        setConflictWarning(lockMsg);
        notification.warning({
          message: '指令下发排他锁拦截',
          description: lockMsg,
          duration: 4.5,
        });

        // 移除或将乐观记录置为 REJECTED
        setCommandLogs((prev) =>
          prev.map((log) =>
            log.id === tempId
              ? {
                  ...log,
                  status: CommandStatus.DEVICE_REJECTED,
                  errorMessage: lockMsg,
                  durationMs: 80,
                }
              : log
          )
        );
      } else {
        const errMsg = err instanceof Error ? err.message : '指令下发失败';
        message.error(errMsg);
        setCommandLogs((prev) =>
          prev.map((log) =>
            log.id === tempId
              ? {
                  ...log,
                  status: CommandStatus.FAILED,
                  errorMessage: errMsg,
                  durationMs: 120,
                }
              : log
          )
        );
      }
    } finally {
      setExecutingCommandCode(null);
    }
  };

  // 遥测状态实时联动更新
  const applyTelemetryStateChange = (code: CommandCode, params?: Record<string, unknown>) => {
    setVehicles((prev) =>
      prev.map((veh) => {
        if (veh.id !== selectedVehicleId) return veh;

        const updatedTelemetry: VehicleTelemetryData = { ...veh.telemetry };

        switch (code) {
          case CommandCode.CMD_LOCK:
            updatedTelemetry.doorLocks = 'LOCKED';
            break;
          case CommandCode.CMD_UNLOCK:
            updatedTelemetry.doorLocks = 'UNLOCKED';
            break;
          case CommandCode.CMD_TRUNK_OPEN:
            updatedTelemetry.trunk = 'OPEN';
            break;
          case CommandCode.CMD_TRUNK_CLOSE:
            updatedTelemetry.trunk = 'CLOSED';
            break;
          case CommandCode.CMD_ENGINE_START:
            updatedTelemetry.engine = 'RUNNING';
            break;
          case CommandCode.CMD_ENGINE_STOP:
            updatedTelemetry.engine = 'STOPPED';
            break;
          case CommandCode.CMD_AC_START:
            updatedTelemetry.acRunning = true;
            if (params?.targetTemp) updatedTelemetry.acTemp = Number(params.targetTemp);
            if (params?.fanSpeed) updatedTelemetry.acFanSpeed = Number(params.fanSpeed);
            break;
          case CommandCode.CMD_AC_STOP:
            updatedTelemetry.acRunning = false;
            break;
          case CommandCode.CMD_SEAT_HEAT:
            if (params?.seat === 'BOTH' || params?.seat === 'DRIVER') {
              updatedTelemetry.seatHeatDriver = Number(params?.level || 2);
            }
            if (params?.seat === 'BOTH' || params?.seat === 'PASSENGER') {
              updatedTelemetry.seatHeatPassenger = Number(params?.level || 2);
            }
            break;
          case CommandCode.CMD_WINDOW_OPEN:
            updatedTelemetry.windows = 'OPEN';
            break;
          case CommandCode.CMD_WINDOW_CLOSE:
            updatedTelemetry.windows = 'CLOSED';
            break;
          case CommandCode.CMD_SUNROOF_CONTROL:
            updatedTelemetry.sunroof = updatedTelemetry.sunroof === 'OPEN' ? 'CLOSED' : 'OPEN';
            break;
          default:
            break;
        }

        updatedTelemetry.lastHeartbeat = '刚刚';
        return {
          ...veh,
          telemetry: updatedTelemetry,
        };
      })
    );
  };

  // 打开 L2 安全确认模态框
  const handleTriggerL2 = (code: CommandCode) => {
    setL2TargetCode(code);
    setL2Pin('');
    setL2PinError(null);
    setL2Duration(15);
    setL2ModalOpen(true);
  };

  // 提交 L2 强安全指令
  const handleConfirmL2 = () => {
    if (!l2TargetCode) return;

    const validation = validateSecurityCode(l2Pin, SecurityLevel.L2, '123456');
    if (!validation.valid) {
      setL2PinError(validation.message || '请输入6位有效安全码');
      return;
    }

    setL2PinError(null);
    setL2ModalOpen(false);

    const params: Record<string, unknown> = {};
    if (l2TargetCode === CommandCode.CMD_ENGINE_START) {
      params.durationMinutes = l2Duration;
    } else if (l2TargetCode === CommandCode.CMD_ENGINE_STOP) {
      params.preCheckSpeed = 0;
      params.preCheckGear = 'P';
    }

    dispatchCommand(l2TargetCode, {
      securityCode: l2Pin,
      params,
    });
  };

  // 判定单个指令是否应被禁用 (离线、车型能力不支持、并发排他)
  const isCommandDisabled = (code: CommandCode) => {
    const isOffline = !currentVehicle.isOnline;
    const cap = isCommandSupportedByCapability(code, capabilities);
    const isAnyExecuting = executingCommandCode !== null;
    const isExecuting = executingCommandCode === code;
    return isOffline || !cap.supported || (isAnyExecuting && !isExecuting);
  };

  // 渲染单个指令控制按钮
  const renderCommandButton = (code: CommandCode, customClick?: () => void) => {
    const meta = COMMAND_METADATA[code];
    const icon = COMMAND_ICON_MAP[code] || <CarOutlined />;
    const isExecuting = executingCommandCode === code;
    const isDisabled = isCommandDisabled(code);

    // 判定车型硬件配置提示
    const cap = isCommandSupportedByCapability(code, capabilities);
    const isOffline = !currentVehicle.isOnline;

    let tooltipContent: React.ReactNode = meta.description;
    if (isOffline) {
      tooltipContent = '车载终端离线中，无法下发指令';
    } else if (!cap.supported) {
      tooltipContent = cap.reason || '该车型硬件配置不支持此功能';
    }

    const buttonElement = (
      <Button
        block
        size="large"
        icon={icon}
        loading={isExecuting}
        disabled={isDisabled}
        style={{
          height: 52,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderRadius: 8,
          borderColor:
            meta.securityLevel === SecurityLevel.L2
              ? '#ff4d4f'
              : meta.securityLevel === SecurityLevel.L1
              ? '#faad14'
              : undefined,
        }}
        onClick={() => {
          if (isDisabled) return;
          if (customClick) {
            customClick();
          } else {
            dispatchCommand(code);
          }
        }}
      >
        <div style={{ textAlign: 'left', overflow: 'hidden' }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{meta.name}</div>
          <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)', marginTop: -2 }}>
            {meta.securityLevel === SecurityLevel.L2 ? 'L2 高危强核验' : meta.securityLevel === SecurityLevel.L1 ? 'L1 二次确认' : 'L0 常规下发'}
          </div>
        </div>
        <Tag
          color={
            meta.securityLevel === SecurityLevel.L2
              ? 'error'
              : meta.securityLevel === SecurityLevel.L1
              ? 'warning'
              : 'default'
          }
          style={{ marginRight: 0 }}
        >
          {meta.securityLevel}
        </Tag>
      </Button>
    );

    return (
      <Tooltip title={tooltipContent} placement="top">
        <div style={{ width: '100%' }}>{buttonElement}</div>
      </Tooltip>
    );
  };

  // 状态机标签呈现
  const renderStatusTag = (status: CommandStatus) => {
    switch (status) {
      case CommandStatus.WAITING_ACK:
        return (
          <Tag color="processing" icon={<LoadingOutlined spin />}>
            WAITING_ACK
          </Tag>
        );
      case CommandStatus.SUCCESS:
        return (
          <Tag color="success" icon={<CheckCircleOutlined />}>
            SUCCESS
          </Tag>
        );
      case CommandStatus.DEVICE_REJECTED:
        return (
          <Tag color="warning" icon={<WarningOutlined />}>
            REJECTED
          </Tag>
        );
      case CommandStatus.TIMEOUT:
        return (
          <Tag color="error" icon={<ClockCircleOutlined />}>
            TIMEOUT
          </Tag>
        );
      case CommandStatus.FAILED:
        return (
          <Tag color="error" icon={<CloseCircleOutlined />}>
            FAILED
          </Tag>
        );
      default:
        return <Tag>{status}</Tag>;
    }
  };

  const voltageMeta = evaluateVoltageHealth(currentVehicle.telemetry.batteryVoltage);

  return (
    <div style={{ padding: '0 4px', maxWidth: 1600, margin: '0 auto' }}>
      {/* 顶部选车与状态控制条 */}
      <Card
        styles={{ body: { padding: '16px 20px' } }}
        style={{
          borderRadius: 8,
          marginBottom: 16,
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        }}
      >
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Space align="center" size="middle" wrap>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CarOutlined style={{ fontSize: 22, color: '#1677ff' }} />
                <Title level={4} style={{ margin: 0 }}>
                  远程车控全景运营台
                </Title>
              </div>
              <Tag color="blue">实时 MQTT 遥测</Tag>
            </Space>
          </Col>
          <Col xs={24} md={12} style={{ textAlign: 'right' }}>
            <Space align="center" size="middle" wrap>
              <Text type="secondary">当前管控车辆：</Text>
              <Select
                value={selectedVehicleId}
                onChange={handleSelectVehicle}
                style={{ width: 280 }}
                showSearch
                optionFilterProp="label"
                options={vehicles.map((v) => ({
                  value: v.id,
                  label: `${v.plateNumber} · ${v.brandName} ${v.modelName} (${v.isOnline ? '🟢 在线' : '⚪ 离线'})`,
                }))}
              />
              <Divider type="vertical" />
              <Space size={6}>
                <Text style={{ fontSize: 13 }}>在线模拟：</Text>
                <Switch
                  checked={currentVehicle.isOnline}
                  onChange={handleToggleOnline}
                  checkedChildren="在线"
                  unCheckedChildren="离线"
                />
              </Space>
              <Button
                icon={<ThunderboltOutlined />}
                onClick={() => handleOpenTraceDrawer()}
              >
                全量链路大屏
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => loadVehicleContext(selectedVehicleId)}
              >
                刷新车况
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 409 排他锁冲突友好提醒 */}
      {conflictWarning && (
        <Alert
          message="并发排他锁提示"
          description={conflictWarning}
          type="warning"
          showIcon
          closable
          onClose={() => setConflictWarning(null)}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* 70% / 30% 核心响应式工作台 */}
      <Row gutter={[16, 16]}>
        {/* 左栏 70%: 车辆全景看板与 13 类指令控制板 */}
        <Col xs={24} lg={17}>
          {/* 全景工况指标卡片 */}
          <Card
            title={
              <Space align="center">
                <DashboardOutlined style={{ color: '#1677ff' }} />
                <span>目标车辆实时工况透视看板</span>
                <Badge
                  status={currentVehicle.isOnline ? 'success' : 'default'}
                  text={
                    <Text strong style={{ color: currentVehicle.isOnline ? '#52c41a' : '#8c8c8c' }}>
                      {currentVehicle.isOnline ? '车载终端在线 (MQTT 连接就绪)' : '车载终端离线 (心跳中断)'}
                    </Text>
                  }
                />
              </Space>
            }
            styles={{ body: { padding: '16px 20px' } }}
            style={{ borderRadius: 8, marginBottom: 16 }}
          >
            <Descriptions
              bordered
              size="small"
              column={{ xs: 2, sm: 3, md: 4, lg: 4 }}
              styles={{
                label: { background: '#fafafa', width: '22%' },
              }}
            >
              <Descriptions.Item label="车牌 / 品牌">
                <Text strong>{currentVehicle.plateNumber}</Text>
                <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                  {currentVehicle.brandName} {currentVehicle.modelName}
                </div>
              </Descriptions.Item>

              <Descriptions.Item label="VIN 码 / 设备号">
                <Text copyable style={{ fontSize: 12 }}>
                  {currentVehicle.vin}
                </Text>
                <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                  终端: {currentVehicle.deviceNo}
                </div>
              </Descriptions.Item>

              <Descriptions.Item label="蓄电池电压">
                <Space>
                  <Text strong style={{ fontSize: 15, color: voltageMeta.color }}>
                    {currentVehicle.telemetry.batteryVoltage.toFixed(1)} V
                  </Text>
                  <Tag color={voltageMeta.tagColor}>{voltageMeta.text}</Tag>
                </Space>
              </Descriptions.Item>

              <Descriptions.Item label="动力 / 发动机">
                {currentVehicle.telemetry.engine === 'RUNNING' ? (
                  <Tag color="success">点火运行中 (ON)</Tag>
                ) : (
                  <Tag color="default">已熄火驻车 (OFF)</Tag>
                )}
                <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                  车速: {currentVehicle.telemetry.speed} km/h [{currentVehicle.telemetry.gear} 档]
                </div>
              </Descriptions.Item>

              <Descriptions.Item label="四门锁态">
                {currentVehicle.telemetry.doorLocks === 'LOCKED' ? (
                  <Tag color="blue" icon={<LockOutlined />}>
                    已闭锁 (LOCKED)
                  </Tag>
                ) : (
                  <Tag color="warning" icon={<UnlockOutlined />}>
                    已开启 (UNLOCKED)
                  </Tag>
                )}
              </Descriptions.Item>

              <Descriptions.Item label="后备箱 / 天窗">
                <Space direction="vertical" size={2}>
                  <div>
                    尾箱:{' '}
                    {currentVehicle.telemetry.trunk === 'CLOSED' ? (
                      <Tag color="default">已闭合</Tag>
                    ) : (
                      <Tag color="volcano">已弹开</Tag>
                    )}
                  </div>
                  <div>
                    天窗:{' '}
                    {currentVehicle.telemetry.sunroof === 'CLOSED' ? (
                      <Tag color="default">已关闭</Tag>
                    ) : (
                      <Tag color="processing">已开启</Tag>
                    )}
                  </div>
                </Space>
              </Descriptions.Item>

              <Descriptions.Item label="座舱温控">
                <Space direction="vertical" size={2}>
                  <div>
                    空调:{' '}
                    {currentVehicle.telemetry.acRunning ? (
                      <Tag color="cyan">
                        运行中 ({currentVehicle.telemetry.acTemp}°C / {currentVehicle.telemetry.acFanSpeed}档)
                      </Tag>
                    ) : (
                      <Tag color="default">已关闭</Tag>
                    )}
                  </div>
                  <div style={{ fontSize: 12 }}>
                    加热: 主驾[{currentVehicle.telemetry.seatHeatDriver === 0 ? 'OFF' : `${currentVehicle.telemetry.seatHeatDriver}档`}] / 副驾[{currentVehicle.telemetry.seatHeatPassenger === 0 ? 'OFF' : `${currentVehicle.telemetry.seatHeatPassenger}档`}]
                  </div>
                </Space>
              </Descriptions.Item>

              <Descriptions.Item label="里程 / 心跳">
                <div>{currentVehicle.telemetry.mileage.toLocaleString()} km</div>
                <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                  最新心跳: {currentVehicle.telemetry.lastHeartbeat}
                </div>
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {/* 13 类远程控车指令矩阵卡片 */}
          <Card
            title={
              <Space>
                <SafetyCertificateOutlined style={{ color: '#52c41a' }} />
                <span>13 类远程指令控制矩阵</span>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  (根据车型能力模板继承动态启用，高危操作强制核验安全码)
                </Text>
              </Space>
            }
            styles={{ body: { padding: '20px' } }}
            style={{ borderRadius: 8 }}
          >
            {/* 分组 1: 门锁与后备箱 */}
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  marginBottom: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{ width: 4, height: 14, background: '#1677ff', borderRadius: 2 }} />
                【门锁与后备箱】
              </div>
              <Row gutter={[12, 12]}>
                <Col xs={12} sm={6}>
                  {renderCommandButton(CommandCode.CMD_LOCK)}
                </Col>
                <Col xs={12} sm={6}>
                  <Popconfirm
                    title="车辆门锁解锁确认"
                    description="解锁车门后若无人上车，可能存在被盗风险，确认解锁吗？"
                    okText="确认解锁"
                    cancelText="取消"
                    disabled={isCommandDisabled(CommandCode.CMD_UNLOCK)}
                    onConfirm={() => dispatchCommand(CommandCode.CMD_UNLOCK)}
                  >
                    <div>{renderCommandButton(CommandCode.CMD_UNLOCK, () => {})}</div>
                  </Popconfirm>
                </Col>
                <Col xs={12} sm={6}>
                  {renderCommandButton(CommandCode.CMD_TRUNK_OPEN, () => setTrunkModalOpen(true))}
                </Col>
                <Col xs={12} sm={6}>
                  <Popconfirm
                    title="关闭后备箱确认"
                    description="关闭后备箱前请确认尾箱周边无人及障碍物，确认关闭吗？"
                    okText="确认关闭"
                    cancelText="取消"
                    disabled={isCommandDisabled(CommandCode.CMD_TRUNK_CLOSE)}
                    onConfirm={() => dispatchCommand(CommandCode.CMD_TRUNK_CLOSE)}
                  >
                    <div>{renderCommandButton(CommandCode.CMD_TRUNK_CLOSE, () => {})}</div>
                  </Popconfirm>
                </Col>
              </Row>
            </div>

            {/* 分组 2: 动力与寻车 */}
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  marginBottom: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{ width: 4, height: 14, background: '#ff4d4f', borderRadius: 2 }} />
                【动力与寻车】
              </div>
              <Row gutter={[12, 12]}>
                <Col xs={24} sm={8}>
                  {renderCommandButton(CommandCode.CMD_FIND_VEHICLE)}
                </Col>
                <Col xs={24} sm={8}>
                  {renderCommandButton(CommandCode.CMD_ENGINE_START, () =>
                    handleTriggerL2(CommandCode.CMD_ENGINE_START)
                  )}
                </Col>
                <Col xs={24} sm={8}>
                  {renderCommandButton(CommandCode.CMD_ENGINE_STOP, () =>
                    handleTriggerL2(CommandCode.CMD_ENGINE_STOP)
                  )}
                </Col>
              </Row>
            </div>

            {/* 分组 3: 座舱温控 */}
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  marginBottom: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{ width: 4, height: 14, background: '#faad14', borderRadius: 2 }} />
                【座舱温控】
              </div>
              <Row gutter={[12, 12]}>
                <Col xs={24} sm={8}>
                  {renderCommandButton(CommandCode.CMD_AC_START, () => setAcModalOpen(true))}
                </Col>
                <Col xs={24} sm={8}>
                  {renderCommandButton(CommandCode.CMD_AC_STOP)}
                </Col>
                <Col xs={24} sm={8}>
                  {renderCommandButton(CommandCode.CMD_SEAT_HEAT, () => setSeatModalOpen(true))}
                </Col>
              </Row>
            </div>

            {/* 分组 4: 车窗天窗 */}
            <div>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  marginBottom: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{ width: 4, height: 14, background: '#52c41a', borderRadius: 2 }} />
                【车窗天窗】
              </div>
              <Row gutter={[12, 12]}>
                <Col xs={24} sm={8}>
                  <Popconfirm
                    title="一键降窗确认"
                    description="确认一键降下所有车窗通风吗？离开车辆前请注意天气及防盗"
                    okText="确认降窗"
                    cancelText="取消"
                    disabled={isCommandDisabled(CommandCode.CMD_WINDOW_OPEN)}
                    onConfirm={() => dispatchCommand(CommandCode.CMD_WINDOW_OPEN)}
                  >
                    <div>{renderCommandButton(CommandCode.CMD_WINDOW_OPEN, () => {})}</div>
                  </Popconfirm>
                </Col>
                <Col xs={24} sm={8}>
                  <Popconfirm
                    title="一键升窗确认"
                    description="升窗过程中请特别注意防夹手安全提醒，确认升起车窗吗？"
                    okText="确认升窗"
                    cancelText="取消"
                    disabled={isCommandDisabled(CommandCode.CMD_WINDOW_CLOSE)}
                    onConfirm={() => dispatchCommand(CommandCode.CMD_WINDOW_CLOSE)}
                  >
                    <div>{renderCommandButton(CommandCode.CMD_WINDOW_CLOSE, () => {})}</div>
                  </Popconfirm>
                </Col>
                <Col xs={24} sm={8}>
                  <Popconfirm
                    title="天窗开闭确认"
                    description="确认开闭全景天窗吗？请确认车顶无异物阻挡"
                    okText="确认操作"
                    cancelText="取消"
                    disabled={isCommandDisabled(CommandCode.CMD_SUNROOF_CONTROL)}
                    onConfirm={() => dispatchCommand(CommandCode.CMD_SUNROOF_CONTROL)}
                  >
                    <div>{renderCommandButton(CommandCode.CMD_SUNROOF_CONTROL, () => {})}</div>
                  </Popconfirm>
                </Col>
              </Row>
            </div>
          </Card>
        </Col>

        {/* 右栏 30%: 实时指令执行流水监控大屏 */}
        <Col xs={24} lg={7}>
          <Card
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                  <ClockCircleOutlined style={{ color: '#1677ff' }} />
                  <span>实时指令执行流水</span>
                </Space>
                <Badge count={commandLogs.length} overflowCount={99} style={{ backgroundColor: '#1677ff' }} />
              </div>
            }
            extra={
              <Space size="small">
                <Button
                  type="link"
                  size="small"
                  icon={<ThunderboltOutlined />}
                  style={{ padding: 0 }}
                  onClick={() => handleOpenTraceDrawer()}
                >
                  全量链路大屏
                </Button>
                <Button
                  type="text"
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={() => loadVehicleContext(selectedVehicleId)}
                />
              </Space>
            }
            styles={{ body: { padding: '12px', maxHeight: 720, overflowY: 'auto' } }}
            style={{ borderRadius: 8, height: '100%' }}
          >
            {commandLogs.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无控车执行流水"
                style={{ margin: '40px 0' }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {commandLogs.map((log) => {
                  const meta = COMMAND_METADATA[log.commandCode];
                  return (
                    <div
                      key={log.id}
                      style={{
                        padding: '10px 12px',
                        background: '#fafafa',
                        borderRadius: 6,
                        border: '1px solid #f0f0f0',
                        fontSize: 13,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onClick={() => handleOpenTraceDrawer(log.id)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = '#91caff';
                        e.currentTarget.style.backgroundColor = '#f0f7ff';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = '#f0f0f0';
                        e.currentTarget.style.backgroundColor = '#fafafa';
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 4,
                        }}
                      >
                        <Space size={6}>
                          <span style={{ color: '#1677ff' }}>{COMMAND_ICON_MAP[log.commandCode]}</span>
                          <Text strong>{meta ? meta.name : log.commandCode}</Text>
                        </Space>
                        <Space size={4}>
                          {renderStatusTag(log.status)}
                          <Button
                            type="link"
                            size="small"
                            style={{ padding: 0, fontSize: 12, height: 'auto' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenTraceDrawer(log.id);
                            }}
                          >
                            追踪 &gt;
                          </Button>
                        </Space>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          color: 'rgba(0,0,0,0.45)',
                          fontSize: 12,
                        }}
                      >
                        <span>
                          {log.sentAt
                            ? new Date(log.sentAt).toLocaleTimeString('zh-CN', { hour12: false })
                            : '-'}
                        </span>
                        <span>
                          耗时: <Text strong style={{ color: '#52c41a' }}>{formatExecutionDuration(log.durationMs)}</Text>
                        </span>
                      </div>

                      {log.errorMessage && (
                        <div
                          style={{
                            marginTop: 6,
                            padding: '4px 6px',
                            background: '#fff2f0',
                            borderRadius: 4,
                            color: '#ff4d4f',
                            fontSize: 11,
                          }}
                        >
                          原因: {log.errorMessage}
                        </div>
                      )}

                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 10,
                          color: 'rgba(0,0,0,0.3)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        ID: {log.id} | 凭据: {log.idempotencyKey.slice(0, 16)}...
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* ---------------- 模态框 1: L2 高危强核验 (点火 / 熄火) ---------------- */}
      <Modal
        title={
          <Space>
            <WarningOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />
            <span>L2 强安全级控车指令校验</span>
          </Space>
        }
        open={l2ModalOpen}
        onOk={handleConfirmL2}
        onCancel={() => setL2ModalOpen(false)}
        okText="核验安全码并下发"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <div style={{ marginTop: 12 }}>
          {l2TargetCode === CommandCode.CMD_ENGINE_START && (
            <>
              <Alert
                type="warning"
                showIcon
                message="远程点火启动注意事项"
                description="车辆启动后将保持怠速运转，运行至设定时间后将自动熄火。请确认车辆周围环境安全且驻车制动已拉起。"
                style={{ marginBottom: 16 }}
              />
              <Form.Item label="选择启动运行时长 (分钟)">
                <Row align="middle" gutter={16}>
                  <Col span={18}>
                    <Slider
                      min={5}
                      max={45}
                      step={5}
                      value={l2Duration}
                      onChange={(v) => setL2Duration(v)}
                    />
                  </Col>
                  <Col span={6}>
                    <Text strong style={{ color: '#1677ff' }}>
                      {l2Duration} 分钟
                    </Text>
                  </Col>
                </Row>
              </Form.Item>
            </>
          )}

          {l2TargetCode === CommandCode.CMD_ENGINE_STOP && (
            <>
              <Alert
                type="error"
                showIcon
                message="远程熄火前置安全条件校验"
                description="系统已自动对车机工况进行前置核验：当前车速必须为 0 且变速箱必须处于 P 档。"
                style={{ marginBottom: 16 }}
              />
              <div
                style={{
                  background: '#f6ffed',
                  border: '1px solid #b7eb8f',
                  borderRadius: 6,
                  padding: '10px 14px',
                  marginBottom: 16,
                }}
              >
                <Row gutter={[16, 8]}>
                  <Col span={12}>
                    <Text type="secondary">当前车速检测：</Text>
                    <Tag color="success">0 km/h (检测通过)</Tag>
                  </Col>
                  <Col span={12}>
                    <Text type="secondary">当前挡位检测：</Text>
                    <Tag color="success">P 档 (检测通过)</Tag>
                  </Col>
                </Row>
              </div>
            </>
          )}

          <Form.Item
            label="6 位操作安全码"
            required
            validateStatus={l2PinError ? 'error' : ''}
            help={l2PinError || '开发与测试演示环境默认安全码为: 123456'}
          >
            <Input.Password
              maxLength={6}
              placeholder="请输入 6 位纯数字安全码 (例: 123456)"
              value={l2Pin}
              onChange={(e) => {
                setL2Pin(e.target.value);
                setL2PinError(null);
              }}
              style={{ fontSize: 16, letterSpacing: 4 }}
            />
          </Form.Item>
        </div>
      </Modal>

      {/* ---------------- 模态框 2: 空调温控配置参数 ---------------- */}
      <Modal
        title={
          <Space>
            <FireOutlined style={{ color: '#faad14' }} />
            <span>座舱远程空调温控设定</span>
          </Space>
        }
        open={acModalOpen}
        onOk={() => {
          setAcModalOpen(false);
          dispatchCommand(CommandCode.CMD_AC_START, {
            params: {
              targetTemp: acTargetTemp,
              fanSpeed: acFanSpeed,
              loopMode: acLoopMode,
            },
          });
        }}
        onCancel={() => setAcModalOpen(false)}
        okText="立即开启空调"
        cancelText="取消"
      >
        <div style={{ marginTop: 12 }}>
          <Form.Item label="设定目标温度 (°C)">
            <Row align="middle" gutter={16}>
              <Col span={18}>
                <Slider
                  min={16}
                  max={30}
                  step={1}
                  value={acTargetTemp}
                  onChange={(v) => setAcTargetTemp(v)}
                />
              </Col>
              <Col span={6}>
                <Text strong style={{ fontSize: 16, color: '#1677ff' }}>
                  {acTargetTemp} °C
                </Text>
              </Col>
            </Row>
          </Form.Item>

          <Form.Item label="风速档位调节">
            <Radio.Group
              value={acFanSpeed}
              onChange={(e) => setAcFanSpeed(e.target.value)}
              buttonStyle="solid"
            >
              <Radio.Button value={1}>1档 (微风柔和)</Radio.Button>
              <Radio.Button value={2}>2档 (标准适度)</Radio.Button>
              <Radio.Button value={3}>3档 (强劲速冷)</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item label="空气循环模式">
            <Radio.Group
              value={acLoopMode}
              onChange={(e) => setAcLoopMode(e.target.value)}
            >
              <Radio value="INTERNAL">内循环 (快速保温)</Radio>
              <Radio value="EXTERNAL">外循环 (换气通风)</Radio>
            </Radio.Group>
          </Form.Item>
        </div>
      </Modal>

      {/* ---------------- 模态框 3: 座椅加热档位调节 ---------------- */}
      <Modal
        title={
          <Space>
            <HeatMapOutlined style={{ color: '#fa541c' }} />
            <span>座椅电加热档位调节</span>
          </Space>
        }
        open={seatModalOpen}
        onOk={() => {
          setSeatModalOpen(false);
          dispatchCommand(CommandCode.CMD_SEAT_HEAT, {
            params: {
              seat: seatTarget,
              level: seatLevel,
            },
          });
        }}
        onCancel={() => setSeatModalOpen(false)}
        okText="设定加热"
        cancelText="取消"
      >
        <div style={{ marginTop: 12 }}>
          <Form.Item label="选择加热座椅目标">
            <Radio.Group
              value={seatTarget}
              onChange={(e) => setSeatTarget(e.target.value)}
              buttonStyle="solid"
            >
              <Radio.Button value="DRIVER">主驾驶座</Radio.Button>
              <Radio.Button value="PASSENGER">副驾驶座</Radio.Button>
              <Radio.Button value="BOTH">前排双方座椅</Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Form.Item label="加热档位强度">
            <Radio.Group
              value={seatLevel}
              onChange={(e) => setSeatLevel(e.target.value)}
              buttonStyle="solid"
            >
              <Radio.Button value={1}>1档 (微温保暖)</Radio.Button>
              <Radio.Button value={2}>2档 (温暖适宜)</Radio.Button>
              <Radio.Button value={3}>3档 (速热强劲)</Radio.Button>
            </Radio.Group>
          </Form.Item>
        </div>
      </Modal>

      {/* ---------------- 模态框 4: 后备箱开启财产风险确认 ---------------- */}
      <Modal
        title={
          <Space>
            <WarningOutlined style={{ color: '#faad14' }} />
            <span>开启后备箱风险警示</span>
          </Space>
        }
        open={trunkModalOpen}
        onOk={() => {
          setTrunkModalOpen(false);
          dispatchCommand(CommandCode.CMD_TRUNK_OPEN);
        }}
        onCancel={() => setTrunkModalOpen(false)}
        okText="确认开启后备箱"
        cancelText="取消"
      >
        <Alert
          type="warning"
          showIcon
          message="财产安全防盗提醒"
          description="后备箱弹开后若现场无专人看管或关闭，可能导致车内物品遗失或遭遇风雨财产损失，请确认现场有人接收后再行开启！"
          style={{ marginTop: 12 }}
        />
      </Modal>

      {/* ---------------- 720px 指令全生命周期流水与状态机追踪抽屉 ---------------- */}
      <CommandStreamDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        commandId={selectedCommandId}
        vehicleId={selectedVehicleId}
      />
    </div>
  );
};
