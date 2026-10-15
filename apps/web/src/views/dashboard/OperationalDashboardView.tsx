import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Row,
  Col,
  Card,
  Typography,
  Space,
  Tag,
  Badge,
  Button,
  Segmented,
  Switch,
  Tooltip,
  Progress,
  Spin,
  Alert,
} from 'antd';
import {
  DashboardOutlined,
  ReloadOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  ArrowUpOutlined,
  CarOutlined,
  ControlOutlined,
  AlertOutlined,
  UserOutlined,
  CloudUploadOutlined,
  ThunderboltOutlined,
  AimOutlined,
  CompassOutlined,
  DisconnectOutlined,
  PhoneOutlined,
  SafetyCertificateOutlined,
  SoundOutlined,
  RightOutlined,
} from '@ant-design/icons';
import {
  type DashboardSnapshotDto,
  type DashboardStreamItem,
  type DashboardTimeRange,
  type HourlyTrendPoint,
  generateMockRealtimeEvent,
} from './dashboard-core.ts';
import {
  fetchDashboardSnapshotApi,
  appendDashboardStreamEvent,
} from '../../api/dashboard.ts';
import { useNavTabsStore } from '../../store/useNavTabsStore.ts';
import { RoutePath, findRouteByPath } from '../../router/routes.ts';

const { Title, Text } = Typography;

/**
 * 8 大告警类型元数据映射 (展示于告警面板底部微图)
 */
const ALARM_TYPE_ITEMS = [
  { type: 'SOS', label: '车主紧急呼救', count: 1, level: 'P0', color: '#eb2f96', icon: <PhoneOutlined /> },
  { type: 'POWER_CUT', label: '主电源剪线', count: 1, level: 'P0', color: '#cf1322', icon: <DisconnectOutlined /> },
  { type: 'TOW_AWAY', label: '异常拖车位移', count: 1, level: 'P0', color: '#f5222d', icon: <CarOutlined /> },
  { type: 'LOW_BATTERY', label: '蓄电池欠压', count: 42, level: 'P1', color: '#fa8c16', icon: <ThunderboltOutlined /> },
  { type: 'VIBRATION', label: '车身异常震动', count: 28, level: 'P1', color: '#fa541c', icon: <AlertOutlined /> },
  { type: 'GEOFENCE_IN', label: '驶入禁入围栏', count: 18, level: 'P1', color: '#722ed1', icon: <CompassOutlined /> },
  { type: 'GEOFENCE_OUT', label: '驶出运营围栏', count: 15, level: 'P1', color: '#13c2c2', icon: <AimOutlined /> },
  { type: 'OVERSPEED', label: '运营超速预警', count: 36, level: 'P2', color: '#1677ff', icon: <DashboardOutlined /> },
];

export const OperationalDashboardView: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const openTab = useNavTabsStore((s) => s.openTab);

  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<DashboardSnapshotDto | null>(null);
  const [timeRange, setTimeRange] = useState<DashboardTimeRange>('TODAY');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoveredTrendIndex, setHoveredTrendIndex] = useState<number | null>(null);
  const [hoveredAlarmHour, setHoveredAlarmHour] = useState<string | null>(null);

  // 1. 加载全景大屏快照数据
  const loadDashboardData = useCallback(
    async (range: DashboardTimeRange = timeRange, showSpinner = true) => {
      if (showSpinner) setLoading(true);
      try {
        const data = await fetchDashboardSnapshotApi(range);
        setSnapshot(data);
      } catch (err) {
        console.error('加载运营全景大屏失败:', err);
      } finally {
        if (showSpinner) setLoading(false);
      }
    },
    [timeRange]
  );

  useEffect(() => {
    loadDashboardData(timeRange, true);
  }, [timeRange, loadDashboardData]);

  // 2. 全屏状态监听与切换
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // 3. 自动推流与秒级定时器 (每 10s 动态推流一条新事件并微调数据)
  useEffect(() => {
    if (!autoRefresh) return;

    const timer = setInterval(() => {
      const newEvent = generateMockRealtimeEvent();
      appendDashboardStreamEvent(newEvent);

      setSnapshot((prev) => {
        if (!prev) return prev;
        const updatedStream = [newEvent, ...prev.realtimeStream.filter((i) => i.id !== newEvent.id)].slice(0, 30);
        return {
          ...prev,
          realtimeStream: updatedStream,
          updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
          kpi: {
            ...prev.kpi,
            todayCommands: prev.kpi.todayCommands + (newEvent.type === 'COMMAND' ? 1 : 0),
            todayAlarms: prev.kpi.todayAlarms + (newEvent.type === 'ALARM' ? 1 : 0),
          },
        };
      });
    }, 10000);

    return () => clearInterval(timer);
  }, [autoRefresh]);

  // 4. 一键直达业务页面跳转
  const handleNavigate = (targetRoute?: string) => {
    if (!targetRoute) return;
    const route = findRouteByPath(targetRoute);
    if (route) {
      openTab({
        key: route.path,
        title: route.title,
        closable: route.path !== RoutePath.DASHBOARD,
        icon: route.icon,
      });
    }
  };

  // 5. 面积折线图计算辅助函数 (Panel 1)
  const trendMetrics = useMemo(() => {
    if (!snapshot || !snapshot.hourlyTrend || snapshot.hourlyTrend.length === 0) {
      return null;
    }
    const points = snapshot.hourlyTrend;
    const width = 640;
    const height = 210;
    const padLeft = 45;
    const padRight = 15;
    const padTop = 20;
    const padBottom = 28;

    const chartW = width - padLeft - padRight;
    const chartH = height - padTop - padBottom;
    const maxVal = 13000;

    const getX = (index: number) => padLeft + (index / (points.length - 1)) * chartW;
    const getY = (val: number) => padTop + (1 - Math.min(val, maxVal) / maxVal) * chartH;
    const bottomY = padTop + chartH;

    // 构建在线车辆面积与曲线 Path
    let onlineAreaPath = `M ${getX(0)} ${bottomY}`;
    let onlineLinePath = `M ${getX(0)} ${getY(points[0]!.onlineCount)}`;

    points.forEach((p, idx) => {
      const x = getX(idx);
      const y = getY(p.onlineCount);
      onlineAreaPath += ` L ${x} ${y}`;
      if (idx > 0) onlineLinePath += ` L ${x} ${y}`;
    });
    onlineAreaPath += ` L ${getX(points.length - 1)} ${bottomY} Z`;

    // 构建行驶车辆面积与曲线 Path
    let movingAreaPath = `M ${getX(0)} ${bottomY}`;
    let movingLinePath = `M ${getX(0)} ${getY(points[0]!.movingCount)}`;

    points.forEach((p, idx) => {
      const x = getX(idx);
      const y = getY(p.movingCount);
      movingAreaPath += ` L ${x} ${y}`;
      if (idx > 0) movingLinePath += ` L ${x} ${y}`;
    });
    movingAreaPath += ` L ${getX(points.length - 1)} ${bottomY} Z`;

    return {
      points,
      width,
      height,
      padLeft,
      padTop,
      chartW,
      chartH,
      bottomY,
      getX,
      getY,
      onlineAreaPath,
      onlineLinePath,
      movingAreaPath,
      movingLinePath,
    };
  }, [snapshot]);

  // 6. 动力构型 Donut 环形图计算 (Panel 4)
  const donutArcs = useMemo(() => {
    if (!snapshot) return null;
    const { EV, PHEV, REEV, ICE } = snapshot.fleetComposition.powertrainDistribution;
    const total = EV + PHEV + REEV + ICE || 1;

    const r = 58;
    const circumference = 2 * Math.PI * r;

    const configs = [
      { key: 'EV', label: '纯电动 (EV)', count: EV, color: '#1677ff' },
      { key: 'PHEV', label: '插电混动 (PHEV)', count: PHEV, color: '#52c41a' },
      { key: 'REEV', label: '增程式 (REEV)', count: REEV, color: '#722ed1' },
      { key: 'ICE', label: '燃油动力 (ICE)', count: ICE, color: '#fa8c16' },
    ];

    let currentOffset = 0;
    const arcs = configs.map((c) => {
      const ratio = c.count / total;
      const strokeDash = ratio * circumference;
      const offset = currentOffset;
      currentOffset += strokeDash;
      const pct = (ratio * 100).toFixed(1);
      return {
        ...c,
        percentage: pct,
        strokeDasharray: `${strokeDash} ${circumference}`,
        strokeDashoffset: -offset,
      };
    });

    return { arcs, total, circumference, r };
  }, [snapshot]);

  if (!snapshot && loading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 0' }}>
        <Spin size="large" tip="正在初始化全网运营全景大屏..." />
      </div>
    );
  }

  const kpi = snapshot?.kpi;

  // 在线率状态色标
  const onlineRateColor =
    !kpi
      ? '#1677ff'
      : kpi.onlineRate >= 90
      ? '#52c41a'
      : kpi.onlineRate >= 80
      ? '#1677ff'
      : '#fa8c16';

  const onlineRateText =
    !kpi
      ? '-'
      : kpi.onlineRate >= 90
      ? '运行稳健'
      : kpi.onlineRate >= 80
      ? '在线正常'
      : '偏低告警';

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        backgroundColor: '#f5f7fa',
        minHeight: '100%',
        paddingBottom: 16,
      }}
    >
      {/* 顶部综合工具条 (Header Bar) */}
      <Card
        styles={{ body: { padding: '12px 20px' } }}
        style={{
          borderRadius: 8,
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          border: '1px solid #e8e8e8',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          {/* 左侧：大屏标题与秒级脉冲徽标 */}
          <Space size="middle" align="center">
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                backgroundColor: '#1677ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 20,
              }}
            >
              <DashboardOutlined />
            </div>
            <div>
              <Space size="small" align="center">
                <Title level={4} style={{ margin: 0, fontWeight: 600 }}>
                  运营数据全景大屏与统计分析
                </Title>
                <Tag color="geekblue" style={{ borderRadius: 10, margin: 0 }}>
                  全网运营态势
                </Tag>
              </Space>
              <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginTop: 2 }}>
                <Badge status="processing" color="#52c41a" style={{ marginRight: 6 }} />
                秒级动态推流中 · 最后同步时间: {snapshot?.updatedAt ?? '-'}
              </div>
            </div>
          </Space>

          {/* 右侧：时间跨度切换 + 自动推流 Switch + 刷新 + 全屏 */}
          <Space size="middle" align="center">
            <Segmented<DashboardTimeRange>
              value={timeRange}
              onChange={(val) => setTimeRange(val)}
              options={[
                { label: '今日实时', value: 'TODAY' },
                { label: '近 7 天', value: 'LAST_7_DAYS' },
                { label: '近 30 天', value: 'LAST_30_DAYS' },
              ]}
              style={{ fontWeight: 500 }}
            />

            <Space size={6} align="center">
              <Text type="secondary" style={{ fontSize: 13 }}>
                动态推流
              </Text>
              <Switch
                checked={autoRefresh}
                onChange={setAutoRefresh}
                checkedChildren="开"
                unCheckedChildren="关"
              />
            </Space>

            <Tooltip title="立即刷新数据">
              <Button
                icon={<ReloadOutlined spin={loading} />}
                onClick={() => loadDashboardData(timeRange, true)}
                loading={loading}
              >
                刷新
              </Button>
            </Tooltip>

            <Tooltip title={isFullscreen ? '退出全屏模式' : '全屏沉浸大屏'}>
              <Button
                type="text"
                icon={
                  isFullscreen ? (
                    <FullscreenExitOutlined style={{ fontSize: 16 }} />
                  ) : (
                    <FullscreenOutlined style={{ fontSize: 16 }} />
                  )
                }
                onClick={toggleFullscreen}
              />
            </Tooltip>
          </Space>
        </div>
      </Card>

      {/* 6 大核心 KPI 指标微卡片 (Micro KPI Cards) */}
      <Row gutter={[16, 16]}>
        {/* KPI 1: 纳管车辆总数 */}
        <Col xs={24} sm={12} md={8} lg={4}>
          <Card
            styles={{ body: { padding: '16px' } }}
            style={{ borderRadius: 8, height: '100%', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Text type="secondary" style={{ fontSize: 13 }}>
                纳管车辆规模
              </Text>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  backgroundColor: '#e6f4ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#1677ff',
                }}
              >
                <CarOutlined />
              </div>
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, margin: '8px 0 4px', color: 'rgba(0,0,0,0.88)' }}>
              {kpi ? kpi.totalVehicles.toLocaleString() : '-'}
            </div>
            {/* 微型双色比例条 */}
            <div
              style={{
                height: 6,
                backgroundColor: '#e8e8e8',
                borderRadius: 3,
                overflow: 'hidden',
                display: 'flex',
                margin: '6px 0 8px',
              }}
            >
              <div style={{ width: `${kpi?.onlineRate ?? 0}%`, backgroundColor: '#52c41a' }} />
              <div style={{ width: `${100 - (kpi?.onlineRate ?? 0)}%`, backgroundColor: '#d9d9d9' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
              <span>在线 {kpi ? kpi.onlineVehicles.toLocaleString() : '-'}</span>
              <Tag color="success" style={{ margin: 0, padding: '0 4px', fontSize: 11 }}>
                <ArrowUpOutlined /> +{kpi?.vehicleGrowthRate ?? 0}%
              </Tag>
            </div>
          </Card>
        </Col>

        {/* KPI 2: 实时在线率 */}
        <Col xs={24} sm={12} md={8} lg={4}>
          <Card
            styles={{ body: { padding: '16px' } }}
            style={{ borderRadius: 8, height: '100%', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Text type="secondary" style={{ fontSize: 13 }}>
                实时全网在线率
              </Text>
              <Tag color={onlineRateColor} style={{ margin: 0, padding: '0 6px', fontWeight: 600 }}>
                {onlineRateText}
              </Tag>
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, margin: '8px 0 4px', color: onlineRateColor }}>
              {kpi ? `${kpi.onlineRate}%` : '-'}
            </div>
            <Progress
              percent={kpi?.onlineRate ?? 0}
              showInfo={false}
              strokeColor={onlineRateColor}
              size={['100%', 6]}
              style={{ margin: '6px 0 8px' }}
            />
            <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
              离线车辆: {kpi ? kpi.offlineVehicles.toLocaleString() : '-'} 辆
            </div>
          </Card>
        </Col>

        {/* KPI 3: 今日车控下发量 */}
        <Col xs={24} sm={12} md={8} lg={4}>
          <Card
            styles={{ body: { padding: '16px' } }}
            style={{ borderRadius: 8, height: '100%', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Text type="secondary" style={{ fontSize: 13 }}>
                今日车控吞吐量
              </Text>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  backgroundColor: '#f6ffed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#52c41a',
                }}
              >
                <ControlOutlined />
              </div>
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, margin: '8px 0 4px', color: 'rgba(0,0,0,0.88)' }}>
              {kpi ? kpi.todayCommands.toLocaleString() : '-'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0 8px' }}>
              <Tag color="success" style={{ margin: 0, padding: '0 6px', fontSize: 12 }}>
                成功率 {kpi ? `${kpi.commandSuccessRate}%` : '-'}
              </Tag>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
              <span>环比增长</span>
              <span style={{ color: '#52c41a', fontWeight: 600 }}>
                +{kpi?.commandGrowthRate ?? 0}%
              </span>
            </div>
          </Card>
        </Col>

        {/* KPI 4: 今日异常告警量 */}
        <Col xs={24} sm={12} md={8} lg={4}>
          <Card
            styles={{ body: { padding: '16px' } }}
            style={{ borderRadius: 8, height: '100%', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Text type="secondary" style={{ fontSize: 13 }}>
                今日工况告警数
              </Text>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  backgroundColor: '#fff1f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#cf1322',
                }}
              >
                <AlertOutlined />
              </div>
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, margin: '8px 0 4px', color: 'rgba(0,0,0,0.88)' }}>
              {kpi ? kpi.todayAlarms.toLocaleString() : '-'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0 8px' }}>
              <Tag color="blue" style={{ margin: 0, padding: '0 6px', fontSize: 12 }}>
                处置闭环 {kpi ? `${kpi.alarmProcessRate}%` : '-'}
              </Tag>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: 'rgba(0,0,0,0.45)' }}>紧急 (P0)</span>
              <Tag color="error" style={{ margin: 0, padding: '0 6px', fontWeight: 700 }}>
                {kpi?.alarmCriticalCount ?? 0} 起高危
              </Tag>
            </div>
          </Card>
        </Col>

        {/* KPI 5: 活跃车主用户数 */}
        <Col xs={24} sm={12} md={8} lg={4}>
          <Card
            styles={{ body: { padding: '16px' } }}
            style={{ borderRadius: 8, height: '100%', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Text type="secondary" style={{ fontSize: 13 }}>
                活跃车主用户数
              </Text>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  backgroundColor: '#f9f0ff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#722ed1',
                }}
              >
                <UserOutlined />
              </div>
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, margin: '8px 0 4px', color: 'rgba(0,0,0,0.88)' }}>
              {kpi ? kpi.activeUsers.toLocaleString() : '-'}
            </div>
            <div style={{ margin: '6px 0 8px', fontSize: 12, color: 'rgba(0,0,0,0.65)' }}>
              车主渗透率: <span style={{ fontWeight: 600 }}>{kpi?.userActiveRate ?? 0}%</span>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
              月度活跃稳步上升
            </div>
          </Card>
        </Col>

        {/* KPI 6: 固件 OTA 批次量 */}
        <Col xs={24} sm={12} md={8} lg={4}>
          <Card
            styles={{ body: { padding: '16px' } }}
            style={{ borderRadius: 8, height: '100%', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Text type="secondary" style={{ fontSize: 13 }}>
                固件 OTA 升级中
              </Text>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  backgroundColor: '#e6fffb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#13c2c2',
                }}
              >
                <CloudUploadOutlined />
              </div>
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, margin: '8px 0 4px', color: 'rgba(0,0,0,0.88)' }}>
              {kpi ? `${kpi.activeOtaPlans} 个批次` : '-'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0 8px' }}>
              <Badge status="processing" color="#1677ff" />
              <span style={{ fontSize: 12, color: '#1677ff', fontWeight: 600 }}>
                {kpi ? `${kpi.otaUpgradingVehicles} 辆在线升级` : '-'}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
              分批调度稳步推进
            </div>
          </Card>
        </Col>
      </Row>

      {/* 4 大核心可视化面板 (Pure Native SVG/CSS 架构) */}
      <Row gutter={[16, 16]}>
        {/* 图表 1: 24 小时车辆在线与行驶趋势面积折线图 */}
        <Col xs={24} lg={14}>
          <Card
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space size="small">
                  <span style={{ fontWeight: 600 }}>24小时车辆在线与行驶态势折线面积图</span>
                  <Tag color="blue" style={{ borderRadius: 4 }}>
                    24h 时序走势
                  </Tag>
                </Space>
                <Space size="middle" style={{ fontSize: 12 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 12,
                        height: 3,
                        backgroundColor: '#1677ff',
                        borderRadius: 2,
                      }}
                    />
                    在线车辆
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 12,
                        height: 3,
                        backgroundColor: '#52c41a',
                        borderRadius: 2,
                      }}
                    />
                    行驶车辆
                  </span>
                </Space>
              </div>
            }
            styles={{ body: { padding: '16px 20px', position: 'relative' } }}
            style={{ borderRadius: 8, height: '100%', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
          >
            {trendMetrics ? (
              <div style={{ width: '100%', position: 'relative' }}>
                <svg
                  viewBox={`0 0 ${trendMetrics.width} ${trendMetrics.height}`}
                  style={{ width: '100%', height: 230, overflow: 'visible' }}
                  onMouseLeave={() => setHoveredTrendIndex(null)}
                  onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const relX = (e.clientX - rect.left) * (trendMetrics.width / rect.width);
                    const idx = Math.max(
                      0,
                      Math.min(
                        23,
                        Math.round(
                          ((relX - trendMetrics.padLeft) / trendMetrics.chartW) * 23
                        )
                      )
                    );
                    setHoveredTrendIndex(idx);
                  }}
                >
                  <defs>
                    <linearGradient id="onlineGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1677ff" stopOpacity="0.4" />
                      <stop offset="100%" stopColor="#1677ff" stopOpacity="0.02" />
                    </linearGradient>
                    <linearGradient id="movingGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#52c41a" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="#52c41a" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>

                  {/* 水平辅助线与 Y 轴刻度 */}
                  {[0, 3000, 6000, 9000, 12000].map((v) => {
                    const y = trendMetrics.getY(v);
                    return (
                      <g key={v}>
                        <line
                          x1={trendMetrics.padLeft}
                          y1={y}
                          x2={trendMetrics.padLeft + trendMetrics.chartW}
                          y2={y}
                          stroke="#e8e8e8"
                          strokeDasharray="3 3"
                        />
                        <text
                          x={trendMetrics.padLeft - 8}
                          y={y + 4}
                          textAnchor="end"
                          fill="rgba(0,0,0,0.4)"
                          fontSize="10"
                        >
                          {v >= 1000 ? `${v / 1000}k` : v}
                        </text>
                      </g>
                    );
                  })}

                  {/* 面积与折线图 */}
                  <path d={trendMetrics.onlineAreaPath} fill="url(#onlineGradient)" />
                  <path
                    d={trendMetrics.onlineLinePath}
                    fill="none"
                    stroke="#1677ff"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />

                  <path d={trendMetrics.movingAreaPath} fill="url(#movingGradient)" />
                  <path
                    d={trendMetrics.movingLinePath}
                    fill="none"
                    stroke="#52c41a"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />

                  {/* X 轴刻度文字 */}
                  {['00', '03', '06', '09', '12', '15', '18', '21', '23'].map((hourStr) => {
                    const hourIdx = parseInt(hourStr, 10);
                    const x = trendMetrics.getX(hourIdx);
                    return (
                      <text
                        key={hourStr}
                        x={x}
                        y={trendMetrics.bottomY + 18}
                        textAnchor="middle"
                        fill="rgba(0,0,0,0.45)"
                        fontSize="11"
                      >
                        {hourStr}:00
                      </text>
                    );
                  })}

                  {/* 鼠标悬浮指示标与高亮点 */}
                  {hoveredTrendIndex !== null && (
                    <g>
                      <line
                        x1={trendMetrics.getX(hoveredTrendIndex)}
                        y1={trendMetrics.padTop}
                        x2={trendMetrics.getX(hoveredTrendIndex)}
                        y2={trendMetrics.bottomY}
                        stroke="#1677ff"
                        strokeWidth="1.5"
                        strokeDasharray="4 4"
                      />
                      {/* 在线车辆圆点 */}
                      <circle
                        cx={trendMetrics.getX(hoveredTrendIndex)}
                        cy={trendMetrics.getY(
                          trendMetrics.points[hoveredTrendIndex]!.onlineCount
                        )}
                        r="4.5"
                        fill="#1677ff"
                        stroke="#ffffff"
                        strokeWidth="2"
                      />
                      {/* 行驶车辆圆点 */}
                      <circle
                        cx={trendMetrics.getX(hoveredTrendIndex)}
                        cy={trendMetrics.getY(
                          trendMetrics.points[hoveredTrendIndex]!.movingCount
                        )}
                        r="4"
                        fill="#52c41a"
                        stroke="#ffffff"
                        strokeWidth="2"
                      />
                    </g>
                  )}
                </svg>

                {/* 悬浮交互式 Tooltip 浮层 */}
                {hoveredTrendIndex !== null && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 10,
                      left: Math.min(
                        trendMetrics.chartW - 60,
                        Math.max(50, trendMetrics.getX(hoveredTrendIndex) - 80)
                      ),
                      backgroundColor: 'rgba(0, 21, 41, 0.9)',
                      color: '#fff',
                      padding: '8px 12px',
                      borderRadius: 6,
                      fontSize: 12,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                      pointerEvents: 'none',
                      zIndex: 10,
                    }}
                  >
                    <div style={{ fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.15)', paddingBottom: 4, marginBottom: 4 }}>
                      {trendMetrics.points[hoveredTrendIndex]!.hour}:00 态势快照
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: '#91caff' }}>
                      <span>在线车辆:</span>
                      <b>{trendMetrics.points[hoveredTrendIndex]!.onlineCount.toLocaleString()} 辆 ({trendMetrics.points[hoveredTrendIndex]!.onlineRate}%)</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: '#95de64' }}>
                      <span>行驶中车辆:</span>
                      <b>{trendMetrics.points[hoveredTrendIndex]!.movingCount.toLocaleString()} 辆</b>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: '#d9d9d9' }}>
                      <span>静止/怠速车辆:</span>
                      <b>{trendMetrics.points[hoveredTrendIndex]!.idleCount.toLocaleString()} 辆</b>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(0,0,0,0.25)' }}>
                暂无走势数据
              </div>
            )}
          </Card>
        </Col>

        {/* 图表 2: 13 类高频车控指令下发排行横向柱状图 */}
        <Col xs={24} lg={10}>
          <Card
            title={
              <Space size="small">
                <span style={{ fontWeight: 600 }}>13类高频车控指令调用排行</span>
                <Tag color="cyan">实时下发频次</Tag>
              </Space>
            }
            extra={
              <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                成功率与占比
              </span>
            }
            styles={{ body: { padding: '12px 20px', maxHeight: 310, overflowY: 'auto' } }}
            style={{ borderRadius: 8, height: '100%', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {snapshot?.commandRanking.map((item, index) => {
                const rankNumber = index + 1;
                const isTop3 = rankNumber <= 3;
                const rankBadgeBg =
                  rankNumber === 1
                    ? '#faad14'
                    : rankNumber === 2
                    ? '#8c8c8c'
                    : rankNumber === 3
                    ? '#d48806'
                    : '#f0f0f0';
                const rankColor = isTop3 ? '#fff' : 'rgba(0,0,0,0.65)';

                return (
                  <div
                    key={item.commandCode}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 12,
                      padding: '2px 0',
                    }}
                  >
                    {/* 排名角标 */}
                    <span
                      style={{
                        display: 'inline-block',
                        width: 18,
                        height: 18,
                        borderRadius: 4,
                        backgroundColor: rankBadgeBg,
                        color: rankColor,
                        fontSize: 11,
                        fontWeight: 700,
                        textAlign: 'center',
                        lineHeight: '18px',
                        flexShrink: 0,
                      }}
                    >
                      {rankNumber}
                    </span>

                    {/* 指令名称与分类 */}
                    <span
                      style={{
                        width: 80,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        fontWeight: 500,
                        flexShrink: 0,
                      }}
                      title={item.commandName}
                    >
                      {item.commandName}
                    </span>

                    {/* 横向比例条 */}
                    <div
                      style={{
                        flex: 1,
                        height: 12,
                        backgroundColor: '#f5f5f5',
                        borderRadius: 6,
                        overflow: 'hidden',
                        position: 'relative',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.max(4, Math.round((item.count / (snapshot.commandRanking[0]?.count || 1)) * 100))}%`,
                          backgroundColor:
                            item.category === 'DOOR_BODY'
                              ? '#1677ff'
                              : item.category === 'CABIN_CLIMATE'
                              ? '#13c2c2'
                              : item.category === 'POWER_FIND'
                              ? '#722ed1'
                              : '#fa8c16',
                          borderRadius: 6,
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>

                    {/* 调用次数 */}
                    <span
                      style={{
                        width: 65,
                        textAlign: 'right',
                        fontWeight: 600,
                        color: 'rgba(0,0,0,0.85)',
                        flexShrink: 0,
                      }}
                    >
                      {item.count.toLocaleString()}
                    </span>

                    {/* 成功率 Tag */}
                    <Tag
                      color={item.successRate >= 99.0 ? 'success' : item.successRate >= 98.0 ? 'processing' : 'warning'}
                      style={{ margin: 0, padding: '0 4px', fontSize: 11, flexShrink: 0 }}
                    >
                      {item.successRate}%
                    </Tag>
                  </div>
                );
              })}
            </div>
          </Card>
        </Col>

        {/* 图表 3: 24 小时告警态势堆叠条形图与 8 大告警类型微图 */}
        <Col xs={24} lg={14}>
          <Card
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space size="small">
                  <span style={{ fontWeight: 600 }}>24小时告警态势时序堆叠与 8 大类型分布</span>
                  <Tag color="volcano">三级严重度</Tag>
                </Space>
                <Space size="middle" style={{ fontSize: 12 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#cf1322' }} />
                    紧急 P0
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#fa8c16' }} />
                    警告 P1
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#1677ff' }} />
                    提示 P2
                  </span>
                </Space>
              </div>
            }
            styles={{ body: { padding: '16px 20px' } }}
            style={{ borderRadius: 8, height: '100%', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
          >
            {/* 上半部分：24 堆叠条形图 */}
            <div style={{ width: '100%', marginBottom: 16 }}>
              <svg
                viewBox="0 0 640 140"
                style={{ width: '100%', height: 140, overflow: 'visible' }}
                onMouseLeave={() => setHoveredAlarmHour(null)}
              >
                {/* 水平辅助线 */}
                {[0, 5, 10, 15].map((val) => {
                  const y = 110 - (val / 15) * 95;
                  return (
                    <line
                      key={val}
                      x1={35}
                      y1={y}
                      x2={630}
                      y2={y}
                      stroke="#f0f0f0"
                      strokeDasharray="2 2"
                    />
                  );
                })}

                {/* 24 小时堆叠条 */}
                {snapshot?.alarmDistribution.map((item, idx) => {
                  const maxSlot = 15;
                  const x = 40 + idx * 24.5;
                  const barWidth = 14;
                  const baseLine = 110;

                  const criticalH = (item.critical / maxSlot) * 95;
                  const warningH = (item.warning / maxSlot) * 95;
                  const infoH = (item.info / maxSlot) * 95;

                  const yCritical = baseLine - criticalH;
                  const yWarning = yCritical - warningH;
                  const yInfo = yWarning - infoH;

                  const isHovered = hoveredAlarmHour === item.hour;

                  return (
                    <g
                      key={item.hour}
                      onMouseEnter={() => setHoveredAlarmHour(item.hour)}
                      style={{ cursor: 'pointer' }}
                    >
                      {/* 背景轻量悬浮柱 */}
                      <rect
                        x={x - 2}
                        y={10}
                        width={barWidth + 4}
                        height={100}
                        fill={isHovered ? 'rgba(22, 119, 255, 0.08)' : 'transparent'}
                        rx="2"
                      />

                      {/* 紧急 P0 (红) */}
                      {criticalH > 0 && (
                        <rect
                          x={x}
                          y={yCritical}
                          width={barWidth}
                          height={criticalH}
                          fill="#cf1322"
                          rx="1"
                        />
                      )}

                      {/* 警告 P1 (橙) */}
                      {warningH > 0 && (
                        <rect
                          x={x}
                          y={yWarning}
                          width={barWidth}
                          height={warningH}
                          fill="#fa8c16"
                          rx="1"
                        />
                      )}

                      {/* 提示 P2 (蓝) */}
                      {infoH > 0 && (
                        <rect
                          x={x}
                          y={yInfo}
                          width={barWidth}
                          height={infoH}
                          fill="#1677ff"
                          rx="1"
                        />
                      )}

                      {/* X 轴小时标签 (隔 3 小时展示一个) */}
                      {idx % 3 === 0 && (
                        <text
                          x={x + barWidth / 2}
                          y={baseLine + 16}
                          textAnchor="middle"
                          fill="rgba(0,0,0,0.45)"
                          fontSize="10"
                        >
                          {item.hour}:00
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>

              {/* 悬浮提示信息卡片 */}
              {hoveredAlarmHour && (
                <div
                  style={{
                    marginTop: 4,
                    padding: '4px 10px',
                    borderRadius: 4,
                    backgroundColor: '#fafafa',
                    border: '1px solid #f0f0f0',
                    fontSize: 12,
                    display: 'flex',
                    gap: 16,
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{hoveredAlarmHour}:00 时段告警明细:</span>
                  {(() => {
                    const found = snapshot?.alarmDistribution.find((a) => a.hour === hoveredAlarmHour);
                    if (!found) return null;
                    return (
                      <>
                        <span style={{ color: '#cf1322' }}>紧急 P0: <b>{found.critical}</b> 起</span>
                        <span style={{ color: '#fa8c16' }}>警告 P1: <b>{found.warning}</b> 起</span>
                        <span style={{ color: '#1677ff' }}>提示 P2: <b>{found.info}</b> 起</span>
                        <span style={{ color: 'rgba(0,0,0,0.65)' }}>总计: <b>{found.total}</b> 起</span>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* 下半部分：8 大告警类型占比微图网格 */}
            <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(0,0,0,0.65)', marginBottom: 8 }}>
                8 大告警类型累计发生分布 (闭环与预警)
              </div>
              <Row gutter={[8, 8]}>
                {ALARM_TYPE_ITEMS.map((item) => (
                  <Col xs={12} sm={6} key={item.type}>
                    <div
                      style={{
                        padding: '6px 10px',
                        backgroundColor: '#fafafa',
                        borderRadius: 6,
                        border: '1px solid #f0f0f0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Space size={6} align="center">
                        <span style={{ color: item.color, fontSize: 14 }}>{item.icon}</span>
                        <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.85)' }}>{item.label}</span>
                      </Space>
                      <Tag
                        color={item.level === 'P0' ? 'error' : item.level === 'P1' ? 'warning' : 'processing'}
                        style={{ margin: 0, padding: '0 4px', fontSize: 11 }}
                      >
                        {item.count}
                      </Tag>
                    </div>
                  </Col>
                ))}
              </Row>
            </div>
          </Card>
        </Col>

        {/* 图表 4: 动力构型环形图 (Donut Chart) 与 Top 5 固件版本大盘 */}
        <Col xs={24} lg={10}>
          <Card
            title={
              <Space size="small">
                <span style={{ fontWeight: 600 }}>车辆动力架构与固件版本大盘</span>
                <Tag color="purple">资产构型</Tag>
              </Space>
            }
            styles={{ body: { padding: '16px 20px' } }}
            style={{ borderRadius: 8, height: '100%', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}
          >
            <Row gutter={[16, 16]} align="middle">
              {/* 左侧：原生 SVG Donut 环形图 */}
              <Col xs={24} sm={12}>
                <div style={{ position: 'relative', width: 150, height: 150, margin: '0 auto' }}>
                  <svg viewBox="0 0 160 160" style={{ width: '100%', height: '100%' }}>
                    {/* 底层灰色底环 */}
                    <circle
                      cx="80"
                      cy="80"
                      r="58"
                      fill="none"
                      stroke="#f5f5f5"
                      strokeWidth="20"
                    />

                    {/* 4 段动力弧线 */}
                    {donutArcs?.arcs.map((arc) => (
                      <circle
                        key={arc.key}
                        cx="80"
                        cy="80"
                        r={donutArcs.r}
                        fill="none"
                        stroke={arc.color}
                        strokeWidth="20"
                        strokeDasharray={arc.strokeDasharray}
                        strokeDashoffset={arc.strokeDashoffset}
                        transform="rotate(-90 80 80)"
                        style={{ transition: 'stroke-dasharray 0.5s ease' }}
                      />
                    ))}
                  </svg>
                  {/* 环形中央统计总数 */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      pointerEvents: 'none',
                    }}
                  >
                    <div style={{ fontSize: 17, fontWeight: 700, color: 'rgba(0,0,0,0.88)' }}>
                      {donutArcs ? donutArcs.total.toLocaleString() : '-'}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)' }}>总规模(辆)</div>
                  </div>
                </div>

                {/* 环形图图例 */}
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {donutArcs?.arcs.map((item) => (
                    <div
                      key={item.key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 12,
                      }}
                    >
                      <Space size={6} align="center">
                        <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: item.color }} />
                        <span style={{ color: 'rgba(0,0,0,0.65)' }}>{item.label}:</span>
                      </Space>
                      <b>{item.percentage}% ({item.count.toLocaleString()})</b>
                    </div>
                  ))}
                </div>
              </Col>

              {/* 右侧：Top 5 固件版本覆盖率 */}
              <Col xs={24} sm={12}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(0,0,0,0.85)', marginBottom: 8 }}>
                  Top 5 固件版本覆盖率
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {snapshot?.fleetComposition.topFirmwareVersions.map((v, i) => (
                    <div key={v.version} style={{ fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <Space size={4}>
                          <Tag
                            color={i === 0 ? 'blue' : 'default'}
                            style={{ margin: 0, padding: '0 4px', fontSize: 11, fontWeight: 600 }}
                          >
                            {v.version}
                          </Tag>
                          {i === 0 && <span style={{ fontSize: 11, color: '#1677ff' }}>(主流)</span>}
                        </Space>
                        <span style={{ color: 'rgba(0,0,0,0.65)' }}>
                          {v.percentage}% ({v.count.toLocaleString()}辆)
                        </span>
                      </div>
                      <Progress
                        percent={v.percentage}
                        showInfo={false}
                        strokeColor={i === 0 ? '#1677ff' : '#8c8c8c'}
                        size={['100%', 5]}
                      />
                    </div>
                  ))}
                </div>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>

      {/* 底部实时全景运营事件流水 (Realtime Operations Stream Ticker) */}
      <Card
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space size="small">
              <SoundOutlined style={{ color: '#1677ff' }} />
              <span style={{ fontWeight: 600 }}>实时全网运营动态流水 (Realtime Stream)</span>
              <Badge status="processing" color="#52c41a" text="实时推流" />
            </Space>
            <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
              支持一键跨模块业务直达处置
            </span>
          </div>
        }
        styles={{ body: { padding: '12px 20px', maxHeight: 260, overflowY: 'auto' } }}
        style={{
          borderRadius: 8,
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {snapshot?.realtimeStream.map((item) => {
            const typeColor =
              item.type === 'COMMAND'
                ? 'blue'
                : item.type === 'ALARM'
                ? item.level === 'CRITICAL'
                  ? 'red'
                  : 'orange'
                : item.type === 'OTA'
                ? 'purple'
                : 'green';

            const typeLabel =
              item.type === 'COMMAND'
                ? '车控指令'
                : item.type === 'ALARM'
                ? '告警事件'
                : item.type === 'OTA'
                ? '固件升级'
                : '车辆态势';

            return (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  backgroundColor: '#fafafa',
                  borderRadius: 6,
                  border: '1px solid #f0f0f0',
                  gap: 12,
                }}
              >
                {/* 左侧：时间、类型、标题与正文 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 12,
                      color: 'rgba(0,0,0,0.45)',
                      flexShrink: 0,
                    }}
                  >
                    {item.timestampFormatted}
                  </span>
                  <Tag color={typeColor} style={{ margin: 0, padding: '0 6px', fontSize: 11, flexShrink: 0 }}>
                    {typeLabel}
                  </Tag>
                  <div
                    style={{
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      fontSize: 13,
                    }}
                  >
                    <b style={{ color: 'rgba(0,0,0,0.85)', marginRight: 8 }}>{item.title}</b>
                    <span style={{ color: 'rgba(0,0,0,0.65)' }}>{item.content}</span>
                  </div>
                </div>

                {/* 右侧：一键直达业务按钮 */}
                {item.targetRoute && (
                  <Button
                    type="link"
                    size="small"
                    icon={<RightOutlined />}
                    onClick={() => handleNavigate(item.targetRoute)}
                    style={{ flexShrink: 0, padding: '0 8px' }}
                  >
                    直达业务
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
};

export default OperationalDashboardView;
