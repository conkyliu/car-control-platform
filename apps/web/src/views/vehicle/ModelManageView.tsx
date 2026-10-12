import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Card,
  Tabs,
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
} from 'antd';
import type { TableProps } from 'antd';
import {
  AppstoreOutlined,
  CheckCircleOutlined,
  ThunderboltOutlined,
  SearchOutlined,
  ReloadOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CarOutlined,
  TagsOutlined,
  GlobalOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import {
  type ModelDto,
  type BrandDto,
  type PowertrainType,
  type CreateModelInput,
  type UpdateModelInput,
  type CreateBrandInput,
  type UpdateBrandInput,
  validateProtocolCode,
  formatProtocolCode,
  validateBrandCode,
  canDeleteModel,
  canDeleteBrand,
  POWERTRAIN_MAP,
  POWERTRAIN_OPTIONS,
  CAPABILITY_TEMPLATE_OPTIONS,
} from './model-core.ts';
import {
  fetchBrandsApi,
  fetchModelsApi,
  createModelApi,
  updateModelApi,
  deleteModelApi,
  createBrandApi,
  updateBrandApi,
  deleteBrandApi,
} from '../../api/vehicle.ts';
import { isApiError } from './vehicle-core.ts';

const { Text } = Typography;

export const ModelManageView: React.FC = () => {
  const [activeTabKey, setActiveTabKey] = useState<'models' | 'brands'>('models');
  const [loading, setLoading] = useState(false);

  // 数据池状态
  const [models, setModels] = useState<ModelDto[]>([]);
  const [brands, setBrands] = useState<BrandDto[]>([]);

  // 车型筛选条件
  const [modelBrandFilter, setModelBrandFilter] = useState<string>('ALL');
  const [modelPowertrainFilter, setModelPowertrainFilter] = useState<string>('ALL');
  const [modelKeyword, setModelKeyword] = useState('');

  // 品牌筛选条件
  const [brandKeyword, setBrandKeyword] = useState('');

  // 模态框状态
  const [modelModalVisible, setModelModalVisible] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelDto | null>(null);
  const [modelForm] = Form.useForm();
  const [modelSubmitting, setModelSubmitting] = useState(false);

  const [brandModalVisible, setBrandModalVisible] = useState(false);
  const [editingBrand, setEditingBrand] = useState<BrandDto | null>(null);
  const [brandForm] = Form.useForm();
  const [brandSubmitting, setBrandSubmitting] = useState(false);

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [brandRes, modelRes] = await Promise.allSettled([
        fetchBrandsApi(),
        fetchModelsApi(),
      ]);

      if (brandRes.status === 'fulfilled') {
        setBrands(brandRes.value);
      }
      if (modelRes.status === 'fulfilled') {
        setModels(modelRes.value);
      }
    } catch (err) {
      if (isApiError(err)) {
        message.error(`拉取车型品牌数据异常: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 车型统计数据
  const modelStats = useMemo(() => {
    const total = models.length;
    const evCount = models.filter((m) => m.powertrain === 'EV').length;
    const phevCount = models.filter((m) => m.powertrain === 'PHEV').length;
    const iceCount = models.filter((m) => m.powertrain === 'ICE').length;
    const reevCount = models.filter((m) => m.powertrain === 'REEV').length;
    return {
      total,
      evCount,
      phevCount,
      otherCount: iceCount + reevCount,
    };
  }, [models]);

  // 品牌统计数据
  const brandStats = useMemo(() => {
    const total = brands.length;
    const domesticCount = brands.filter(
      (b) => b.country === '自主品牌' || b.country === '自主新势力'
    ).length;
    const jointCount = brands.filter(
      (b) => b.country !== '自主品牌' && b.country !== '自主新势力'
    ).length;
    return {
      total,
      domesticCount,
      jointCount,
    };
  }, [brands]);

  // 车型过滤
  const filteredModels = useMemo(() => {
    return models.filter((m) => {
      if (modelBrandFilter !== 'ALL' && m.brandId !== modelBrandFilter) {
        return false;
      }
      if (modelPowertrainFilter !== 'ALL' && m.powertrain !== modelPowertrainFilter) {
        return false;
      }
      if (modelKeyword.trim()) {
        const kw = modelKeyword.trim().toLowerCase();
        const matchesName = m.name?.toLowerCase().includes(kw);
        const matchesCode = m.code?.toLowerCase().includes(kw);
        const matchesBrand = m.brandName?.toLowerCase().includes(kw);
        if (!matchesName && !matchesCode && !matchesBrand) return false;
      }
      return true;
    });
  }, [models, modelBrandFilter, modelPowertrainFilter, modelKeyword]);

  // 品牌过滤
  const filteredBrands = useMemo(() => {
    return brands.filter((b) => {
      if (brandKeyword.trim()) {
        const kw = brandKeyword.trim().toLowerCase();
        const matchesName = b.name?.toLowerCase().includes(kw);
        const matchesCode = b.code?.toLowerCase().includes(kw);
        const matchesCountry = b.country?.toLowerCase().includes(kw);
        if (!matchesName && !matchesCode && !matchesCountry) return false;
      }
      return true;
    });
  }, [brands, brandKeyword]);

  // 打开车型创建/编辑弹窗
  const handleOpenModelModal = (model?: ModelDto) => {
    if (model) {
      setEditingModel(model);
      modelForm.setFieldsValue({
        brandId: model.brandId,
        name: model.name,
        code: model.code,
        powertrain: model.powertrain,
        capabilityTemplateId: model.capabilityTemplateId,
      });
    } else {
      setEditingModel(null);
      modelForm.resetFields();
      if (brands.length > 0) {
        modelForm.setFieldsValue({
          brandId: brands[0]?.id,
          powertrain: 'EV',
          capabilityTemplateId: CAPABILITY_TEMPLATE_OPTIONS[0]?.id,
        });
      }
    }
    setModelModalVisible(true);
  };

  // 提交车型表单
  const handleSaveModel = async () => {
    try {
      const values = await modelForm.validateFields();
      setModelSubmitting(true);

      const template = CAPABILITY_TEMPLATE_OPTIONS.find(
        (t) => t.id === values.capabilityTemplateId
      );

      if (editingModel) {
        const input: UpdateModelInput = {
          brandId: values.brandId,
          name: values.name,
          code: formatProtocolCode(values.code),
          powertrain: values.powertrain,
          capabilityTemplateId: values.capabilityTemplateId,
          capabilityTemplateName: template?.name,
        };
        await updateModelApi(editingModel.id, input);
        message.success(`车型【${values.name}】更新成功`);
      } else {
        const input: CreateModelInput = {
          brandId: values.brandId,
          name: values.name,
          code: formatProtocolCode(values.code),
          powertrain: values.powertrain,
          capabilityTemplateId: values.capabilityTemplateId,
          capabilityTemplateName: template?.name,
        };
        await createModelApi(input);
        message.success(`车型【${values.name}】新建成功`);
      }

      setModelModalVisible(false);
      await loadData();
    } catch (err: any) {
      if (err.errorFields) return; // Antd 表单校验失败
      message.error(err.message || '保存车型失败');
    } finally {
      setModelSubmitting(false);
    }
  };

  // 删除车型
  const handleDeleteModel = async (model: ModelDto) => {
    const guard = canDeleteModel(model);
    if (!guard.allowed) {
      message.warning(guard.reason || '该车型已有绑定车辆，禁止删除');
      return;
    }

    try {
      await deleteModelApi(model.id);
      message.success(`车型【${model.name}】已成功删除`);
      await loadData();
    } catch (err: any) {
      message.error(err.message || '删除车型失败');
    }
  };

  // 打开品牌创建/编辑弹窗
  const handleOpenBrandModal = (brand?: BrandDto) => {
    if (brand) {
      setEditingBrand(brand);
      brandForm.setFieldsValue({
        name: brand.name,
        code: brand.code,
        country: brand.country,
      });
    } else {
      setEditingBrand(null);
      brandForm.resetFields();
      brandForm.setFieldsValue({
        country: '自主品牌',
      });
    }
    setBrandModalVisible(true);
  };

  // 提交品牌表单
  const handleSaveBrand = async () => {
    try {
      const values = await brandForm.validateFields();
      setBrandSubmitting(true);

      if (editingBrand) {
        const input: UpdateBrandInput = {
          name: values.name,
          code: values.code.trim().toUpperCase(),
          country: values.country,
        };
        await updateBrandApi(editingBrand.id, input);
        message.success(`品牌【${values.name}】更新成功`);
      } else {
        const input: CreateBrandInput = {
          name: values.name,
          code: values.code.trim().toUpperCase(),
          country: values.country,
        };
        await createBrandApi(input);
        message.success(`品牌【${values.name}】创建成功`);
      }

      setBrandModalVisible(false);
      await loadData();
    } catch (err: any) {
      if (err.errorFields) return;
      message.error(err.message || '保存品牌失败');
    } finally {
      setBrandSubmitting(false);
    }
  };

  // 删除品牌
  const handleDeleteBrand = async (brand: BrandDto) => {
    const guard = canDeleteBrand(brand);
    if (!guard.allowed) {
      message.warning(guard.reason || '该品牌下存在车型，禁止删除');
      return;
    }

    try {
      await deleteBrandApi(brand.id);
      message.success(`品牌【${brand.name}】已成功删除`);
      await loadData();
    } catch (err: any) {
      message.error(err.message || '删除品牌失败');
    }
  };

  // 车型表格列
  const modelColumns: TableProps<ModelDto>['columns'] = [
    {
      title: '车型名称',
      dataIndex: 'name',
      key: 'name',
      width: 170,
      render: (name: string, record) => (
        <Space direction="vertical" size={1}>
          <Text strong style={{ fontSize: 14 }}>
            {name}
          </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            ID: {record.id}
          </Text>
        </Space>
      ),
    },
    {
      title: '归属品牌',
      dataIndex: 'brandName',
      key: 'brandName',
      width: 140,
      render: (brandName: string, record) => {
        const matched = brands.find((b) => b.id === record.brandId);
        return (
          <Space size="small">
            <CarOutlined style={{ color: '#1677ff' }} />
            <span>{matched?.name || brandName || '通用品牌'}</span>
          </Space>
        );
      },
    },
    {
      title: '协议代号 (0x02)',
      dataIndex: 'code',
      key: 'code',
      width: 150,
      render: (code: string) => (
        <Tooltip title="与车控通讯协议 0x02 指令集所对应的 16 位车型标识">
          <Text
            code
            style={{
              fontFamily: 'SFMono-Regular, Consolas, Courier, monospace',
              fontSize: 13,
              fontWeight: 600,
              color: '#0958d9',
            }}
          >
            {code}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: '动力类型',
      dataIndex: 'powertrain',
      key: 'powertrain',
      width: 120,
      render: (powertrain: PowertrainType) => {
        const meta = POWERTRAIN_MAP[powertrain] || POWERTRAIN_MAP.EV;
        return <Tag color={meta.tagColor}>{meta.label}</Tag>;
      },
    },
    {
      title: '关联能力模板',
      dataIndex: 'capabilityTemplateName',
      key: 'capabilityTemplateName',
      width: 180,
      render: (tplName?: string) => (
        <Tag color="cyan" style={{ borderRadius: 4 }}>
          {tplName || '纯电标准控车模板'}
        </Tag>
      ),
    },
    {
      title: '归属车辆数',
      dataIndex: 'vehicleCount',
      key: 'vehicleCount',
      width: 120,
      render: (count?: number) => (
        <Badge
          count={count ?? 0}
          showZero
          style={{
            backgroundColor: count && count > 0 ? '#1677ff' : '#d9d9d9',
          }}
        />
      ),
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
      width: 140,
      fixed: 'right',
      render: (_, record: ModelDto) => {
        const deleteGuard = canDeleteModel(record);
        return (
          <Space size="middle">
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleOpenModelModal(record)}
            >
              编辑
            </Button>
            {deleteGuard.allowed ? (
              <Popconfirm
                title="确认删除该车型档案？"
                description={`车型【${record.name}】(${record.code}) 将被永久移除`}
                onConfirm={() => handleDeleteModel(record)}
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
              >
                <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                  删除
                </Button>
              </Popconfirm>
            ) : (
              <Tooltip title={deleteGuard.reason}>
                <Button
                  type="link"
                  size="small"
                  danger
                  disabled
                  icon={<DeleteOutlined />}
                >
                  删除
                </Button>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
  ];

  // 品牌表格列
  const brandColumns: TableProps<BrandDto>['columns'] = [
    {
      title: '品牌名称',
      dataIndex: 'name',
      key: 'name',
      width: 180,
      render: (name: string, record) => (
        <Space size="middle">
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              background: '#e6f4ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#1677ff',
              fontWeight: 700,
            }}
          >
            {record.code.slice(0, 2)}
          </div>
          <div>
            <Text strong style={{ fontSize: 14 }}>
              {name}
            </Text>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                ID: {record.id}
              </Text>
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: '品牌代号',
      dataIndex: 'code',
      key: 'code',
      width: 140,
      render: (code: string) => (
        <Text
          code
          style={{
            fontFamily: 'monospace',
            fontWeight: 600,
            letterSpacing: 0.5,
          }}
        >
          {code}
        </Text>
      ),
    },
    {
      title: '国别性质',
      dataIndex: 'country',
      key: 'country',
      width: 140,
      render: (country: string) => {
        const isDomestic = country.includes('自主');
        return (
          <Tag
            color={isDomestic ? 'blue' : 'geekblue'}
            icon={<GlobalOutlined />}
            style={{ borderRadius: 4 }}
          >
            {country}
          </Tag>
        );
      },
    },
    {
      title: '在册车型数',
      dataIndex: 'modelCount',
      key: 'modelCount',
      width: 120,
      render: (count?: number) => (
        <Badge
          count={count ?? 0}
          showZero
          style={{
            backgroundColor: count && count > 0 ? '#52c41a' : '#d9d9d9',
          }}
        />
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (date?: string) => (
        <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>
          {date || '-'}
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      fixed: 'right',
      render: (_, record: BrandDto) => {
        const deleteGuard = canDeleteBrand(record);
        return (
          <Space size="middle">
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleOpenBrandModal(record)}
            >
              编辑
            </Button>
            {deleteGuard.allowed ? (
              <Popconfirm
                title="确认删除该品牌？"
                description={`品牌【${record.name}】(${record.code}) 将被移除`}
                onConfirm={() => handleDeleteBrand(record)}
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
              >
                <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                  删除
                </Button>
              </Popconfirm>
            ) : (
              <Tooltip title={deleteGuard.reason}>
                <Button
                  type="link"
                  size="small"
                  danger
                  disabled
                  icon={<DeleteOutlined />}
                >
                  删除
                </Button>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 顶部选项卡 */}
      <Card
        bordered={false}
        style={{
          borderRadius: 8,
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        }}
        styles={{ body: { padding: '8px 24px 0 24px' } }}
      >
        <Tabs
          activeKey={activeTabKey}
          onChange={(key) => setActiveTabKey(key as 'models' | 'brands')}
          items={[
            {
              key: 'models',
              label: (
                <Space>
                  <AppstoreOutlined />
                  <span>车型管理 (协议 0x02 映射)</span>
                  <Badge count={models.length} overflowCount={999} style={{ backgroundColor: '#1677ff' }} />
                </Space>
              ),
            },
            {
              key: 'brands',
              label: (
                <Space>
                  <TagsOutlined />
                  <span>品牌车系维护</span>
                  <Badge count={brands.length} overflowCount={99} style={{ backgroundColor: '#52c41a' }} />
                </Space>
              ),
            },
          ]}
        />
      </Card>

      {/* Tab 1: 车型管理 */}
      {activeTabKey === 'models' && (
        <>
          {/* 车型指标卡片 */}
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
                  title="在册车型总数"
                  value={modelStats.total}
                  prefix={<AppstoreOutlined style={{ color: '#1677ff' }} />}
                  suffix={<Text type="secondary" style={{ fontSize: 13 }}>款</Text>}
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
                  title="纯电动车型 (EV)"
                  value={modelStats.evCount}
                  prefix={<ThunderboltOutlined style={{ color: '#52c41a' }} />}
                  valueStyle={{ color: '#52c41a' }}
                  suffix={<Text type="secondary" style={{ fontSize: 13 }}>款</Text>}
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
                  title="插电混动车型 (PHEV)"
                  value={modelStats.phevCount}
                  prefix={<CheckCircleOutlined style={{ color: '#1677ff' }} />}
                  valueStyle={{ color: '#1677ff' }}
                  suffix={<Text type="secondary" style={{ fontSize: 13 }}>款</Text>}
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
                  title="燃油与增程车型"
                  value={modelStats.otherCount}
                  prefix={<CarOutlined style={{ color: '#722ed1' }} />}
                  valueStyle={{ color: '#722ed1' }}
                  suffix={<Text type="secondary" style={{ fontSize: 13 }}>款</Text>}
                />
              </Card>
            </Col>
          </Row>

          {/* 车型筛选工具栏 */}
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
                    placeholder="搜索车型名称 / 0x02代号 / 品牌..."
                    prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,0.45)' }} />}
                    value={modelKeyword}
                    onChange={(e) => setModelKeyword(e.target.value)}
                    style={{ width: 260 }}
                    allowClear
                  />

                  <Select
                    value={modelBrandFilter}
                    onChange={setModelBrandFilter}
                    style={{ width: 160 }}
                    options={[
                      { label: '全部品牌', value: 'ALL' },
                      ...brands.map((b) => ({ label: b.name, value: b.id })),
                    ]}
                  />

                  <Select
                    value={modelPowertrainFilter}
                    onChange={setModelPowertrainFilter}
                    style={{ width: 160 }}
                    options={[
                      { label: '全部动力类型', value: 'ALL' },
                      ...POWERTRAIN_OPTIONS,
                    ]}
                  />

                  <Button icon={<ReloadOutlined />} onClick={loadData}>
                    刷新
                  </Button>

                  <Button
                    onClick={() => {
                      setModelKeyword('');
                      setModelBrandFilter('ALL');
                      setModelPowertrainFilter('ALL');
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
                  onClick={() => handleOpenModelModal()}
                >
                  + 新建车型
                </Button>
              </Col>
            </Row>
          </Card>

          {/* 车型表格 */}
          <Card
            bordered={false}
            style={{
              borderRadius: 8,
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
            }}
          >
            <Table<ModelDto>
              rowKey="id"
              columns={modelColumns}
              dataSource={filteredModels}
              loading={loading}
              pagination={{
                pageSize: 10,
                showTotal: (total) => `共 ${total} 款车型档案`,
                showSizeChanger: true,
              }}
              scroll={{ x: 1000 }}
            />
          </Card>
        </>
      )}

      {/* Tab 2: 品牌维护 */}
      {activeTabKey === 'brands' && (
        <>
          {/* 品牌统计卡片 */}
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={8}>
              <Card
                bordered={false}
                style={{
                  borderRadius: 8,
                  boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
                }}
              >
                <Statistic
                  title="车辆品牌总数"
                  value={brandStats.total}
                  prefix={<TagsOutlined style={{ color: '#1677ff' }} />}
                  suffix={<Text type="secondary" style={{ fontSize: 13 }}>个</Text>}
                />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card
                bordered={false}
                style={{
                  borderRadius: 8,
                  boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
                }}
              >
                <Statistic
                  title="中国自主品牌"
                  value={brandStats.domesticCount}
                  prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                  valueStyle={{ color: '#52c41a' }}
                  suffix={<Text type="secondary" style={{ fontSize: 13 }}>个</Text>}
                />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card
                bordered={false}
                style={{
                  borderRadius: 8,
                  boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
                }}
              >
                <Statistic
                  title="外资/合资独资品牌"
                  value={brandStats.jointCount}
                  prefix={<GlobalOutlined style={{ color: '#1677ff' }} />}
                  valueStyle={{ color: '#1677ff' }}
                  suffix={<Text type="secondary" style={{ fontSize: 13 }}>个</Text>}
                />
              </Card>
            </Col>
          </Row>

          {/* 品牌操作栏 */}
          <Card
            bordered={false}
            style={{
              borderRadius: 8,
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
            }}
          >
            <Row gutter={[16, 16]} justify="space-between" align="middle">
              <Col xs={24} sm={16}>
                <Space size="middle">
                  <Input
                    placeholder="搜索品牌名称 / 代号 / 国别..."
                    prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,0.45)' }} />}
                    value={brandKeyword}
                    onChange={(e) => setBrandKeyword(e.target.value)}
                    style={{ width: 280 }}
                    allowClear
                  />
                  <Button icon={<ReloadOutlined />} onClick={loadData}>
                    刷新
                  </Button>
                  <Button onClick={() => setBrandKeyword('')}>重置</Button>
                </Space>
              </Col>

              <Col xs={24} sm={8} style={{ textAlign: 'right' }}>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => handleOpenBrandModal()}
                >
                  + 新建品牌
                </Button>
              </Col>
            </Row>
          </Card>

          {/* 品牌表格 */}
          <Card
            bordered={false}
            style={{
              borderRadius: 8,
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
            }}
          >
            <Table<BrandDto>
              rowKey="id"
              columns={brandColumns}
              dataSource={filteredBrands}
              loading={loading}
              pagination={{
                pageSize: 10,
                showTotal: (total) => `共 ${total} 个汽车品牌`,
              }}
              scroll={{ x: 800 }}
            />
          </Card>
        </>
      )}

      {/* 车型新建/编辑弹窗 */}
      <Modal
        title={editingModel ? '编辑车型档案' : '新建车型档案'}
        open={modelModalVisible}
        onOk={handleSaveModel}
        onCancel={() => setModelModalVisible(false)}
        confirmLoading={modelSubmitting}
        destroyOnClose
        width={560}
      >
        <Form form={modelForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="brandId"
            label="归属品牌"
            rules={[{ required: true, message: '请选择车型归属品牌' }]}
          >
            <Select
              placeholder="请选择汽车品牌"
              options={brands.map((b) => ({ label: `${b.name} (${b.code})`, value: b.id }))}
            />
          </Form.Item>

          <Form.Item
            name="name"
            label="车型名称"
            rules={[{ required: true, message: '请输入车型名称' }]}
          >
            <Input placeholder="例如: 汉 EV / Model Y / 极氪 001" maxLength={30} />
          </Form.Item>

          <Form.Item
            name="code"
            label="协议车型代号 (0x02)"
            tooltip="底层车控通讯协议 0x02 指令集对应的 16 位 16 进制标识，格式严格为 0xXXXX"
            rules={[
              { required: true, message: '请输入协议车型代号 0x02' },
              {
                validator: (_, value) => {
                  if (!value || validateProtocolCode(value)) {
                    return Promise.resolve();
                  }
                  return Promise.reject(
                    new Error('代号格式必须为 0x 开头的 4 位 16 进制字符 (例如: 0x0101, 0x0201)')
                  );
                },
              },
            ]}
          >
            <Input placeholder="例如: 0x0101" maxLength={6} style={{ fontFamily: 'monospace' }} />
          </Form.Item>

          <Form.Item
            name="powertrain"
            label="动力总成类型"
            rules={[{ required: true, message: '请选择动力类型' }]}
          >
            <Select options={POWERTRAIN_OPTIONS} />
          </Form.Item>

          <Form.Item
            name="capabilityTemplateId"
            label="车控能力模板关联"
            rules={[{ required: true, message: '请选择关联的控车模板' }]}
          >
            <Select
              options={CAPABILITY_TEMPLATE_OPTIONS.map((t) => ({
                label: `${t.name} (${t.code}) - ${t.description}`,
                value: t.id,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 品牌新建/编辑弹窗 */}
      <Modal
        title={editingBrand ? '编辑汽车品牌' : '新建汽车品牌'}
        open={brandModalVisible}
        onOk={handleSaveBrand}
        onCancel={() => setBrandModalVisible(false)}
        confirmLoading={brandSubmitting}
        destroyOnClose
        width={480}
      >
        <Form form={brandForm} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="品牌名称"
            rules={[{ required: true, message: '请输入品牌中文或英文全称' }]}
          >
            <Input placeholder="例如: 比亚迪 / 特斯拉 / 吉利极氪" maxLength={20} />
          </Form.Item>

          <Form.Item
            name="code"
            label="品牌英文大写代号"
            tooltip="2~12 位大写英文字母、数字或下划线 (如 BYD, TESLA)"
            rules={[
              { required: true, message: '请输入品牌代号' },
              {
                validator: (_, value) => {
                  if (!value || validateBrandCode(value)) {
                    return Promise.resolve();
                  }
                  return Promise.reject(
                    new Error('品牌代号须为 2~12 位大写英文字母/数字/下划线')
                  );
                },
              },
            ]}
          >
            <Input
              placeholder="例如: BYD"
              maxLength={12}
              style={{ textTransform: 'uppercase', fontFamily: 'monospace' }}
            />
          </Form.Item>

          <Form.Item
            name="country"
            label="国别与性质"
            rules={[{ required: true, message: '请选择国别性质' }]}
          >
            <Select
              options={[
                { label: '自主品牌', value: '自主品牌' },
                { label: '自主新势力', value: '自主新势力' },
                { label: '合资品牌', value: '合资品牌' },
                { label: '外资独资', value: '外资独资' },
                { label: '进口高端', value: '进口高端' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ModelManageView;
