import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Table,
  Button,
  Input,
  Select,
  Tag,
  Badge,
  Space,
  Modal,
  Form,
  Popconfirm,
  message,
  Typography,
  Tooltip,
  Alert,
  Descriptions,
} from 'antd';
import type { TableProps } from 'antd';
import {
  DesktopOutlined,
  CheckCircleOutlined,
  DisconnectOutlined,
  AlertOutlined,
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  UploadOutlined,
  InfoCircleOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  type DeviceDto,
  type DeviceQueryParams,
  type ProjectDto,
  type CreateDeviceInput,
  type DeviceLifecycleStatus,
  calculateDeviceStats,
  filterDevices,
  getSignalQuality,
  getOnlineStatusMeta,
  getLifecycleStatusMeta,
  validateImei,
  validateIccid,
  generateDeviceNo,
  isApiError,
  PRODUCT_KEY_OPTIONS,
  SEED_PROJECTS,
} from './device-core.ts';
import {
  fetchDevicesApi,
  createDeviceApi,
  updateDeviceStatusApi,
  fetchProjectsApi,
} from '../../api/device.ts';
import { useTenantStore } from '../../store/useTenantStore.ts';
import { BatchImportModal } from './BatchImportModal.tsx';

const { Title, Text, Paragraph } = Typography;

/**
 * 4G 信号 RSRP 阶梯指示器组件
 */
const SignalIndicator: React.FC<{ rsrp?: number | null }> = ({ rsrp }) => {
  const meta = getSignalQuality(rsrp);

  return (
    <Tooltip title={`4G 信号强度: ${meta.label} (${meta.rsrp !== null ? `${meta.rsrp} dBm` : '无信号'})`}>
      <Space size={2} align="end" style={{ height: 18, cursor: 'pointer' }}>
        {[5, 8, 11, 14].map((h, idx) => {
          const filled = idx < meta.bars;
          return (
            <span
              key={idx}
              style={{
                display: 'inline-block',
                width: 3,
                height: h,
                backgroundColor: filled ? meta.color : '#e0e0e0',
                borderRadius: 1,
              }}
            />
          );
        })}
        <span
          style={{
            fontSize: 12,
            marginLeft: 4,
            color: meta.bars > 0 ? meta.color : '#8c8c8c',
            fontFamily: 'SFMono-Regular, Consolas, Courier, monospace',
          }}
        >
          {meta.rsrp !== null ? `${meta.rsrp}dBm` : '-'}
        </span>
      </Space>
    </Tooltip>
  );
};

export const DeviceListView: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState<DeviceDto[]>([]);
  const [projects, setProjects] = useState<ProjectDto[]>(SEED_PROJECTS);

  // 筛选器状态
  const [keyword, setKeyword] = useState('');
  const [projectFilter, setProjectFilter] = useState('ALL');
  const [onlineStatusFilter, setOnlineStatusFilter] = useState('ALL');
  const [firmwareVersionFilter, setFirmwareVersionFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // 新建设备模态框状态
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [createForm] = Form.useForm();

  // 查看详情弹窗状态
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<DeviceDto | null>(null);

  // 批量导入向导模态框状态
  const [batchImportModalVisible, setBatchImportModalVisible] = useState(false);

  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [fetchedDevices, fetchedProjects] = await Promise.allSettled([
        fetchDevicesApi(),
        fetchProjectsApi(),
      ]);

      if (fetchedDevices.status === 'fulfilled') {
        setDevices(fetchedDevices.value);
      } else if (isApiError(fetchedDevices.reason)) {
        message.error(`加载设备失败: ${fetchedDevices.reason.message}`);
      }

      if (fetchedProjects.status === 'fulfilled') {
        setProjects(fetchedProjects.value);
      }
    } catch (err) {
      if (isApiError(err)) {
        message.error(`数据加载异常: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 获取当前租户的动态设备配额约束（未设置时回退至 1000 默认容量）
  const currentTenantId = useTenantStore((s) => s.currentTenantId);
  const tenantList = useTenantStore((s) => s.tenantList);

  const tenantQuota = useMemo(() => {
    const activeTenant = tenantList.find((t) => t.id === currentTenantId);
    return activeTenant?.quotaDeviceCount || 1000;
  }, [tenantList, currentTenantId]);

  // 计算当前租户剩余可用配额
  const remainingQuota = useMemo(() => {
    return Math.max(0, tenantQuota - devices.length);
  }, [tenantQuota, devices.length]);

  // 计算顶部汇总指标与动态配额比
  const stats = useMemo(() => {
    return calculateDeviceStats(devices, tenantQuota);
  }, [devices, tenantQuota]);

  // 计算可筛选固件版本列表
  const availableFirmwareVersions = useMemo(() => {
    const versions = new Set<string>();
    devices.forEach((d) => {
      if (d.firmwareVersion) {
        versions.add(d.firmwareVersion);
      }
    });
    return Array.from(versions);
  }, [devices]);

  // 纯客户端多维组合过滤
  const filteredDevices = useMemo(() => {
    const queryParams: DeviceQueryParams = {
      keyword: keyword.trim() || undefined,
      projectId: projectFilter !== 'ALL' ? projectFilter : undefined,
      onlineStatus: onlineStatusFilter !== 'ALL' ? onlineStatusFilter : undefined,
      firmwareVersion: firmwareVersionFilter !== 'ALL' ? firmwareVersionFilter : undefined,
      status: statusFilter !== 'ALL' ? statusFilter : undefined,
    };
    return filterDevices(devices, queryParams);
  }, [devices, keyword, projectFilter, onlineStatusFilter, firmwareVersionFilter, statusFilter]);

  // 重置筛选器
  const handleResetFilters = () => {
    setKeyword('');
    setProjectFilter('ALL');
    setOnlineStatusFilter('ALL');
    setFirmwareVersionFilter('ALL');
    setStatusFilter('ALL');
    setCurrentPage(1);
  };

  // 打开批量导入向导
  const handleOpenBatchImport = () => {
    setBatchImportModalVisible(true);
  };

  // 打开详情
  const handleViewDetail = (record: DeviceDto) => {
    setSelectedDevice(record);
    setDetailModalVisible(true);
  };

  // 变更设备生命周期状态 (ACTIVE / INACTIVE / DECOMMISSIONED)
  const handleStatusChange = async (id: string, newStatus: DeviceLifecycleStatus) => {
    try {
      const updated = await updateDeviceStatusApi(id, newStatus);
      message.success(`设备已成功更新为「${getLifecycleStatusMeta(newStatus).label}」`);
      setDevices((prev) => prev.map((d) => (d.id === id ? updated : d)));
    } catch (err) {
      if (isApiError(err)) {
        message.error(`状态变更失败: ${err.message}`);
      } else {
        message.error('操作异常，请稍后重试');
      }
    }
  };

  // 提交新建设备
  const handleCreateSubmit = async () => {
    try {
      const values = await createForm.validateFields();
      setSubmittingCreate(true);

      const input: CreateDeviceInput = {
        deviceNo: values.deviceNo,
        imei: values.imei,
        productKey: values.productKey,
        projectId: values.projectId,
        iccid: values.iccid || undefined,
        status: 'ACTIVE',
      };

      const created = await createDeviceApi(input);
      message.success(`设备 ${created.deviceNo} 建档成功！`);
      setCreateModalVisible(false);
      createForm.resetFields();
      setDevices((prev) => [created, ...prev]);
    } catch (err) {
      if (isApiError(err)) {
        message.error(`建档失败: ${err.message}`);
      } else if (!(err && typeof err === 'object' && 'errorFields' in err)) {
        message.error('建档操作异常，请稍后重试');
      }
    } finally {
      setSubmittingCreate(false);
    }
  };

  // 表格列定义
  const columns: TableProps<DeviceDto>['columns'] = [
    {
      title: '设备编号',
      dataIndex: 'deviceNo',
      key: 'deviceNo',
      width: 160,
      render: (val: string, record: DeviceDto) => (
        <Space direction="vertical" size={0}>
          <Text
            copyable={{ tooltips: ['点击复制', '已复制'] }}
            style={{
              fontFamily: 'SFMono-Regular, Consolas, Courier, monospace',
              fontWeight: 600,
              color: '#1677ff',
              cursor: 'pointer',
            }}
            onClick={() => handleViewDetail(record)}
          >
            {val}
          </Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {record.productName || record.productKey}
          </Text>
        </Space>
      ),
    },
    {
      title: 'IMEI 硬件标识',
      dataIndex: 'imei',
      key: 'imei',
      width: 170,
      render: (val: string) => (
        <Text
          copyable={{ tooltips: ['点击复制', '已复制'] }}
          style={{
            fontFamily: 'SFMono-Regular, Consolas, Courier, monospace',
            fontSize: 13,
          }}
        >
          {val}
        </Text>
      ),
    },
    {
      title: 'ICCID (SIM卡)',
      dataIndex: 'iccid',
      key: 'iccid',
      width: 190,
      render: (val?: string) =>
        val ? (
          <Text
            copyable={{ tooltips: ['点击复制', '已复制'] }}
            style={{
              fontFamily: 'SFMono-Regular, Consolas, Courier, monospace',
              fontSize: 12,
            }}
          >
            {val}
          </Text>
        ) : (
          <Text type="secondary">-</Text>
        ),
    },
    {
      title: '所属项目',
      dataIndex: 'projectName',
      key: 'projectName',
      width: 150,
      ellipsis: true,
      render: (val?: string, record?: DeviceDto) => (
        <Tooltip title={val || record?.projectId}>
          <Text>{val || record?.projectId}</Text>
        </Tooltip>
      ),
    },
    {
      title: '绑定车辆',
      dataIndex: 'boundVehiclePlate',
      key: 'boundVehiclePlate',
      width: 130,
      render: (plate?: string | null, record?: DeviceDto) => {
        if (plate) {
          return (
            <Tooltip title={record?.boundVin ? `VIN: ${record.boundVin}` : undefined}>
              <Tag color="blue" style={{ fontWeight: 500 }}>
                {plate}
              </Tag>
            </Tooltip>
          );
        }
        return <Tag color="default">未绑定</Tag>;
      },
    },
    {
      title: '在线状态',
      dataIndex: 'onlineStatus',
      key: 'onlineStatus',
      width: 110,
      render: (status: string) => {
        const meta = getOnlineStatusMeta(status);
        return (
          <Badge
            color={meta.badgeColor}
            text={
              <Text strong style={{ color: meta.badgeColor, fontSize: 13 }}>
                {meta.label}
              </Text>
            }
          />
        );
      },
    },
    {
      title: '4G 信号强度',
      dataIndex: 'signalRsrp',
      key: 'signalRsrp',
      width: 130,
      render: (rsrp?: number) => <SignalIndicator rsrp={rsrp} />,
    },
    {
      title: '固件版本',
      dataIndex: 'firmwareVersion',
      key: 'firmwareVersion',
      width: 100,
      render: (ver: string) => (
        <Tag color="cyan" style={{ fontFamily: 'monospace' }}>
          {ver}
        </Tag>
      ),
    },
    {
      title: '资产状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: DeviceLifecycleStatus) => {
        const meta = getLifecycleStatusMeta(status);
        return <Tag color={meta.color}>{meta.label}</Tag>;
      },
    },
    {
      title: '最后心跳时间',
      dataIndex: 'lastHeartbeatAt',
      key: 'lastHeartbeatAt',
      width: 150,
      render: (date?: string) =>
        date ? (
          <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{date}</Text>
        ) : (
          <Text type="secondary" style={{ fontSize: 12 }}>
            -
          </Text>
        ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 170,
      fixed: 'right',
      render: (_, record: DeviceDto) => {
        return (
          <Space size="small">
            <Button
              type="link"
              size="small"
              onClick={() => handleViewDetail(record)}
            >
              详情
            </Button>

            {record.status === 'ACTIVE' && (
              <>
                <Popconfirm
                  title="确认停用该设备？"
                  description="停用后终端将无法接入并停止心跳处理"
                  okText="停用"
                  cancelText="取消"
                  onConfirm={() => handleStatusChange(record.id, 'INACTIVE')}
                >
                  <Button type="link" size="small" danger>
                    停用
                  </Button>
                </Popconfirm>

                <Popconfirm
                  title="确认报废该设备？"
                  description="报废为不可逆操作，该硬件将永久注销"
                  okText="报废"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => handleStatusChange(record.id, 'DECOMMISSIONED')}
                >
                  <Button type="link" size="small" style={{ color: '#cf1322' }}>
                    报废
                  </Button>
                </Popconfirm>
              </>
            )}

            {record.status === 'INACTIVE' && (
              <>
                <Popconfirm
                  title="确认启用该设备？"
                  description="启用后将允许终端重新上线通讯"
                  okText="启用"
                  cancelText="取消"
                  onConfirm={() => handleStatusChange(record.id, 'ACTIVE')}
                >
                  <Button type="link" size="small" style={{ color: '#52c41a' }}>
                    启用
                  </Button>
                </Popconfirm>

                <Popconfirm
                  title="确认报废该设备？"
                  description="报废为不可逆操作，该硬件将永久注销"
                  okText="报废"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => handleStatusChange(record.id, 'DECOMMISSIONED')}
                >
                  <Button type="link" size="small" style={{ color: '#cf1322' }}>
                    报废
                  </Button>
                </Popconfirm>
              </>
            )}

            {record.status === 'DECOMMISSIONED' && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                已归档
              </Text>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 配额超限预警 Banner (>= 90% 触发) */}
      {stats.isQuotaWarning && (
        <Alert
          type="warning"
          showIcon
          closable
          message="租户设备配额即将达到上限"
          description={`租户设备配额已占用 ${stats.quotaUsed}/${stats.quotaTotal} (${stats.quotaUsage}%)，即将达到租户许可上限，请及时联系商务人员进行配额扩容！`}
          style={{ borderRadius: 8, boxShadow: '0 2px 6px rgba(250, 173, 20, 0.15)' }}
        />
      )}

      {/* 顶部指标统计卡片 (4 卡布局) */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card
            bordered={false}
            style={{
              borderRadius: 8,
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
            }}
          >
            <Statistic
              title="设备总数"
              value={stats.totalCount}
              prefix={<DesktopOutlined style={{ color: '#1677ff' }} />}
              suffix={<Text type="secondary" style={{ fontSize: 12 }}>台</Text>}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card
            bordered={false}
            style={{
              borderRadius: 8,
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Statistic
                title="在线设备"
                value={stats.onlineCount}
                prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                valueStyle={{ color: '#52c41a' }}
                suffix={<Text type="secondary" style={{ fontSize: 12 }}>台</Text>}
              />
              <Tag color="success" style={{ fontWeight: 600 }}>
                在线率 {stats.onlineRate}%
              </Tag>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card
            bordered={false}
            style={{
              borderRadius: 8,
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
            }}
          >
            <Statistic
              title="离线设备"
              value={stats.offlineCount}
              prefix={<DisconnectOutlined style={{ color: '#8c8c8c' }} />}
              valueStyle={{ color: '#8c8c8c' }}
              suffix={<Text type="secondary" style={{ fontSize: 12 }}>台</Text>}
            />
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card
            bordered={false}
            style={{
              borderRadius: 8,
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
            }}
          >
            <Statistic
              title="异常告警设备"
              value={stats.alarmingCount}
              prefix={<AlertOutlined style={{ color: '#ff4d4f' }} />}
              valueStyle={{ color: '#ff4d4f' }}
              suffix={<Text type="secondary" style={{ fontSize: 12 }}>台</Text>}
            />
          </Card>
        </Col>
      </Row>

      {/* 筛选与操作工具栏 */}
      <Card
        bordered={false}
        style={{
          borderRadius: 8,
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        }}
      >
        <Row gutter={[16, 16]} justify="space-between" align="middle">
          <Col xs={24} lg={18}>
            <Space wrap size="middle">
              <Input
                placeholder="搜索设备号 / IMEI / ICCID / 车牌 / VIN..."
                prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,0.45)' }} />}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                style={{ width: 280 }}
                allowClear
              />

              <Select
                value={projectFilter}
                onChange={setProjectFilter}
                style={{ width: 180 }}
                options={[
                  { label: '全部项目', value: 'ALL' },
                  ...projects.map((p) => ({ label: p.name, value: p.id })),
                ]}
              />

              <Select
                value={onlineStatusFilter}
                onChange={setOnlineStatusFilter}
                style={{ width: 140 }}
                options={[
                  { label: '全部在线状态', value: 'ALL' },
                  { label: '🟢 在线 (ONLINE)', value: 'ONLINE' },
                  { label: '⚪ 离线 (OFFLINE)', value: 'OFFLINE' },
                  { label: '🔴 告警 (ALARMING)', value: 'ALARMING' },
                ]}
              />

              <Select
                value={firmwareVersionFilter}
                onChange={setFirmwareVersionFilter}
                style={{ width: 130 }}
                options={[
                  { label: '全部版本', value: 'ALL' },
                  ...availableFirmwareVersions.map((v) => ({ label: v, value: v })),
                ]}
              />

              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                style={{ width: 130 }}
                options={[
                  { label: '全部生命周期', value: 'ALL' },
                  { label: '正常启用', value: 'ACTIVE' },
                  { label: '已停用', value: 'INACTIVE' },
                  { label: '已报废', value: 'DECOMMISSIONED' },
                ]}
              />

              <Button icon={<ReloadOutlined />} onClick={handleResetFilters}>
                重置
              </Button>
            </Space>
          </Col>

          <Col xs={24} lg={6} style={{ textAlign: 'right' }}>
            <Space wrap>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  createForm.resetFields();
                  createForm.setFieldsValue({
                    deviceNo: generateDeviceNo(),
                    productKey: 'TBOX-G4-STD',
                    projectId: projects[0]?.id || 'proj-sz-01',
                  });
                  setCreateModalVisible(true);
                }}
              >
                新建设备
              </Button>

              <Button icon={<UploadOutlined />} onClick={handleOpenBatchImport}>
                批量导入
              </Button>

              <Button icon={<ReloadOutlined />} onClick={loadData}>
                刷新
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 设备台账数据表格 */}
      <Card
        bordered={false}
        style={{
          borderRadius: 8,
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        }}
      >
        <Table<DeviceDto>
          rowKey="id"
          columns={columns}
          dataSource={filteredDevices}
          loading={loading}
          scroll={{ x: 1400 }}
          pagination={{
            current: currentPage,
            pageSize,
            total: filteredDevices.length,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showTotal: (total) => `共 ${total} 台设备 (在线率 ${stats.onlineRate}%)`,
            onChange: (page, size) => {
              setCurrentPage(page);
              setPageSize(size);
            },
          }}
        />
      </Card>

      {/* 单个设备建档模态框 */}
      <Modal
        title="新建设备资产档案"
        open={createModalVisible}
        onOk={handleCreateSubmit}
        onCancel={() => setCreateModalVisible(false)}
        confirmLoading={submittingCreate}
        okText="立即建档"
        cancelText="取消"
        destroyOnClose
        width={560}
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="设备编号"
            name="deviceNo"
            rules={[{ required: true, message: '请输入或自动生成设备编号' }]}
            extra="支持自动生成唯一序列号规范编号"
          >
            <Input
              placeholder="例如: DEV_10020"
              addonAfter={
                <Button
                  type="link"
                  size="small"
                  icon={<ThunderboltOutlined />}
                  onClick={() => createForm.setFieldValue('deviceNo', generateDeviceNo())}
                  style={{ padding: 0 }}
                >
                  生成序列号
                </Button>
              }
            />
          </Form.Item>

          <Form.Item
            label="IMEI 硬件识别码"
            name="imei"
            rules={[
              { required: true, message: '请输入15位纯数字 IMEI 识别码' },
              {
                validator: async (_, value) => {
                  if (value && !validateImei(value)) {
                    throw new Error('IMEI 格式错误，必须为严格 15 位数字');
                  }
                },
              },
            ]}
          >
            <Input placeholder="请输入15位设备硬件 IMEI (如 868123045678999)" maxLength={15} />
          </Form.Item>

          <Form.Item
            label="产品型号 (ProductKey)"
            name="productKey"
            rules={[{ required: true, message: '请选择产品型号' }]}
          >
            <Select options={PRODUCT_KEY_OPTIONS} />
          </Form.Item>

          <Form.Item
            label="归属项目"
            name="projectId"
            rules={[{ required: true, message: '请选择归属项目' }]}
          >
            <Select
              options={projects.map((p) => ({
                label: `${p.name} (${p.code})`,
                value: p.id,
              }))}
            />
          </Form.Item>

          <Form.Item
            label="ICCID (SIM卡识别码，选填)"
            name="iccid"
            rules={[
              {
                validator: async (_, value) => {
                  if (value && !validateIccid(value)) {
                    throw new Error('ICCID 格式错误，必须为 19~20 位字母数字');
                  }
                },
              },
            ]}
          >
            <Input placeholder="选填，如 89860401123456789012" maxLength={20} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 设备详情简要预览模态框 (Task 3 接入 640px 专属详情抽屉) */}
      <Modal
        title={
          <Space>
            <InfoCircleOutlined style={{ color: '#1677ff' }} />
            <span>设备资产详情预览</span>
            {selectedDevice && (
              <Tag color="blue">{selectedDevice.deviceNo}</Tag>
            )}
          </Space>
        }
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" type="primary" onClick={() => setDetailModalVisible(false)}>
            关闭
          </Button>,
        ]}
        width={680}
      >
        {selectedDevice && (
          <div style={{ marginTop: 16 }}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="设备编号">
                <Text copyable style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                  {selectedDevice.deviceNo}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="在线状态">
                {(() => {
                  const meta = getOnlineStatusMeta(selectedDevice.onlineStatus);
                  return <Badge color={meta.badgeColor} text={meta.label} />;
                })()}
              </Descriptions.Item>
              <Descriptions.Item label="IMEI">
                <Text copyable style={{ fontFamily: 'monospace' }}>
                  {selectedDevice.imei}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="ICCID">
                <Text copyable style={{ fontFamily: 'monospace' }}>
                  {selectedDevice.iccid || '-'}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="硬件型号">
                {selectedDevice.productName || selectedDevice.productKey}
              </Descriptions.Item>
              <Descriptions.Item label="所属项目">
                {selectedDevice.projectName || selectedDevice.projectId}
              </Descriptions.Item>
              <Descriptions.Item label="绑定车牌">
                {selectedDevice.boundVehiclePlate ? (
                  <Tag color="blue">{selectedDevice.boundVehiclePlate}</Tag>
                ) : (
                  <Tag color="default">未绑定</Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="绑定 VIN">
                {selectedDevice.boundVin || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="固件版本">
                <Tag color="cyan">{selectedDevice.firmwareVersion}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="4G 信号 RSRP">
                <SignalIndicator rsrp={selectedDevice.signalRsrp} />
              </Descriptions.Item>
              <Descriptions.Item label="主电瓶电压">
                {selectedDevice.mainVoltage ? `${selectedDevice.mainVoltage} V` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="备用电池百分比">
                {selectedDevice.backupBatteryPercent !== undefined
                  ? `${selectedDevice.backupBatteryPercent} %`
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="芯片温度">
                {selectedDevice.temperature !== undefined ? `${selectedDevice.temperature} °C` : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="生命周期状态">
                <Tag color={getLifecycleStatusMeta(selectedDevice.status).color}>
                  {getLifecycleStatusMeta(selectedDevice.status).label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="激活时间">
                {selectedDevice.activatedAt || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="最后心跳时间">
                {selectedDevice.lastHeartbeatAt || '-'}
              </Descriptions.Item>
            </Descriptions>

            <Alert
              style={{ marginTop: 16 }}
              type="info"
              showIcon
              message="设备详情 640px 滑出抽屉与远程参数配置面板"
              description="该设备的三标签页实时工况监控与远程参数配置（心跳周期/APN/重启指令）将在 Sprint 2 Task 3 中完整交付。"
            />
          </div>
        )}
      </Modal>

      {/* 批量设备导入向导模态框 */}
      <BatchImportModal
        open={batchImportModalVisible}
        onClose={() => setBatchImportModalVisible(false)}
        onSuccess={loadData}
        remainingQuota={remainingQuota}
      />
    </div>
  );
};

export default DeviceListView;
