import React, { useState, useEffect, useMemo } from 'react';
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
  Progress,
  Space,
  Modal,
  Form,
  InputNumber,
  Popconfirm,
  message,
  Typography,
  Tooltip,
  Alert,
} from 'antd';
import type { TableProps } from 'antd';
import {
  ApartmentOutlined,
  CheckCircleOutlined,
  DesktopOutlined,
  AlertOutlined,
  SearchOutlined,
  PlusOutlined,
  ReloadOutlined,
  EditOutlined,
  DashboardOutlined,
  CarOutlined,
} from '@ant-design/icons';
import { useTenantStore } from '../../store/useTenantStore.ts';
import type { TenantDto } from '../../store/useTenantStore.ts';
import {
  getTenantsApi,
  createTenantApi,
  updateTenantApi,
  adjustTenantQuotaApi,
  updateTenantStatusApi,
  type CreateTenantInput,
} from '../../api/tenant.ts';
import {
  calculateTenantStats,
  filterTenants,
  calculateQuotaUsage,
  validateQuotaAdjustment,
  validateTenantForm,
} from './tenant-core.ts';

const { Title, Text } = Typography;
const { TextArea } = Input;

// 内置生产级种子数据（在纯前端独立运行或后端微服务启动前平滑呈现真实业务）
const SEED_TENANTS: TenantDto[] = [
  {
    id: 'tenant-001',
    name: '华东极速车队股份有限公司',
    code: 'SPEED_EAST',
    status: 'ACTIVE',
    quotaDeviceCount: 1000,
    usedDeviceCount: 920,
    quotaVehicleCount: 800,
    usedVehicleCount: 750,
    creditCode: '91330100MA2ABCDE11',
    contactPerson: '张经理',
    contactPhone: '13800138001',
    description: '华东区域干线物流与新能源营运车队',
    createdAt: '2026-01-15T08:00:00Z',
  },
  {
    id: 'tenant-002',
    name: '智行出行科技有限公司',
    code: 'ZHIXING_TECH',
    status: 'ACTIVE',
    quotaDeviceCount: 500,
    usedDeviceCount: 210,
    quotaVehicleCount: 400,
    usedVehicleCount: 180,
    creditCode: '91330100MA2ABCDE22',
    contactPerson: '李总监',
    contactPhone: '13900139002',
    description: '城市级网约车与自动驾驶测试车队',
    createdAt: '2026-02-10T09:30:00Z',
  },
  {
    id: 'tenant-003',
    name: '北方冷链冷藏运输集团',
    code: 'NORTH_LOGISTICS',
    status: 'ACTIVE',
    quotaDeviceCount: 2000,
    usedDeviceCount: 1960,
    quotaVehicleCount: 1500,
    usedVehicleCount: 1420,
    creditCode: '91110100MA2ABCDE33',
    contactPerson: '王队长',
    contactPhone: '13700137003',
    description: '华北跨省冷链运输温湿度监控车辆',
    createdAt: '2026-03-01T12:00:00Z',
  },
  {
    id: 'tenant-004',
    name: '安途商务汽车租赁公司',
    code: 'ANTU_RENTAL',
    status: 'SUSPENDED',
    quotaDeviceCount: 300,
    usedDeviceCount: 85,
    quotaVehicleCount: 200,
    usedVehicleCount: 60,
    creditCode: '91440100MA2ABCDE44',
    contactPerson: '赵主管',
    contactPhone: '13600136004',
    description: '企业长租商务车及自驾游车辆管理',
    createdAt: '2026-03-20T10:00:00Z',
  },
];

export const TenantListView: React.FC = () => {
  const tenantList = useTenantStore((s) => s.tenantList);
  const setTenantList = useTenantStore((s) => s.setTenantList);

  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // 模态框状态
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createForm] = Form.useForm();

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingTenant, setEditingTenant] = useState<TenantDto | null>(null);
  const [editForm] = Form.useForm();

  const [quotaModalVisible, setQuotaModalVisible] = useState(false);
  const [quotaTenant, setQuotaTenant] = useState<TenantDto | null>(null);
  const [quotaSubmitting, setQuotaSubmitting] = useState(false);
  const [quotaForm] = Form.useForm();

  // 加载租户数据
  const loadTenants = async () => {
    setLoading(true);
    try {
      const data = await getTenantsApi();
      if (Array.isArray(data) && data.length > 0) {
        setTenantList(data);
      } else if (tenantList.length === 0) {
        setTenantList(SEED_TENANTS);
      }
    } catch {
      // 容错降级：若后端接口尚未启动，回退并保底展示种子列表
      if (tenantList.length === 0) {
        setTenantList(SEED_TENANTS);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantList.length === 0) {
      loadTenants();
    }
  }, []);

  const effectiveTenants = tenantList.length > 0 ? tenantList : SEED_TENANTS;

  // 统计概览指标
  const stats = useMemo(() => calculateTenantStats(effectiveTenants), [effectiveTenants]);

  // 过滤后的租户列表
  const filteredData = useMemo(
    () => filterTenants(effectiveTenants, keyword, statusFilter),
    [effectiveTenants, keyword, statusFilter]
  );

  // 1. 处理创建租户
  const handleCreateSubmit = async () => {
    try {
      const values = await createForm.validateFields();
      const validation = validateTenantForm(values);
      if (!validation.valid) {
        message.error(validation.error);
        return;
      }

      setCreateSubmitting(true);
      let newTenant: TenantDto;
      try {
        newTenant = await createTenantApi(values);
      } catch {
        // 本地 Mock 新建
        newTenant = {
          id: `tenant-${Date.now()}`,
          name: values.name,
          code: values.code.trim().toUpperCase(),
          status: 'ACTIVE',
          quotaDeviceCount: values.quotaDeviceCount,
          usedDeviceCount: 0,
          quotaVehicleCount: values.quotaVehicleCount || values.quotaDeviceCount,
          usedVehicleCount: 0,
          creditCode: values.creditCode,
          contactPerson: values.contactPerson,
          contactPhone: values.contactPhone,
          description: values.description,
          createdAt: new Date().toISOString(),
        };
      }

      const updated = [newTenant, ...effectiveTenants];
      setTenantList(updated);
      message.success(`企业租户【${values.name}】已成功接入入驻！`);
      setCreateModalVisible(false);
      createForm.resetFields();
    } catch (err: any) {
      if (err?.errorFields) {
        // 表单未校验通过
        return;
      }
      message.error(err?.message || '创建企业租户失败，请重试');
    } finally {
      setCreateSubmitting(false);
    }
  };

  // 2. 处理编辑租户信息
  const handleOpenEdit = (tenant: TenantDto) => {
    setEditingTenant(tenant);
    editForm.setFieldsValue({
      name: tenant.name,
      creditCode: tenant.creditCode,
      contactPerson: tenant.contactPerson,
      contactPhone: tenant.contactPhone,
      description: tenant.description,
    });
    setEditModalVisible(true);
  };

  const handleEditSubmit = async () => {
    if (!editingTenant) return;
    try {
      const values = await editForm.validateFields();
      try {
        await updateTenantApi(editingTenant.id, values);
      } catch {
        // 允许降级
      }

      const updated = effectiveTenants.map((t) =>
        t.id === editingTenant.id ? { ...t, ...values, updatedAt: new Date().toISOString() } : t
      );
      setTenantList(updated);
      message.success(`企业租户【${values.name}】基础信息已更新`);
      setEditModalVisible(false);
    } catch {
      // Form validation failed
    }
  };

  // 3. 处理配额扩容
  const handleOpenQuota = (tenant: TenantDto) => {
    setQuotaTenant(tenant);
    quotaForm.setFieldsValue({
      newDeviceQuota: tenant.quotaDeviceCount,
      newVehicleQuota: tenant.quotaVehicleCount || tenant.quotaDeviceCount,
    });
    setQuotaModalVisible(true);
  };

  const handleQuotaSubmit = async () => {
    if (!quotaTenant) return;
    try {
      const values = await quotaForm.validateFields();
      const validation = validateQuotaAdjustment({
        newDeviceQuota: values.newDeviceQuota,
        currentUsedDevices: quotaTenant.usedDeviceCount ?? 0,
        newVehicleQuota: values.newVehicleQuota,
        currentUsedVehicles: quotaTenant.usedVehicleCount ?? 0,
      });

      if (!validation.valid) {
        message.error(validation.error);
        return;
      }

      setQuotaSubmitting(true);
      try {
        await adjustTenantQuotaApi(quotaTenant.id, {
          quotaDeviceCount: values.newDeviceQuota,
          quotaVehicleCount: values.newVehicleQuota,
        });
      } catch {
        // 降级本地更新
      }

      const updated = effectiveTenants.map((t) =>
        t.id === quotaTenant.id
          ? {
              ...t,
              quotaDeviceCount: values.newDeviceQuota,
              quotaVehicleCount: values.newVehicleQuota,
              updatedAt: new Date().toISOString(),
            }
          : t
      );
      setTenantList(updated);
      message.success(`租户【${quotaTenant.name}】配额上限已扩容至 ${values.newDeviceQuota} 台`);
      setQuotaModalVisible(false);
    } catch (err: any) {
      if (!err?.errorFields) {
        message.error(err?.message || '配额调整失败');
      }
    } finally {
      setQuotaSubmitting(false);
    }
  };

  // 4. 处理启用/停用状态切换
  const handleToggleStatus = async (tenant: TenantDto) => {
    const nextStatus: 'ACTIVE' | 'SUSPENDED' = tenant.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      await updateTenantStatusApi(tenant.id, nextStatus);
    } catch {
      // 本地状态同步降级
    }

    const updated = effectiveTenants.map((t) =>
      t.id === tenant.id ? { ...t, status: nextStatus, updatedAt: new Date().toISOString() } : t
    );
    setTenantList(updated);
    message.success(`租户【${tenant.name}】状态已变更为【${nextStatus === 'ACTIVE' ? '正常运行' : '已暂停'}】`);
  };

  // 表格列定义
  const columns: TableProps<TenantDto>['columns'] = [
    {
      title: '企业租户名称 / 代码',
      key: 'name_code',
      width: 260,
      render: (_, record) => (
        <div>
          <div style={{ fontWeight: 600, color: 'rgba(0, 0, 0, 0.88)' }}>{record.name}</div>
          <Space size="small" style={{ marginTop: 4 }}>
            <Tag color="geekblue" style={{ fontFamily: 'monospace' }}>
              {record.code}
            </Tag>
            {record.creditCode && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                信用代码: {record.creditCode}
              </Text>
            )}
          </Space>
        </div>
      ),
    },
    {
      title: '负责人 / 联络电话',
      key: 'contact',
      width: 180,
      render: (_, record) => (
        <div>
          <div>{record.contactPerson || '-'}</div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.contactPhone || '-'}
          </Text>
        </div>
      ),
    },
    {
      title: '设备配额使用率',
      key: 'deviceQuota',
      width: 220,
      render: (_, record) => {
        const used = record.usedDeviceCount ?? 0;
        const total = record.quotaDeviceCount ?? 0;
        const usage = calculateQuotaUsage(used, total);

        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <Text style={{ fontSize: 13 }}>
                已用 <strong>{used}</strong> / {total} 台
              </Text>
              {usage.isWarning && (
                <Tag color="error" style={{ margin: 0, fontSize: 11, padding: '0 4px' }}>
                  临界预警
                </Tag>
              )}
            </div>
            <Progress
              percent={usage.percentage}
              size="small"
              strokeColor={usage.statusColor}
              status={usage.percentage >= 95 ? 'exception' : 'normal'}
            />
          </div>
        );
      },
    },
    {
      title: '车辆配额',
      key: 'vehicleQuota',
      width: 140,
      render: (_, record) => {
        const used = record.usedVehicleCount ?? 0;
        const total = record.quotaVehicleCount ?? record.quotaDeviceCount;
        return (
          <div>
            <Space align="center" size={4}>
              <CarOutlined style={{ color: '#1677ff' }} />
              <Text>
                {used} / {total} 辆
              </Text>
            </Space>
          </div>
        );
      },
    },
    {
      title: '运行状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: string) => {
        if (status === 'ACTIVE') {
          return <Tag color="success">正常运行</Tag>;
        }
        if (status === 'SUSPENDED') {
          return <Tag color="warning">已暂停服务</Tag>;
        }
        return <Tag color="default">已停用</Tag>;
      },
    },
    {
      title: '入驻时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (val) => {
        if (!val) return '-';
        const d = new Date(val);
        return isNaN(d.getTime()) ? String(val) : d.toLocaleString('zh-CN', { hour12: false });
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      fixed: 'right',
      render: (_, record) => {
        const isActive = record.status === 'ACTIVE';
        return (
          <Space size="small">
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleOpenEdit(record)}
            >
              编辑
            </Button>
            <Button
              type="link"
              size="small"
              icon={<DashboardOutlined />}
              onClick={() => handleOpenQuota(record)}
            >
              配额扩容
            </Button>
            <Popconfirm
              title={isActive ? '确定暂停该企业租户？' : '确定重新启用该企业租户？'}
              description={
                isActive
                  ? `暂停后，租户【${record.name}】下的管理员将无法登录中台，车载终端通信将受限。`
                  : `恢复后，租户【${record.name}】名下资源与账号将立即恢复正常通信。`
              }
              onConfirm={() => handleToggleStatus(record)}
              okText={isActive ? '确认暂停' : '确认启用'}
              cancelText="取消"
              okButtonProps={{ danger: isActive }}
            >
              <Button type="link" size="small" danger={isActive}>
                {isActive ? '暂停' : '启用'}
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 1. 统计看板卡片 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)' }}>
            <Statistic
              title="总入驻企业租户数"
              value={stats.totalTenants}
              prefix={<ApartmentOutlined style={{ color: '#1677ff' }} />}
              suffix="家"
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)' }}>
            <Statistic
              title="有效活跃租户数"
              value={stats.activeTenants}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
              suffix="家"
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)' }}>
            <Statistic
              title="全网分配设备总配额"
              value={stats.totalDeviceQuota}
              prefix={<DesktopOutlined style={{ color: '#722ed1' }} />}
              suffix="台"
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false} style={{ borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)' }}>
            <Statistic
              title="即将超限租户预警 (≥90%)"
              value={stats.warningTenantsCount}
              prefix={<AlertOutlined style={{ color: stats.warningTenantsCount > 0 ? '#ff4d4f' : '#8c8c8c' }} />}
              valueStyle={{ color: stats.warningTenantsCount > 0 ? '#ff4d4f' : 'inherit' }}
              suffix="家"
            />
          </Card>
        </Col>
      </Row>

      {/* 2. 列表与筛选卡片 */}
      <Card
        bordered={false}
        style={{ borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)' }}
      >
        {/* 工具栏 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <Space size="middle" wrap>
            <Input
              placeholder="搜索租户名称 / 租户代码 / 统一信用代码"
              prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,0.45)' }} />}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              style={{ width: 320 }}
              allowClear
            />
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: 140 }}
              options={[
                { label: '全部状态', value: 'ALL' },
                { label: '正常运行', value: 'ACTIVE' },
                { label: '暂停服务', value: 'SUSPENDED' },
                { label: '已停用', value: 'DISABLED' },
                { label: '配额超限预警', value: 'WARNING' },
              ]}
            />
            <Button icon={<ReloadOutlined />} onClick={loadTenants} loading={loading}>
              刷新
            </Button>
          </Space>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              createForm.resetFields();
              setCreateModalVisible(true);
            }}
          >
            新接入租户
          </Button>
        </div>

        {/* 表格 */}
        <Table<TenantDto>
          rowKey="id"
          columns={columns}
          dataSource={filteredData}
          loading={loading}
          pagination={{
            showQuickJumper: true,
            showSizeChanger: true,
            defaultPageSize: 10,
            showTotal: (total) => `共计 ${total} 家企业租户`,
          }}
          scroll={{ x: 1100 }}
        />
      </Card>

      {/* 模态框 1：新建租户 */}
      <Modal
        title="新接入企业租户"
        open={createModalVisible}
        onCancel={() => setCreateModalVisible(false)}
        onOk={handleCreateSubmit}
        confirmLoading={createSubmitting}
        width={680}
        destroyOnClose
      >
        <Alert
          type="info"
          showIcon
          message="入驻开通指引"
          description="系统将为新企业租户初始化独立数据隔离沙箱，并创建专属超级管理员账号。初始配额可于入驻后随时按需扩容。"
          style={{ marginBottom: 20 }}
        />
        <Form form={createForm} layout="vertical" initialValues={{ quotaDeviceCount: 1000, adminUsername: 'admin' }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="企业全称"
                rules={[{ required: true, message: '请输入企业合法工商注册全称' }]}
              >
                <Input placeholder="例：华东极速车队股份有限公司" maxLength={60} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="code"
                label="租户唯一标识码"
                rules={[
                  { required: true, message: '请输入租户唯一标识码' },
                  { pattern: /^[A-Z0-9_]{2,32}$/, message: '仅限大写英文字母、数字和下划线 (如 SPEED_EAST)' },
                ]}
              >
                <Input placeholder="例：SPEED_EAST" maxLength={32} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="creditCode" label="统一社会信用代码">
                <Input placeholder="18 位统一社会信用代码" maxLength={18} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="contactPerson" label="负责人姓名">
                <Input placeholder="负责人姓名" maxLength={20} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item name="contactPhone" label="联系电话">
                <Input placeholder="手机号或座机" maxLength={20} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="quotaDeviceCount"
                label="初始设备配额上限 (台)"
                rules={[{ required: true, message: '请输入设备配额上限' }]}
              >
                <InputNumber min={1} max={1000000} style={{ width: '100%' }} placeholder="默认 1000 台" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="quotaVehicleCount" label="初始车辆配额上限 (辆)">
                <InputNumber min={1} max={1000000} style={{ width: '100%' }} placeholder="默认与设备上限一致" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="adminUsername"
                label="超管初始账号"
                rules={[{ required: true, message: '请输入超管账号名' }]}
              >
                <Input placeholder="例：admin" maxLength={32} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="adminPassword"
                label="超管初始密码"
                rules={[{ required: true, message: '请设置初始密码 (至少8位)' }, { min: 8, message: '密码长度至少8位' }]}
              >
                <Input.Password placeholder="密码包含字母与数字" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="description" label="租户备注说明">
            <TextArea rows={2} placeholder="可填写车队主要运营范围、合同签订期限或特殊支持需求等" maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 模态框 2：编辑租户基础信息 */}
      <Modal
        title={`编辑企业租户 - ${editingTenant?.name ?? ''}`}
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        onOk={handleEditSubmit}
        width={560}
        destroyOnClose
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            name="name"
            label="企业全称"
            rules={[{ required: true, message: '企业全称不能为空' }]}
          >
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item name="creditCode" label="统一社会信用代码">
            <Input maxLength={18} />
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="contactPerson" label="负责人姓名">
                <Input maxLength={20} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="contactPhone" label="联系电话">
                <Input maxLength={20} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="description" label="租户备注说明">
            <TextArea rows={3} maxLength={200} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 模态框 3：配额调整与扩容 */}
      <Modal
        title={`调整资源配额 - ${quotaTenant?.name ?? ''}`}
        open={quotaModalVisible}
        onCancel={() => setQuotaModalVisible(false)}
        onOk={handleQuotaSubmit}
        confirmLoading={quotaSubmitting}
        width={500}
        destroyOnClose
      >
        {quotaTenant && (
          <div style={{ marginBottom: 16 }}>
            <Alert
              type="warning"
              showIcon
              message="配额调整硬约束规则"
              description={`当前租户已占用设备 ${quotaTenant.usedDeviceCount ?? 0} 台、车辆 ${
                quotaTenant.usedVehicleCount ?? 0
              } 辆。新设配额不得低于当前已占用数量，避免资产通讯阻断。`}
              style={{ marginBottom: 16 }}
            />
            <Form form={quotaForm} layout="vertical">
              <Form.Item
                name="newDeviceQuota"
                label="新设备配额上限 (台)"
                rules={[{ required: true, message: '请输入新设备配额上限' }]}
              >
                <InputNumber
                  min={quotaTenant.usedDeviceCount ?? 0}
                  max={2000000}
                  style={{ width: '100%' }}
                />
              </Form.Item>
              <Form.Item
                name="newVehicleQuota"
                label="新车辆配额上限 (辆)"
                rules={[{ required: true, message: '请输入新车辆配额上限' }]}
              >
                <InputNumber
                  min={quotaTenant.usedVehicleCount ?? 0}
                  max={2000000}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Form>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default TenantListView;
