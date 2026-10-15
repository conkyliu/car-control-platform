import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Card,
  Input,
  Segmented,
  Checkbox,
  Button,
  Tag,
  Badge,
  Typography,
  Empty,
  Spin,
  Alert,
  Tooltip,
  message,
} from 'antd';
import {
  CarOutlined,
  ThunderboltOutlined,
  AlertOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  AimOutlined,
  SearchOutlined,
  HistoryOutlined,
  CompassOutlined,
} from '@ant-design/icons';
import {
  type VehicleLocationDto,
  type TelemetryFilterQuery,
  type TelemetryStatusFilter,
  calculateTelemetryOverview,
  filterVehicleLocations,
  applyLocationUpdate,
  toMarkerItem,
} from './telemetry-core.ts';
import {
  fetchVehicleLocationsApi,
  subscribeRealtimeLocations,
} from '../../api/telemetry.ts';
import { MapContainer } from './MapContainer.tsx';
import {
  type Coordinates,
  type MapMarkerItem,
  calculateBoundingBox,
  formatSpeed,
} from './map-core.ts';
import { useVehicleStore } from '../../store/useVehicleStore.ts';
import { useNavTabsStore } from '../../store/useNavTabsStore.ts';
import { RoutePath } from '../../router/routes.ts';

const { Text, Title } = Typography;

export const RealtimeLocationMap: React.FC = () => {
  // 核心数据状态
  const [vehicles, setVehicles] = useState<VehicleLocationDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  // 筛选与检索状态
  const [searchText, setSearchText] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<TelemetryStatusFilter>('ALL');
  const [lowVoltageOnly, setLowVoltageOnly] = useState<boolean>(false);

  // 地图受控视角（用于居中飞越与一键全图适配）
  const [mapCenter, setMapCenter] = useState<Coordinates | undefined>(undefined);
  const [mapZoom, setMapZoom] = useState<number | undefined>(undefined);

  // 全局业务状态联动
  const setGlobalVehicle = useVehicleStore((s) => s.setVehicle);
  const openTab = useNavTabsStore((s) => s.openTab);

  // 1. 数据拉取
  const loadVehicles = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await fetchVehicleLocationsApi();
      setVehicles(data);
    } catch (err: any) {
      setErrorMsg(err?.message || '获取车辆实时遥测数据失败，请检查网络连接');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVehicles();

    // 2. 挂载 WebSocket 实时定位数据流通道
    const unsubscribe = subscribeRealtimeLocations((updatedVehicle) => {
      setVehicles((prev) =>
        applyLocationUpdate(prev, {
          vehicleId: updatedVehicle.vehicleId,
          lat: updatedVehicle.coordinates.lat,
          lng: updatedVehicle.coordinates.lng,
          speed: updatedVehicle.speed,
          heading: updatedVehicle.heading,
          altitude: updatedVehicle.altitude,
          satellites: updatedVehicle.satellites,
          voltage: updatedVehicle.voltage,
          gpsValid: updatedVehicle.gpsValid,
          status: updatedVehicle.status,
          timestamp: updatedVehicle.timestamp,
          lastReportTime: updatedVehicle.lastReportTime,
        })
      );
    });

    return () => {
      unsubscribe();
    };
  }, [loadVehicles]);

  // 3. 计算统计指标
  const overviewStats = useMemo(() => {
    return calculateTelemetryOverview(vehicles);
  }, [vehicles]);

  // 4. 多维筛选过滤后的车辆列表
  const filteredVehicles = useMemo(() => {
    const query: TelemetryFilterQuery = {
      keyword: searchText,
      status: statusFilter,
      lowVoltageOnly,
    };
    return filterVehicleLocations(vehicles, query);
  }, [vehicles, searchText, statusFilter, lowVoltageOnly]);

  // 转换为 MapContainer 可渲染的 markers
  const mapMarkers: MapMarkerItem[] = useMemo(() => {
    return filteredVehicles.map(toMarkerItem);
  }, [filteredVehicles]);

  // 点击列表项：地图平滑对焦并唤起气泡
  const handleSelectVehicleItem = (item: VehicleLocationDto) => {
    setSelectedVehicleId(item.vehicleId);
    setMapCenter(item.coordinates);
    setMapZoom(16);
  };

  // 全图视野一键适配 (Fit Bounds)
  const handleFitBounds = () => {
    if (filteredVehicles.length === 0) {
      message.info('当前暂无可见车辆标记');
      return;
    }
    const bbox = calculateBoundingBox(filteredVehicles.map((v) => v.coordinates));
    setMapCenter(bbox.center);
    setMapZoom(bbox.recommendedZoom);
    message.success(`已重设视野至 ${filteredVehicles.length} 台目标车辆所在区域`);
  };

  // 气泡卡片：跳转车控中心
  const handleTriggerCommand = (marker: MapMarkerItem) => {
    setGlobalVehicle(marker.id);
    openTab({
      key: RoutePath.COMMANDS,
      title: '车控中心',
      icon: 'ControlOutlined',
    });
    message.info(`已切换至车辆 [${marker.plateNumber}] 车控工作台`);
  };

  // 气泡卡片：轨迹回放
  const handleViewTrack = (marker: MapMarkerItem) => {
    message.success(`已为车辆 [${marker.plateNumber}] 加载最新历史轨迹`);
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: 16,
        height: 'calc(100vh - 128px)',
        minHeight: 680,
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* ================= 左侧：多维车辆看板与检索工作台 (340px) ================= */}
      <div
        style={{
          width: 340,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          height: '100%',
          overflow: 'hidden',
        }}
      >
        {/* 顶部 4 大 KPI 监控卡片 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 8,
          }}
        >
          {/* 全部车辆 */}
          <Card
            size="small"
            styles={{ body: { padding: '8px 12px' } }}
            style={{
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              background: '#f8fafc',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                全部车辆
              </Text>
              <CarOutlined style={{ color: '#1677ff', fontSize: 14 }} />
            </div>
            <div style={{ marginTop: 2, display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
                {overviewStats.totalVehicles}
              </span>
              <Text type="secondary" style={{ fontSize: 11 }}>
                台
              </Text>
            </div>
          </Card>

          {/* 在线行驶 */}
          <Card
            size="small"
            styles={{ body: { padding: '8px 12px' } }}
            style={{
              borderRadius: 8,
              border: '1px solid #dcfce7',
              background: '#f0fdf4',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                在线行驶
              </Text>
              <ThunderboltOutlined style={{ color: '#52c41a', fontSize: 14 }} />
            </div>
            <div style={{ marginTop: 2, display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#15803d' }}>
                {overviewStats.movingCount}
              </span>
              <Text type="secondary" style={{ fontSize: 11 }}>
                ({overviewStats.onlineRate}%)
              </Text>
            </div>
          </Card>

          {/* 静止熄火 */}
          <Card
            size="small"
            styles={{ body: { padding: '8px 12px' } }}
            style={{
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              background: '#f8fafc',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                静止熄火
              </Text>
              <PauseCircleOutlined style={{ color: '#64748b', fontSize: 14 }} />
            </div>
            <div style={{ marginTop: 2, display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#334155' }}>
                {overviewStats.stationaryCount}
              </span>
              <Text type="secondary" style={{ fontSize: 11 }}>
                台
              </Text>
            </div>
          </Card>

          {/* 异常告警 */}
          <Card
            size="small"
            styles={{ body: { padding: '8px 12px' } }}
            style={{
              borderRadius: 8,
              border: '1px solid #fee2e2',
              background: '#fef2f2',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                异常告警
              </Text>
              <AlertOutlined style={{ color: '#ef4444', fontSize: 14 }} />
            </div>
            <div style={{ marginTop: 2, display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#b91c1c' }}>
                {overviewStats.alarmCount}
              </span>
              <Text type="secondary" style={{ fontSize: 11 }}>
                台
              </Text>
            </div>
          </Card>
        </div>

        {/* 车辆看板与列表主容器卡片 */}
        <Card
          styles={{
            body: {
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              overflow: 'hidden',
              boxSizing: 'border-box',
            },
          }}
          style={{
            flex: 1,
            borderRadius: 8,
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* 1. 搜索框 */}
          <Input
            placeholder="搜索车牌号/VIN/设备号/车型..."
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            allowClear
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ marginBottom: 10, borderRadius: 6 }}
          />

          {/* 2. 状态分段选择器 Segmented */}
          <Segmented
            block
            size="small"
            value={statusFilter}
            onChange={(val) => setStatusFilter(val as TelemetryStatusFilter)}
            options={[
              { label: '全部', value: 'ALL' },
              { label: '行驶', value: 'MOVING' },
              { label: '静止', value: 'STATIONARY' },
              { label: '告警', value: 'ALARM' },
              { label: '离线', value: 'OFFLINE' },
            ]}
            style={{ marginBottom: 10 }}
          />

          {/* 3. 辅助过滤与快捷工具栏 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
              paddingBottom: 8,
              borderBottom: '1px solid #f1f5f9',
            }}
          >
            <Checkbox
              checked={lowVoltageOnly}
              onChange={(e) => setLowVoltageOnly(e.target.checked)}
              style={{ fontSize: 12 }}
            >
              主电欠压
            </Checkbox>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Tooltip title="一键将地图对焦至当前所有筛选车辆">
                <Button
                  size="small"
                  icon={<AimOutlined />}
                  onClick={handleFitBounds}
                  style={{ fontSize: 12 }}
                >
                  全车视野
                </Button>
              </Tooltip>
              <Tooltip title="刷新数据">
                <Button
                  size="small"
                  icon={<ReloadOutlined spin={loading} />}
                  onClick={loadVehicles}
                />
              </Tooltip>
            </div>
          </div>

          {/* 筛选结果计数 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8,
              fontSize: 12,
              color: '#64748b',
            }}
          >
            <span>
              已筛选 <strong style={{ color: '#0f172a' }}>{filteredVehicles.length}</strong> 台车辆
            </span>
            {overviewStats.avgSpeed > 0 && (
              <span>
                行驶均速: <strong style={{ color: '#1677ff' }}>{overviewStats.avgSpeed}</strong> km/h
              </span>
            )}
          </div>

          {/* 4. 可滚动车辆列表容器 */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              paddingRight: 2,
            }}
          >
            {loading && vehicles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <Spin tip="正在载入车辆实时定位与工况..." />
              </div>
            ) : errorMsg ? (
              <Alert
                type="error"
                showIcon
                message="数据加载失败"
                description={errorMsg}
                action={
                  <Button size="small" type="primary" onClick={loadVehicles}>
                    重试
                  </Button>
                }
              />
            ) : filteredVehicles.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <span style={{ fontSize: 13, color: '#64748b' }}>未找到匹配条件的车辆</span>
                }
                style={{ margin: '40px 0' }}
              >
                <Button
                  size="small"
                  onClick={() => {
                    setSearchText('');
                    setStatusFilter('ALL');
                    setLowVoltageOnly(false);
                  }}
                >
                  重置筛选条件
                </Button>
              </Empty>
            ) : (
              filteredVehicles.map((veh) => {
                const isSelected = selectedVehicleId === veh.vehicleId;
                const isGreenPlate =
                  veh.plateNumber.length >= 8 ||
                  veh.plateNumber.includes('D') ||
                  veh.plateNumber.includes('F');
                const isLowVoltage = veh.voltage !== undefined && veh.voltage < 11.5;
                const speed = veh.speed ?? 0;

                // 状态指示点
                let badgeStatus: 'success' | 'processing' | 'error' | 'default' = 'default';
                if (veh.status === 'ALARM') {
                  badgeStatus = 'error';
                } else if (speed > 0) {
                  badgeStatus = 'processing';
                } else if (veh.status === 'ONLINE') {
                  badgeStatus = 'success';
                } else {
                  badgeStatus = 'default';
                }

                return (
                  <div
                    key={veh.vehicleId}
                    onClick={() => handleSelectVehicleItem(veh)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 6,
                      cursor: 'pointer',
                      border: isSelected ? '1.5px solid #1677ff' : '1px solid #f1f5f9',
                      background: isSelected ? '#f0f7ff' : '#ffffff',
                      boxShadow: isSelected
                        ? '0 2px 8px rgba(22, 119, 255, 0.12)'
                        : '0 1px 2px rgba(0, 0, 0, 0.02)',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {/* 卡片首行：车牌 + 在线标识 + 实时车速 */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 4,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Tag
                          color={isGreenPlate ? 'green' : 'blue'}
                          style={{
                            margin: 0,
                            fontWeight: 600,
                            letterSpacing: '0.5px',
                            borderRadius: 4,
                          }}
                        >
                          {veh.plateNumber}
                        </Tag>
                        <Badge status={badgeStatus} />
                      </div>

                      <Text
                        strong
                        style={{
                          fontSize: 13,
                          color: speed > 0 ? '#1677ff' : '#64748b',
                        }}
                      >
                        {formatSpeed(speed)}
                      </Text>
                    </div>

                    {/* 卡片次行：品牌车型与设备编号 */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 4,
                      }}
                    >
                      <Text
                        ellipsis
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: '#1e293b',
                          maxWidth: 160,
                        }}
                      >
                        {veh.brand} {veh.modelName}
                      </Text>
                      <Text
                        type="secondary"
                        style={{ fontSize: 11, fontFamily: 'monospace' }}
                      >
                        {veh.deviceNo}
                      </Text>
                    </div>

                    {/* 卡片末行：电瓶电压 + 上报时间 */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 11,
                        color: '#94a3b8',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {isLowVoltage ? (
                          <Tag
                            color="error"
                            style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '18px' }}
                          >
                            欠压 {veh.voltage}V
                          </Tag>
                        ) : veh.voltage !== undefined ? (
                          <span style={{ color: '#475569' }}>电瓶: {veh.voltage}V</span>
                        ) : null}

                        {veh.status === 'ALARM' && (
                          <Tag
                            color="red"
                            style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '18px' }}
                          >
                            告警 {veh.alarmCount ?? 1}
                          </Tag>
                        )}
                      </div>

                      <span title={veh.lastReportTime}>
                        {veh.lastReportTime ? veh.lastReportTime.slice(11, 19) : '--:--:--'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>

      {/* ================= 右侧：MapContainer 高性能 GIS 地图大屏 ================= */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          height: '100%',
          position: 'relative',
          borderRadius: 8,
          overflow: 'hidden',
          border: '1px solid #e2e8f0',
        }}
      >
        <MapContainer
          vehicles={mapMarkers}
          selectedVehicleId={selectedVehicleId || undefined}
          onSelectVehicle={(marker) => {
            setSelectedVehicleId(marker ? marker.id : null);
          }}
          onTriggerCommand={handleTriggerCommand}
          onViewTrack={handleViewTrack}
          center={mapCenter}
          zoom={mapZoom}
          height="100%"
        />
      </div>
    </div>
  );
};
