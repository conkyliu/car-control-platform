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
  message,
  Typography,
  Tooltip,
  Alert,
  Descriptions,
  Divider,
} from 'antd';
import type { TableProps } from 'antd';
import {
  CarOutlined,
  CheckCircleOutlined,
  AlertOutlined,
  LinkOutlined,
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  ThunderboltOutlined,
  LockOutlined,
  ToolOutlined,
  SafetyCertificateOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import {
  type VehicleDto,
  type VehicleQueryParams,
  type VehicleStatus,
  type BrandDto,
  type ModelDto,
  calculateVehicleStats,
  filterVehicles,
  getVehicleStatusMeta,
  validateVin,
  validatePlateNumber,
  generateSampleVin,
  maskPhone,
  formatVoltage,
  isValidVehicleStatusTransition,
  isApiError,
  SEED_BRANDS,
  SEED_MODELS,
} from './vehicle-core.ts';
import {
  fetchVehiclesApi,
  createVehicleApi,
  updateVehicleStatusApi,
  fetchBrandsApi,
  fetchModelsApi,
  type CreateVehicleInput,
} from '../../api/vehicle.ts';
import { fetchProjectsApi, fetchDevicesApi, type ProjectDto, type DeviceDto } from '../../api/device.ts';
import { SEED_PROJECTS } from '../device/device-core.ts';
import { useTenantStore } from '../../store/useTenantStore.ts';

const { Text } = Typography;

export const VehicleListView: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [vehicles, setVehicles] = useState<VehicleDto[]>([]);
  const [projects, setProjects] = useState<ProjectDto[]>(SEED_PROJECTS);
  const [brands, setBrands] = useState<BrandDto[]>(SEED_BRANDS);
  const [models, setModels] = useState<ModelDto[]>(SEED_MODELS);
  const [availableDevices, setAvailableDevices] = useState<DeviceDto[]>([]);

  // 筛选器状态
  const [keyword, setKeyword] = useState('');
  const [projectFilter, setProjectFilter] = useState<string>('ALL');
  const [brandFilter, setBrandFilter] = useState<string>('ALL');
  const [modelFilter, setModelFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [bindStatusFilter, setBindStatusFilter] = useState<string>('ALL');
  const [onlineStatusFilter, setOnlineStatusFilter] = useState<string>('ALL');

  // 模态框状态
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleDto | null>(null);
  const [targetStatus, setTargetStatus] = useState<VehicleStatus>('NORMAL');

  const [createForm] = Form.useForm();
  const selectedBrandInForm = Form.useWatch('brandId', createForm);

  // 租户与配额数据
  const currentTenantId = useTenantStore((s) => s.currentTenantId);
  const tenantList = useTenantStore((s) => s.tenantList);

  const tenantQuota = useMemo(() => {
    const activeTenant = tenantList.find((t) => t.id === currentTenantId);
    return activeTenant?.quotaVehicleCount || activeTenant?.quotaDeviceCount || 1000;
  }, [tenantList, currentTenantId]);

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [vehicleList, projectList, brandList, modelList, deviceList] = await Promise.allSettled([
        fetchVehiclesApi(),
        fetchProjectsApi(),
        fetchBrandsApi(),
        fetchModelsApi(),
        fetchDevicesApi(),
      ]);

      if (vehicleList.status === 'fulfilled') {
        setVehicles(vehicleList.value);
      } else if (isApiError(vehicleList.reason)) {
        message.error(`拉取车辆列表异常: ${vehicleList.reason.message}`);
      }

      if (projectList.status === 'fulfilled') {
        setProjects(projectList.value);
      }
      if (brandList.status === 'fulfilled') {
        setBrands(brandList.value);
      }
      if (modelList.status === 'fulfilled') {
        setModels(modelList.value);
      }
      if (deviceList.status === 'fulfilled') {
        setAvailableDevices(deviceList.value.filter((d) => !d.boundVin && !d.boundVehiclePlate));
      }
    } catch (err) {
      if (isApiError(err)) {
        message.error(`网络通讯异常: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 根据选择的品牌动态过滤当前可用车型（在筛选器中）
  const filteredModelsForFilter = useMemo(() => {
    if (brandFilter === 'ALL') return models;
    return models.filter((m) => m.brandId === brandFilter);
  }, [models, brandFilter]);

  // 根据表单选择的品牌动态过滤当前可用车型（在建档表单中）
  const formAvailableModels = useMemo(() => {
    if (!selectedBrandInForm) return [];
    return models.filter((m) => m.brandId === selectedBrandInForm);
  }, [models, selectedBrandInForm]);

  // 本地过滤数据
  const displayVehicles = useMemo(() => {
    const query: VehicleQueryParams = {
      keyword,
      projectId: projectFilter,
      brandId: brandFilter,
      modelId: modelFilter,
      status: statusFilter,
      bindStatus: bindStatusFilter,
      onlineStatus: onlineStatusFilter,
    };
    return filterVehicles(vehicles, query);
  }, [
    vehicles,
    keyword,
    projectFilter,
    brandFilter,
    modelFilter,
    statusFilter,
    bindStatusFilter,
    onlineStatusFilter,
  ]);

  // 顶部汇总统计指标
  const stats = useMemo(() => {
    return calculateVehicleStats(vehicles, tenantQuota);
  }, [vehicles, tenantQuota]);

  // 重置筛选器
  const handleResetFilters = () => {
    setKeyword('');
    setProjectFilter('ALL');
    setBrandFilter('ALL');
    setModelFilter('ALL');
    setStatusFilter('ALL');
    setBindStatusFilter('ALL');
    setOnlineStatusFilter('ALL');
  };

  // 打开建档模态框
  const handleOpenCreateModal = () => {
    createForm.resetFields();
    if (projects.length > 0) {
      createForm.setFieldValue('projectId', projects[0].id);
    }
    if (brands.length > 0) {
      createForm.setFieldValue('brandId', brands[0].id);
    }
    setCreateModalOpen(true);
  };

  // 提交建档表单
  const handleCreateSubmit = async () => {
    try {
      const values = await createForm.validateFields();
      setSubmitting(true);

      const input: CreateVehicleInput = {
        vin: values.vin,
        plateNumber: values.plateNumber,
        projectId: values.projectId,
        brandId: values.brandId,
        modelId: values.modelId,
        deviceId: values.deviceId || null,
        ownerName: values.ownerName,
        ownerPhone: values.ownerPhone,
      };

      const created = await createVehicleApi(input);
      message.success(`车辆【${created.plateNumber}】建档成功！`);
      setCreateModalOpen(false);
      loadData();
    } catch (err) {
      if (isApiError(err)) {
        message.error(`建档失败: ${err.message}`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // 打开车况详情弹窗
  const handleViewDetail = (vehicle: VehicleDto) => {
    setSelectedVehicle(vehicle);
    setDetailModalOpen(true);
  };

  // 打开状态变更弹窗
  const handleOpenStatusModal = (vehicle: VehicleDto) => {
    setSelectedVehicle(vehicle);
    setTargetStatus(vehicle.status);
    setStatusModalOpen(true);
  };

  // 提交状态变更
  const handleStatusChangeSubmit = async () => {
    if (!selectedVehicle) return;
    if (!isValidVehicleStatusTransition(selectedVehicle.status, targetStatus)) {
      message.error('已报废车辆为物理终态，不可逆向流转为其他运营状态');
      return;
    }

    try {
      setSubmitting(true);
      await updateVehicleStatusApi(selectedVehicle.id, targetStatus);
      message.success(`车辆【${selectedVehicle.plateNumber}】运营状态已变更为：${getVehicleStatusMeta(targetStatus).label}`);
      setStatusModalOpen(false);
      loadData();
    } catch (err) {
      if (isApiError(err)) {
        message.error(`状态变更失败: ${err.message}`);
      } else if (err instanceof Error) {
        message.error(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // 表格列配置
  const columns: TableProps<VehicleDto>['columns'] = [
    {
      title: '车牌号码',
      dataIndex: 'plateNumber',
      key: 'plateNumber',
      width: 130,
      render: (plate: string, record) => (
        <Tooltip title="点击查看车况遥测概览">
          <Tag
            color="blue"
            style={{ fontWeight: 600, cursor: 'pointer', fontSize: 13, padding: '2px 8px' }}
            onClick={() => handleViewDetail(record)}
          >
            {plate}
          </Tag>
        </Tooltip>
      ),
    },
    {
      title: '车架号 (VIN)',
      dataIndex: 'vin',
      key: 'vin',
      width: 190,
      render: (vin: string) => (
        <Text
          copyable={{ text: vin }}
          code
          style={{ fontFamily: 'SFMono-Regular, Consolas, Courier, monospace', fontSize: 13 }}
        >
          {vin}
        </Text>
      ),
    },
    {
      title: '品牌与车型',
      key: 'model',
      width: 170,
      render: (_, record) => (
        <Space size={6}>
          <Tag color="geekblue">{record.brandName ?? '未知品牌'}</Tag>
          <Text strong style={{ fontSize: 13 }}>
            {record.modelName ?? '未知车型'}
          </Text>
        </Space>
      ),
    },
    {
      title: '绑定车载终端',
      key: 'device',
      width: 190,
      render: (_, record) => {
        if (!record.deviceNo) {
          return <Tag color="default">未绑定</Tag>;
        }
        const isOnline = record.deviceOnlineStatus === 'ONLINE';
        return (
          <Space size={6}>
            <Text
              copyable={{ text: record.deviceNo }}
              code
              style={{ fontFamily: 'SFMono-Regular, Consolas, Courier, monospace', fontSize: 12 }}
            >
              {record.deviceNo}
            </Text>
            <Badge
              status={isOnline ? 'success' : 'default'}
              text={
                <span style={{ fontSize: 12, color: isOnline ? '#52c41a' : '#8c8c8c' }}>
                  {isOnline ? '在线' : '离线'}
                </span>
              }
            />
          </Space>
        );
      },
    },
    {
      title: '实时车况指标',
      key: 'telemetry',
      width: 220,
      render: (_, record) => {
        const tel = record.telemetry;
        if (!tel) {
          return <Text type="secondary" style={{ fontSize: 12 }}>暂无遥测</Text>;
        }
        const vMeta = formatVoltage(tel.batteryVoltage);

        return (
          <Space size={8}>
            {/* 门锁 */}
            <Tooltip title={tel.doorLocked ? '车门已上锁' : '车门未锁'}>
              <Tag color={tel.doorLocked ? 'success' : 'warning'} style={{ margin: 0, padding: '0 6px' }}>
                {tel.doorLocked ? '🔒 锁' : '🔓 开'}
              </Tag>
            </Tooltip>

            {/* 引擎/点火 */}
            <Tooltip title={tel.engineStarted ? '发动机点火运行中' : '发动机熄火静止'}>
              <Badge
                status={tel.engineStarted ? 'processing' : 'default'}
                color={tel.engineStarted ? '#52c41a' : '#8c8c8c'}
                text={
                  <span style={{ fontSize: 12, color: tel.engineStarted ? '#52c41a' : '#8c8c8c' }}>
                    {tel.engineStarted ? '点火' : '熄火'}
                  </span>
                }
              />
            </Tooltip>

            {/* 电瓶电压 */}
            <Tooltip title={`小电瓶电压: ${vMeta.text} (${vMeta.isWarning ? '低电平告警' : '正常'})`}>
              <span
                style={{
                  color: vMeta.color,
                  fontFamily: 'SFMono-Regular, Consolas, Courier, monospace',
                  fontWeight: 600,
                  fontSize: 12,
                }}
              >
                {vMeta.text}
              </span>
            </Tooltip>
          </Space>
        );
      },
    },
    {
      title: '运营状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: VehicleStatus) => {
        const meta = getVehicleStatusMeta(status);
        return <Tag color={meta.tagColor}>{meta.label}</Tag>;
      },
    },
    {
      title: '归属项目与车主',
      key: 'owner',
      width: 180,
      render: (_, record) => (
        <div>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.projectName ?? '默认车队'}
            </Text>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.85)' }}>
            {record.ownerName ?? '-'} ({maskPhone(record.ownerPhone)})
          </div>
        </div>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (val: string) => (
        <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>
          {val ?? '-'}
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right',
      width: 200,
      render: (_, record) => {
        const isScrapped = record.status === 'SCRAPPED';

        return (
          <Space size={4}>
            <Button
              type="link"
              size="small"
              icon={<InfoCircleOutlined />}
              onClick={() => handleViewDetail(record)}
            >
              车况
            </Button>

            {isScrapped ? (
              <Tooltip title="已报废车辆为物理终态，不可逆向变更状态">
                <Button type="link" size="small" disabled>
                  变更
                </Button>
              </Tooltip>
            ) : (
              <Button
                type="link"
                size="small"
                onClick={() => handleOpenStatusModal(record)}
              >
                变更
              </Button>
            )}

            <Button
              type="link"
              size="small"
              onClick={() => {
                message.info(
                  `车辆【${record.plateNumber}】软硬件绑定管理将在后续硬件绑定中心 (Task 5) 提供联动！`
                );
              }}
            >
              {record.deviceId ? '换绑' : '绑定'}
            </Button>
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
          message="租户车辆配额即将达到上限"
          description={`租户车辆配额已占用 ${stats.quotaUsed}/${stats.quotaTotal} (${stats.quotaUsage}%)，即将达到租户许可上限，请及时联系商务人员进行配额扩容！`}
          style={{ borderRadius: 8, boxShadow: '0 2px 6px rgba(250, 173, 20, 0.15)' }}
        />
      )}

      {/* 顶部指标统计卡片 (4 卡布局) */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card
            bordered={false}
            style={{ borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)' }}
          >
            <Statistic
              title="车辆总数"
              value={stats.totalCount}
              prefix={<CarOutlined style={{ color: '#1677ff' }} />}
              suffix={<Text type="secondary" style={{ fontSize: 12 }}>辆</Text>}
            />
            <div style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                配额已用 {stats.quotaUsage}%
              </Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card
            bordered={false}
            style={{ borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Statistic
                title="正常运营中"
                value={stats.normalCount}
                prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                valueStyle={{ color: '#52c41a' }}
                suffix={<Text type="secondary" style={{ fontSize: 12 }}>辆</Text>}
              />
              <Tag color="success" style={{ fontWeight: 600 }}>
                在线率 {stats.onlineRate}%
              </Tag>
            </div>
            <div style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                实时在线 {stats.onlineCount} 辆
              </Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card
            bordered={false}
            style={{ borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)' }}
          >
            <Statistic
              title="维保与风控"
              value={stats.maintenanceCount + stats.lockedCount}
              prefix={<AlertOutlined style={{ color: '#fa8c16' }} />}
              valueStyle={{ color: '#fa8c16' }}
              suffix={<Text type="secondary" style={{ fontSize: 12 }}>辆</Text>}
            />
            <div style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                维保 {stats.maintenanceCount} | 风控锁死 {stats.lockedCount}
              </Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card
            bordered={false}
            style={{ borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Statistic
                title="终端设备绑定率"
                value={stats.boundRate}
                prefix={<LinkOutlined style={{ color: '#1677ff' }} />}
                valueStyle={{ color: '#1677ff' }}
                suffix="%"
              />
              <Tag color="processing">
                {stats.boundCount}/{stats.totalCount}
              </Tag>
            </div>
            <div style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                已绑定 {stats.boundCount} 辆 / 未绑定 {stats.totalCount - stats.boundCount} 辆
              </Text>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 筛选与操作工具栏 */}
      <Card
        bordered={false}
        style={{ borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)' }}
      >
        <Row gutter={[16, 16]} justify="space-between" align="middle">
          <Col xs={24} xl={18}>
            <Space wrap size="middle">
              <Input
                placeholder="搜索车牌 / VIN / 设备号 / 车主 / 品牌..."
                prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,0.45)' }} />}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                style={{ width: 260 }}
                allowClear
              />

              <Select
                value={projectFilter}
                onChange={setProjectFilter}
                style={{ width: 170 }}
                options={[
                  { label: '全部项目', value: 'ALL' },
                  ...projects.map((p) => ({ label: p.name, value: p.id })),
                ]}
              />

              <Select
                value={brandFilter}
                onChange={(val) => {
                  setBrandFilter(val);
                  setModelFilter('ALL');
                }}
                style={{ width: 130 }}
                options={[
                  { label: '全部品牌', value: 'ALL' },
                  ...brands.map((b) => ({ label: b.name, value: b.id })),
                ]}
              />

              <Select
                value={modelFilter}
                onChange={setModelFilter}
                style={{ width: 130 }}
                options={[
                  { label: '全部车型', value: 'ALL' },
                  ...filteredModelsForFilter.map((m) => ({ label: m.name, value: m.id })),
                ]}
              />

              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                style={{ width: 130 }}
                options={[
                  { label: '全部状态', value: 'ALL' },
                  { label: '正常运营', value: 'NORMAL' },
                  { label: '维保检修', value: 'MAINTENANCE' },
                  { label: '风控锁死', value: 'LOCKED' },
                  { label: '已报废', value: 'SCRAPPED' },
                ]}
              />

              <Select
                value={bindStatusFilter}
                onChange={setBindStatusFilter}
                style={{ width: 130 }}
                options={[
                  { label: '全部绑定', value: 'ALL' },
                  { label: '已绑定设备', value: 'BOUND' },
                  { label: '未绑定设备', value: 'UNBOUND' },
                ]}
              />

              <Button icon={<ReloadOutlined />} onClick={loadData}>
                刷新
              </Button>

              <Button onClick={handleResetFilters}>重置</Button>
            </Space>
          </Col>

          <Col xs={24} xl={6} style={{ textAlign: 'right' }}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleOpenCreateModal}
            >
              + 录入车辆
            </Button>
          </Col>
        </Row>
      </Card>

      {/* 车辆列表表格 */}
      <Card
        bordered={false}
        style={{ borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)' }}
      >
        <Table<VehicleDto>
          rowKey="id"
          columns={columns}
          dataSource={displayVehicles}
          loading={loading}
          pagination={{
            defaultPageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 辆车辆`,
          }}
          scroll={{ x: 1400 }}
        />
      </Card>

      {/* 单个车辆录入模态框 */}
      <Modal
        title={
          <Space>
            <CarOutlined style={{ color: '#1677ff' }} />
            <span>新增车辆台账建档</span>
          </Space>
        }
        open={createModalOpen}
        onOk={handleCreateSubmit}
        onCancel={() => setCreateModalOpen(false)}
        confirmLoading={submitting}
        destroyOnClose
        width={580}
      >
        <Form form={createForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            label="车架号 (VIN 码，17位)"
            name="vin"
            rules={[
              { required: true, message: '请输入17位车辆车架号 (VIN)' },
              {
                validator: async (_, value) => {
                  if (value && !validateVin(value)) {
                    throw new Error('VIN 格式错误，必须为 17 位大写字母与数字（严禁包含 I, O, Q）');
                  }
                },
              },
            ]}
            extra="依据 ISO 3779 国际标准校验，自动转大写并排除 I/O/Q"
          >
            <Input
              placeholder="例如: LFPH2E023N1000001"
              maxLength={17}
              addonAfter={
                <Button
                  type="link"
                  size="small"
                  icon={<ThunderboltOutlined />}
                  onClick={() => createForm.setFieldValue('vin', generateSampleVin())}
                  style={{ padding: 0 }}
                >
                  生成示例 VIN
                </Button>
              }
            />
          </Form.Item>

          <Form.Item
            label="车牌号码 (支持新能源绿牌)"
            name="plateNumber"
            rules={[
              { required: true, message: '请输入车牌号码' },
              {
                validator: async (_, value) => {
                  if (value && !validatePlateNumber(value)) {
                    throw new Error(
                      '车牌格式不正确，请输入中国大陆标准车牌(如 粤B·88888 或新能源 粤B·D12345)'
                    );
                  }
                },
              },
            ]}
          >
            <Input placeholder="例如: 粤B·88888 或 粤B·D12345" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="品牌"
                name="brandId"
                rules={[{ required: true, message: '请选择车辆品牌' }]}
              >
                <Select
                  options={brands.map((b) => ({ label: b.name, value: b.id }))}
                  onChange={() => createForm.setFieldValue('modelId', undefined)}
                  placeholder="选择品牌"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="车型"
                name="modelId"
                rules={[{ required: true, message: '请选择车型' }]}
              >
                <Select
                  options={formAvailableModels.map((m) => ({ label: m.name, value: m.id }))}
                  placeholder="选择对应车型"
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label="归属项目"
            name="projectId"
            rules={[{ required: true, message: '请选择归属车队项目' }]}
          >
            <Select
              options={projects.map((p) => ({
                label: `${p.name} (${p.code})`,
                value: p.id,
              }))}
            />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="车主姓名 (选填)" name="ownerName">
                <Input placeholder="例如: 张三" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="联系电话 (选填)"
                name="ownerPhone"
                rules={[
                  {
                    validator: async (_, value) => {
                      if (value && !/^1[3-9]\d{9}$/.test(value.trim())) {
                        throw new Error('请输入合法的大陆 11 位手机号码');
                      }
                    },
                  },
                ]}
              >
                <Input placeholder="例如: 13800138888" maxLength={11} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label="绑定车载终端设备 (选填)"
            name="deviceId"
            extra="可下拉绑定当前处于未绑定状态的空闲车载设备"
          >
            <Select
              allowClear
              placeholder="暂不绑定（后续可在台账中绑定）"
              options={availableDevices.map((d) => ({
                label: `${d.deviceNo} (${d.productName ?? 'T-Box'})`,
                value: d.id,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 车辆详情与车况遥测概览模态框 */}
      <Modal
        title={
          <Space>
            <CarOutlined style={{ color: '#1677ff' }} />
            <span>车辆档案与实时遥测概览 - {selectedVehicle?.plateNumber}</span>
          </Space>
        }
        open={detailModalOpen}
        onCancel={() => setDetailModalOpen(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalOpen(false)}>
            关闭
          </Button>,
        ]}
        width={680}
      >
        {selectedVehicle && (
          <div style={{ marginTop: 16 }}>
            <Descriptions title="基本档案信息" bordered size="small" column={2}>
              <Descriptions.Item label="车牌号码">
                <Tag color="blue" style={{ fontWeight: 600 }}>
                  {selectedVehicle.plateNumber}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="车架号 (VIN)">
                <Text code copyable={{ text: selectedVehicle.vin }}>
                  {selectedVehicle.vin}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="品牌与车型">
                {selectedVehicle.brandName} - {selectedVehicle.modelName}
              </Descriptions.Item>
              <Descriptions.Item label="运营状态">
                {(() => {
                  const meta = getVehicleStatusMeta(selectedVehicle.status);
                  return <Tag color={meta.tagColor}>{meta.label}</Tag>;
                })()}
              </Descriptions.Item>
              <Descriptions.Item label="归属项目">
                {selectedVehicle.projectName ?? '默认车队'}
              </Descriptions.Item>
              <Descriptions.Item label="车主信息">
                {selectedVehicle.ownerName ?? '-'} ({maskPhone(selectedVehicle.ownerPhone)})
              </Descriptions.Item>
              <Descriptions.Item label="建档时间" span={2}>
                {selectedVehicle.createdAt}
              </Descriptions.Item>
            </Descriptions>

            <Divider style={{ margin: '16px 0' }} />

            <Descriptions title="车载设备与遥测数据" bordered size="small" column={2}>
              <Descriptions.Item label="关联设备">
                {selectedVehicle.deviceNo ? (
                  <Space>
                    <Text code copyable={{ text: selectedVehicle.deviceNo }}>
                      {selectedVehicle.deviceNo}
                    </Text>
                    <Badge
                      status={selectedVehicle.deviceOnlineStatus === 'ONLINE' ? 'success' : 'default'}
                      text={selectedVehicle.deviceOnlineStatus === 'ONLINE' ? '在线' : '离线'}
                    />
                  </Space>
                ) : (
                  <Tag color="default">未绑定</Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="电瓶电压">
                {(() => {
                  const v = formatVoltage(selectedVehicle.telemetry?.batteryVoltage);
                  return (
                    <span style={{ color: v.color, fontWeight: 600 }}>
                      {v.text} {v.isWarning && '(低电平告警)'}
                    </span>
                  );
                })()}
              </Descriptions.Item>
              <Descriptions.Item label="车门锁态">
                {selectedVehicle.telemetry?.doorLocked ? (
                  <Tag color="success">🔒 已闭锁</Tag>
                ) : (
                  <Tag color="warning">🔓 未闭锁</Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="行李箱尾门">
                {selectedVehicle.telemetry?.trunkLocked ? (
                  <Tag color="success">🔒 已关闭锁止</Tag>
                ) : (
                  <Tag color="warning">🔓 开启中</Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="发动机动力">
                {selectedVehicle.telemetry?.engineStarted ? (
                  <Tag color="processing">🟢 点火运行中</Tag>
                ) : (
                  <Tag color="default">⚪ 熄火静止</Tag>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="剩余电量/油量">
                {selectedVehicle.telemetry?.fuelOrBatteryLevel !== undefined
                  ? `${selectedVehicle.telemetry.fuelOrBatteryLevel}%`
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="累计行驶里程">
                {selectedVehicle.telemetry?.mileage !== undefined
                  ? `${selectedVehicle.telemetry.mileage.toLocaleString()} km`
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="当前瞬时车速">
                {selectedVehicle.telemetry?.speed !== undefined
                  ? `${selectedVehicle.telemetry.speed} km/h`
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="最新定位位置" span={2}>
                {selectedVehicle.telemetry?.location ?? '整车交付中心'}
              </Descriptions.Item>
              <Descriptions.Item label="最新报文时间" span={2}>
                {selectedVehicle.telemetry?.lastReportedAt ?? '-'}
              </Descriptions.Item>
            </Descriptions>
          </div>
        )}
      </Modal>

      {/* 车辆状态变更确认模态框 */}
      <Modal
        title={
          <Space>
            <SafetyCertificateOutlined style={{ color: '#fa8c16' }} />
            <span>变更车辆运营状态 - {selectedVehicle?.plateNumber}</span>
          </Space>
        }
        open={statusModalOpen}
        onOk={handleStatusChangeSubmit}
        onCancel={() => setStatusModalOpen(false)}
        confirmLoading={submitting}
        width={480}
      >
        <div style={{ marginTop: 16 }}>
          <Descriptions size="small" column={1} bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="当前运营状态">
              {selectedVehicle && (
                <Tag color={getVehicleStatusMeta(selectedVehicle.status).tagColor}>
                  {getVehicleStatusMeta(selectedVehicle.status).label}
                </Tag>
              )}
            </Descriptions.Item>
          </Descriptions>

          <Form.Item label="目标状态" required style={{ marginBottom: 12 }}>
            <Select
              value={targetStatus}
              onChange={setTargetStatus}
              style={{ width: '100%' }}
              options={[
                { label: '正常运营 (NORMAL)', value: 'NORMAL' },
                { label: '维保检修 (MAINTENANCE)', value: 'MAINTENANCE' },
                { label: '风控锁死 (LOCKED)', value: 'LOCKED' },
                { label: '已报废 (SCRAPPED)', value: 'SCRAPPED' },
              ]}
            />
          </Form.Item>

          {targetStatus === 'SCRAPPED' && (
            <Alert
              type="error"
              showIcon
              message="高危不可逆操作警示"
              description="报废为物理终态。一旦标记为【已报废】，车辆将永久归档注销，严禁逆向恢复为正常、维保或风控状态！"
              style={{ marginTop: 8 }}
            />
          )}

          {targetStatus === 'LOCKED' && (
            <Alert
              type="warning"
              showIcon
              message="风控锁死提醒"
              description="设置为风控锁死后，平台将限制针对该车辆的非必要远程控车指令下发。"
              style={{ marginTop: 8 }}
            />
          )}
        </div>
      </Modal>
    </div>
  );
};

export default VehicleListView;
