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
  Radio,
} from 'antd';
import type { TableProps } from 'antd';
import {
  ClusterOutlined,
  CheckCircleOutlined,
  DesktopOutlined,
  CarOutlined,
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  EditOutlined,
  SwapOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import {
  type ProjectDto,
  type ProjectStatus,
  type CreateProjectInput,
  type UpdateProjectInput,
  validateProjectCode,
  canArchiveProject,
  PROJECT_STATUS_MAP,
} from './project-core.ts';
import { type DeviceDto, getOnlineStatusMeta } from './device-core.ts';
import {
  fetchProjectsApi,
  createProjectApi,
  updateProjectApi,
  updateProjectStatusApi,
  allocateDevicesToProjectApi,
  fetchDevicesApi,
} from '../../api/device.ts';
import { maskPhone, isApiError } from '../vehicle/vehicle-core.ts';

const { Text, Paragraph } = Typography;

export const ProjectManageView: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<ProjectDto[]>([]);

  // 筛选条件
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [keyword, setKeyword] = useState('');

  // 新建/编辑项目弹窗
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectDto | null>(null);
  const [projectForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  // 设备调配弹窗
  const [allocateModalVisible, setAllocateModalVisible] = useState(false);
  const [currentAllocProject, setCurrentAllocProject] = useState<ProjectDto | null>(null);
  const [allDevices, setAllDevices] = useState<DeviceDto[]>([]);
  const [allocateLoading, setAllocateLoading] = useState(false);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<React.Key[]>([]);
  const [deviceFilterScope, setDeviceFilterScope] = useState<'ALL' | 'CURRENT' | 'OTHER'>('ALL');

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchProjectsApi();
      setProjects(data);
    } catch (err) {
      if (isApiError(err)) {
        message.error(`拉取项目列表异常: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 统计指标
  const stats = useMemo(() => {
    const total = projects.length;
    const activeCount = projects.filter((p) => p.status === 'ACTIVE').length;
    const totalDevices = projects.reduce((acc, p) => acc + (p.deviceCount ?? 0), 0);
    const totalVehicles = projects.reduce((acc, p) => acc + (p.vehicleCount ?? 0), 0);
    return {
      total,
      activeCount,
      totalDevices,
      totalVehicles,
    };
  }, [projects]);

  // 列表过滤
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (statusFilter !== 'ALL' && p.status !== statusFilter) {
        return false;
      }
      if (keyword.trim()) {
        const kw = keyword.trim().toLowerCase();
        const matchesName = p.name?.toLowerCase().includes(kw);
        const matchesCode = p.code?.toLowerCase().includes(kw);
        const matchesOrg = p.orgName?.toLowerCase().includes(kw);
        const matchesContact = p.contactName?.toLowerCase().includes(kw);
        if (!matchesName && !matchesCode && !matchesOrg && !matchesContact) {
          return false;
        }
      }
      return true;
    });
  }, [projects, statusFilter, keyword]);

  // 打开新建/编辑项目弹窗
  const handleOpenEditModal = (proj?: ProjectDto) => {
    if (proj) {
      setEditingProject(proj);
      projectForm.setFieldsValue({
        name: proj.name,
        code: proj.code,
        orgName: proj.orgName,
        contactName: proj.contactName,
        contactPhone: proj.contactPhone,
        description: proj.description,
      });
    } else {
      setEditingProject(null);
      projectForm.resetFields();
      projectForm.setFieldsValue({
        orgName: '华南智慧车联网运营部',
      });
    }
    setEditModalVisible(true);
  };

  // 保存项目
  const handleSaveProject = async () => {
    try {
      const values = await projectForm.validateFields();
      setSubmitting(true);

      if (editingProject) {
        const input: UpdateProjectInput = {
          name: values.name,
          code: values.code.trim().toUpperCase(),
          orgName: values.orgName,
          contactName: values.contactName,
          contactPhone: values.contactPhone,
          description: values.description,
        };
        await updateProjectApi(editingProject.id, input);
        message.success(`项目【${values.name}】更新成功`);
      } else {
        const input: CreateProjectInput = {
          name: values.name,
          code: values.code.trim().toUpperCase(),
          orgName: values.orgName,
          contactName: values.contactName,
          contactPhone: values.contactPhone,
          description: values.description,
          status: 'ACTIVE',
        };
        await createProjectApi(input);
        message.success(`项目【${values.name}】新建成功`);
      }

      setEditModalVisible(false);
      await loadData();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(err.message || '保存项目失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 状态流转操作 (暂停 / 恢复 / 归档)
  const handleUpdateStatus = async (project: ProjectDto, nextStatus: ProjectStatus) => {
    if (nextStatus === 'ARCHIVED') {
      const guard = canArchiveProject(
        project,
        project.onlineDeviceCount ?? 0,
        project.vehicleCount ?? 0
      );
      if (!guard.allowed) {
        message.error(guard.reason || '项目存在在线设备或绑定车辆，禁止直接归档');
        return;
      }
    }

    try {
      await updateProjectStatusApi(project.id, nextStatus);
      const actionName =
        nextStatus === 'ACTIVE' ? '恢复运营' : nextStatus === 'PAUSED' ? '暂停' : '归档';
      message.success(`项目【${project.name}】已成功${actionName}`);
      await loadData();
    } catch (err: any) {
      message.error(err.message || '更新项目状态失败');
    }
  };

  // 打开设备调配弹窗
  const handleOpenAllocateModal = async (project: ProjectDto) => {
    setCurrentAllocProject(project);
    setAllocateLoading(true);
    setAllocateModalVisible(true);
    try {
      const devices = await fetchDevicesApi();
      setAllDevices(devices);
      // 默认选中当前项目所属的设备
      const currentIds = devices
        .filter((d) => d.projectId === project.id)
        .map((d) => d.id);
      setSelectedDeviceIds(currentIds);
    } catch (err: any) {
      message.error(err.message || '拉取设备列表失败');
    } finally {
      setAllocateLoading(false);
    }
  };

  // 提交设备跨项目调配
  const handleConfirmAllocate = async () => {
    if (!currentAllocProject) return;
    try {
      setAllocateLoading(true);
      await allocateDevicesToProjectApi(
        currentAllocProject.id,
        selectedDeviceIds.map(String)
      );
      message.success(
        `成功将 ${selectedDeviceIds.length} 台设备调配绑定至【${currentAllocProject.name}】`
      );
      setAllocateModalVisible(false);
      await loadData();
    } catch (err: any) {
      message.error(err.message || '调配设备失败');
    } finally {
      setAllocateLoading(false);
    }
  };

  // 调配弹窗内展示的设备列表过滤
  const displayedDevicesForAllocate = useMemo(() => {
    if (!currentAllocProject) return [];
    if (deviceFilterScope === 'CURRENT') {
      return allDevices.filter((d) => d.projectId === currentAllocProject.id);
    }
    if (deviceFilterScope === 'OTHER') {
      return allDevices.filter((d) => d.projectId !== currentAllocProject.id);
    }
    return allDevices;
  }, [allDevices, currentAllocProject, deviceFilterScope]);

  // 表格列定义
  const columns: TableProps<ProjectDto>['columns'] = [
    {
      title: '项目名称',
      dataIndex: 'name',
      key: 'name',
      width: 200,
      render: (name: string, record) => (
        <Space direction="vertical" size={1}>
          <Text strong style={{ fontSize: 14 }}>
            {name}
          </Text>
          {record.description && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.description}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: '项目代号',
      dataIndex: 'code',
      key: 'code',
      width: 150,
      render: (code: string) => (
        <Text
          code
          style={{
            fontFamily: 'SFMono-Regular, Consolas, Courier, monospace',
            fontSize: 13,
            fontWeight: 600,
            color: '#1677ff',
          }}
        >
          {code}
        </Text>
      ),
    },
    {
      title: '归属运营机构',
      dataIndex: 'orgName',
      key: 'orgName',
      width: 170,
      render: (orgName?: string) => orgName || '华南智慧车联网运营部',
    },
    {
      title: '负责人 / 电话',
      key: 'contact',
      width: 170,
      render: (_, record) => (
        <div>
          <div>
            <Text strong>{record.contactName || '默认负责人'}</Text>
          </div>
          <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>
            {maskPhone(record.contactPhone)}
          </Text>
        </div>
      ),
    },
    {
      title: '设备与车辆配额',
      key: 'assets',
      width: 180,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>设备数: </Text>
            <Text strong>{record.deviceCount ?? 0} 台</Text>
            <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>
              (在线 {record.onlineDeviceCount ?? 0})
            </Text>
          </div>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>车辆数: </Text>
            <Text strong>{record.vehicleCount ?? 0} 辆</Text>
          </div>
        </Space>
      ),
    },
    {
      title: '项目状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: ProjectStatus) => {
        const meta = PROJECT_STATUS_MAP[status] || PROJECT_STATUS_MAP.ACTIVE;
        return <Tag color={meta.tagColor}>{meta.label}</Tag>;
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (date?: string) => (
        <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>
          {date || '-'}
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      fixed: 'right',
      render: (_, record: ProjectDto) => {
        const isArchived = record.status === 'ARCHIVED';
        const archiveGuard = canArchiveProject(
          record,
          record.onlineDeviceCount ?? 0,
          record.vehicleCount ?? 0
        );

        return (
          <Space size="middle">
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              disabled={isArchived}
              onClick={() => handleOpenEditModal(record)}
            >
              编辑
            </Button>

            <Button
              type="link"
              size="small"
              icon={<SwapOutlined />}
              disabled={isArchived}
              onClick={() => handleOpenAllocateModal(record)}
            >
              设备调配
            </Button>

            {record.status === 'ACTIVE' && (
              <Popconfirm
                title="确认暂停该项目？"
                description="暂停后项目将停止新车辆与设备接入"
                onConfirm={() => handleUpdateStatus(record, 'PAUSED')}
                okText="暂停"
                cancelText="取消"
              >
                <Button type="link" size="small" icon={<PauseCircleOutlined />}>
                  暂停
                </Button>
              </Popconfirm>
            )}

            {record.status === 'PAUSED' && (
              <>
                <Button
                  type="link"
                  size="small"
                  icon={<PlayCircleOutlined />}
                  onClick={() => handleUpdateStatus(record, 'ACTIVE')}
                >
                  恢复
                </Button>

                {archiveGuard.allowed ? (
                  <Popconfirm
                    title="确认归档结项该项目？"
                    description="归档后项目将转为只读历史档案，不可继续调配设备"
                    onConfirm={() => handleUpdateStatus(record, 'ARCHIVED')}
                    okText="归档"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                  >
                    <Button type="link" size="small" danger icon={<InboxOutlined />}>
                      归档
                    </Button>
                  </Popconfirm>
                ) : (
                  <Tooltip title={archiveGuard.reason}>
                    <Button
                      type="link"
                      size="small"
                      danger
                      disabled
                      icon={<InboxOutlined />}
                    >
                      归档
                    </Button>
                  </Tooltip>
                )}
              </>
            )}

            {isArchived && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                已结项归档
              </Text>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 顶部指标卡片 */}
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
              title="管理项目总数"
              value={stats.total}
              prefix={<ClusterOutlined style={{ color: '#1677ff' }} />}
              suffix={<Text type="secondary" style={{ fontSize: 13 }}>个</Text>}
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
              title="正常运营中项目"
              value={stats.activeCount}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
              suffix={<Text type="secondary" style={{ fontSize: 13 }}>个</Text>}
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
              title="已调配车载终端"
              value={stats.totalDevices}
              prefix={<DesktopOutlined style={{ color: '#1677ff' }} />}
              suffix={<Text type="secondary" style={{ fontSize: 13 }}>台</Text>}
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
              title="关联车辆资产数"
              value={stats.totalVehicles}
              prefix={<CarOutlined style={{ color: '#722ed1' }} />}
              valueStyle={{ color: '#722ed1' }}
              suffix={<Text type="secondary" style={{ fontSize: 13 }}>辆</Text>}
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
                placeholder="搜索项目名称 / 项目代号 / 机构 / 负责人..."
                prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,0.45)' }} />}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                style={{ width: 280 }}
                allowClear
              />

              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                style={{ width: 150 }}
                options={[
                  { label: '全部项目状态', value: 'ALL' },
                  { label: '🟢 运营中 (ACTIVE)', value: 'ACTIVE' },
                  { label: '🟠 已暂停 (PAUSED)', value: 'PAUSED' },
                  { label: '⚪ 已归档 (ARCHIVED)', value: 'ARCHIVED' },
                ]}
              />

              <Button icon={<ReloadOutlined />} onClick={loadData}>
                刷新
              </Button>

              <Button
                onClick={() => {
                  setKeyword('');
                  setStatusFilter('ALL');
                }}
              >
                重置
              </Button>
            </Space>
          </Col>

          <Col xs={24} lg={6} style={{ textAlign: 'right' }}>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => handleOpenEditModal()}
            >
              + 新建项目
            </Button>
          </Col>
        </Row>
      </Card>

      {/* 项目列表表格 */}
      <Card
        bordered={false}
        style={{
          borderRadius: 8,
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        }}
      >
        <Table<ProjectDto>
          rowKey="id"
          columns={columns}
          dataSource={filteredProjects}
          loading={loading}
          pagination={{
            pageSize: 10,
            showTotal: (total) => `共 ${total} 个运营项目`,
            showSizeChanger: true,
          }}
          scroll={{ x: 1100 }}
        />
      </Card>

      {/* 新建/编辑项目模态框 */}
      <Modal
        title={editingProject ? '编辑运营项目' : '新建运营项目'}
        open={editModalVisible}
        onOk={handleSaveProject}
        onCancel={() => setEditModalVisible(false)}
        confirmLoading={submitting}
        destroyOnClose
        width={540}
      >
        <Form form={projectForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="项目名称"
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input placeholder="例如: 深圳极速智慧车队" maxLength={30} />
          </Form.Item>

          <Form.Item
            name="code"
            label="项目唯一代码 (大写英文)"
            tooltip="3~20 位大写英文字母、数字或下划线"
            rules={[
              { required: true, message: '请输入项目代号' },
              {
                validator: (_, value) => {
                  if (!value || validateProjectCode(value)) {
                    return Promise.resolve();
                  }
                  return Promise.reject(
                    new Error('项目代号须为 3~20 位大写英文字母/数字/下划线')
                  );
                },
              },
            ]}
          >
            <Input
              placeholder="例如: SZ_SPEED_01"
              maxLength={20}
              style={{ textTransform: 'uppercase', fontFamily: 'monospace' }}
            />
          </Form.Item>

          <Form.Item name="orgName" label="归属机构名称">
            <Input placeholder="例如: 华南智慧车联网运营部" maxLength={30} />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="contactName" label="项目负责人">
                <Input placeholder="例如: 陈工" maxLength={15} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="contactPhone" label="联系电话">
                <Input placeholder="11位手机号码" maxLength={11} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="description" label="项目业务说明">
            <Input.TextArea rows={3} placeholder="简要说明项目应用场景与车队用途" maxLength={100} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 设备跨项目调配模态框 */}
      <Modal
        title={
          <Space>
            <SwapOutlined style={{ color: '#1677ff' }} />
            <span>设备项目归属调配 -【{currentAllocProject?.name}】</span>
          </Space>
        }
        open={allocateModalVisible}
        onOk={handleConfirmAllocate}
        onCancel={() => setAllocateModalVisible(false)}
        confirmLoading={allocateLoading}
        width={760}
        destroyOnClose
        okText={`确认调配 (${selectedDeviceIds.length} 台设备)`}
      >
        <div style={{ marginTop: 12, marginBottom: 16 }}>
          <Paragraph type="secondary" style={{ marginBottom: 12 }}>
            通过多选勾选设备并确认，可将选中的设备跨项目批量重新分配至【{currentAllocProject?.name}】({currentAllocProject?.code})。已勾选的设备将原子化更新其所属项目。
          </Paragraph>

          <Radio.Group
            value={deviceFilterScope}
            onChange={(e) => setDeviceFilterScope(e.target.value)}
            style={{ marginBottom: 12 }}
          >
            <Radio.Button value="ALL">全部设备 ({allDevices.length})</Radio.Button>
            <Radio.Button value="CURRENT">
              当前项目已配 ({allDevices.filter((d) => d.projectId === currentAllocProject?.id).length})
            </Radio.Button>
            <Radio.Button value="OTHER">
              其它项目可调 ({allDevices.filter((d) => d.projectId !== currentAllocProject?.id).length})
            </Radio.Button>
          </Radio.Group>
        </div>

        <Table<DeviceDto>
          rowKey="id"
          size="small"
          loading={allocateLoading}
          rowSelection={{
            selectedRowKeys: selectedDeviceIds,
            onChange: (newSelectedKeys) => setSelectedDeviceIds(newSelectedKeys),
          }}
          dataSource={displayedDevicesForAllocate}
          pagination={{ pageSize: 5 }}
          columns={[
            {
              title: '设备编号',
              dataIndex: 'deviceNo',
              key: 'deviceNo',
              render: (no: string) => (
                <Text code style={{ fontFamily: 'monospace' }}>
                  {no}
                </Text>
              ),
            },
            {
              title: '当前归属项目',
              dataIndex: 'projectName',
              key: 'projectName',
              render: (pName?: string, record?: DeviceDto) => {
                const isCurrent = record?.projectId === currentAllocProject?.id;
                return (
                  <Tag color={isCurrent ? 'blue' : 'default'}>
                    {pName || '未分配项目'}
                  </Tag>
                );
              },
            },
            {
              title: '在线状态',
              dataIndex: 'onlineStatus',
              key: 'onlineStatus',
              render: (status: string) => {
                const meta = getOnlineStatusMeta(status);
                return <Badge color={meta.badgeColor} text={meta.label} />;
              },
            },
            {
              title: '绑定车辆',
              dataIndex: 'boundVehiclePlate',
              key: 'boundVehiclePlate',
              render: (plate?: string | null) => plate || '-',
            },
          ]}
        />
      </Modal>
    </div>
  );
};

export default ProjectManageView;
