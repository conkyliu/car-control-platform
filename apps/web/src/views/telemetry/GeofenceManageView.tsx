import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Card,
  Row,
  Col,
  Typography,
  Space,
  Button,
  Input,
  Select,
  Tag,
  Switch,
  Popconfirm,
  Modal,
  Form,
  Radio,
  Slider,
  InputNumber,
  Checkbox,
  TimePicker,
  Tooltip,
  Divider,
  Empty,
  Spin,
  message,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  AimOutlined,
  EnvironmentOutlined,
  AlertOutlined,
  CompassOutlined,
  AppstoreOutlined,
  CarOutlined,
  ClockCircleOutlined,
  InfoCircleOutlined,
  MinusCircleOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import {
  type Coordinates,
  type GeofenceDto,
  type GeofenceType,
  type GeofenceStatus,
  type AlarmTriggerType,
  type AlarmLevel,
  calculateCircleAreaKm2,
  calculatePolygonAreaKm2,
  formatGeofenceArea,
  validateGeofenceName,
  validateCircleRadius,
  validatePolygonVertices,
  filterGeofences,
  SEED_GEOFENCES,
} from './geofence-core.ts';
import {
  fetchGeofencesApi,
  createGeofenceApi,
  updateGeofenceApi,
  toggleGeofenceStatusApi,
  deleteGeofenceApi,
} from '../../api/geofence.ts';
import { MapContainer } from './MapContainer.tsx';
import { SEED_MAP_VEHICLES, calculateBoundingBox } from './map-core.ts';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const DAY_OPTIONS = [
  { label: '周一', value: 1 },
  { label: '周二', value: 2 },
  { label: '周三', value: 3 },
  { label: '周四', value: 4 },
  { label: '周五', value: 5 },
  { label: '周六', value: 6 },
  { label: '周日', value: 7 },
];

const PRESET_POLYGONS = [
  {
    name: '上海陆家嘴金融区',
    vertices: [
      { lat: 31.246, lng: 121.492 },
      { lat: 31.246, lng: 121.508 },
      { lat: 31.232, lng: 121.508 },
      { lat: 31.232, lng: 121.492 },
    ],
  },
  {
    name: '深圳高新南区',
    vertices: [
      { lat: 22.548, lng: 113.932 },
      { lat: 22.548, lng: 113.946 },
      { lat: 22.535, lng: 113.946 },
      { lat: 22.535, lng: 113.932 },
    ],
  },
  {
    name: '前海现代服务保税区',
    vertices: [
      { lat: 22.542, lng: 113.895 },
      { lat: 22.545, lng: 113.918 },
      { lat: 22.528, lng: 113.918 },
      { lat: 22.525, lng: 113.895 },
    ],
  },
];

export const GeofenceManageView: React.FC = () => {
  const [geofences, setGeofences] = useState<GeofenceDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeGeofenceId, setActiveGeofenceId] = useState<string | null>(null);

  // Filters
  const [keyword, setKeyword] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Map controlled viewport
  const [mapCenter, setMapCenter] = useState<Coordinates>({ lat: 22.5428, lng: 113.9389 });
  const [mapZoom, setMapZoom] = useState<number>(13);

  // Edit / Create Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingGeofence, setEditingGeofence] = useState<GeofenceDto | null>(null);
  const [modalForm] = Form.useForm();
  const [modalType, setModalType] = useState<GeofenceType>('CIRCLE');
  const [circleRadius, setCircleRadius] = useState<number>(1200);
  const [polygonVertices, setPolygonVertices] = useState<Coordinates[]>([
    { lat: 22.548, lng: 113.932 },
    { lat: 22.548, lng: 113.946 },
    { lat: 22.535, lng: 113.946 },
    { lat: 22.535, lng: 113.932 },
  ]);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Load geofences
  const loadGeofences = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchGeofencesApi();
      setGeofences(data);
      if (data.length > 0 && !activeGeofenceId) {
        setActiveGeofenceId(data[0].id);
      }
    } catch {
      message.error('加载电子围栏列表失败');
    } finally {
      setLoading(false);
    }
  }, [activeGeofenceId]);

  useEffect(() => {
    loadGeofences();
  }, [loadGeofences]);

  // Filtered geofences
  const filteredList = useMemo(() => {
    return filterGeofences(geofences, {
      keyword: keyword || undefined,
      type: typeFilter !== 'ALL' ? (typeFilter as GeofenceType) : undefined,
      status: statusFilter !== 'ALL' ? (statusFilter as GeofenceStatus) : undefined,
    });
  }, [geofences, keyword, typeFilter, statusFilter]);

  // Currently active geofence
  const activeGeofence = useMemo(() => {
    return geofences.find((g) => g.id === activeGeofenceId) || null;
  }, [geofences, activeGeofenceId]);

  // KPIs
  const kpiStats = useMemo(() => {
    const total = geofences.length;
    const active = geofences.filter((g) => g.status === 'ACTIVE').length;
    const boundVehicles = geofences.reduce((acc, g) => acc + g.boundVehicleCount, 0);
    const triggers24h = geofences.reduce((acc, g) => acc + (g.status === 'ACTIVE' ? g.boundVehicleCount * 3 + 2 : 0), 0);
    return { total, active, boundVehicles, triggers24h };
  }, [geofences]);

  // Focus map on a geofence
  const handleFocusGeofence = (fence: GeofenceDto) => {
    setActiveGeofenceId(fence.id);
    if (fence.type === 'CIRCLE' && fence.circle) {
      setMapCenter(fence.circle.center);
      // Adaptive zoom based on radius
      const r = fence.circle.radiusMeters;
      let targetZoom = 14;
      if (r <= 500) targetZoom = 16;
      else if (r <= 1500) targetZoom = 15;
      else if (r <= 5000) targetZoom = 13;
      else targetZoom = 11;
      setMapZoom(targetZoom);
    } else if (fence.type === 'POLYGON' && fence.polygon && fence.polygon.vertices.length > 0) {
      const bbox = calculateBoundingBox(fence.polygon.vertices);
      setMapCenter(bbox.center);
      setMapZoom(Math.max(12, bbox.recommendedZoom));
    }
  };

  // Toggle Geofence Status
  const handleToggleStatus = async (id: string, checked: boolean) => {
    const nextStatus: GeofenceStatus = checked ? 'ACTIVE' : 'DISABLED';
    try {
      const updated = await toggleGeofenceStatusApi(id, nextStatus);
      setGeofences((prev) => prev.map((g) => (g.id === id ? updated : g)));
      message.success(`围栏已${checked ? '启用生效' : '停用'}`);
    } catch {
      message.error('切换围栏状态失败');
    }
  };

  // Delete Geofence
  const handleDeleteGeofence = async (id: string) => {
    try {
      await deleteGeofenceApi(id);
      setGeofences((prev) => prev.filter((g) => g.id !== id));
      if (activeGeofenceId === id) {
        setActiveGeofenceId(null);
      }
      message.success('围栏已成功删除');
    } catch {
      message.error('删除围栏失败');
    }
  };

  // Open Create Modal
  const handleOpenCreateModal = () => {
    setEditingGeofence(null);
    setModalType('CIRCLE');
    setCircleRadius(1200);
    const initialCoords: Coordinates = { lat: 22.5428, lng: 113.9389 };
    modalForm.resetFields();
    modalForm.setFieldsValue({
      name: '',
      type: 'CIRCLE',
      circleCenterLat: initialCoords.lat,
      circleCenterLng: initialCoords.lng,
      radiusMeters: 1200,
      triggerType: 'OUT',
      alarmLevel: 'WARNING',
      vehicleScope: 'ALL',
      effectiveDays: [1, 2, 3, 4, 5],
      description: '',
    });
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (fence: GeofenceDto) => {
    setEditingGeofence(fence);
    setModalType(fence.type);
    modalForm.resetFields();

    if (fence.type === 'CIRCLE' && fence.circle) {
      setCircleRadius(fence.circle.radiusMeters);
      modalForm.setFieldsValue({
        name: fence.name,
        type: 'CIRCLE',
        circleCenterLat: fence.circle.center.lat,
        circleCenterLng: fence.circle.center.lng,
        radiusMeters: fence.circle.radiusMeters,
        triggerType: fence.triggerType,
        alarmLevel: fence.alarmLevel,
        vehicleScope: fence.vehicleIds && fence.vehicleIds.length > 0 ? 'CUSTOM' : 'ALL',
        vehicleIds: fence.vehicleIds || [],
        effectiveDays: fence.effectiveDays || [1, 2, 3, 4, 5],
        description: fence.description || '',
      });
    } else if (fence.type === 'POLYGON' && fence.polygon) {
      setPolygonVertices([...fence.polygon.vertices]);
      modalForm.setFieldsValue({
        name: fence.name,
        type: 'POLYGON',
        triggerType: fence.triggerType,
        alarmLevel: fence.alarmLevel,
        vehicleScope: fence.vehicleIds && fence.vehicleIds.length > 0 ? 'CUSTOM' : 'ALL',
        vehicleIds: fence.vehicleIds || [],
        effectiveDays: fence.effectiveDays || [1, 2, 3, 4, 5],
        description: fence.description || '',
      });
    }

    setIsModalOpen(true);
  };

  // Submit Modal Form
  const handleModalSubmit = async () => {
    try {
      const values = await modalForm.validateFields();
      setSubmitting(true);

      const nameCheck = validateGeofenceName(values.name);
      if (!nameCheck.valid) {
        message.error(nameCheck.error);
        setSubmitting(false);
        return;
      }

      let payloadCircle = undefined;
      let payloadPolygon = undefined;

      if (modalType === 'CIRCLE') {
        const radiusCheck = validateCircleRadius(Number(values.radiusMeters));
        if (!radiusCheck.valid) {
          message.error(radiusCheck.error);
          setSubmitting(false);
          return;
        }
        payloadCircle = {
          center: {
            lat: Number(values.circleCenterLat),
            lng: Number(values.circleCenterLng),
          },
          radiusMeters: Number(values.radiusMeters),
        };
      } else {
        const polygonCheck = validatePolygonVertices(polygonVertices);
        if (!polygonCheck.valid) {
          message.error(polygonCheck.error);
          setSubmitting(false);
          return;
        }
        payloadPolygon = {
          vertices: polygonVertices,
        };
      }

      const vehicleIds = values.vehicleScope === 'CUSTOM' ? values.vehicleIds || [] : [];
      const boundCount = values.vehicleScope === 'ALL' ? SEED_MAP_VEHICLES.length : vehicleIds.length;

      if (editingGeofence) {
        const updated = await updateGeofenceApi(editingGeofence.id, {
          name: values.name,
          type: modalType,
          circle: payloadCircle,
          polygon: payloadPolygon,
          triggerType: values.triggerType,
          alarmLevel: values.alarmLevel,
          vehicleIds,
          boundVehicleCount: boundCount,
          effectiveDays: values.effectiveDays,
          description: values.description,
        });
        setGeofences((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
        setActiveGeofenceId(updated.id);
        message.success('电子围栏更新成功');
      } else {
        const created = await createGeofenceApi({
          tenantId: 'tenant-001',
          projectId: 'proj-001',
          name: values.name,
          type: modalType,
          circle: payloadCircle,
          polygon: payloadPolygon,
          triggerType: values.triggerType,
          alarmLevel: values.alarmLevel,
          status: 'ACTIVE',
          vehicleIds,
          boundVehicleCount: boundCount,
          effectiveDays: values.effectiveDays,
          description: values.description,
        });
        setGeofences((prev) => [created, ...prev]);
        setActiveGeofenceId(created.id);
        handleFocusGeofence(created);
        message.success('新建电子围栏成功');
      }

      setIsModalOpen(false);
    } catch {
      // validation errors handled by antd
    } finally {
      setSubmitting(false);
    }
  };

  // Calculated area in modal
  const computedModalArea = useMemo(() => {
    if (modalType === 'CIRCLE') {
      return calculateCircleAreaKm2(circleRadius);
    }
    return calculatePolygonAreaKm2(polygonVertices);
  }, [modalType, circleRadius, polygonVertices]);

  // Helper tags
  const renderTriggerTag = (type: AlarmTriggerType) => {
    switch (type) {
      case 'IN':
        return <Tag color="blue">驶入告警</Tag>;
      case 'OUT':
        return <Tag color="orange">驶出告警</Tag>;
      case 'IN_OUT':
        return <Tag color="volcano">进出双向</Tag>;
      default:
        return null;
    }
  };

  const renderAlarmLevelTag = (level: AlarmLevel) => {
    switch (level) {
      case 'CRITICAL':
        return <Tag color="error">严重 (P0)</Tag>;
      case 'WARNING':
        return <Tag color="warning">警告 (P1)</Tag>;
      case 'INFO':
        return <Tag color="default">提示 (P2)</Tag>;
      default:
        return null;
    }
  };

  const renderTypeTag = (type: GeofenceType) => {
    if (type === 'CIRCLE') {
      return (
        <Tag color="cyan" icon={<CompassOutlined />}>
          圆形围栏
        </Tag>
      );
    }
    return (
      <Tag color="purple" icon={<AppstoreOutlined />}>
        多边形围栏
      </Tag>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 4 KPI Metric Header Cards */}
      <Row gutter={[12, 12]}>
        <Col xs={12} sm={6}>
          <Card
            styles={{ body: { padding: '12px 16px' } }}
            style={{ borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
          >
            <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 12 }}>电子围栏总数</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: '#1677ff' }}>
                {kpiStats.total}
              </span>
              <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>个</span>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card
            styles={{ body: { padding: '12px 16px' } }}
            style={{ borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
          >
            <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 12 }}>生效执行中</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: '#52c41a' }}>
                {kpiStats.active}
              </span>
              <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>个</span>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card
            styles={{ body: { padding: '12px 16px' } }}
            style={{ borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
          >
            <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 12 }}>覆盖绑定车辆</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: '#722ed1' }}>
                {kpiStats.boundVehicles}
              </span>
              <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>台</span>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card
            styles={{ body: { padding: '12px 16px' } }}
            style={{ borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
          >
            <div style={{ color: 'rgba(0,0,0,0.45)', fontSize: 12 }}>24h触发告警次数</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: '#fa8c16' }}>
                {kpiStats.triggers24h}
              </span>
              <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>次</span>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Main Master-Detail Working Area */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          height: 'calc(100vh - 210px)',
          minHeight: 620,
        }}
      >
        {/* Left Pane: Filters & Geofence Cards List (420px) */}
        <Card
          styles={{
            body: {
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              boxSizing: 'border-box',
            },
          }}
          style={{
            width: 420,
            flexShrink: 0,
            borderRadius: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          }}
        >
          {/* Header Action & Filter Bar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Title level={5} style={{ margin: 0, fontSize: 15 }}>
                电子围栏规则列表
              </Title>
              <Button
                type="primary"
                size="small"
                icon={<PlusOutlined />}
                onClick={handleOpenCreateModal}
              >
                新建围栏
              </Button>
            </div>

            {/* Keyword Search */}
            <Input
              placeholder="搜索围栏名称 / 项目..."
              prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,0.45)' }} />}
              allowClear
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              size="middle"
            />

            {/* Type & Status Selects */}
            <div style={{ display: 'flex', gap: 8 }}>
              <Select
                value={typeFilter}
                onChange={setTypeFilter}
                style={{ flex: 1 }}
                size="small"
                options={[
                  { label: '全部类型', value: 'ALL' },
                  { label: '圆形围栏', value: 'CIRCLE' },
                  { label: '多边形围栏', value: 'POLYGON' },
                ]}
              />
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                style={{ flex: 1 }}
                size="small"
                options={[
                  { label: '全部状态', value: 'ALL' },
                  { label: '生效中', value: 'ACTIVE' },
                  { label: '已停用', value: 'DISABLED' },
                ]}
              />
            </div>
          </div>

          <Divider style={{ margin: '4px 0 10px 0' }} />

          {/* Scrollable Geofence Cards List */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              paddingRight: 4,
            }}
          >
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <Spin tip="加载中..." />
              </div>
            ) : filteredList.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无符合条件的电子围栏"
                style={{ margin: 'auto 0' }}
              >
                <Button type="primary" size="small" onClick={handleOpenCreateModal}>
                  立即创建
                </Button>
              </Empty>
            ) : (
              filteredList.map((fence) => {
                const isSelected = fence.id === activeGeofenceId;
                const fenceArea =
                  fence.type === 'CIRCLE' && fence.circle
                    ? calculateCircleAreaKm2(fence.circle.radiusMeters)
                    : fence.type === 'POLYGON' && fence.polygon
                      ? calculatePolygonAreaKm2(fence.polygon.vertices)
                      : 0;

                return (
                  <div
                    key={fence.id}
                    onClick={() => handleFocusGeofence(fence)}
                    data-testid={`geofence-card-${fence.id}`}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 8,
                      border: `1.5px solid ${isSelected ? '#1677ff' : '#f0f0f0'}`,
                      backgroundColor: isSelected ? '#f0f7ff' : '#ffffff',
                      boxShadow: isSelected
                        ? '0 4px 12px rgba(22, 119, 255, 0.15)'
                        : '0 1px 3px rgba(0,0,0,0.03)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                    }}
                  >
                    {/* Top Row: Name & Switch */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Text strong style={{ fontSize: 14, color: isSelected ? '#1677ff' : undefined }}>
                          {fence.name}
                        </Text>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
                          {renderTypeTag(fence.type)}
                          {renderTriggerTag(fence.triggerType)}
                          {renderAlarmLevelTag(fence.alarmLevel)}
                        </div>
                      </div>

                      <div onClick={(e) => e.stopPropagation()}>
                        <Switch
                          checked={fence.status === 'ACTIVE'}
                          size="small"
                          onChange={(checked) => handleToggleStatus(fence.id, checked)}
                          title={fence.status === 'ACTIVE' ? '点击停用' : '点击启用'}
                        />
                      </div>
                    </div>

                    {/* Description snippet */}
                    {fence.description && (
                      <Paragraph
                        type="secondary"
                        ellipsis={{ rows: 2 }}
                        style={{ fontSize: 12, margin: 0, lineHeight: '18px' }}
                      >
                        {fence.description}
                      </Paragraph>
                    )}

                    {/* Meta stats */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 12,
                        color: 'rgba(0,0,0,0.65)',
                        backgroundColor: isSelected ? '#e6f4ff' : '#fafafa',
                        padding: '4px 8px',
                        borderRadius: 4,
                      }}
                    >
                      <span>
                        覆盖面积: <strong>{formatGeofenceArea(fenceArea)}</strong>
                      </span>
                      <span>
                        绑定车辆: <strong>{fence.boundVehicleCount}</strong> 台
                      </span>
                    </div>

                    {/* Card Action Buttons */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: 8,
                        marginTop: 2,
                        borderTop: '1px solid #f0f0f0',
                        paddingTop: 6,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        type="text"
                        size="small"
                        icon={<AimOutlined />}
                        onClick={() => handleFocusGeofence(fence)}
                      >
                        定位
                      </Button>
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        onClick={() => handleOpenEditModal(fence)}
                      >
                        编辑
                      </Button>
                      <Popconfirm
                        title="删除电子围栏"
                        description="确定要彻底删除该电子围栏配置吗？此操作无法撤销。"
                        onConfirm={() => handleDeleteGeofence(fence.id)}
                        okText="确认删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                      >
                        <Button type="text" danger size="small" icon={<DeleteOutlined />}>
                          删除
                        </Button>
                      </Popconfirm>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        {/* Right Pane: GIS Map Surface & Overlay Details */}
        <div style={{ flex: 1, position: 'relative', height: '100%' }}>
          <MapContainer
            height="100%"
            geofences={filteredList}
            activeGeofenceId={activeGeofenceId || undefined}
            onSelectGeofence={(gf) => {
              if (gf) {
                handleFocusGeofence(gf);
              } else {
                setActiveGeofenceId(null);
              }
            }}
            center={mapCenter}
            zoom={mapZoom}
            vehicles={SEED_MAP_VEHICLES}
          >
            {/* Active Geofence Floating Info HUD Card */}
            {activeGeofence && (
              <div
                style={{
                  position: 'absolute',
                  top: 16,
                  left: 16,
                  zIndex: 35,
                  width: 340,
                  backgroundColor: 'rgba(255, 255, 255, 0.95)',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
                  backdropFilter: 'blur(8px)',
                  padding: '14px 16px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text strong style={{ fontSize: 15, color: '#0f172a' }}>
                    {activeGeofence.name}
                  </Text>
                  <Button
                    type="text"
                    size="small"
                    onClick={() => setActiveGeofenceId(null)}
                    style={{ color: 'rgba(0,0,0,0.45)' }}
                  >
                    ✕
                  </Button>
                </div>

                <div style={{ display: 'flex', gap: 6, margin: '6px 0 10px 0', flexWrap: 'wrap' }}>
                  {renderTypeTag(activeGeofence.type)}
                  {renderTriggerTag(activeGeofence.triggerType)}
                  {renderAlarmLevelTag(activeGeofence.alarmLevel)}
                  <Tag color={activeGeofence.status === 'ACTIVE' ? 'success' : 'default'}>
                    {activeGeofence.status === 'ACTIVE' ? '生效运行中' : '已停用'}
                  </Tag>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'rgba(0,0,0,0.45)' }}>地理覆盖面积:</span>
                    <span style={{ fontWeight: 600 }}>
                      {formatGeofenceArea(
                        activeGeofence.type === 'CIRCLE' && activeGeofence.circle
                          ? calculateCircleAreaKm2(activeGeofence.circle.radiusMeters)
                          : activeGeofence.type === 'POLYGON' && activeGeofence.polygon
                            ? calculatePolygonAreaKm2(activeGeofence.polygon.vertices)
                            : 0
                      )}
                    </span>
                  </div>
                  {activeGeofence.type === 'CIRCLE' && activeGeofence.circle && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'rgba(0,0,0,0.45)' }}>圆心半径:</span>
                      <span>{activeGeofence.circle.radiusMeters} 米</span>
                    </div>
                  )}
                  {activeGeofence.type === 'POLYGON' && activeGeofence.polygon && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'rgba(0,0,0,0.45)' }}>顶点数量:</span>
                      <span>{activeGeofence.polygon.vertices.length} 个基准折点</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'rgba(0,0,0,0.45)' }}>监控车辆范围:</span>
                    <span style={{ color: '#1677ff', fontWeight: 600 }}>
                      {activeGeofence.boundVehicleCount} 台车辆
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'rgba(0,0,0,0.45)' }}>生效日期:</span>
                    <span>
                      {activeGeofence.effectiveDays && activeGeofence.effectiveDays.length === 7
                        ? '全周 7 天'
                        : activeGeofence.effectiveDays
                          ? `周 ${activeGeofence.effectiveDays.join('、')}`
                          : '工作日'}
                    </span>
                  </div>
                  {activeGeofence.effectiveTimeRange && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'rgba(0,0,0,0.45)' }}>生效时段:</span>
                      <span>
                        {activeGeofence.effectiveTimeRange[0]} ~ {activeGeofence.effectiveTimeRange[1]}
                      </span>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 10, borderTop: '1px solid #f0f0f0' }}>
                  <Button
                    type="primary"
                    size="small"
                    icon={<EditOutlined />}
                    style={{ flex: 1 }}
                    onClick={() => handleOpenEditModal(activeGeofence)}
                  >
                    编辑围栏
                  </Button>
                  <Button
                    size="small"
                    icon={<AimOutlined />}
                    onClick={() => handleFocusGeofence(activeGeofence)}
                  >
                    居中视野
                  </Button>
                </div>
              </div>
            )}
          </MapContainer>
        </div>
      </div>

      {/* Geofence Edit & Create Modal */}
      <Modal
        title={editingGeofence ? '编辑电子围栏' : '新建电子围栏'}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onOk={handleModalSubmit}
        confirmLoading={submitting}
        width={680}
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto', paddingRight: 8 } }}
        destroyOnClose
      >
        <Form form={modalForm} layout="vertical" initialValues={{ type: 'CIRCLE', triggerType: 'OUT', alarmLevel: 'WARNING', vehicleScope: 'ALL' }}>
          {/* Geofence Name */}
          <Form.Item
            name="name"
            label="围栏名称"
            rules={[
              { required: true, message: '请输入围栏名称' },
              { min: 2, max: 30, message: '名称长度为 2 ~ 30 个字符' },
            ]}
          >
            <Input placeholder="例如：深圳高新南区核心禁出围栏" />
          </Form.Item>

          {/* Fence Geometry Type */}
          <Form.Item name="type" label="围栏空间几何类型">
            <Radio.Group
              onChange={(e) => setModalType(e.target.value)}
              buttonStyle="solid"
            >
              <Radio.Button value="CIRCLE">圆形电子围栏 (半径距离)</Radio.Button>
              <Radio.Button value="POLYGON">多边形电子围栏 (折点闭包)</Radio.Button>
            </Radio.Group>
          </Form.Item>

          {/* Circular Configuration */}
          {modalType === 'CIRCLE' && (
            <Card
              size="small"
              title="圆形参数设定"
              styles={{ body: { padding: '12px 14px' } }}
              style={{ backgroundColor: '#fafafa', marginBottom: 16 }}
            >
              <Row gutter={12}>
                <Col span={12}>
                  <Form.Item
                    name="circleCenterLat"
                    label="圆心纬度 (Latitude)"
                    rules={[{ required: true, message: '请输入圆心纬度' }]}
                  >
                    <InputNumber style={{ width: '100%' }} precision={6} step={0.001} min={-90} max={90} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="circleCenterLng"
                    label="圆心经度 (Longitude)"
                    rules={[{ required: true, message: '请输入圆心经度' }]}
                  >
                    <InputNumber style={{ width: '100%' }} precision={6} step={0.001} min={-180} max={180} />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item label={`围栏半径 (米): ${circleRadius} m`} style={{ marginBottom: 6 }}>
                <Row gutter={16} align="middle">
                  <Col span={16}>
                    <Slider
                      min={100}
                      max={20000}
                      step={50}
                      value={circleRadius}
                      onChange={(val) => {
                        setCircleRadius(val);
                        modalForm.setFieldValue('radiusMeters', val);
                      }}
                    />
                  </Col>
                  <Col span={8}>
                    <Form.Item name="radiusMeters" noStyle rules={[{ required: true, message: '请输入半径' }]}>
                      <InputNumber
                        min={100}
                        max={100000}
                        value={circleRadius}
                        onChange={(val) => setCircleRadius(val || 100)}
                        addonAfter="米"
                        style={{ width: '100%' }}
                      />
                    </Form.Item>
                  </Col>
                </Row>
              </Form.Item>

              <div style={{ fontSize: 12, color: '#1677ff', fontWeight: 600 }}>
                💡 换算覆盖面积：{formatGeofenceArea(computedModalArea)}
              </div>
            </Card>
          )}

          {/* Polygon Configuration */}
          {modalType === 'POLYGON' && (
            <Card
              size="small"
              title="多边形折点顶点列表 (至少 3 个点)"
              styles={{ body: { padding: '12px 14px' } }}
              style={{ backgroundColor: '#fafafa', marginBottom: 16 }}
            >
              {/* Preset buttons */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.65)' }}>快速载入预设区域：</span>
                {PRESET_POLYGONS.map((p) => (
                  <Button
                    key={p.name}
                    size="small"
                    onClick={() => setPolygonVertices([...p.vertices])}
                  >
                    {p.name}
                  </Button>
                ))}
              </div>

              {/* Vertices table/rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
                {polygonVertices.map((vertex, index) => (
                  <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Tag style={{ width: 28, textAlign: 'center' }}>{index + 1}</Tag>
                    <InputNumber
                      placeholder="纬度 Lat"
                      value={vertex.lat}
                      precision={6}
                      step={0.001}
                      onChange={(val) => {
                        const copy = [...polygonVertices];
                        copy[index].lat = val || 0;
                        setPolygonVertices(copy);
                      }}
                      style={{ flex: 1 }}
                    />
                    <InputNumber
                      placeholder="经度 Lng"
                      value={vertex.lng}
                      precision={6}
                      step={0.001}
                      onChange={(val) => {
                        const copy = [...polygonVertices];
                        copy[index].lng = val || 0;
                        setPolygonVertices(copy);
                      }}
                      style={{ flex: 1 }}
                    />
                    <Button
                      type="text"
                      danger
                      icon={<MinusCircleOutlined />}
                      disabled={polygonVertices.length <= 3}
                      onClick={() => {
                        const copy = polygonVertices.filter((_, i) => i !== index);
                        setPolygonVertices(copy);
                      }}
                    />
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                <Button
                  type="dashed"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    const last = polygonVertices[polygonVertices.length - 1] || { lat: 22.54, lng: 113.93 };
                    setPolygonVertices([...polygonVertices, { lat: last.lat + 0.005, lng: last.lng + 0.005 }]);
                  }}
                >
                  添加顶点坐标
                </Button>
                <div style={{ fontSize: 12, color: '#722ed1', fontWeight: 600 }}>
                  💡 闭合几何面积：{formatGeofenceArea(computedModalArea)}
                </div>
              </div>
            </Card>
          )}

          {/* Trigger Rules & Alarm Level */}
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="triggerType" label="越界触发规则" rules={[{ required: true }]}>
                <Radio.Group>
                  <Radio value="OUT">驶出围栏告警</Radio>
                  <Radio value="IN">驶入围栏告警</Radio>
                  <Radio value="IN_OUT">进出双向告警</Radio>
                </Radio.Group>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="alarmLevel" label="告警紧急严重级别" rules={[{ required: true }]}>
                <Select
                  options={[
                    { label: '提示通知 (P2 - INFO)', value: 'INFO' },
                    { label: '警告注意 (P1 - WARNING)', value: 'WARNING' },
                    { label: '严重阻断 (P0 - CRITICAL)', value: 'CRITICAL' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          {/* Bound Vehicle Policy */}
          <Form.Item name="vehicleScope" label="关联管控车辆范围">
            <Radio.Group>
              <Radio value="ALL">全部在网车辆 (全网规则)</Radio>
              <Radio value="CUSTOM">指定车辆清单 (白名单/黑名单)</Radio>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prev, cur) => prev.vehicleScope !== cur.vehicleScope}
          >
            {({ getFieldValue }) =>
              getFieldValue('vehicleScope') === 'CUSTOM' ? (
                <Form.Item
                  name="vehicleIds"
                  label="选择指定生效车辆"
                  rules={[{ required: true, message: '请至少选择一台关联车辆' }]}
                >
                  <Select
                    mode="multiple"
                    placeholder="选择车牌号 / VIN"
                    options={SEED_MAP_VEHICLES.map((v) => ({
                      label: `${v.plateNumber} (${v.model})`,
                      value: v.id,
                    }))}
                  />
                </Form.Item>
              ) : null
            }
          </Form.Item>

          {/* Effective Days */}
          <Form.Item name="effectiveDays" label="生效星期">
            <Checkbox.Group options={DAY_OPTIONS} />
          </Form.Item>

          {/* Description */}
          <Form.Item name="description" label="备注说明">
            <TextArea rows={2} placeholder="填写该围栏的管理依据、责任人及告警处理规程..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default GeofenceManageView;
