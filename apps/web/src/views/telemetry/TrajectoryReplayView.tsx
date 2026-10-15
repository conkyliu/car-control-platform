import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Card,
  Select,
  Segmented,
  DatePicker,
  Button,
  Typography,
  Tag,
  Alert,
  Spin,
  Empty,
  Tooltip,
  message,
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  AimOutlined,
  CarOutlined,
  ThunderboltOutlined,
  DashboardOutlined,
  FieldTimeOutlined,
  CompressOutlined,
  EnvironmentOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import {
  type TrajectoryPoint,
  type StayPoint,
  type TrajectoryStats,
  type InterpolatedTrajectoryState,
  type SimplifiedTrajectoryDto,
  TRAJECTORY_TOLERANCE_OPTIONS,
  DEFAULT_TRAJECTORY,
  SEED_TRAJECTORIES,
} from './trajectory-core.ts';
import { fetchVehicleTrajectoryApi, fetchVehicleLocationsApi } from '../../api/telemetry.ts';
import { MapContainer, type ReplayVehicleState, type MapStayPointItem } from './MapContainer.tsx';
import { TrajectoryPlayer } from './TrajectoryPlayer.tsx';
import {
  type Coordinates,
  type MapMarkerItem,
  calculateBoundingBox,
  SEED_MAP_VEHICLES,
} from './map-core.ts';
import { type VehicleLocationDto, SEED_TELEMETRY_VEHICLES } from './telemetry-core.ts';

const { Text, Title } = Typography;

export interface TrajectoryReplayViewProps {
  initialVehicleId?: string;
  height?: number | string;
  onClose?: () => void;
  style?: React.CSSProperties;
}

export const TrajectoryReplayView: React.FC<TrajectoryReplayViewProps> = ({
  initialVehicleId = 'veh-001',
  height = 'calc(100vh - 128px)',
  onClose,
  style,
}) => {
  // 车辆列表与选中
  const [vehicles, setVehicles] = useState<VehicleLocationDto[]>(SEED_TELEMETRY_VEHICLES);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(initialVehicleId);

  // 筛选与容差参数
  const [datePreset, setDatePreset] = useState<'TODAY' | 'YESTERDAY' | '3D' | 'CUSTOM'>('TODAY');
  const [customRange, setCustomRange] = useState<[string | undefined, string | undefined]>([
    undefined,
    undefined,
  ]);
  const [tolerance, setTolerance] = useState<number>(0.0001); // 默认标准 11.1m

  // 轨迹数据
  const [loading, setLoading] = useState<boolean>(false);
  const [trajectoryData, setTrajectoryData] = useState<SimplifiedTrajectoryDto>(DEFAULT_TRAJECTORY);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 地图视角
  const [mapCenter, setMapCenter] = useState<Coordinates | undefined>(undefined);
  const [mapZoom, setMapZoom] = useState<number | undefined>(undefined);

  // 回放状态与车辆游标
  const [currentCar, setCurrentCar] = useState<ReplayVehicleState | null>(null);

  // 加载车辆选项
  useEffect(() => {
    let isMounted = true;
    fetchVehicleLocationsApi()
      .then((data) => {
        if (isMounted && data.length > 0) {
          setVehicles(data);
        }
      })
      .catch(() => {
        // Fallback to seeds
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // 获取当前选中车辆对象
  const currentVehicle = useMemo(() => {
    return vehicles.find((v) => v.vehicleId === selectedVehicleId) || vehicles[0];
  }, [vehicles, selectedVehicleId]);

  // 查询轨迹数据
  const loadTrajectory = useCallback(async () => {
    if (!selectedVehicleId) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      let startTime: string | undefined;
      let endTime: string | undefined;
      const now = new Date();

      if (datePreset === 'TODAY') {
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        startTime = todayStart.toISOString();
        endTime = now.toISOString();
      } else if (datePreset === 'YESTERDAY') {
        const yStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
        const yEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);
        startTime = yStart.toISOString();
        endTime = yEnd.toISOString();
      } else if (datePreset === '3D') {
        const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 3600 * 1000);
        startTime = threeDaysAgo.toISOString();
        endTime = now.toISOString();
      } else if (customRange[0] && customRange[1]) {
        startTime = customRange[0];
        endTime = customRange[1];
      }

      const res = await fetchVehicleTrajectoryApi(selectedVehicleId, {
        startTime,
        endTime,
        tolerance,
      });

      setTrajectoryData(res);

      // 自动居中并适配缩放视野
      if (res.points.length > 0) {
        const bbox = calculateBoundingBox(res.points.map((p) => ({ lat: p.lat, lng: p.lng })));
        setMapCenter(bbox.center);
        setMapZoom(bbox.recommendedZoom);

        // 初始化车辆游标至起点
        const startPoint = res.points[0];
        setCurrentCar({
          coordinates: { lat: startPoint.lat, lng: startPoint.lng },
          heading: startPoint.heading,
          speed: startPoint.speed,
          plateNumber: currentVehicle?.plateNumber || '粤B·D12345',
        });
      }
    } catch (err: any) {
      setErrorMsg(err?.message || '获取车辆历史轨迹失败，已启用离线基线数据');
    } finally {
      setLoading(false);
    }
  }, [selectedVehicleId, datePreset, customRange, tolerance, currentVehicle]);

  // 初次加载与车辆切换时自动拉取
  useEffect(() => {
    loadTrajectory();
  }, [selectedVehicleId, tolerance, datePreset]);

  // 同步外部 initialVehicleId
  useEffect(() => {
    if (initialVehicleId && initialVehicleId !== selectedVehicleId) {
      setSelectedVehicleId(initialVehicleId);
    }
  }, [initialVehicleId]);

  // 播放游标推进回调
  const handleProgressChange = useCallback(
    (state: InterpolatedTrajectoryState) => {
      setCurrentCar({
        coordinates: { lat: state.lat, lng: state.lng },
        heading: state.heading,
        speed: state.speed,
        plateNumber: currentVehicle?.plateNumber || '粤B·D12345',
      });
    },
    [currentVehicle]
  );

  // 视野全图重置
  const handleFitTrajectory = () => {
    if (trajectoryData.points.length === 0) return;
    const bbox = calculateBoundingBox(trajectoryData.points.map((p) => ({ lat: p.lat, lng: p.lng })));
    setMapCenter(bbox.center);
    setMapZoom(bbox.recommendedZoom);
    message.success('已自动对焦并全图适配历史轨迹航线');
  };

  // 起点与终点 Marker
  const startMarker = useMemo(() => {
    if (trajectoryData.points.length === 0) return undefined;
    const pt = trajectoryData.points[0];
    return {
      lat: pt.lat,
      lng: pt.lng,
      title: `起点: ${pt.timeFormatted}`,
    };
  }, [trajectoryData.points]);

  const endMarker = useMemo(() => {
    if (trajectoryData.points.length < 2) return undefined;
    const pt = trajectoryData.points[trajectoryData.points.length - 1];
    return {
      lat: pt.lat,
      lng: pt.lng,
      title: `终点: ${pt.timeFormatted}`,
    };
  }, [trajectoryData.points]);

  const stayPointMarkers: MapStayPointItem[] = useMemo(() => {
    return (trajectoryData.stayPoints || []).map((s) => ({
      id: s.id,
      coordinates: s.coordinates,
      durationFormatted: s.durationFormatted,
      durationSeconds: s.durationSeconds,
      startTime: s.startTime,
      endTime: s.endTime,
      address: s.address,
    }));
  }, [trajectoryData.stayPoints]);

  const stats = trajectoryData.stats;

  return (
    <div
      className="trajectory-replay-view-root"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        height,
        width: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
        ...style,
      }}
      data-testid="trajectory-replay-view"
    >
      {/* 1. 顶部控制工具栏与检索卡片 */}
      <Card
        size="small"
        styles={{ body: { padding: '10px 16px' } }}
        style={{
          borderRadius: 8,
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          {/* 左侧：车辆选择器与时间筛选 */}
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            {/* 车辆选择 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CarOutlined style={{ color: '#1677ff' }} />
              <Select
                showSearch
                placeholder="请选择/搜索目标车辆"
                value={selectedVehicleId}
                onChange={(val) => setSelectedVehicleId(val)}
                style={{ width: 220 }}
                filterOption={(input, option) => {
                  const label = String(option?.label ?? '');
                  return label.toLowerCase().includes(input.toLowerCase());
                }}
                options={vehicles.map((v) => ({
                  value: v.vehicleId,
                  label: `${v.plateNumber} (${v.brand} ${v.modelName})`,
                }))}
              />
            </div>

            {/* 时间预设快捷按钮 */}
            <Segmented
              options={[
                { label: '今天', value: 'TODAY' },
                { label: '昨天', value: 'YESTERDAY' },
                { label: '近3天', value: '3D' },
                { label: '自定义', value: 'CUSTOM' },
              ]}
              value={datePreset}
              onChange={(val) => setDatePreset(val as any)}
            />

            {/* 自定义时间范围 */}
            {datePreset === 'CUSTOM' && (
              <DatePicker.RangePicker
                showTime
                placeholder={['开始时间', '结束时间']}
                onChange={(_, dateStrings) => {
                  setCustomRange([dateStrings[0] || undefined, dateStrings[1] || undefined]);
                }}
                style={{ width: 330 }}
              />
            )}

            {/* 抽稀容差选择 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Tooltip title="基于 Douglas-Peucker 算法降低高频折线密度，优化大屏回放帧率">
                <CompressOutlined style={{ color: '#64748b' }} />
              </Tooltip>
              <Text type="secondary" style={{ fontSize: 12 }}>
                抽稀精度:
              </Text>
              <Segmented
                options={TRAJECTORY_TOLERANCE_OPTIONS.map((opt) => ({
                  label: opt.label,
                  value: opt.value,
                }))}
                value={tolerance}
                onChange={(val) => setTolerance(Number(val))}
              />
            </div>
          </div>

          {/* 右侧：操作按钮组 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tooltip title="一键全图适配当前轨迹航线">
              <Button icon={<AimOutlined />} onClick={handleFitTrajectory}>
                适配全图
              </Button>
            </Tooltip>

            <Button
              type="primary"
              icon={<SearchOutlined />}
              loading={loading}
              onClick={loadTrajectory}
            >
              查询轨迹
            </Button>

            {onClose && (
              <Button icon={<CloseOutlined />} onClick={onClose}>
                关闭
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* 2. 轨迹关键指标汇总 KPI Banner (6 维科技风指标条) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: 10,
        }}
      >
        {/* 累计里程 */}
        <Card
          size="small"
          styles={{ body: { padding: '8px 12px' } }}
          style={{
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
          }}
        >
          <Text type="secondary" style={{ fontSize: 11 }}>
            累计里程
          </Text>
          <div style={{ marginTop: 2, display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', fontFamily: 'monospace' }}>
              {stats.totalDistanceKm}
            </span>
            <span style={{ fontSize: 11, color: '#64748b' }}>km</span>
          </div>
        </Card>

        {/* 行驶时长 */}
        <Card
          size="small"
          styles={{ body: { padding: '8px 12px' } }}
          style={{
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
          }}
        >
          <Text type="secondary" style={{ fontSize: 11 }}>
            行驶总时长
          </Text>
          <div style={{ marginTop: 2, display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#1677ff' }}>
              {stats.durationFormatted}
            </span>
          </div>
        </Card>

        {/* 最高时速 */}
        <Card
          size="small"
          styles={{ body: { padding: '8px 12px' } }}
          style={{
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
          }}
        >
          <Text type="secondary" style={{ fontSize: 11 }}>
            最高时速
          </Text>
          <div style={{ marginTop: 2, display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#fa541c', fontFamily: 'monospace' }}>
              {stats.maxSpeedKmh}
            </span>
            <span style={{ fontSize: 11, color: '#64748b' }}>km/h</span>
          </div>
        </Card>

        {/* 行驶均速 */}
        <Card
          size="small"
          styles={{ body: { padding: '8px 12px' } }}
          style={{
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
          }}
        >
          <Text type="secondary" style={{ fontSize: 11 }}>
            行驶平均车速
          </Text>
          <div style={{ marginTop: 2, display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#52c41a', fontFamily: 'monospace' }}>
              {stats.avgSpeedKmh}
            </span>
            <span style={{ fontSize: 11, color: '#64748b' }}>km/h</span>
          </div>
        </Card>

        {/* 停驻点数 */}
        <Card
          size="small"
          styles={{ body: { padding: '8px 12px' } }}
          style={{
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
          }}
        >
          <Text type="secondary" style={{ fontSize: 11 }}>
            停驻异常点
          </Text>
          <div style={{ marginTop: 2, display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: stats.stayCount > 0 ? '#1677ff' : '#64748b', fontFamily: 'monospace' }}>
              {stats.stayCount}
            </span>
            <span style={{ fontSize: 11, color: '#64748b' }}>处</span>
          </div>
        </Card>

        {/* 抽稀压缩比 */}
        <Card
          size="small"
          styles={{ body: { padding: '8px 12px' } }}
          style={{
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            background: 'linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%)',
          }}
        >
          <Text type="secondary" style={{ fontSize: 11 }}>
            矢量抽稀率
          </Text>
          <div style={{ marginTop: 2, display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#722ed1', fontFamily: 'monospace' }}>
              {stats.compressionRatio ?? 0}%
            </span>
            <span style={{ fontSize: 11, color: '#64748b' }}>
              ({trajectoryData.simplifiedCount}/{trajectoryData.rawCount})
            </span>
          </div>
        </Card>
      </div>

      {/* 3. 错误提示通告栏 */}
      {errorMsg && (
        <Alert
          type="warning"
          showIcon
          closable
          message="接口提示"
          description={errorMsg}
          style={{ borderRadius: 6 }}
        />
      )}

      {/* 4. 主地图与播放器容器 */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          borderRadius: 8,
          overflow: 'hidden',
          border: '1px solid #e2e8f0',
        }}
      >
        {loading && trajectoryData.points.length === 0 ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#f8fafc',
            }}
          >
            <Spin tip="正在拉取高频历史轨迹并计算矢量抽稀..." />
          </div>
        ) : trajectoryData.points.length === 0 ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#f8fafc',
            }}
          >
            <Empty description="该时间段内暂无历史行驶轨迹记录" />
          </div>
        ) : (
          <MapContainer
            vehicles={[]}
            trackPolyline={trajectoryData.points.map((p) => ({ lat: p.lat, lng: p.lng }))}
            startMarker={startMarker}
            endMarker={endMarker}
            stayPoints={stayPointMarkers}
            replayVehicle={currentCar || undefined}
            center={mapCenter}
            zoom={mapZoom}
            height="100%"
            showLegend={false}
          >
            {/* 浮动车载控制器 HUD 播放器 */}
            <TrajectoryPlayer
              points={trajectoryData.points}
              plateNumber={currentVehicle?.plateNumber}
              onProgressChange={handleProgressChange}
            />
          </MapContainer>
        )}
      </div>
    </div>
  );
};
