import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Modal,
  Card,
  Typography,
  Tag,
  Badge,
  Space,
  Button,
  Radio,
  Select,
  Input,
  Alert,
  Tabs,
  Descriptions,
  Popconfirm,
  Spin,
  message,
} from 'antd';
import {
  LinkOutlined,
  DisconnectOutlined,
  SwapOutlined,
  ScanOutlined,
  BarcodeOutlined,
  WifiOutlined,
} from '@ant-design/icons';
import type { VehicleDto } from './vehicle-core.ts';
import {
  type DeviceDto,
  getOnlineStatusMeta,
  getSignalQuality,
} from '../device/device-core.ts';
import {
  validateBindingPair,
  UNBIND_REASONS,
  UNBIND_REASON_OPTIONS,
  type UnbindReason,
} from './vehicle-bind-core.ts';
import {
  bindDeviceApi,
  unbindDeviceApi,
  fetchAvailableDevicesApi,
} from '../../api/vehicle.ts';
import { fetchDeviceDetailApi } from '../../api/device.ts';
import { isApiError } from './vehicle-core.ts';

const { Text } = Typography;

export interface VehicleBindModalProps {
  open: boolean;
  vehicle: VehicleDto | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const VehicleBindModal: React.FC<VehicleBindModalProps> = ({
  open,
  vehicle,
  onClose,
  onSuccess,
}) => {
  // 设备数据与检索
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [availableDevices, setAvailableDevices] = useState<DeviceDto[]>([]);
  const [currentDevice, setCurrentDevice] = useState<DeviceDto | null>(null);

  // 模式 1：首次绑定向导状态
  const [inputMode, setInputMode] = useState<'SELECT' | 'MANUAL'>('SELECT');
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [bindRemark, setBindRemark] = useState('');
  const [bindingLoading, setBindingLoading] = useState(false);

  // 模式 2：换绑与解绑状态
  const [activeTab, setActiveTab] = useState<'rebind' | 'unbind'>('rebind');
  const [rebindDeviceId, setRebindDeviceId] = useState<string | null>(null);
  const [rebindRemark, setRebindRemark] = useState('');
  const [rebindLoading, setRebindLoading] = useState(false);

  const [unbindReason, setUnbindReason] = useState<UnbindReason | undefined>(undefined);
  const [unbindRemark, setUnbindRemark] = useState('');
  const [unbindLoading, setUnbindLoading] = useState(false);

  // 判断是否为已绑定模式
  const isBoundMode = Boolean(vehicle?.deviceId);

  // 加载可用空闲设备与当前绑定设备
  const loadModalData = useCallback(async () => {
    if (!open || !vehicle) return;
    setLoadingDevices(true);
    try {
      const freeDevices = await fetchAvailableDevicesApi();
      setAvailableDevices(freeDevices);

      if (vehicle.deviceId) {
        try {
          const detail = await fetchDeviceDetailApi(vehicle.deviceId);
          setCurrentDevice(detail);
        } catch {
          // 降级使用基础设备信息
          setCurrentDevice({
            id: vehicle.deviceId,
            deviceNo: vehicle.deviceNo || vehicle.deviceId,
            imei: '868123045678901',
            productKey: 'TBOX-G4-STD',
            productName: '4G 智慧车载终端 (标准版)',
            projectId: vehicle.projectId,
            projectName: vehicle.projectName,
            onlineStatus: vehicle.deviceOnlineStatus || 'ONLINE',
            firmwareVersion: 'v2.1.0',
            status: 'ACTIVE',
          });
        }
      } else {
        setCurrentDevice(null);
      }
    } catch (err) {
      if (isApiError(err)) {
        message.error(`拉取可用设备列表失败: ${err.message}`);
      }
    } finally {
      setLoadingDevices(false);
    }
  }, [open, vehicle]);

  useEffect(() => {
    if (open) {
      setSelectedDeviceId(null);
      setManualCode('');
      setBindRemark('');
      setRebindDeviceId(null);
      setRebindRemark('');
      setUnbindReason(undefined);
      setUnbindRemark('');
      setActiveTab('rebind');
      setInputMode('SELECT');
      loadModalData();
    }
  }, [open, loadModalData]);

  // 首次绑定：选中的目标设备对象
  const selectedDevice = useMemo(() => {
    if (!selectedDeviceId) return null;
    return availableDevices.find((d) => d.id === selectedDeviceId) || null;
  }, [selectedDeviceId, availableDevices]);

  // 首次绑定：校验结果
  const bindValidation = useMemo(() => {
    if (!vehicle || !selectedDevice) return { valid: false };
    return validateBindingPair(vehicle, selectedDevice);
  }, [vehicle, selectedDevice]);

  // 换绑：选中的目标设备对象与校验结果
  const rebindDevice = useMemo(() => {
    if (!rebindDeviceId) return null;
    return availableDevices.find((d) => d.id === rebindDeviceId) || null;
  }, [rebindDeviceId, availableDevices]);

  const rebindValidation = useMemo(() => {
    if (!vehicle || !rebindDevice) return { valid: false };
    return validateBindingPair(vehicle, rebindDevice);
  }, [vehicle, rebindDevice]);

  // 手动 / 扫码检索设备
  const handleManualSearch = (codeToSearch?: string) => {
    const query = (codeToSearch ?? manualCode).trim().toLowerCase();
    if (!query) {
      message.warning('请输入车载终端编号 (DEV_*) 或 15 位 IMEI');
      return;
    }

    const matched = availableDevices.find(
      (d) =>
        d.deviceNo.toLowerCase().includes(query) ||
        d.imei.toLowerCase().includes(query)
    );

    if (matched) {
      setSelectedDeviceId(matched.id);
      message.success(`成功匹配到空闲终端【${matched.deviceNo}】`);
    } else {
      message.warning(`未在空闲设备库中检索到包含 "${query}" 的可用设备`);
    }
  };

  // 模拟扫码录入
  const handleSimulateScan = () => {
    if (availableDevices.length === 0) {
      message.info('当前暂无空闲可用设备可供模拟扫码');
      return;
    }
    const sample = availableDevices[0]!;
    setManualCode(sample.imei);
    setSelectedDeviceId(sample.id);
    message.success(`模拟扫码识别成功：IMEI ${sample.imei}`);
  };

  // 执行首次绑定
  const handleConfirmBind = async () => {
    if (!vehicle || !selectedDeviceId || !bindValidation.valid) return;
    setBindingLoading(true);
    try {
      const res = await bindDeviceApi(vehicle.id, selectedDeviceId, bindRemark.trim());
      message.success(res.message || '车辆与硬件终端绑定成功！');
      onSuccess();
      onClose();
    } catch (err: any) {
      message.error(err.message || '绑定失败，请稍后重试');
    } finally {
      setBindingLoading(false);
    }
  };

  // 执行换绑
  const handleConfirmRebind = async () => {
    if (!vehicle || !rebindDeviceId || !rebindValidation.valid) return;
    setRebindLoading(true);
    try {
      const res = await bindDeviceApi(vehicle.id, rebindDeviceId, rebindRemark.trim());
      message.success(res.message || '车载硬件换绑成功！');
      onSuccess();
      onClose();
    } catch (err: any) {
      message.error(err.message || '换绑失败，请稍后重试');
    } finally {
      setRebindLoading(false);
    }
  };

  // 执行解绑
  const handleConfirmUnbind = async () => {
    if (!vehicle || !unbindReason) {
      message.warning('请选择解除绑定的业务原因');
      return;
    }
    setUnbindLoading(true);
    try {
      const fullReason = `${unbindReason}${unbindRemark ? `: ${unbindRemark.trim()}` : ''}`;
      const res = await unbindDeviceApi(vehicle.id, fullReason);
      message.success(res.message || '车辆与硬件设备解绑成功！');
      onSuccess();
      onClose();
    } catch (err: any) {
      message.error(err.message || '解绑失败，请稍后重试');
    } finally {
      setUnbindLoading(false);
    }
  };

  if (!vehicle) return null;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      width={620}
      centered
      destroyOnClose
      title={
        <Space size={8}>
          {isBoundMode ? (
            <SwapOutlined style={{ color: '#1677ff', fontSize: 18 }} />
          ) : (
            <LinkOutlined style={{ color: '#1677ff', fontSize: 18 }} />
          )}
          <span style={{ fontWeight: 600 }}>
            {isBoundMode ? '软硬件配对管理中心 (换绑 / 解绑)' : '车辆与车载终端软硬件绑定向导'}
          </span>
        </Space>
      }
      footer={null}
    >
      <Spin spinning={loadingDevices}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
          {/* 顶部目标车辆基本档案卡片 */}
          <Card
            size="small"
            style={{
              background: '#f9fbfd',
              border: '1px solid #e6f0fa',
              borderRadius: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Space size={8} wrap>
                <Tag color="blue" style={{ fontSize: 14, fontWeight: 700, padding: '2px 8px' }}>
                  {vehicle.plateNumber}
                </Tag>
                <Text code style={{ fontFamily: 'monospace', fontSize: 13 }}>
                  {vehicle.vin}
                </Text>
              </Space>
              <Tag color={vehicle.deviceId ? 'success' : 'default'} style={{ margin: 0 }}>
                {vehicle.deviceId ? '已绑定硬件' : '空闲待绑定'}
              </Tag>
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 16, fontSize: 12, color: 'rgba(0,0,0,0.65)' }}>
              <span>品牌车型：<strong>{vehicle.brandName || '-'} · {vehicle.modelName || '-'}</strong></span>
              <span>归属项目：<strong>{vehicle.projectName || vehicle.projectId || '-'}</strong></span>
            </div>
          </Card>

          {/* 模式一：未绑定车辆 -> 首次绑定向导 */}
          {!isBoundMode && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* 设备输入模式选择 */}
              <div>
                <Text strong style={{ fontSize: 13, marginBottom: 8, display: 'block' }}>
                  选择车载终端录入方式：
                </Text>
                <Radio.Group
                  value={inputMode}
                  onChange={(e) => setInputMode(e.target.value)}
                  buttonStyle="solid"
                >
                  <Radio.Button value="SELECT">
                    <Space size={4}>
                      <LinkOutlined /> 从空闲设备库选择
                    </Space>
                  </Radio.Button>
                  <Radio.Button value="MANUAL">
                    <Space size={4}>
                      <ScanOutlined /> 扫码 / 手动输入序列号
                    </Space>
                  </Radio.Button>
                </Radio.Group>
              </div>

              {/* 方式 A：下拉搜索空闲设备 */}
              {inputMode === 'SELECT' && (
                <div>
                  <Select
                    showSearch
                    allowClear
                    style={{ width: '100%' }}
                    placeholder="请选择或搜索空闲可用车载终端 (按设备号 / 15位 IMEI 检索)"
                    value={selectedDeviceId}
                    onChange={(val) => setSelectedDeviceId(val)}
                    filterOption={(input, option) => {
                      const label = String(option?.label ?? '').toLowerCase();
                      return label.includes(input.toLowerCase());
                    }}
                    options={availableDevices.map((d) => ({
                      value: d.id,
                      label: `${d.deviceNo} · IMEI: ${d.imei} [${d.productName || d.productKey}] (${d.projectName || '默认项目'})`,
                    }))}
                  />
                  <div style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      当前租户共有 {availableDevices.length} 台空闲待装车载设备
                    </Text>
                    {availableDevices.length === 0 && (
                      <Text type="danger" style={{ fontSize: 12 }}>
                        暂无可绑定的空闲设备，请先前往设备中心导入设备
                      </Text>
                    )}
                  </div>
                </div>
              )}

              {/* 方式 B：手动输入 / 扫码 */}
              {inputMode === 'MANUAL' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Space.Compact style={{ width: '100%' }}>
                    <Input
                      placeholder="请输入或扫码录入设备编号 (DEV_*) 或 15位 IMEI"
                      value={manualCode}
                      onChange={(e) => setManualCode(e.target.value)}
                      onPressEnter={() => handleManualSearch()}
                      prefix={<ScanOutlined style={{ color: '#1677ff' }} />}
                    />
                    <Button type="primary" onClick={() => handleManualSearch()}>
                      检索匹配
                    </Button>
                    <Button icon={<BarcodeOutlined />} onClick={handleSimulateScan}>
                      模拟扫码
                    </Button>
                  </Space.Compact>
                </div>
              )}

              {/* 选定设备实时工况卡片预览 */}
              {selectedDevice && (
                <Card
                  size="small"
                  title={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Space size={6}>
                        <Text strong code style={{ fontFamily: 'monospace', fontSize: 14 }}>
                          {selectedDevice.deviceNo}
                        </Text>
                        <Tag color="cyan">{selectedDevice.productName || selectedDevice.productKey}</Tag>
                      </Space>
                      <Badge
                        status={selectedDevice.onlineStatus === 'ONLINE' ? 'success' : 'default'}
                        text={getOnlineStatusMeta(selectedDevice.onlineStatus).label}
                      />
                    </div>
                  }
                  style={{ borderRadius: 8, border: '1px solid #d9e8ff' }}
                >
                  <Descriptions size="small" column={2}>
                    <Descriptions.Item label="硬件 IMEI">
                      <Text copyable style={{ fontFamily: 'monospace' }}>
                        {selectedDevice.imei}
                      </Text>
                    </Descriptions.Item>
                    <Descriptions.Item label="4G 信号强度">
                      {(() => {
                        const sig = getSignalQuality(selectedDevice.signalRsrp);
                        return (
                          <Space size={4}>
                            <WifiOutlined style={{ color: sig.color }} />
                            <span>{sig.label}</span>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              ({selectedDevice.signalRsrp != null ? `${selectedDevice.signalRsrp} dBm` : '-'})
                            </Text>
                          </Space>
                        );
                      })()}
                    </Descriptions.Item>
                    <Descriptions.Item label="固件版本">
                      <Text code>{selectedDevice.firmwareVersion || 'v1.0.0'}</Text>
                    </Descriptions.Item>
                    <Descriptions.Item label="设备归属项目">
                      <span>{selectedDevice.projectName || selectedDevice.projectId || '-'}</span>
                    </Descriptions.Item>
                  </Descriptions>

                  {/* 跨项目一致性告警提示 */}
                  {bindValidation.warning && (
                    <Alert
                      type="warning"
                      showIcon
                      message={bindValidation.warning}
                      style={{ marginTop: 8 }}
                    />
                  )}

                  {/* 配对规则拦截错误 */}
                  {!bindValidation.valid && bindValidation.error && (
                    <Alert
                      type="error"
                      showIcon
                      message={bindValidation.error}
                      style={{ marginTop: 8 }}
                    />
                  )}
                </Card>
              )}

              {/* 绑定备注输入 */}
              <div>
                <Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>
                  绑定操作备注 (选填)：
                </Text>
                <Input.TextArea
                  rows={2}
                  maxLength={200}
                  showCount
                  placeholder="例如：整车交付中心PDI检测完成，加装车载终端"
                  value={bindRemark}
                  onChange={(e) => setBindRemark(e.target.value)}
                />
              </div>

              {/* 底部按钮栏 */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <Button onClick={onClose}>取消</Button>
                <Button
                  type="primary"
                  icon={<LinkOutlined />}
                  loading={bindingLoading}
                  disabled={!selectedDeviceId || !bindValidation.valid}
                  onClick={handleConfirmBind}
                >
                  确认绑定硬件
                </Button>
              </div>
            </div>
          )}

          {/* 模式二：已绑定车辆 -> 换绑与解绑工作台 */}
          {isBoundMode && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* 当前绑定的设备信息卡片 */}
              <Card
                size="small"
                title={
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Space size={6}>
                      <Text strong style={{ fontSize: 13 }}>当前绑定的车载设备</Text>
                      <Text code style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                        {currentDevice?.deviceNo || vehicle.deviceNo || vehicle.deviceId}
                      </Text>
                    </Space>
                    <Badge
                      status={vehicle.deviceOnlineStatus === 'ONLINE' ? 'success' : 'default'}
                      text={getOnlineStatusMeta(vehicle.deviceOnlineStatus || 'OFFLINE').label}
                    />
                  </div>
                }
                style={{ borderRadius: 8, background: '#fafafa', border: '1px solid #f0f0f0' }}
              >
                <Descriptions size="small" column={2}>
                  <Descriptions.Item label="硬件 IMEI">
                    <Text copyable style={{ fontFamily: 'monospace' }}>
                      {currentDevice?.imei || '-'}
                    </Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="产品型号">
                    <Tag color="geekblue">{currentDevice?.productName || currentDevice?.productKey || 'T-Box 终端'}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="固件版本">
                    <Text code>{currentDevice?.firmwareVersion || 'v2.1.0'}</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="设备所属项目">
                    <span>{currentDevice?.projectName || vehicle.projectName || '-'}</span>
                  </Descriptions.Item>
                </Descriptions>
              </Card>

              {/* 换绑与解绑选项卡 */}
              <Tabs
                activeKey={activeTab}
                onChange={(key) => setActiveTab(key as 'rebind' | 'unbind')}
                items={[
                  {
                    key: 'rebind',
                    label: (
                      <Space size={4}>
                        <SwapOutlined />
                        <span>更换新设备 (换绑)</span>
                      </Space>
                    ),
                    children: (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <Alert
                          type="info"
                          showIcon
                          message="换绑说明"
                          description="更换新设备后，原设备将自动解除占用并归还为空闲可用状态，车辆将立即与新设备建立遥测会话。"
                        />

                        <div>
                          <Text strong style={{ fontSize: 13, marginBottom: 6, display: 'block' }}>
                            选择替换接入的新设备：
                          </Text>
                          <Select
                            showSearch
                            style={{ width: '100%' }}
                            placeholder="请选择空闲可用的新车载终端"
                            value={rebindDeviceId}
                            onChange={(val) => setRebindDeviceId(val)}
                            filterOption={(input, option) => {
                              const label = String(option?.label ?? '').toLowerCase();
                              return label.includes(input.toLowerCase());
                            }}
                            options={availableDevices
                              .filter((d) => d.id !== vehicle.deviceId)
                              .map((d) => ({
                                value: d.id,
                                label: `${d.deviceNo} · IMEI: ${d.imei} [${d.productName || d.productKey}]`,
                              }))}
                          />
                        </div>

                        {/* 新设备工况预览 */}
                        {rebindDevice && (
                          <Card
                            size="small"
                            style={{ borderRadius: 8, border: '1px dashed #1677ff' }}
                          >
                            <Descriptions size="small" column={2}>
                              <Descriptions.Item label="新设备编号">
                                <Text strong code style={{ fontFamily: 'monospace' }}>
                                  {rebindDevice.deviceNo}
                                </Text>
                              </Descriptions.Item>
                              <Descriptions.Item label="在线工况">
                                <Badge
                                  status={rebindDevice.onlineStatus === 'ONLINE' ? 'success' : 'default'}
                                  text={getOnlineStatusMeta(rebindDevice.onlineStatus).label}
                                />
                              </Descriptions.Item>
                              <Descriptions.Item label="固件版本">
                                <Text code>{rebindDevice.firmwareVersion || 'v1.0.0'}</Text>
                              </Descriptions.Item>
                              <Descriptions.Item label="所属项目">
                                <span>{rebindDevice.projectName || '默认项目'}</span>
                              </Descriptions.Item>
                            </Descriptions>

                            {rebindValidation.warning && (
                              <Alert
                                type="warning"
                                showIcon
                                message={rebindValidation.warning}
                                style={{ marginTop: 8 }}
                              />
                            )}

                            {!rebindValidation.valid && rebindValidation.error && (
                              <Alert
                                type="error"
                                showIcon
                                message={rebindValidation.error}
                                style={{ marginTop: 8 }}
                              />
                            )}
                          </Card>
                        )}

                        <div>
                          <Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>
                            换绑说明备注 (选填)：
                          </Text>
                          <Input.TextArea
                            rows={2}
                            maxLength={200}
                            showCount
                            placeholder="例如：原设备硬件通讯模组损坏，更换备件终端"
                            value={rebindRemark}
                            onChange={(e) => setRebindRemark(e.target.value)}
                          />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                          <Button onClick={onClose}>取消</Button>
                          <Button
                            type="primary"
                            icon={<SwapOutlined />}
                            loading={rebindLoading}
                            disabled={!rebindDeviceId || !rebindValidation.valid}
                            onClick={handleConfirmRebind}
                          >
                            确认换绑并激活
                          </Button>
                        </div>
                      </div>
                    ),
                  },
                  {
                    key: 'unbind',
                    label: (
                      <Space size={4}>
                        <DisconnectOutlined style={{ color: '#ff4d4f' }} />
                        <span style={{ color: '#ff4d4f' }}>解除软硬件绑定 (解绑)</span>
                      </Space>
                    ),
                    children: (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <Alert
                          type="error"
                          showIcon
                          message="高危风险警示"
                          description="解除绑定后，平台将立即停止对该车辆的远程车控（开关锁/空调/鸣笛）与实时遥测数据接收！原车载终端将释放回归空闲资产库。"
                          style={{ borderRadius: 6 }}
                        />

                        <div>
                          <Text strong style={{ fontSize: 13, marginBottom: 6, display: 'block' }}>
                            <span style={{ color: '#ff4d4f' }}>*</span> 请选择解绑业务归因 (必填)：
                          </Text>
                          <Select
                            style={{ width: '100%' }}
                            placeholder="请选择解绑原因"
                            value={unbindReason}
                            onChange={(val) => setUnbindReason(val)}
                            options={UNBIND_REASON_OPTIONS.map((item) => ({
                              value: item.value,
                              label: `${item.label} (${item.description})`,
                            }))}
                          />
                        </div>

                        <div>
                          <Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>
                            详细业务情况说明 (选填)：
                          </Text>
                          <Input.TextArea
                            rows={2}
                            maxLength={200}
                            showCount
                            placeholder="请输入解绑工单编号、现场维修负责人或详细处理说明"
                            value={unbindRemark}
                            onChange={(e) => setUnbindRemark(e.target.value)}
                          />
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                          <Button onClick={onClose}>取消</Button>
                          <Popconfirm
                            title="高危操作二次确认"
                            description={
                              <div style={{ maxWidth: 320 }}>
                                确认解除车辆 <strong>{vehicle.plateNumber}</strong> 与设备{' '}
                                <strong>{vehicle.deviceNo || vehicle.deviceId}</strong> 的软硬件绑定吗？
                                <div style={{ color: '#ff4d4f', marginTop: 4, fontSize: 12 }}>
                                  解除后将无法进行远程控车与实时位置追踪。
                                </div>
                              </div>
                            }
                            okText="确认解除绑定"
                            cancelText="取消"
                            okButtonProps={{ danger: true, loading: unbindLoading }}
                            onConfirm={handleConfirmUnbind}
                          >
                            <Button
                              danger
                              type="primary"
                              icon={<DisconnectOutlined />}
                              loading={unbindLoading}
                              disabled={!unbindReason}
                            >
                              解除软硬件绑定
                            </Button>
                          </Popconfirm>
                        </div>
                      </div>
                    ),
                  },
                ]}
              />
            </div>
          )}
        </div>
      </Spin>
    </Modal>
  );
};
