import React, { useState, useEffect, useCallback } from 'react';
import {
  Drawer,
  Tabs,
  Descriptions,
  Card,
  Tag,
  Badge,
  Space,
  Button,
  Typography,
  Row,
  Col,
  Statistic,
  Progress,
  Alert,
  Form,
  Input,
  InputNumber,
  Switch,
  Slider,
  Modal,
  Spin,
  Empty,
  Divider,
  message,
  Tooltip,
} from 'antd';
import {
  ReloadOutlined,
  CarOutlined,
  InfoCircleOutlined,
  DashboardOutlined,
  SettingOutlined,
  CloudUploadOutlined,
  WarningOutlined,
  ExclamationCircleFilled,
  CompassOutlined,
  ThunderboltOutlined,
  DesktopOutlined,
} from '@ant-design/icons';
import {
  type DeviceDetailDto,
  type DeviceConfigInput,
  validateVoltage,
  getVoltageStatusMeta,
  validateTemperature,
  getTemperatureStatusMeta,
  validateHeartbeatInterval,
  validateSecurityCode,
  getOnlineStatusMeta,
  getLifecycleStatusMeta,
  getSignalQuality,
  isApiError,
} from './device-core.ts';
import {
  fetchDeviceDetailApi,
  updateDeviceConfigApi,
  rebootDeviceApi,
} from '../../api/device.ts';

const { Text, Title, Paragraph } = Typography;

export interface DeviceDetailDrawerProps {
  open: boolean;
  deviceId: string | null;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * 4G 信号指示条形组件
 */
const SignalBarIndicator: React.FC<{ rsrp?: number | null }> = ({ rsrp }) => {
  const meta = getSignalQuality(rsrp);
  return (
    <Tooltip title={`4G 信号质量: ${meta.label} (${meta.rsrp !== null ? `${meta.rsrp} dBm` : '无信号'})`}>
      <Space size={3} align="end" style={{ height: 20 }}>
        {[6, 10, 14, 18].map((h, idx) => (
          <span
            key={idx}
            style={{
              display: 'inline-block',
              width: 4,
              height: h,
              backgroundColor: idx < meta.bars ? meta.color : '#e0e0e0',
              borderRadius: 1.5,
            }}
          />
        ))}
        <Text
          style={{
            fontSize: 13,
            marginLeft: 6,
            color: meta.bars > 0 ? meta.color : '#8c8c8c',
            fontFamily: 'SFMono-Regular, Consolas, Courier, monospace',
            fontWeight: 500,
          }}
        >
          {meta.rsrp !== null ? `${meta.rsrp} dBm` : '无信号'}
        </Text>
      </Space>
    </Tooltip>
  );
};

export const DeviceDetailDrawer: React.FC<DeviceDetailDrawerProps> = ({
  open,
  deviceId,
  onClose,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [device, setDevice] = useState<DeviceDetailDto | null>(null);
  const [activeTab, setActiveTab] = useState('hardware');

  // 参数配置表单
  const [configForm] = Form.useForm();
  const [submittingConfig, setSubmittingConfig] = useState(false);

  // L2 远程重启模态框
  const [rebootModalVisible, setRebootModalVisible] = useState(false);
  const [securityCode, setSecurityCode] = useState('');
  const [rebooting, setRebooting] = useState(false);

  // 拉取单台设备详情
  const loadDeviceDetail = useCallback(async () => {
    if (!deviceId) return;
    setLoading(true);
    try {
      const data = await fetchDeviceDetailApi(deviceId);
      setDevice(data);

      // 同步配置表单初始值
      if (data.config) {
        configForm.setFieldsValue({
          heartbeatInterval: data.config.heartbeatInterval ?? 30,
          apn: data.config.apn ?? 'CMNET',
          locationReportEnabled: data.config.locationReportEnabled ?? true,
          locationReportInterval: data.config.locationReportInterval ?? 30,
          blePkeEnabled: data.config.blePkeEnabled ?? true,
          blePkeSensitivity: data.config.blePkeSensitivity ?? 3,
        });
      }
    } catch (err) {
      if (isApiError(err)) {
        message.error(`加载设备详情失败: ${err.message}`);
      } else if (err instanceof Error) {
        message.error(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [deviceId, configForm]);

  useEffect(() => {
    if (open && deviceId) {
      loadDeviceDetail();
    } else {
      setDevice(null);
      setRebootModalVisible(false);
      setSecurityCode('');
      setActiveTab('hardware');
      configForm.resetFields();
    }
  }, [open, deviceId, loadDeviceDetail, configForm]);

  // 提交参数配置下发
  const handleConfigSubmit = async () => {
    if (!deviceId) return;
    try {
      const values = await configForm.validateFields();
      setSubmittingConfig(true);

      const input: DeviceConfigInput = {
        heartbeatInterval: values.heartbeatInterval,
        apn: values.apn.trim(),
        locationReportEnabled: values.locationReportEnabled,
        locationReportInterval: values.locationReportInterval,
        blePkeEnabled: values.blePkeEnabled,
        blePkeSensitivity: values.blePkeSensitivity,
      };

      const updated = await updateDeviceConfigApi(deviceId, input);
      message.success('远程参数配置指令已成功下发至设备！');
      setDevice(updated);
      onSuccess?.();
    } catch (err) {
      if (isApiError(err)) {
        message.error(`参数下发失败: ${err.message}`);
      } else if (err instanceof Error && !('errorFields' in err)) {
        message.error(err.message);
      }
    } finally {
      setSubmittingConfig(false);
    }
  };

  // 确认 L2 远程重启
  const handleRebootConfirm = async () => {
    if (!deviceId) return;
    if (!validateSecurityCode(securityCode)) {
      message.error('安全确认码错误，请输入严格匹配的 "REBOOT"');
      return;
    }

    setRebooting(true);
    try {
      const result = await rebootDeviceApi(deviceId, securityCode);
      message.success(result.message || '远程重启指令已下发！');
      setRebootModalVisible(false);
      setSecurityCode('');
      loadDeviceDetail();
      onSuccess?.();
    } catch (err) {
      if (isApiError(err)) {
        message.error(`重启下发失败: ${err.message}`);
      } else if (err instanceof Error) {
        message.error(err.message);
      }
    } finally {
      setRebooting(false);
    }
  };

  // 渲染头部
  const renderHeader = () => {
    if (!device) return '设备详情';
    const onlineMeta = getOnlineStatusMeta(device.onlineStatus);

    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingRight: 24 }}>
        <Space size="middle" align="center">
          <DesktopOutlined style={{ color: '#1677ff', fontSize: 18 }} />
          <Text
            copyable={{ tooltips: ['复制设备编号', '已复制'] }}
            style={{
              fontFamily: 'SFMono-Regular, Consolas, Courier, monospace',
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            {device.deviceNo}
          </Text>
          <Badge
            color={onlineMeta.badgeColor}
            text={
              <Text strong style={{ color: onlineMeta.badgeColor, fontSize: 13 }}>
                {onlineMeta.label}
              </Text>
            }
          />
          <Tag color="blue">{device.projectName || '默认项目'}</Tag>
        </Space>

        <Button
          type="text"
          icon={<ReloadOutlined spin={loading} />}
          onClick={loadDeviceDetail}
          title="刷新设备工况"
        />
      </div>
    );
  };

  // Tab 1: 硬件与基础档案
  const renderHardwareTab = () => {
    if (!device) return null;
    const lifecycleMeta = getLifecycleStatusMeta(device.status);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* 基础参数 Descriptions */}
        <Card
          size="small"
          title={<Text strong>硬件基础档案</Text>}
          bordered={false}
          style={{ background: '#fafafa', borderRadius: 8 }}
        >
          <Descriptions column={2} size="small" bordered={false}>
            <Descriptions.Item label="设备编号">
              <Text copyable style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                {device.deviceNo}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="硬件型号">
              <Text>{device.productName || device.productKey}</Text>
            </Descriptions.Item>

            <Descriptions.Item label="IMEI (硬件串号)">
              <Text copyable style={{ fontFamily: 'monospace' }}>
                {device.imei}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="ICCID (SIM卡)">
              {device.iccid ? (
                <Text copyable style={{ fontFamily: 'monospace' }}>
                  {device.iccid}
                </Text>
              ) : (
                <Text type="secondary">-</Text>
              )}
            </Descriptions.Item>

            <Descriptions.Item label="所属项目">
              <Text>{device.projectName || device.projectId}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="所属机构">
              <Text>{device.orgName || '华南智慧车联网运营部'}</Text>
            </Descriptions.Item>

            <Descriptions.Item label="固件版本">
              <Tag color="cyan" style={{ fontFamily: 'monospace' }}>
                {device.firmwareVersion}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="资产状态">
              <Tag color={lifecycleMeta.color}>{lifecycleMeta.label}</Tag>
            </Descriptions.Item>

            <Descriptions.Item label="激活入网时间">
              <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>
                {device.activatedAt || '-'}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="最后心跳时间">
              <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>
                {device.lastHeartbeatAt || '-'}
              </Text>
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {/* 绑定车辆卡片 */}
        <Card
          size="small"
          title={
            <Space>
              <CarOutlined style={{ color: '#1677ff' }} />
              <Text strong>绑定车辆档案</Text>
            </Space>
          }
          bordered={false}
          style={{
            background: device.boundVehicle || device.boundVehiclePlate ? '#f0f5ff' : '#fafafa',
            borderRadius: 8,
            border: device.boundVehicle || device.boundVehiclePlate ? '1px solid #d6e4ff' : '1px solid #f0f0f0',
          }}
        >
          {device.boundVehicle || device.boundVehiclePlate ? (
            <Descriptions column={2} size="small" bordered={false}>
              <Descriptions.Item label="车牌号码">
                <Tag color="blue" style={{ fontSize: 13, fontWeight: 600, padding: '2px 8px' }}>
                  {device.boundVehicle?.plate || device.boundVehiclePlate}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="车架号 (VIN)">
                <Text copyable style={{ fontFamily: 'monospace', fontSize: 13 }}>
                  {device.boundVehicle?.vin || device.boundVin || 'LFPH2E023N10001'}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="车型品牌与规格">
                <Text>{device.boundVehicle?.model || '新能源双路CAN智能乘用车'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="车主信息">
                <Text>
                  {device.boundVehicle?.ownerName || '张**'}{' '}
                  <Text type="secondary">({device.boundVehicle?.ownerPhone || '138****8888'})</Text>
                </Text>
              </Descriptions.Item>
            </Descriptions>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <Space direction="vertical" size={2}>
                  <Text type="secondary">当前设备未绑定任何车辆</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    如需挂载设备，请在「车辆资产中心」进行配对建档绑定。
                  </Text>
                </Space>
              }
            />
          )}
        </Card>
      </div>
    );
  };

  // Tab 2: 实时工况监控仪表
  const renderTelemetryTab = () => {
    if (!device) return null;

    const voltageMeta = getVoltageStatusMeta(device.mainVoltage);
    const tempMeta = getTemperatureStatusMeta(device.temperature);
    const batteryPercent = device.backupBatteryPercent ?? 0;
    const isBatteryLow = batteryPercent < 20;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* 异常预警提示条 */}
        {voltageMeta.isAlert && (
          <Alert
            type={voltageMeta.alertType || 'warning'}
            showIcon
            message={voltageMeta.label}
            description={
              voltageMeta.status === 'LOW'
                ? `当前主电瓶电压 ${device.mainVoltage}V 低于 11.5V 警戒线，电瓶可能亏电或漏电，请尽快维护！`
                : `当前主电瓶电压 ${device.mainVoltage}V 高于 15.0V 发电机过压警戒线，请检查整流发电机！`
            }
          />
        )}

        {tempMeta.isAlert && (
          <Alert
            type={tempMeta.alertType || 'warning'}
            showIcon
            message={tempMeta.label}
            description={
              tempMeta.status === 'OVERHEAT'
                ? `芯片温度达 ${device.temperature}°C，已超出 75°C 危险安全阈值，请排查散热或降低高负载任务！`
                : `芯片温度达 ${device.temperature}°C，处于 60~75°C 升高区间，请保持监控。`
            }
          />
        )}

        {isBatteryLow && (
          <Alert
            type="error"
            showIcon
            message="备用锂电池电量严重不足"
            description={`备用电池仅剩 ${batteryPercent}% (低于 20%)，主电源若断电将无法维持离线告警！`}
          />
        )}

        {/* 通讯与工况指标 (Row 1) */}
        <Card
          size="small"
          title={<Text strong>通讯与网络态势</Text>}
          bordered={false}
          style={{ background: '#fafafa', borderRadius: 8 }}
        >
          <Row gutter={[16, 16]} align="middle">
            <Col span={8}>
              <Statistic
                title="在线状态与心跳"
                value={getOnlineStatusMeta(device.onlineStatus).label}
                valueStyle={{ color: getOnlineStatusMeta(device.onlineStatus).badgeColor, fontSize: 18 }}
                suffix={
                  <Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>
                    {device.onlineStatus === 'ONLINE' ? `(延迟 ${device.lastHeartbeatLatency ?? 2}s)` : ''}
                  </Text>
                }
              />
            </Col>

            <Col span={8}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  4G 蜂窝网络信号
                </Text>
                <SignalBarIndicator rsrp={device.signalRsrp} />
              </div>
            </Col>

            <Col span={8}>
              <Statistic
                title="CSQ 信号等级"
                value={device.csq !== undefined ? `${device.csq} / 31` : '-'}
                valueStyle={{ fontSize: 18, fontFamily: 'monospace' }}
                suffix={
                  device.csq !== undefined ? (
                    <Tag color={device.csq >= 20 ? 'green' : device.csq >= 12 ? 'blue' : 'orange'}>
                      {device.csq >= 20 ? '优' : device.csq >= 12 ? '良' : '弱'}
                    </Tag>
                  ) : null
                }
              />
            </Col>
          </Row>
        </Card>

        {/* 电气与芯片监测 (Row 2) */}
        <Card
          size="small"
          title={<Text strong>电气环境与核心传感器监测</Text>}
          bordered={false}
          style={{ background: '#fafafa', borderRadius: 8 }}
        >
          <Row gutter={[16, 16]} align="middle">
            <Col span={8}>
              <Statistic
                title="主电瓶电压 (12V系统)"
                value={device.mainVoltage !== undefined ? device.mainVoltage : '-'}
                precision={1}
                suffix="V"
                valueStyle={{
                  color: voltageMeta.color,
                  fontSize: 22,
                  fontFamily: 'monospace',
                  fontWeight: 600,
                }}
              />
              <Tag color={voltageMeta.status === 'NORMAL' ? 'success' : voltageMeta.status === 'LOW' ? 'warning' : 'error'} style={{ marginTop: 4 }}>
                {voltageMeta.label}
              </Tag>
            </Col>

            <Col span={8} style={{ textAlign: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Progress
                  type="circle"
                  percent={batteryPercent}
                  size={68}
                  strokeColor={isBatteryLow ? '#ff4d4f' : '#52c41a'}
                />
                <Text style={{ fontSize: 12, marginTop: 4 }}>备用锂电池电量</Text>
              </div>
            </Col>

            <Col span={8}>
              <Statistic
                title="芯片运行温度"
                value={device.temperature !== undefined ? device.temperature : '-'}
                suffix="°C"
                valueStyle={{
                  color: tempMeta.color,
                  fontSize: 22,
                  fontFamily: 'monospace',
                  fontWeight: 600,
                }}
              />
              <Tag
                color={tempMeta.status === 'NORMAL' ? 'success' : tempMeta.status === 'WARNING' ? 'warning' : 'error'}
                style={{ marginTop: 4 }}
              >
                {tempMeta.label}
              </Tag>
            </Col>
          </Row>
        </Card>

        {/* 定位与导航数据 (Row 3) */}
        <Card
          size="small"
          title={
            <Space>
              <CompassOutlined style={{ color: '#1677ff' }} />
              <Text strong>高精度卫星定位监测</Text>
            </Space>
          }
          bordered={false}
          style={{ background: '#fafafa', borderRadius: 8 }}
        >
          <Row gutter={[16, 16]} align="middle">
            <Col span={12}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  WGS-84 经纬度坐标
                </Text>
                <Text
                  copyable={{ tooltips: ['复制坐标', '已复制'] }}
                  style={{
                    fontFamily: 'SFMono-Regular, Consolas, Courier, monospace',
                    fontWeight: 600,
                    fontSize: 14,
                  }}
                >
                  {device.gpsCoordinates || '22.543099, 114.057868'}
                </Text>
              </div>
            </Col>

            <Col span={6}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  定位锁星状态
                </Text>
                <div>
                  <Tag
                    color={
                      device.gpsStatus === 'GPS已锁定'
                        ? 'green'
                        : device.gpsStatus === '基站定位'
                        ? 'blue'
                        : 'default'
                    }
                  >
                    {device.gpsStatus || 'GPS已锁定'}
                  </Tag>
                </div>
              </div>
            </Col>

            <Col span={6}>
              <Statistic
                title="可用搜星颗数"
                value={device.satelliteCount ?? 14}
                suffix="颗"
                valueStyle={{ fontSize: 18, color: '#1677ff', fontFamily: 'monospace' }}
              />
            </Col>
          </Row>
        </Card>
      </div>
    );
  };

  // Tab 3: 远程参数配置与 L2 重启门禁
  const renderConfigTab = () => {
    if (!device) return null;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* 参数下发表单 */}
        <Card
          size="small"
          title={<Text strong>终端通信与功能参数下发</Text>}
          bordered={false}
          style={{ background: '#fafafa', borderRadius: 8 }}
        >
          <Form
            form={configForm}
            layout="vertical"
            initialValues={{
              heartbeatInterval: 30,
              apn: 'CMNET',
              locationReportEnabled: true,
              locationReportInterval: 30,
              blePkeEnabled: true,
              blePkeSensitivity: 3,
            }}
          >
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  label="心跳上报周期 (秒)"
                  name="heartbeatInterval"
                  rules={[
                    { required: true, message: '请输入心跳周期' },
                    {
                      validator: async (_, value) => {
                        if (value !== undefined && !validateHeartbeatInterval(value)) {
                          throw new Error('心跳上报周期有效区间为 10 ~ 3600 秒');
                        }
                      },
                    },
                  ]}
                  extra="推荐值: 30秒 (范围 10~3600秒，步长 5)"
                >
                  <InputNumber min={10} max={3600} step={5} addonAfter="秒" style={{ width: '100%' }} />
                </Form.Item>
              </Col>

              <Col span={12}>
                <Form.Item
                  label="APN 接入点名称"
                  name="apn"
                  rules={[
                    { required: true, message: '请输入APN接入点' },
                    { whitespace: true, message: 'APN接入点不能为空白字符' },
                  ]}
                  extra={
                    <Space size={4} style={{ marginTop: 4 }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>预设:</Text>
                      {['CMNET', 'UNINET', 'CTNET'].map((tag) => (
                        <Tag
                          key={tag}
                          style={{ cursor: 'pointer', fontSize: 11 }}
                          onClick={() => configForm.setFieldValue('apn', tag)}
                        >
                          {tag}
                        </Tag>
                      ))}
                    </Space>
                  }
                >
                  <Input placeholder="例如: CMNET" />
                </Form.Item>
              </Col>
            </Row>

            <Divider style={{ margin: '8px 0 16px' }} />

            <Row gutter={16} align="middle">
              <Col span={8}>
                <Form.Item
                  label="定位数据自动上报"
                  name="locationReportEnabled"
                  valuePropName="checked"
                >
                  <Switch checkedChildren="开启" unCheckedChildren="关闭" />
                </Form.Item>
              </Col>

              <Col span={16}>
                <Form.Item
                  label="定位上报间隔 (秒)"
                  name="locationReportInterval"
                  rules={[{ required: true, message: '请输入定位上报间隔' }]}
                >
                  <InputNumber min={5} max={600} step={5} addonAfter="秒" style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>

            <Divider style={{ margin: '8px 0 16px' }} />

            <Row gutter={16} align="middle">
              <Col span={8}>
                <Form.Item
                  label="蓝牙 PKE 感应开关"
                  name="blePkeEnabled"
                  valuePropName="checked"
                  extra="无感靠近迎宾与离车闭锁"
                >
                  <Switch checkedChildren="启用" unCheckedChildren="禁用" />
                </Form.Item>
              </Col>

              <Col span={16}>
                <Form.Item
                  label="蓝牙 PKE 感应灵敏度 (1~5档)"
                  name="blePkeSensitivity"
                >
                  <Slider
                    min={1}
                    max={5}
                    step={1}
                    marks={{
                      1: '1档(近)',
                      3: '3档(中)',
                      5: '5档(远)',
                    }}
                  />
                </Form.Item>
              </Col>
            </Row>

            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <Button
                type="primary"
                icon={<CloudUploadOutlined />}
                loading={submittingConfig}
                onClick={handleConfigSubmit}
              >
                下发参数配置
              </Button>
            </div>
          </Form>
        </Card>

        {/* 极高危操作区：远程设备重启 */}
        <Card
          size="small"
          style={{
            backgroundColor: '#fff1f0',
            border: '1px solid #ffccc7',
            borderRadius: 8,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Space align="center">
              <WarningOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />
              <Text strong style={{ color: '#cf1322', fontSize: 14 }}>
                极高危操作区：远程设备重启 (Remote Reboot)
              </Text>
            </Space>

            <Text type="secondary" style={{ color: '#a8071a', fontSize: 13 }}>
              下发远程重启指令将导致 T-Box 瞬时断开蜂窝通信链路并离线 30~60 秒。若车辆处于行驶中，可能导致控车状态短暂失联，请严格谨慎操作！
            </Text>

            <div style={{ textAlign: 'right', marginTop: 4 }}>
              <Button
                danger
                type="primary"
                icon={<ThunderboltOutlined />}
                onClick={() => {
                  setSecurityCode('');
                  setRebootModalVisible(true);
                }}
              >
                远程设备重启
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  };

  return (
    <>
      <Drawer
        title={renderHeader()}
        placement="right"
        width={640}
        open={open}
        onClose={onClose}
        destroyOnClose
        extra={
          <Button onClick={onClose} size="small">
            关闭
          </Button>
        }
      >
        {loading && !device ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <Spin size="large" tip="正在加载设备详细工况与配置..." />
          </div>
        ) : !device ? (
          <Empty description="未找到设备详情数据" />
        ) : (
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              {
                key: 'hardware',
                label: (
                  <Space>
                    <InfoCircleOutlined />
                    <span>硬件与基础档案</span>
                  </Space>
                ),
                children: renderHardwareTab(),
              },
              {
                key: 'telemetry',
                label: (
                  <Space>
                    <DashboardOutlined />
                    <span>实时工况监控</span>
                  </Space>
                ),
                children: renderTelemetryTab(),
              },
              {
                key: 'config',
                label: (
                  <Space>
                    <SettingOutlined />
                    <span>远程参数配置</span>
                  </Space>
                ),
                children: renderConfigTab(),
              },
            ]}
          />
        )}
      </Drawer>

      {/* L2 二次确认防误触模态框 */}
      <Modal
        title={
          <Space>
            <ExclamationCircleFilled style={{ color: '#ff4d4f', fontSize: 18 }} />
            <Text strong style={{ color: '#cf1322' }}>
              远程设备重启二次确认 (L2 门禁)
            </Text>
          </Space>
        }
        open={rebootModalVisible}
        onCancel={() => {
          setRebootModalVisible(false);
          setSecurityCode('');
        }}
        onOk={handleRebootConfirm}
        confirmLoading={rebooting}
        okText="确认下发重启指令"
        cancelText="取消"
        okButtonProps={{
          danger: true,
          disabled: !validateSecurityCode(securityCode),
        }}
        destroyOnClose
        width={480}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
          <Alert
            type="error"
            showIcon
            message="高危操作警告"
            description="重启将造成 T-Box 通信中断 30~60 秒，车载蓝牙与云端数据链路将重连。确定要立即向该设备下发重启指令吗？"
          />

          <div>
            <Paragraph style={{ marginBottom: 8, fontSize: 13 }}>
              为防止误触操作，请在下方文本框中输入安全确认码{' '}
              <Text code style={{ color: '#cf1322', fontWeight: 'bold' }}>
                REBOOT
              </Text>{' '}
              以激活确认按钮：
            </Paragraph>

            <Input
              placeholder="请输入 REBOOT 以确认重启"
              value={securityCode}
              onChange={(e) => setSecurityCode(e.target.value)}
              maxLength={20}
              allowClear
              style={{ fontFamily: 'monospace' }}
            />
          </div>
        </div>
      </Modal>
    </>
  );
};

export default DeviceDetailDrawer;
