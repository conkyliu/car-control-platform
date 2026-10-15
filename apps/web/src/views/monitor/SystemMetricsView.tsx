import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Select,
  Progress,
  Modal,
  Input,
  message,
  Table,
  Spin,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  LineChartOutlined,
  ReloadOutlined,
  CodeOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined,
  ApiOutlined,
  CloudUploadOutlined,
  LockOutlined,
  HddOutlined,
  ClusterOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import {
  type SystemMetricsSnapshotDto,
  type ClusterNodeHealth,
  type ClusterServiceRole,
  type ClusterNodeStatus,
  SEED_SYSTEM_METRICS_SNAPSHOT,
} from './metrics-core.ts';
import { fetchSystemMetricsSnapshotApi } from '../../api/metrics.ts';

const { Title, Text, Paragraph } = Typography;

/**
 * 24小时固定趋势插值数据点（车控 QPS 与 遥测速率）
 */
interface HourlyTrendPoint {
  hour: string;
  commandQps: number;
  telemetryRate: number;
}

const MOCK_HOURLY_TREND: HourlyTrendPoint[] = [
  { hour: '00:00', commandQps: 18, telemetryRate: 450 },
  { hour: '01:00', commandQps: 12, telemetryRate: 380 },
  { hour: '02:00', commandQps: 9, telemetryRate: 320 },
  { hour: '03:00', commandQps: 8, telemetryRate: 310 },
  { hour: '04:00', commandQps: 10, telemetryRate: 340 },
  { hour: '05:00', commandQps: 22, telemetryRate: 490 },
  { hour: '06:00', commandQps: 45, telemetryRate: 980 },
  { hour: '07:00', commandQps: 92, telemetryRate: 1850 },
  { hour: '08:00', commandQps: 185, telemetryRate: 2940 },
  { hour: '09:00', commandQps: 240, telemetryRate: 3200 },
  { hour: '10:00', commandQps: 195, telemetryRate: 2820 },
  { hour: '11:00', commandQps: 170, telemetryRate: 2650 },
  { hour: '12:00', commandQps: 210, telemetryRate: 2900 },
  { hour: '13:00', commandQps: 180, telemetryRate: 2710 },
  { hour: '14:00', commandQps: 175, telemetryRate: 2680 },
  { hour: '15:00', commandQps: 190, telemetryRate: 2850 },
  { hour: '16:00', commandQps: 215, telemetryRate: 3100 },
  { hour: '17:00', commandQps: 260, telemetryRate: 3450 },
  { hour: '18:00', commandQps: 285, telemetryRate: 3620 },
  { hour: '19:00', commandQps: 230, telemetryRate: 3150 },
  { hour: '20:00', commandQps: 180, telemetryRate: 2740 },
  { hour: '21:00', commandQps: 135, telemetryRate: 2100 },
  { hour: '22:00', commandQps: 85, telemetryRate: 1450 },
  { hour: '23:00', commandQps: 42, telemetryRate: 820 },
];

/**
 * 微服务角色色系映射
 */
const ROLE_TAG_MAP: Record<ClusterServiceRole, { color: string; label: string }> = {
  GATEWAY: { color: 'blue', label: 'API 网关' },
  CORE_API: { color: 'geekblue', label: '车控核心' },
  TELEMETRY: { color: 'cyan', label: '遥测摄入' },
  WORKER: { color: 'purple', label: '异步作业' },
  BROKER: { color: 'volcano', label: 'MQTT 中间件' },
  DATABASE: { color: 'gold', label: '持久存储' },
};

export const SystemMetricsView: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<SystemMetricsSnapshotDto>(
    SEED_SYSTEM_METRICS_SNAPSHOT
  );
  const [selectedTenant, setSelectedTenant] = useState<string>('all');
  const [refreshInterval, setRefreshInterval] = useState<number>(10000); // 默认 10 秒
  const [isRawModalOpen, setIsRawModalOpen] = useState(false);
  const [rawSearchKeyword, setRawSearchKeyword] = useState('');
  const [copied, setCopied] = useState(false);
  const [hoveredTrendIndex, setHoveredTrendIndex] = useState<number | null>(null);

  // 加载系统指标快照
  const loadMetricsData = useCallback(
    async (showSpinner = true) => {
      if (showSpinner) setLoading(true);
      try {
        const tenantArg = selectedTenant === 'all' ? undefined : selectedTenant;
        const data = await fetchSystemMetricsSnapshotApi(tenantArg);
        setSnapshot(data);
      } catch (err) {
        console.error('加载系统监控快照失败:', err);
      } finally {
        if (showSpinner) setLoading(false);
      }
    },
    [selectedTenant]
  );

  useEffect(() => {
    loadMetricsData(true);
  }, [loadMetricsData]);

  // 自动刷新定时器
  useEffect(() => {
    if (refreshInterval <= 0) return;
    const timer = setInterval(() => {
      loadMetricsData(false);
    }, refreshInterval);
    return () => clearInterval(timer);
  }, [refreshInterval, loadMetricsData]);

  // 复制 Prometheus 原始报文
  const handleCopyRawText = async () => {
    try {
      await navigator.clipboard.writeText(snapshot.rawPrometheusText);
      setCopied(true);
      message.success('Prometheus 原始指标文本已复制至剪贴板');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      message.error('复制失败，请手动选中文本复制');
    }
  };

  // 过滤后的 Prometheus 报文
  const filteredRawLines = useMemo(() => {
    const raw = snapshot.rawPrometheusText || '';
    if (!rawSearchKeyword.trim()) return raw;
    const kw = rawSearchKeyword.trim().toLowerCase();
    return raw
      .split('\n')
      .filter((line) => line.toLowerCase().includes(kw))
      .join('\n');
  }, [snapshot.rawPrometheusText, rawSearchKeyword]);

  // 计算直方图步进桶分布
  const histogramBuckets = useMemo(() => {
    const rawBuckets = snapshot.corePrometheus.commandDuration.buckets || [];
    const stepBuckets: Array<{ label: string; count: number; le: number }> = [];

    const bucketLabels = [
      '≤50ms',
      '≤100ms',
      '≤250ms',
      '≤500ms',
      '≤1.0s',
      '≤1.5s',
      '≤2.0s',
      '≤3.0s',
      '≤5.0s',
      '≤10.0s',
      '>10.0s',
    ];

    let prevCount = 0;
    for (let i = 0; i < rawBuckets.length; i++) {
      const b = rawBuckets[i];
      const delta = Math.max(0, b.count - prevCount);
      prevCount = b.count;
      stepBuckets.push({
        label: bucketLabels[i] || `≤${b.le}s`,
        count: delta,
        le: b.le,
      });
    }

    return stepBuckets;
  }, [snapshot.corePrometheus.commandDuration.buckets]);

  // 直方图最大计数用于柱高归一化
  const maxBucketCount = useMemo(() => {
    return Math.max(...histogramBuckets.map((b) => b.count), 1);
  }, [histogramBuckets]);

  // 24小时面积图 SVG 计算
  const areaChartPoints = useMemo(() => {
    const svgWidth = 600;
    const svgHeight = 220;
    const paddingX = 40;
    const paddingY = 24;
    const innerW = svgWidth - paddingX * 2;
    const innerH = svgHeight - paddingY * 2;

    const maxQps = Math.max(...MOCK_HOURLY_TREND.map((d) => d.commandQps), 300);
    const maxTelemetry = Math.max(...MOCK_HOURLY_TREND.map((d) => d.telemetryRate), 4000);

    const qpsCoords = MOCK_HOURLY_TREND.map((d, i) => {
      const x = paddingX + (i / (MOCK_HOURLY_TREND.length - 1)) * innerW;
      const y = paddingY + innerH - (d.commandQps / maxQps) * innerH;
      return { x, y };
    });

    const telemetryCoords = MOCK_HOURLY_TREND.map((d, i) => {
      const x = paddingX + (i / (MOCK_HOURLY_TREND.length - 1)) * innerW;
      const y = paddingY + innerH - (d.telemetryRate / maxTelemetry) * innerH;
      return { x, y };
    });

    // 构建曲线路径
    const buildPath = (coords: Array<{ x: number; y: number }>) => {
      if (coords.length === 0) return '';
      return coords.reduce((acc, pt, i) => {
        if (i === 0) return `M ${pt.x} ${pt.y}`;
        const prev = coords[i - 1];
        const cx1 = prev.x + (pt.x - prev.x) / 2;
        const cy1 = prev.y;
        const cx2 = prev.x + (pt.x - prev.x) / 2;
        const cy2 = pt.y;
        return `${acc} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${pt.x} ${pt.y}`;
      }, '');
    };

    const qpsLine = buildPath(qpsCoords);
    const telemetryLine = buildPath(telemetryCoords);

    const bottomY = paddingY + innerH;
    const qpsArea = `${qpsLine} L ${paddingX + innerW} ${bottomY} L ${paddingX} ${bottomY} Z`;
    const telemetryArea = `${telemetryLine} L ${paddingX + innerW} ${bottomY} L ${paddingX} ${bottomY} Z`;

    return {
      svgWidth,
      svgHeight,
      paddingX,
      paddingY,
      innerW,
      innerH,
      maxQps,
      maxTelemetry,
      qpsCoords,
      telemetryCoords,
      qpsLine,
      qpsArea,
      telemetryLine,
      telemetryArea,
    };
  }, []);

  // 租户锁冲突明细表结构
  const lockTableColumns: ColumnsType<{
    tenantId: string;
    tenantName: string;
    contentions: number;
    websocketCount: number;
    uplinksCount: number;
    status: string;
  }> = [
    {
      title: '企业租户',
      dataIndex: 'tenantName',
      key: 'tenantName',
      render: (name, rec) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {rec.tenantId}
          </Text>
        </Space>
      ),
    },
    {
      title: '排他锁争抢',
      dataIndex: 'contentions',
      key: 'contentions',
      render: (val) => (
        <Tag color={val > 10 ? 'warning' : 'default'} style={{ fontWeight: 600 }}>
          {val} 次冲突
        </Tag>
      ),
    },
    {
      title: '长连接 (WS)',
      dataIndex: 'websocketCount',
      key: 'websocketCount',
      render: (val) => `${val.toLocaleString()} 连接`,
    },
    {
      title: '遥测上行包',
      dataIndex: 'uplinksCount',
      key: 'uplinksCount',
      render: (val) => `${(val / 1000000).toFixed(2)}M pkts`,
    },
    {
      title: '并发控制',
      dataIndex: 'status',
      key: 'status',
      render: (status) => <Tag color="success">{status}</Tag>,
    },
  ];

  const rawLockTableData = [
    {
      key: 'tenant-alpha',
      tenantId: 'tenant-alpha',
      tenantName: 'Alpha 智联车队',
      contentions: snapshot.corePrometheus.lockContentions.byTenant['tenant-alpha'] ?? 16,
      websocketCount: snapshot.corePrometheus.websocketConnections.byTenant['tenant-alpha'] ?? 680,
      uplinksCount: snapshot.corePrometheus.telemetryUplinksByTenant['tenant-alpha'] ?? 15130350,
      status: '正常排队防重',
    },
    {
      key: 'tenant-beta',
      tenantId: 'tenant-beta',
      tenantName: 'Beta 尊享出行',
      contentions: snapshot.corePrometheus.lockContentions.byTenant['tenant-beta'] ?? 9,
      websocketCount: snapshot.corePrometheus.websocketConnections.byTenant['tenant-beta'] ?? 420,
      uplinksCount: snapshot.corePrometheus.telemetryUplinksByTenant['tenant-beta'] ?? 7642100,
      status: '正常排队防重',
    },
    {
      key: 'tenant-gamma',
      tenantId: 'tenant-gamma',
      tenantName: 'Gamma 共享租车',
      contentions: snapshot.corePrometheus.lockContentions.byTenant['tenant-gamma'] ?? 4,
      websocketCount: snapshot.corePrometheus.websocketConnections.byTenant['tenant-gamma'] ?? 180,
      uplinksCount: snapshot.corePrometheus.telemetryUplinksByTenant['tenant-gamma'] ?? 3140500,
      status: '正常排队防重',
    },
  ];

  const lockTableData = selectedTenant === 'ALL'
    ? rawLockTableData
    : rawLockTableData.filter((item) => item.tenantId === selectedTenant);

  const overallHealth = snapshot.clusterHealth.overallStatus;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 顶部控制栏与集群全景状态 */}
      <Card
        styles={{ body: { padding: '16px 20px' } }}
        style={{
          borderRadius: 8,
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        }}
      >
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Space align="center" size="middle" wrap>
              <Title level={4} style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <LineChartOutlined style={{ color: '#1677ff' }} />
                系统 Prometheus 监控指标与集群健康
              </Title>
              {overallHealth === 'HEALTHY' && (
                <Tag color="success" style={{ borderRadius: 12, padding: '2px 10px', fontSize: 13 }}>
                  🟢 集群全节点健康 (All Services Healthy)
                </Tag>
              )}
              {overallHealth === 'DEGRADED' && (
                <Tag color="warning" style={{ borderRadius: 12, padding: '2px 10px', fontSize: 13 }}>
                  🟠 集群服务亚健康降级 (Degraded)
                </Tag>
              )}
              {overallHealth === 'UNHEALTHY' && (
                <Tag color="error" style={{ borderRadius: 12, padding: '2px 10px', fontSize: 13 }}>
                  🔴 集群关键节点异常 (Unhealthy)
                </Tag>
              )}
            </Space>
            <Paragraph
              type="secondary"
              style={{ margin: '4px 0 0', fontSize: 12 }}
            >
              直连后端微服务导出指标 (GET /metrics)，毫秒级洞察指令吞吐、全链路耗时分位数 SLA、分布式排他锁及 EMQX 消息队列
            </Paragraph>
          </Col>

          <Col xs={24} md={12} style={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 10 }}>
            {/* 租户过滤选择 */}
            <Select
              style={{ width: 175 }}
              value={selectedTenant}
              onChange={(val) => setSelectedTenant(val)}
              options={[
                { label: '全部租户 (All Tenants)', value: 'all' },
                { label: 'Alpha 智联车队', value: 'tenant-alpha' },
                { label: 'Beta 尊享出行', value: 'tenant-beta' },
                { label: 'Gamma 共享租车', value: 'tenant-gamma' },
              ]}
              aria-label="租户过滤选择"
            />

            {/* 刷新频率控制 */}
            <Segmented
              value={refreshInterval}
              onChange={(val) => setRefreshInterval(Number(val))}
              options={[
                { label: '5s', value: 5000 },
                { label: '10s', value: 10000 },
                { label: '30s', value: 30000 },
                { label: '关闭', value: 0 },
              ]}
            />

            {/* 立即刷新按钮 */}
            <Button
              icon={<ReloadOutlined spin={loading} />}
              loading={loading}
              onClick={() => loadMetricsData(true)}
            >
              立即刷新
            </Button>

            {/* 查看原始报文 Modal */}
            <Button
              icon={<CodeOutlined />}
              onClick={() => setIsRawModalOpen(true)}
            >
              Prometheus 原始报文
            </Button>
          </Col>
        </Row>
      </Card>

      {/* 6 大核心系统基础设施 KPI 卡片 */}
      <Row gutter={[16, 16]}>
        {/* Card 1: API 指令吞吐总量 */}
        <Col xs={24} sm={12} lg={4}>
          <Card
            styles={{ body: { padding: 16 } }}
            style={{ borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0,0,0,0.03)', height: '100%' }}
          >
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text type="secondary" style={{ fontSize: 13 }}>车控指令吞吐</Text>
                <ThunderboltOutlined style={{ color: '#1677ff', fontSize: 16 }} />
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'rgba(0,0,0,0.88)' }}>
                {snapshot.corePrometheus.commandsTotal.toLocaleString()}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>今日执行成功率</Text>
                <Tag
                  color={snapshot.corePrometheus.commandSuccessRate >= 98 ? 'success' : 'warning'}
                  style={{ margin: 0 }}
                >
                  {snapshot.corePrometheus.commandSuccessRate}%
                </Tag>
              </div>
            </Space>
          </Card>
        </Col>

        {/* Card 2: 指令延迟 P50 与 P99 */}
        <Col xs={24} sm={12} lg={4}>
          <Card
            styles={{ body: { padding: 16 } }}
            style={{ borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0,0,0,0.03)', height: '100%' }}
          >
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text type="secondary" style={{ fontSize: 13 }}>指令执行延迟 P99</Text>
                <ClockCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'rgba(0,0,0,0.88)' }}>
                {(snapshot.corePrometheus.commandDuration.p99Seconds * 1000).toFixed(0)}
                <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 4 }}>ms</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  P50: {(snapshot.corePrometheus.commandDuration.p50Seconds * 1000).toFixed(0)}ms
                </Text>
                <Tag
                  color={snapshot.corePrometheus.commandDuration.p99Seconds <= 1.5 ? 'success' : 'error'}
                  style={{ margin: 0 }}
                >
                  {snapshot.corePrometheus.commandDuration.p99Seconds <= 1.5 ? 'SLA 达标' : '延迟告警'}
                </Tag>
              </div>
            </Space>
          </Card>
        </Col>

        {/* Card 3: 活跃设备模拟器与长连接 */}
        <Col xs={24} sm={12} lg={4}>
          <Card
            styles={{ body: { padding: 16 } }}
            style={{ borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0,0,0,0.03)', height: '100%' }}
          >
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text type="secondary" style={{ fontSize: 13 }}>WebSocket 活跃连接</Text>
                <ApiOutlined style={{ color: '#722ed1', fontSize: 16 }} />
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'rgba(0,0,0,0.88)' }}>
                {snapshot.corePrometheus.websocketConnections.total.toLocaleString()}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  模拟器: {snapshot.corePrometheus.activeSimulators.online}/{snapshot.corePrometheus.activeSimulators.total}
                </Text>
                <Tag color="cyan" style={{ margin: 0 }}>
                  {snapshot.corePrometheus.activeSimulators.onlineRate}% 在线
                </Tag>
              </div>
            </Space>
          </Card>
        </Col>

        {/* Card 4: 遥测数据上行速率 */}
        <Col xs={24} sm={12} lg={4}>
          <Card
            styles={{ body: { padding: 16 } }}
            style={{ borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0,0,0,0.03)', height: '100%' }}
          >
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text type="secondary" style={{ fontSize: 13 }}>遥测数据摄入速率</Text>
                <CloudUploadOutlined style={{ color: '#13c2c2', fontSize: 16 }} />
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'rgba(0,0,0,0.88)' }}>
                {snapshot.messageQueue.msgInRateSec.toLocaleString()}
                <span style={{ fontSize: 13, fontWeight: 400, marginLeft: 4 }}>pkt/s</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>累计上行报文</Text>
                <Text strong style={{ fontSize: 12, color: '#13c2c2' }}>
                  {(snapshot.corePrometheus.telemetryUplinksTotal / 1000000).toFixed(1)}M
                </Text>
              </div>
            </Space>
          </Card>
        </Col>

        {/* Card 5: 分布式排他锁争抢 */}
        <Col xs={24} sm={12} lg={4}>
          <Card
            styles={{ body: { padding: 16 } }}
            style={{ borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0,0,0,0.03)', height: '100%' }}
          >
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text type="secondary" style={{ fontSize: 13 }}>Redis 并发锁争抢</Text>
                <LockOutlined style={{ color: '#fa8c16', fontSize: 16 }} />
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'rgba(0,0,0,0.88)' }}>
                {snapshot.corePrometheus.lockContentions.total}
                <span style={{ fontSize: 13, fontWeight: 400, marginLeft: 4 }}>次冲突</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>千次冲突率</Text>
                <Tag color="blue" style={{ margin: 0 }}>
                  {snapshot.corePrometheus.lockContentions.contentionRatePerThousand}‰
                </Tag>
              </div>
            </Space>
          </Card>
        </Col>

        {/* Card 6: 集群硬件资源水位 */}
        <Col xs={24} sm={12} lg={4}>
          <Card
            styles={{ body: { padding: 16 } }}
            style={{ borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0,0,0,0.03)', height: '100%' }}
          >
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text type="secondary" style={{ fontSize: 13 }}>集群硬件水位</Text>
                <HddOutlined style={{ color: '#eb2f96', fontSize: 16 }} />
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 2 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <Text type="secondary">CPU</Text>
                    <Text strong>{snapshot.clusterHealth.avgCpuPercent}%</Text>
                  </div>
                  <Progress
                    percent={snapshot.clusterHealth.avgCpuPercent}
                    size="small"
                    showInfo={false}
                    status={snapshot.clusterHealth.avgCpuPercent > 80 ? 'exception' : 'normal'}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <Text type="secondary">内存</Text>
                    <Text strong>{snapshot.clusterHealth.avgMemoryPercent}%</Text>
                  </div>
                  <Progress
                    percent={snapshot.clusterHealth.avgMemoryPercent}
                    size="small"
                    showInfo={false}
                    strokeColor="#722ed1"
                  />
                </div>
              </div>
            </Space>
          </Card>
        </Col>
      </Row>

      {/* 4 大可视化诊断看板 */}
      {/* 行 1: Panel 1 直方图分布 + Panel 2 24小时 QPS 与遥测走势 */}
      <Row gutter={[16, 16]}>
        {/* Panel 1: 指令耗时直方图分布 (Latency Buckets & SLA P99) */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <ClockCircleOutlined style={{ color: '#1677ff' }} />
                <span>指令耗时直方图分布 (Latency Buckets & SLA P99)</span>
              </Space>
            }
            extra={
              <Space size="small">
                <Badge color="#1677ff" text={`P50: ${(snapshot.corePrometheus.commandDuration.p50Seconds * 1000).toFixed(0)}ms`} />
                <Badge color="#fa8c16" text={`P90: ${(snapshot.corePrometheus.commandDuration.p90Seconds * 1000).toFixed(0)}ms`} />
                <Badge color="#ff4d4f" text={`P99: ${(snapshot.corePrometheus.commandDuration.p99Seconds * 1000).toFixed(0)}ms`} />
              </Space>
            }
            styles={{ body: { padding: '16px 20px' } }}
            style={{ borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0,0,0,0.03)' }}
          >
            <div style={{ width: '100%', height: 260, position: 'relative' }}>
              <svg
                width="100%"
                height="100%"
                viewBox="0 0 540 240"
                preserveAspectRatio="none"
                style={{ overflow: 'visible' }}
              >
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1677ff" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#69b1ff" stopOpacity="0.4" />
                  </linearGradient>
                </defs>

                {/* 背景参考横虚线 */}
                {[0.25, 0.5, 0.75, 1].map((pct, idx) => {
                  const y = 200 - pct * 170;
                  return (
                    <g key={idx}>
                      <line
                        x1="30"
                        y1={y}
                        x2="520"
                        y2={y}
                        stroke="#f0f0f0"
                        strokeDasharray="3,3"
                        strokeWidth="1"
                      />
                      <text
                        x="25"
                        y={y + 4}
                        textAnchor="end"
                        fontSize="10"
                        fill="#8c8c8c"
                      >
                        {Math.round(maxBucketCount * pct)}
                      </text>
                    </g>
                  );
                })}

                {/* 直方图柱体 */}
                {histogramBuckets.map((bucket, index) => {
                  const barWidth = 32;
                  const spacing = 12;
                  const startX = 40 + index * (barWidth + spacing);
                  const barHeight = Math.max(4, (bucket.count / maxBucketCount) * 170);
                  const barY = 200 - barHeight;

                  return (
                    <g key={index}>
                      <rect
                        x={startX}
                        y={barY}
                        width={barWidth}
                        height={barHeight}
                        rx="3"
                        fill="url(#barGradient)"
                        style={{
                          transition: 'all 0.3s ease',
                          cursor: 'pointer',
                        }}
                      >
                        <title>{`${bucket.label}: ${bucket.count} 次指令`}</title>
                      </rect>
                      {/* 柱顶数值 */}
                      {bucket.count > 0 && (
                        <text
                          x={startX + barWidth / 2}
                          y={barY - 5}
                          textAnchor="middle"
                          fontSize="10"
                          fill="#595959"
                        >
                          {bucket.count}
                        </text>
                      )}
                      {/* X 轴标签 */}
                      <text
                        x={startX + barWidth / 2}
                        y="218"
                        textAnchor="middle"
                        fontSize="9.5"
                        fill="#8c8c8c"
                      >
                        {bucket.label}
                      </text>
                    </g>
                  );
                })}

                {/* SLA 达标 1.5s 警戒虚线 */}
                <line
                  x1="318"
                  y1="25"
                  x2="318"
                  y2="200"
                  stroke="#52c41a"
                  strokeDasharray="4,4"
                  strokeWidth="2"
                />
                <text x="322" y="38" fontSize="11" fill="#52c41a" fontWeight="600">
                  SLA 阈值 1.5s
                </text>
              </svg>
            </div>
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
              <span>* 柱体展示每个耗时区间非累计采样次数分布</span>
              <span>指令平均耗时: {(snapshot.corePrometheus.commandDuration.avgSeconds * 1000).toFixed(0)}ms</span>
            </div>
          </Card>
        </Col>

        {/* Panel 2: 24 小时 QPS 吞吐与遥测速率走势面积图 */}
        <Col xs={24} lg={12}>
          <Card
            title={
              <Space>
                <LineChartOutlined style={{ color: '#52c41a' }} />
                <span>24小时 QPS 吞吐与遥测速率走势 (Throughput & Telemetry Trend)</span>
              </Space>
            }
            extra={
              <Space size="middle">
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#1677ff', display: 'inline-block' }} />
                  车控指令 QPS
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#52c41a', display: 'inline-block' }} />
                  遥测上行 (pkt/s)
                </span>
              </Space>
            }
            styles={{ body: { padding: '16px 20px' } }}
            style={{ borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0,0,0,0.03)' }}
          >
            <div
              style={{ width: '100%', height: 260, position: 'relative' }}
              onMouseLeave={() => setHoveredTrendIndex(null)}
            >
              <svg
                width="100%"
                height="100%"
                viewBox={`0 0 ${areaChartPoints.svgWidth} ${areaChartPoints.svgHeight}`}
                preserveAspectRatio="none"
                style={{ overflow: 'visible' }}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const relX = ((e.clientX - rect.left) / rect.width) * areaChartPoints.svgWidth;
                  const idx = Math.round(
                    ((relX - areaChartPoints.paddingX) / areaChartPoints.innerW) *
                      (MOCK_HOURLY_TREND.length - 1)
                  );
                  if (idx >= 0 && idx < MOCK_HOURLY_TREND.length) {
                    setHoveredTrendIndex(idx);
                  }
                }}
              >
                <defs>
                  <linearGradient id="qpsAreaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1677ff" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#1677ff" stopOpacity="0.02" />
                  </linearGradient>
                  <linearGradient id="telemetryAreaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#52c41a" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#52c41a" stopOpacity="0.02" />
                  </linearGradient>
                </defs>

                {/* 背景水平网格线 */}
                {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
                  const y =
                    areaChartPoints.paddingY +
                    areaChartPoints.innerH -
                    pct * areaChartPoints.innerH;
                  return (
                    <line
                      key={idx}
                      x1={areaChartPoints.paddingX}
                      y1={y}
                      x2={areaChartPoints.paddingX + areaChartPoints.innerW}
                      y2={y}
                      stroke="#f5f5f5"
                      strokeWidth="1"
                    />
                  );
                })}

                {/* 面积填充 */}
                <path d={areaChartPoints.telemetryArea} fill="url(#telemetryAreaGradient)" />
                <path d={areaChartPoints.qpsArea} fill="url(#qpsAreaGradient)" />

                {/* 折线描边 */}
                <path
                  d={areaChartPoints.telemetryLine}
                  fill="none"
                  stroke="#52c41a"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d={areaChartPoints.qpsLine}
                  fill="none"
                  stroke="#1677ff"
                  strokeWidth="2"
                  strokeLinecap="round"
                />

                {/* X 轴关键时间标签 */}
                {[0, 4, 8, 12, 16, 20, 23].map((idx) => {
                  const pt = areaChartPoints.qpsCoords[idx];
                  if (!pt) return null;
                  return (
                    <text
                      key={idx}
                      x={pt.x}
                      y={areaChartPoints.paddingY + areaChartPoints.innerH + 16}
                      textAnchor="middle"
                      fontSize="10"
                      fill="#8c8c8c"
                    >
                      {MOCK_HOURLY_TREND[idx].hour}
                    </text>
                  );
                })}

                {/* 交互悬浮十字线与高亮数据点 */}
                {hoveredTrendIndex !== null && (
                  <g>
                    <line
                      x1={areaChartPoints.qpsCoords[hoveredTrendIndex].x}
                      y1={areaChartPoints.paddingY}
                      x2={areaChartPoints.qpsCoords[hoveredTrendIndex].x}
                      y2={areaChartPoints.paddingY + areaChartPoints.innerH}
                      stroke="#bfbfbf"
                      strokeDasharray="3,3"
                      strokeWidth="1"
                    />
                    <circle
                      cx={areaChartPoints.qpsCoords[hoveredTrendIndex].x}
                      cy={areaChartPoints.qpsCoords[hoveredTrendIndex].y}
                      r="4.5"
                      fill="#1677ff"
                      stroke="#fff"
                      strokeWidth="2"
                    />
                    <circle
                      cx={areaChartPoints.telemetryCoords[hoveredTrendIndex].x}
                      cy={areaChartPoints.telemetryCoords[hoveredTrendIndex].y}
                      r="4.5"
                      fill="#52c41a"
                      stroke="#fff"
                      strokeWidth="2"
                    />
                  </g>
                )}
              </svg>

              {/* 悬浮 Tooltip 浮层 */}
              {hoveredTrendIndex !== null && (
                <div
                  style={{
                    position: 'absolute',
                    top: 10,
                    right: 20,
                    backgroundColor: 'rgba(0, 0, 0, 0.85)',
                    color: '#fff',
                    padding: '8px 12px',
                    borderRadius: 6,
                    fontSize: 12,
                    pointerEvents: 'none',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    zIndex: 10,
                  }}
                >
                  <div style={{ fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.2)', paddingBottom: 4, marginBottom: 4 }}>
                    时间点: {MOCK_HOURLY_TREND[hoveredTrendIndex].hour}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#4096ff' }}>● 车控指令:</span>
                    <span>{MOCK_HOURLY_TREND[hoveredTrendIndex].commandQps} QPS</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                    <span style={{ color: '#73d13d' }}>● 遥测摄入:</span>
                    <span>{MOCK_HOURLY_TREND[hoveredTrendIndex].telemetryRate.toLocaleString()} pkt/s</span>
                  </div>
                </div>
              )}
            </div>
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
              <span>* 移动鼠标至图表可交互查看各时段 QPS 与数据包吞吐</span>
              <span>当前峰值指令 QPS: 285 / 峰值摄入: 3,620 pkt/s</span>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 行 2: Panel 3 微服务集群 8 节点健康网格 + Panel 4 EMQX 与锁诊断 */}
      <Row gutter={[16, 16]}>
        {/* Panel 3: 微服务集群 8 节点健康度网格 (Cluster Node Matrix) */}
        <Col xs={24} lg={14}>
          <Card
            title={
              <Space>
                <ClusterOutlined style={{ color: '#1677ff' }} />
                <span>微服务集群与基础设施节点健康度矩阵 (Cluster 8-Node Matrix)</span>
              </Space>
            }
            extra={
              <Tag color="success">
                {snapshot.clusterHealth.healthyCount} / {snapshot.clusterHealth.totalCount} 节点在线健康
              </Tag>
            }
            styles={{ body: { padding: '16px' } }}
            style={{ borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0,0,0,0.03)' }}
          >
            <Row gutter={[12, 12]}>
              {snapshot.clusterHealth.nodes.map((node) => {
                const roleMeta = ROLE_TAG_MAP[node.role] || { color: 'default', label: node.role };
                return (
                  <Col xs={24} sm={12} key={node.id}>
                    <div
                      style={{
                        padding: '12px 14px',
                        borderRadius: 6,
                        border: '1px solid #f0f0f0',
                        backgroundColor: '#fafafa',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Space size={6}>
                          <Badge
                            status={
                              node.status === 'HEALTHY'
                                ? 'success'
                                : node.status === 'DEGRADED'
                                ? 'warning'
                                : 'error'
                            }
                          />
                          <Text strong style={{ fontSize: 13 }}>
                            {node.serviceName}
                          </Text>
                        </Space>
                        <Tag color={roleMeta.color} style={{ margin: 0, fontSize: 11 }}>
                          {roleMeta.label}
                        </Tag>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                        <span>{node.host}:{node.port}</span>
                        <Tag style={{ margin: 0, fontSize: 10 }}>{node.version}</Tag>
                      </div>

                      {/* CPU 与 内存条 */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                          <Text type="secondary">CPU 使用率</Text>
                          <Text strong>{node.cpuUsagePercent}%</Text>
                        </div>
                        <Progress
                          percent={node.cpuUsagePercent}
                          size="small"
                          showInfo={false}
                          status={node.cpuUsagePercent > 80 ? 'exception' : 'normal'}
                        />
                      </div>

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                          <Text type="secondary">内存: {node.memoryUsedMb}MB / {node.memoryTotalMb}MB</Text>
                          <Text strong>{node.memoryUsagePercent}%</Text>
                        </div>
                        <Progress
                          percent={node.memoryUsagePercent}
                          size="small"
                          showInfo={false}
                          strokeColor="#722ed1"
                        />
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(0,0,0,0.45)', borderTop: '1px dashed #e8e8e8', paddingTop: 6 }}>
                        <span>持续运行: {node.uptimeFormatted}</span>
                        <span>重启: {node.restartCount} 次</span>
                      </div>
                    </div>
                  </Col>
                );
              })}
            </Row>
          </Card>
        </Col>

        {/* Panel 4: EMQX 消息中间件与分布式锁诊断卡片 (Broker & Concurrency Diagnostics) */}
        <Col xs={24} lg={10}>
          <Card
            title={
              <Space>
                <LockOutlined style={{ color: '#fa8c16' }} />
                <span>EMQX 消息中间件与并发锁诊断 (MQTT & Concurrency)</span>
              </Space>
            }
            styles={{ body: { padding: '16px 20px' } }}
            style={{ borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0,0,0,0.03)' }}
          >
            {/* 上半部分：EMQX Broker 关键指标 */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 12,
                marginBottom: 16,
              }}
            >
              <div style={{ padding: '10px 14px', backgroundColor: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>EMQX 摄入吞吐 (Ingress)</Text>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#389e0d' }}>
                  {snapshot.messageQueue.msgInRateSec.toLocaleString()} msg/s
                </div>
              </div>

              <div style={{ padding: '10px 14px', backgroundColor: '#e6f4ff', border: '1px solid #91caff', borderRadius: 6 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>分发下行吞吐 (Egress)</Text>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#0958d9' }}>
                  {snapshot.messageQueue.msgOutRateSec.toLocaleString()} msg/s
                </div>
              </div>

              <div style={{ padding: '10px 14px', backgroundColor: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 6 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>消费者堆积延迟 (Lag)</Text>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: '#fa8c16' }}>
                    {snapshot.messageQueue.consumerLagCount} 条
                  </span>
                  <Tag color="success" style={{ margin: 0 }}>消费通畅</Tag>
                </div>
              </div>

              <div style={{ padding: '10px 14px', backgroundColor: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 6 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>在线客户端 / 保留消息</Text>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'rgba(0,0,0,0.88)' }}>
                  {snapshot.messageQueue.connectedClients.toLocaleString()} / {snapshot.messageQueue.retainedMessages.toLocaleString()}
                </div>
              </div>
            </div>

            {/* 下半部分：多租户分布式锁争抢明细表 */}
            <div style={{ marginBottom: 8 }}>
              <Text strong style={{ fontSize: 13 }}>租户级并发防重排他锁争抢监控</Text>
            </div>
            <Table
              size="small"
              columns={lockTableColumns}
              dataSource={lockTableData}
              pagination={false}
              bordered={false}
            />
          </Card>
        </Col>
      </Row>

      {/* Prometheus 原始报文查看模态弹窗 */}
      <Modal
        title={
          <Space>
            <CodeOutlined style={{ color: '#1677ff' }} />
            <span>Prometheus Exporter 原始指标报文 (GET /metrics)</span>
          </Space>
        }
        open={isRawModalOpen}
        onCancel={() => setIsRawModalOpen(false)}
        width={850}
        footer={[
          <Button key="close" onClick={() => setIsRawModalOpen(false)}>
            关闭
          </Button>,
          <Button
            key="copy"
            type="primary"
            icon={copied ? <CheckOutlined /> : <CopyOutlined />}
            onClick={handleCopyRawText}
          >
            {copied ? '已复制全部报文' : '复制全部指标文本'}
          </Button>,
        ]}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <Input
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            placeholder="按指标名或关键字实时搜索过滤 (例如: car_commands_total, latency, tenant-alpha)..."
            value={rawSearchKeyword}
            onChange={(e) => setRawSearchKeyword(e.target.value)}
            allowClear
          />

          <div
            style={{
              backgroundColor: '#1f1f1f',
              color: '#d4d4d4',
              borderRadius: 6,
              padding: '14px 18px',
              fontFamily: 'Consolas, Monaco, monospace',
              fontSize: 12,
              maxHeight: 450,
              overflow: 'auto',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
              border: '1px solid #333',
            }}
          >
            {filteredRawLines || <Text style={{ color: '#8c8c8c' }}>无匹配指标行</Text>}
          </div>
        </Space>
      </Modal>
    </div>
  );
};

export default SystemMetricsView;
