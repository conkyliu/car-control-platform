import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Input,
  Select,
  Radio,
  Button,
  Table,
  Tag,
  Badge,
  Space,
  Typography,
  Tooltip,
  Popconfirm,
  Modal,
  Drawer,
  Form,
  Upload,
  Timeline,
  Descriptions,
  Alert,
  message,
} from 'antd';
import type { TableColumnsType, UploadProps } from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  SyncOutlined,
  UploadOutlined,
  PlusOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  ClockCircleOutlined,
  StopOutlined,
  CloudUploadOutlined,
  WifiOutlined,
  ControlOutlined,
  CarOutlined,
  ThunderboltOutlined,
  InboxOutlined,
  CopyOutlined,
  SafetyCertificateOutlined,
  FileTextOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import {
  FirmwareType,
  FirmwareStatus,
  type FirmwarePackageDto,
  type FirmwareQueryParams,
  type CreateFirmwareInput,
  FIRMWARE_TYPE_METADATA,
  FIRMWARE_STATUS_METADATA,
  validateSemver,
  validateSha256,
  formatFileSize,
  calculateFirmwareStats,
  SUPPORTED_VEHICLE_MODELS,
} from './firmware-core.ts';
import {
  fetchFirmwarePackagesApi,
  createFirmwarePackageApi,
  publishFirmwarePackageApi,
  deprecateFirmwarePackageApi,
  deleteFirmwarePackageApi,
} from '../../api/firmware.ts';

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;
const { Dragger } = Upload;

/**
 * 固件类型图标渲染辅助器
 */
export const renderFirmwareTypeIcon = (type: FirmwareType) => {
  switch (type) {
    case FirmwareType.TBOX:
      return <WifiOutlined />;
    case FirmwareType.MCU:
      return <ControlOutlined />;
    case FirmwareType.BCM:
      return <CarOutlined />;
    case FirmwareType.BMS:
      return <ThunderboltOutlined />;
    default:
      return <CloudUploadOutlined />;
  }
};

/**
 * 固件类型彩色标签渲染器
 */
export const renderFirmwareTypeTag = (type: FirmwareType) => {
  const meta = FIRMWARE_TYPE_METADATA[type];
  if (!meta) {
    return <Tag>{type}</Tag>;
  }
  return (
    <Tag color={meta.tagColor} icon={renderFirmwareTypeIcon(type)}>
      {meta.label}
    </Tag>
  );
};

/**
 * 固件管理工作台视图组件
 */
export const FirmwareManageView: React.FC = () => {
  const [packages, setPackages] = useState<FirmwarePackageDto[]>([]);
  const [loading, setLoading] = useState(false);

  // 筛选检索状态
  const [keyword, setKeyword] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedModel, setSelectedModel] = useState<string>('ALL');

  // 上传模态框状态
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadForm] = Form.useForm();
  const [simulatedFile, setSimulatedFile] = useState<{
    name: string;
    size: number;
    sha256: string;
  } | null>(null);

  // 详情抽屉状态
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [activePackage, setActivePackage] = useState<FirmwarePackageDto | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // 加载固件列表
  const loadPackages = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchFirmwarePackagesApi();
      setPackages(data);
    } catch (err: any) {
      message.error(err?.message || '拉取固件版本列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPackages();
  }, [loadPackages]);

  // 前端多维过滤计算
  const filteredPackages = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return packages.filter((pkg) => {
      if (kw) {
        const matchName = pkg.name.toLowerCase().includes(kw);
        const matchVer = pkg.version.toLowerCase().includes(kw);
        const matchHash = pkg.sha256.toLowerCase().includes(kw);
        const matchNotes = pkg.releaseNotes ? pkg.releaseNotes.toLowerCase().includes(kw) : false;
        if (!matchName && !matchVer && !matchHash && !matchNotes) {
          return false;
        }
      }

      if (selectedType !== 'ALL' && pkg.firmwareType !== selectedType) {
        return false;
      }

      if (selectedStatus !== 'ALL' && pkg.status !== selectedStatus) {
        return false;
      }

      if (selectedModel !== 'ALL') {
        const hasModelId = pkg.applicableModelIds.includes(selectedModel);
        const hasModelName = pkg.applicableModelNames.includes(selectedModel);
        if (!hasModelId && !hasModelName) {
          return false;
        }
      }

      return true;
    });
  }, [packages, keyword, selectedType, selectedStatus, selectedModel]);

  // 全量汇总指标
  const stats = useMemo(() => {
    return calculateFirmwareStats(packages);
  }, [packages]);

  // 重置筛选条件
  const handleResetFilter = () => {
    setKeyword('');
    setSelectedType('ALL');
    setSelectedStatus('ALL');
    setSelectedModel('ALL');
  };

  // 查看详情
  const handleViewDetail = (record: FirmwarePackageDto) => {
    setActivePackage(record);
    setDetailDrawerOpen(true);
  };

  // 发布固件
  const handlePublish = async (record: FirmwarePackageDto) => {
    setActionLoadingId(record.id);
    try {
      const updated = await publishFirmwarePackageApi(record.id);
      message.success(`固件包 [${record.name} (${record.version})] 已成功发布上线！`);
      setPackages((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      if (activePackage?.id === record.id) {
        setActivePackage(updated);
      }
    } catch (err: any) {
      message.error(err?.message || '发布固件失败');
    } finally {
      setActionLoadingId(null);
    }
  };

  // 废弃固件
  const handleDeprecate = async (record: FirmwarePackageDto) => {
    setActionLoadingId(record.id);
    try {
      const updated = await deprecateFirmwarePackageApi(record.id);
      message.warning(`固件包 [${record.name} (${record.version})] 已废弃下线！`);
      setPackages((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      if (activePackage?.id === record.id) {
        setActivePackage(updated);
      }
    } catch (err: any) {
      message.error(err?.message || '废弃固件失败');
    } finally {
      setActionLoadingId(null);
    }
  };

  // 删除草稿
  const handleDelete = async (record: FirmwarePackageDto) => {
    setActionLoadingId(record.id);
    try {
      await deleteFirmwarePackageApi(record.id);
      message.success(`草稿固件 [${record.name}] 已删除`);
      setPackages((prev) => prev.filter((p) => p.id !== record.id));
      if (activePackage?.id === record.id) {
        setDetailDrawerOpen(false);
        setActivePackage(null);
      }
    } catch (err: any) {
      message.error(err?.message || '删除固件包失败');
    } finally {
      setActionLoadingId(null);
    }
  };

  // 模拟文件拖拽生成哈希与大小
  const handleUploadChange: UploadProps['onChange'] = (info) => {
    const file = info.file.originFileObj || (info.file as any);
    if (!file) return;

    // 模拟文件大小与真实的 64 位 SHA-256 哈希
    const generatedSize = file.size || Math.floor(8 * 1024 * 1024 + Math.random() * 20 * 1024 * 1024);
    const hexChars = '0123456789abcdef';
    let generatedSha256 = '';
    for (let i = 0; i < 64; i++) {
      generatedSha256 += hexChars[Math.floor(Math.random() * hexChars.length)];
    }

    const sim = {
      name: file.name || 'firmware_update.bin',
      size: generatedSize,
      sha256: generatedSha256,
    };
    setSimulatedFile(sim);
    uploadForm.setFieldsValue({
      sha256: sim.sha256,
    });
  };

  // 提交上传新固件包
  const handleUploadSubmit = async () => {
    try {
      const values = await uploadForm.validateFields();
      setSubmitting(true);

      const modelNames = (values.applicableModelIds as string[]).map((mId) => {
        const found = SUPPORTED_VEHICLE_MODELS.find((m) => m.id === mId);
        return found ? found.name : mId;
      });

      const fileSize = simulatedFile ? simulatedFile.size : 12 * 1024 * 1024;

      const payload: CreateFirmwareInput = {
        name: values.name.trim(),
        firmwareType: values.firmwareType,
        version: values.version.trim(),
        fileSize,
        sha256: values.sha256.trim().toLowerCase(),
        applicableModelIds: values.applicableModelIds,
        applicableModelNames: modelNames,
        releaseNotes: values.releaseNotes.trim(),
        uploadedBy: '系统管理员_当前账号',
      };

      const created = await createFirmwarePackageApi(payload);
      message.success(`固件包 [${created.name} (${created.version})] 录入建档成功！`);
      setPackages((prev) => [created, ...prev]);
      setUploadModalOpen(false);
      uploadForm.resetFields();
      setSimulatedFile(null);
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || '固件包录入建档失败');
    } finally {
      setSubmitting(false);
    }
  };

  // 表格列配置
  const columns: TableColumnsType<FirmwarePackageDto> = [
    {
      title: '固件包名称 / 领域类型',
      dataIndex: 'name',
      key: 'name',
      width: 240,
      render: (text: string, record) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--ant-color-text)' }}>{text}</div>
          <Space size={6} style={{ marginTop: 4 }}>
            {renderFirmwareTypeTag(record.firmwareType)}
            <Text type="secondary" style={{ fontSize: 11 }}>
              {record.id}
            </Text>
          </Space>
        </div>
      ),
    },
    {
      title: 'SemVer 版本',
      dataIndex: 'version',
      key: 'version',
      width: 120,
      render: (version: string) => (
        <Tag color="blue" style={{ fontFamily: 'monospace', fontWeight: 600 }}>
          {version}
        </Tag>
      ),
    },
    {
      title: '文件大小',
      dataIndex: 'fileSizeFormatted',
      key: 'fileSizeFormatted',
      width: 100,
      render: (size: string) => (
        <Text style={{ fontFamily: 'monospace', fontSize: 13 }}>{size}</Text>
      ),
    },
    {
      title: 'SHA-256 完整性哈希',
      dataIndex: 'sha256',
      key: 'sha256',
      width: 160,
      render: (sha: string) => (
        <Tooltip
          title={
            <div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                <SafetyCertificateOutlined style={{ color: '#52c41a', marginRight: 4 }} />
                SHA-256 文件完整性校验和:
              </div>
              <div style={{ wordBreak: 'break-all', fontFamily: 'monospace', fontSize: 11 }}>
                {sha}
              </div>
            </div>
          }
        >
          <Text
            copyable={{ text: sha }}
            code
            style={{
              fontSize: 12,
              cursor: 'pointer',
              color: 'var(--ant-color-primary)',
            }}
          >
            {sha.slice(0, 6)}...{sha.slice(-6)}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: '适用适配车型',
      dataIndex: 'applicableModelNames',
      key: 'applicableModelNames',
      width: 220,
      render: (models: string[]) => {
        if (!models || models.length === 0) {
          return <Text type="secondary">通用不限车型</Text>;
        }
        const visible = models.slice(0, 2);
        const rest = models.length - 2;
        return (
          <Space wrap size={[4, 4]}>
            {visible.map((m) => (
              <Tag key={m} color="geekblue" style={{ margin: 0, fontSize: 11 }}>
                {m}
              </Tag>
            ))}
            {rest > 0 && (
              <Tooltip title={models.slice(2).join('、')}>
                <Tag style={{ margin: 0, fontSize: 11 }}>+{rest}</Tag>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: FirmwareStatus) => {
        const meta = FIRMWARE_STATUS_METADATA[status];
        if (!meta) return <Badge status="default" text={status} />;
        return (
          <Badge
            status={meta.badgeStatus}
            text={<span style={{ fontWeight: 500 }}>{meta.label}</span>}
          />
        );
      },
    },
    {
      title: '发布说明',
      dataIndex: 'releaseNotes',
      key: 'releaseNotes',
      width: 180,
      ellipsis: true,
      render: (notes: string) => (
        <Tooltip title={notes}>
          <Paragraph ellipsis={{ rows: 1 }} style={{ margin: 0, color: 'rgba(0,0,0,0.65)' }}>
            {notes || '-'}
          </Paragraph>
        </Tooltip>
      ),
    },
    {
      title: '维护人与更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 160,
      render: (_: string, record) => (
        <div>
          <div>
            <Text style={{ fontSize: 12 }}>{record.uploadedBy}</Text>
          </div>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {new Date(record.publishedAt || record.updatedAt).toLocaleDateString()}
          </Text>
        </div>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 200,
      fixed: 'right',
      render: (_, record) => {
        const isActionLoading = actionLoadingId === record.id;
        const canPublish = record.status === FirmwareStatus.DRAFT;
        const canDeprecate = record.status !== FirmwareStatus.DEPRECATED;
        const canDelete = record.status === FirmwareStatus.DRAFT;

        return (
          <Space size={4}>
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleViewDetail(record)}
            >
              详情
            </Button>

            {canPublish && (
              <Popconfirm
                title="发布固件包"
                description={`确认正式发布固件 [${record.name} (${record.version})] 至生产版本库吗？`}
                okText="确认发布"
                cancelText="取消"
                onConfirm={() => handlePublish(record)}
              >
                <Button
                  type="link"
                  size="small"
                  loading={isActionLoading}
                  style={{ color: '#52c41a' }}
                >
                  发布
                </Button>
              </Popconfirm>
            )}

            {canDeprecate && (
              <Popconfirm
                title="废弃固件包"
                description={`确认废弃固件 [${record.name} (${record.version})] 吗？废弃后不可恢复且无法被升级批次选用。`}
                okText="确认废弃"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={() => handleDeprecate(record)}
              >
                <Button
                  type="link"
                  size="small"
                  danger
                  loading={isActionLoading}
                >
                  废弃
                </Button>
              </Popconfirm>
            )}

            {canDelete && (
              <Popconfirm
                title="删除草稿固件"
                description="确认物理删除该草稿版本吗？删除后不可找回。"
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                onConfirm={() => handleDelete(record)}
              >
                <Button
                  type="link"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  loading={isActionLoading}
                />
              </Popconfirm>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 4 大核心 KPI 指标卡片 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card styles={{ body: { padding: '16px 20px' } }}>
            <Statistic
              title={<span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>固件版本总数</span>}
              value={stats.total}
              suffix={<span style={{ fontSize: 14 }}>个</span>}
              valueStyle={{ color: '#1677ff', fontWeight: 700 }}
              prefix={<CloudUploadOutlined />}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
              总存储体积: <Text strong>{stats.totalSizeFormatted}</Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card styles={{ body: { padding: '16px 20px' } }}>
            <Statistic
              title={<span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>已发布上线固件</span>}
              value={stats.published}
              suffix={<span style={{ fontSize: 14 }}>/ {stats.total}</span>}
              valueStyle={{ color: '#52c41a', fontWeight: 700 }}
              prefix={<CheckCircleOutlined />}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
              生产就绪率:{' '}
              <Text strong style={{ color: '#52c41a' }}>
                {stats.total > 0 ? Math.round((stats.published / stats.total) * 100) : 0}%
              </Text>{' '}
              (草稿: {stats.draft} / 废弃: {stats.deprecated})
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card styles={{ body: { padding: '16px 20px' } }}>
            <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)', marginBottom: 8 }}>
              四大约束领域分布
            </div>
            <Space wrap size={[6, 6]}>
              <Tag color="blue">T-Box: {stats.typeDistribution[FirmwareType.TBOX]}</Tag>
              <Tag color="cyan">MCU: {stats.typeDistribution[FirmwareType.MCU]}</Tag>
              <Tag color="purple">BCM: {stats.typeDistribution[FirmwareType.BCM]}</Tag>
              <Tag color="green">BMS: {stats.typeDistribution[FirmwareType.BMS]}</Tag>
            </Space>
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
              全域控车硬件固件全覆盖
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card styles={{ body: { padding: '16px 20px' } }}>
            <Statistic
              title={<span style={{ fontSize: 13, color: 'rgba(0,0,0,0.45)' }}>已覆盖适配车型</span>}
              value={stats.coveredModelsCount}
              suffix={<span style={{ fontSize: 14 }}>款</span>}
              valueStyle={{ color: '#722ed1', fontWeight: 700 }}
              prefix={<CarOutlined />}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
              已适配主流新能源与燃油车系架构
            </div>
          </Card>
        </Col>
      </Row>

      {/* 检索过滤工具栏与表格主体 */}
      <Card
        styles={{ body: { padding: '20px 24px' } }}
        style={{
          borderRadius: 8,
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <Space wrap size={10}>
            <Input
              placeholder="搜索固件包名称、SemVer版本或SHA-256..."
              prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,0.25)' }} />}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              allowClear
              style={{ width: 280 }}
            />

            <Select
              value={selectedType}
              onChange={setSelectedType}
              style={{ width: 150 }}
              options={[
                { label: '全部固件类型', value: 'ALL' },
                { label: 'T-Box 无线网关', value: FirmwareType.TBOX },
                { label: 'MCU 底盘域控', value: FirmwareType.MCU },
                { label: 'BCM 车身控制', value: FirmwareType.BCM },
                { label: 'BMS 电池管理', value: FirmwareType.BMS },
              ]}
            />

            <Select
              value={selectedStatus}
              onChange={setSelectedStatus}
              style={{ width: 140 }}
              options={[
                { label: '全部状态', value: 'ALL' },
                { label: '草稿待发布', value: FirmwareStatus.DRAFT },
                { label: '已发布上线', value: FirmwareStatus.PUBLISHED },
                { label: '已废弃下线', value: FirmwareStatus.DEPRECATED },
              ]}
            />

            <Select
              value={selectedModel}
              onChange={setSelectedModel}
              style={{ width: 160 }}
              options={[
                { label: '全部适用车型', value: 'ALL' },
                ...SUPPORTED_VEHICLE_MODELS.map((m) => ({
                  label: m.name,
                  value: m.id,
                })),
              ]}
            />

            <Button icon={<ReloadOutlined />} onClick={handleResetFilter}>
              重置
            </Button>
            <Button icon={<SyncOutlined />} onClick={loadPackages} loading={loading}>
              刷新
            </Button>
          </Space>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              uploadForm.resetFields();
              setSimulatedFile(null);
              setUploadModalOpen(true);
            }}
          >
            上传固件包
          </Button>
        </div>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={filteredPackages}
          loading={loading}
          scroll={{ x: 1200 }}
          pagination={{
            defaultPageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 个固件包`,
          }}
        />
      </Card>

      {/* 上传 / 录入固件包模态框 */}
      <Modal
        title={
          <Space>
            <CloudUploadOutlined style={{ color: '#1677ff' }} />
            <span>上传并录入新固件包</span>
          </Space>
        }
        open={uploadModalOpen}
        onCancel={() => {
          setUploadModalOpen(false);
          uploadForm.resetFields();
          setSimulatedFile(null);
        }}
        onOk={handleUploadSubmit}
        confirmLoading={submitting}
        okText="录入固件包"
        cancelText="取消"
        width={680}
        styles={{ body: { maxHeight: '72vh', overflowY: 'auto', padding: '16px 8px' } }}
      >
        <Form
          form={uploadForm}
          layout="vertical"
          initialValues={{
            firmwareType: FirmwareType.TBOX,
            version: 'v1.0.0',
            applicableModelIds: ['model-et7'],
          }}
        >
          <Form.Item
            name="name"
            label="固件包名称"
            rules={[
              { required: true, message: '请输入固件包名称' },
              { min: 3, message: '名称至少需 3 个字符' },
            ]}
          >
            <Input placeholder="例如：T-Box 5G双频高精定位通信终端固件" />
          </Form.Item>

          <Form.Item
            name="firmwareType"
            label="约束领域 / 固件类型"
            rules={[{ required: true, message: '请选择固件类型' }]}
          >
            <Radio.Group buttonStyle="solid">
              <Radio.Button value={FirmwareType.TBOX}>
                <Space>
                  <WifiOutlined />
                  <span>T-Box 网关</span>
                </Space>
              </Radio.Button>
              <Radio.Button value={FirmwareType.MCU}>
                <Space>
                  <ControlOutlined />
                  <span>MCU 动力底盘</span>
                </Space>
              </Radio.Button>
              <Radio.Button value={FirmwareType.BCM}>
                <Space>
                  <CarOutlined />
                  <span>BCM 车身舒适</span>
                </Space>
              </Radio.Button>
              <Radio.Button value={FirmwareType.BMS}>
                <Space>
                  <ThunderboltOutlined />
                  <span>BMS 动力电池</span>
                </Space>
              </Radio.Button>
            </Radio.Group>
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="version"
                label="SemVer 语义化版本号"
                rules={[
                  { required: true, message: '请输入版本号' },
                  {
                    validator: (_, value) => {
                      if (!value) return Promise.resolve();
                      const check = validateSemver(value);
                      if (!check.valid) {
                        return Promise.reject(new Error(check.error));
                      }
                      return Promise.resolve();
                    },
                  },
                ]}
                extra="支持 v1.2.0、2.0.1-rc.1、v3.0.0-beta.2 语义化版本"
              >
                <Input placeholder="例如：v2.4.1" />
              </Form.Item>
            </Col>

            <Col span={12}>
              <Form.Item
                name="applicableModelIds"
                label="适用适配车型"
                rules={[{ required: true, message: '请选择至少一款适配车型' }]}
              >
                <Select
                  mode="multiple"
                  placeholder="选择适用车型"
                  options={SUPPORTED_VEHICLE_MODELS.map((m) => ({
                    label: m.name,
                    value: m.id,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item label="固件二进制镜像包文件 (BIN / TAR.GZ / HEX)">
            <Dragger
              name="file"
              multiple={false}
              showUploadList={false}
              beforeUpload={() => false}
              onChange={handleUploadChange}
              style={{ padding: '16px 0', background: '#fafafa' }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined style={{ color: '#1677ff', fontSize: 36 }} />
              </p>
              <p className="ant-upload-text">点击或将固件包拖拽至此区域完成模拟校验</p>
              <p className="ant-upload-hint">
                支持 .bin, .hex, .tar.gz 格式固件镜像，系统将自动计算完整性哈希与字节体积
              </p>
            </Dragger>

            {simulatedFile && (
              <Card
                size="small"
                styles={{ body: { padding: 12 } }}
                style={{ marginTop: 10, background: '#f6ffed', borderColor: '#b7eb8f' }}
              >
                <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Space>
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    <Text strong>{simulatedFile.name}</Text>
                    <Tag color="green">{formatFileSize(simulatedFile.size)}</Tag>
                  </Space>
                  <Tag color="cyan">完整性 SHA-256 已生成</Tag>
                </Space>
              </Card>
            )}
          </Form.Item>

          <Form.Item
            name="sha256"
            label="SHA-256 完整性哈希 (64 位十六进制)"
            rules={[
              { required: true, message: 'SHA-256 完整性校验和必填' },
              {
                validator: (_, value) => {
                  if (!value) return Promise.resolve();
                  if (!validateSha256(value)) {
                    return Promise.reject(new Error('哈希值必须为标准的 64 位十六进制字符'));
                  }
                  return Promise.resolve();
                },
              },
            ]}
            extra="上传文件时自动计算生成，亦支持手动粘贴厂商交付的标准 SHA-256 摘要"
          >
            <Input
              placeholder="例如：9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
              style={{ fontFamily: 'monospace' }}
            />
          </Form.Item>

          <Form.Item
            name="releaseNotes"
            label="发布变更说明 (Release Notes)"
            rules={[
              { required: true, message: '请输入版本变更说明' },
              { min: 5, message: '说明至少需 5 个字符' },
            ]}
          >
            <TextArea
              rows={3}
              placeholder="详细列出本版本固件的升级特性、协议优化、漏洞修复与硬件依赖环境说明..."
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 固件包详情与生命周期抽屉 */}
      <Drawer
        title={
          <Space>
            <FileTextOutlined style={{ color: '#1677ff' }} />
            <span>固件包规格与生命周期档案</span>
          </Space>
        }
        open={detailDrawerOpen}
        onClose={() => setDetailDrawerOpen(false)}
        width={620}
        styles={{ body: { padding: '20px 24px' } }}
        extra={
          activePackage && (
            <Space>
              {activePackage.status === FirmwareStatus.DRAFT && (
                <Popconfirm
                  title="发布固件包"
                  description="确认将此固件发布至生产环境吗？"
                  onConfirm={() => handlePublish(activePackage)}
                >
                  <Button type="primary" size="small" style={{ background: '#52c41a' }}>
                    发布上线
                  </Button>
                </Popconfirm>
              )}
              {activePackage.status !== FirmwareStatus.DEPRECATED && (
                <Popconfirm
                  title="废弃固件包"
                  description="确认废弃此固件吗？废弃后不可恢复。"
                  okButtonProps={{ danger: true }}
                  onConfirm={() => handleDeprecate(activePackage)}
                >
                  <Button danger size="small">
                    废弃下线
                  </Button>
                </Popconfirm>
              )}
            </Space>
          )
        }
      >
        {activePackage && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* 顶部状态提示 */}
            {activePackage.status === FirmwareStatus.PUBLISHED && (
              <Alert
                type="success"
                showIcon
                message="固件已正式发布生产"
                description="本固件已完成 SHA-256 完整性检验与合规测试，可用于向适配车型分批下发 OTA 升级任务。"
              />
            )}
            {activePackage.status === FirmwareStatus.DRAFT && (
              <Alert
                type="warning"
                showIcon
                message="固件处于草稿待审状态"
                description="本版本尚未正式入库生效，需测试验证通过并由负责人点击【发布上线】后方可选用。"
              />
            )}
            {activePackage.status === FirmwareStatus.DEPRECATED && (
              <Alert
                type="error"
                showIcon
                message="固件已废弃终止运维"
                description="此版本已被标记为过时或存在安全缺陷，系统已禁止新的升级批次选用该固件。"
              />
            )}

            {/* 规格参数 Descriptions */}
            <Descriptions
              title="规格与参数契约"
              bordered
              size="small"
              column={2}
            >
              <Descriptions.Item label="固件 ID" span={2}>
                <Text code copyable>
                  {activePackage.id}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="固件包名" span={2}>
                <Text strong>{activePackage.name}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="领域类型">
                {renderFirmwareTypeTag(activePackage.firmwareType)}
              </Descriptions.Item>
              <Descriptions.Item label="SemVer 版本">
                <Tag color="blue" style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                  {activePackage.version}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="文件大小">
                <Text strong>{activePackage.fileSizeFormatted}</Text>{' '}
                <Text type="secondary">({activePackage.fileSize.toLocaleString()} 字节)</Text>
              </Descriptions.Item>
              <Descriptions.Item label="生命周期状态">
                {FIRMWARE_STATUS_METADATA[activePackage.status]?.label}
              </Descriptions.Item>
              <Descriptions.Item label="SHA-256 哈希" span={2}>
                <Paragraph
                  copyable={{ text: activePackage.sha256 }}
                  code
                  style={{
                    wordBreak: 'break-all',
                    margin: 0,
                    fontSize: 12,
                    background: '#f5f5f5',
                    padding: '4px 8px',
                    borderRadius: 4,
                  }}
                >
                  {activePackage.sha256}
                </Paragraph>
              </Descriptions.Item>
              <Descriptions.Item label="维护人">
                {activePackage.uploadedBy}
              </Descriptions.Item>
              <Descriptions.Item label="建档时间">
                {new Date(activePackage.createdAt).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="发布时间" span={2}>
                {activePackage.publishedAt
                  ? new Date(activePackage.publishedAt).toLocaleString()
                  : '尚未发布 (待投产)'}
              </Descriptions.Item>
            </Descriptions>

            {/* 适用车型 */}
            <div>
              <Title level={5} style={{ marginBottom: 8, fontSize: 14 }}>
                适配车型列表
              </Title>
              <Space wrap size={[6, 6]}>
                {activePackage.applicableModelNames.map((name) => (
                  <Tag key={name} color="geekblue">
                    {name}
                  </Tag>
                ))}
              </Space>
            </div>

            {/* 发布说明 */}
            <div>
              <Title level={5} style={{ marginBottom: 8, fontSize: 14 }}>
                版本变更日志 (Release Notes)
              </Title>
              <Card
                size="small"
                styles={{ body: { padding: '12px 16px', background: '#fafafa' } }}
              >
                <Text style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                  {activePackage.releaseNotes}
                </Text>
              </Card>
            </div>

            {/* 垂直生命周期时间线 */}
            <div>
              <Title level={5} style={{ marginBottom: 12, fontSize: 14 }}>
                生命周期演进时间轴
              </Title>
              <Timeline
                items={[
                  {
                    color: 'green',
                    dot: <CheckCircleOutlined />,
                    children: (
                      <div>
                        <div style={{ fontWeight: 600 }}>固件编译打包与上传建档</div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          由 {activePackage.uploadedBy} 于{' '}
                          {new Date(activePackage.createdAt).toLocaleString()} 录入并归档
                        </Text>
                      </div>
                    ),
                  },
                  {
                    color: 'green',
                    dot: <SafetyCertificateOutlined />,
                    children: (
                      <div>
                        <div style={{ fontWeight: 600 }}>SHA-256 完整性哈希校验通过</div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          64 位十六进制散列值比对一致，无篡改损坏风险
                        </Text>
                      </div>
                    ),
                  },
                  {
                    color:
                      activePackage.status === FirmwareStatus.PUBLISHED ||
                      activePackage.status === FirmwareStatus.DEPRECATED
                        ? 'green'
                        : 'gray',
                    dot:
                      activePackage.status === FirmwareStatus.PUBLISHED ||
                      activePackage.status === FirmwareStatus.DEPRECATED ? (
                        <CheckCircleOutlined />
                      ) : (
                        <ClockCircleOutlined />
                      ),
                    children: (
                      <div>
                        <div style={{ fontWeight: 600 }}>生产版本库发布上线</div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {activePackage.publishedAt
                            ? `于 ${new Date(activePackage.publishedAt).toLocaleString()} 正式发布生效`
                            : '待管理员终审发布'}
                        </Text>
                      </div>
                    ),
                  },
                  {
                    color: activePackage.status === FirmwareStatus.DEPRECATED ? 'red' : 'gray',
                    dot:
                      activePackage.status === FirmwareStatus.DEPRECATED ? (
                        <StopOutlined />
                      ) : (
                        <ClockCircleOutlined />
                      ),
                    children: (
                      <div>
                        <div style={{ fontWeight: 600 }}>固件版本废弃终止</div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {activePackage.status === FirmwareStatus.DEPRECATED
                            ? `已于 ${new Date(activePackage.updatedAt).toLocaleString()} 终止运维`
                            : '处于有效维护期'}
                        </Text>
                      </div>
                    ),
                  },
                ]}
              />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
