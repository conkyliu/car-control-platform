import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Card,
  Row,
  Col,
  Statistic,
  Progress,
  Input,
  Select,
  Segmented,
  DatePicker,
  Button,
  Table,
  Tag,
  Badge,
  Space,
  Typography,
  Tooltip,
  message,
} from 'antd';
import type { TableColumnsType } from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  AlertOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EnvironmentOutlined,
  SafetyCertificateOutlined,
  EyeOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import {
  type AlarmRecord,
  AlarmType,
  AlarmLevel,
  AlarmStatus,
  ALARM_TYPE_METADATA,
  ALARM_LEVEL_METADATA,
  ALARM_STATUS_METADATA,
  calculateAlarmStats,
  filterAlarms,
} from './alarm-core.ts';
import { fetchAlarmsApi } from '../../api/alarm.ts';
import { AlertProcessDrawer, renderAlarmTypeIcon } from './AlertProcessDrawer.tsx';
import { useNavTabsStore } from '../../store/useNavTabsStore.ts';
import { RoutePath } from '../../router/routes.ts';

const { Text } = Typography;

export const AlertCenterView: React.FC = () => {
  const [alarms, setAlarms] = useState<AlarmRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // 筛选状态
  const [keyword, setKeyword] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedLevel, setSelectedLevel] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [dateRange, setDateRange] = useState<[string | undefined, string | undefined]>([
    undefined,
    undefined,
  ]);
  const [rangePickerKey, setRangePickerKey] = useState(0);

  // 抽屉状态
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeAlarm, setActiveAlarm] = useState<AlarmRecord | null>(null);

  const openTab = useNavTabsStore((s) => s.openTab);

  const loadAlarms = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAlarmsApi();
      setAlarms(data);
    } catch (err: any) {
      message.error(err?.message || '拉取告警列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAlarms();
  }, [loadAlarms]);

  // 全量指标统计
  const stats = useMemo(() => {
    return calculateAlarmStats(alarms);
  }, [alarms]);

  // 本地过滤计算
  const filteredAlarms = useMemo(() => {
    return filterAlarms(alarms, {
      keyword: keyword.trim() || undefined,
      alarmType: selectedType !== 'ALL' ? (selectedType as AlarmType) : undefined,
      alarmLevel: selectedLevel !== 'ALL' ? (selectedLevel as AlarmLevel) : undefined,
      status: selectedStatus !== 'ALL' ? (selectedStatus as AlarmStatus) : undefined,
      startDate: dateRange[0] || undefined,
      endDate: dateRange[1] || undefined,
    });
  }, [alarms, keyword, selectedType, selectedLevel, selectedStatus, dateRange]);

  const handleOpenDrawer = (record: AlarmRecord) => {
    setActiveAlarm(record);
    setDrawerOpen(true);
  };

  const handleDrawerSuccess = (updated: AlarmRecord) => {
    setAlarms((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
  };

  const handleLocate = (record: AlarmRecord) => {
    if (!record.lat || !record.lng) {
      message.warning('该告警未包含有效 GPS 经纬度信息');
      return;
    }

    message.info(`正在跳转至实时定位大屏 (车牌: ${record.plateNumber || record.vehicleId})`);
    openTab({
      key: RoutePath.TELEMETRY,
      title: '实时定位与轨迹',
      closable: true,
      icon: 'AimOutlined',
    });
  };

  const handleResetFilters = () => {
    setKeyword('');
    setSelectedType('ALL');
    setSelectedLevel('ALL');
    setSelectedStatus('ALL');
    setDateRange([undefined, undefined]);
    setRangePickerKey((k) => k + 1);
  };

  const formatDate = (dateInput?: string | Date) => {
    if (!dateInput) return '-';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput);
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  };

  const columns: TableColumnsType<AlarmRecord> = [
    {
      title: '告警流水号',
      dataIndex: 'id',
      key: 'id',
      width: 170,
      render: (id: string) => (
        <Text copyable code style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 500 }}>
          {id}
        </Text>
      ),
    },
    {
      title: '告警类型',
      dataIndex: 'alarmType',
      key: 'alarmType',
      width: 170,
      render: (type: AlarmType) => {
        const meta = ALARM_TYPE_METADATA[type];
        if (!meta) return <Tag>{type}</Tag>;
        return (
          <Tag color={meta.tagColor} icon={renderAlarmTypeIcon(type)} style={{ fontWeight: 500 }}>
            {meta.label}
          </Tag>
        );
      },
    },
    {
      title: '严重级别',
      dataIndex: 'alarmLevel',
      key: 'alarmLevel',
      width: 110,
      render: (level: AlarmLevel) => {
        const meta = ALARM_LEVEL_METADATA[level];
        if (!meta) return <Tag>{level}</Tag>;
        return (
          <Tag color={meta.tagColor} style={{ fontWeight: 600 }}>
            {meta.label}
          </Tag>
        );
      },
    },
    {
      title: '关联车辆信息',
      key: 'vehicle',
      width: 220,
      render: (_, record) => (
        <div>
          <Space orientation="horizontal" size="small">
            {record.plateNumber ? (
              <Tag color="blue" style={{ fontWeight: 600 }}>
                {record.plateNumber}
              </Tag>
            ) : (
              <Tag color="default">未上牌</Tag>
            )}
            <Text style={{ fontSize: 13 }}>{record.vehicleModel || '-'}</Text>
          </Space>
          <div style={{ marginTop: 2 }}>
            <Text
              type="secondary"
              copyable
              style={{ fontFamily: 'monospace', fontSize: 11 }}
            >
              VIN: {record.vin || record.vehicleId}
            </Text>
          </div>
        </div>
      ),
    },
    {
      title: '设备编号',
      dataIndex: 'deviceNo',
      key: 'deviceNo',
      width: 140,
      render: (deviceNo: string) => (
        <Text copyable code style={{ fontFamily: 'monospace', fontSize: 12 }}>
          {deviceNo}
        </Text>
      ),
    },
    {
      title: '告警内容与说明',
      dataIndex: 'message',
      key: 'message',
      ellipsis: true,
      render: (msg: string) => (
        <Tooltip title={msg} placement="topLeft">
          <Text style={{ fontSize: 13 }}>{msg || '-'}</Text>
        </Tooltip>
      ),
    },
    {
      title: '瞬时工况',
      key: 'telemetry',
      width: 140,
      render: (_, record) => (
        <div>
          <div>
            <Text style={{ fontSize: 12 }}>车速: </Text>
            <Text
              strong
              style={{
                fontSize: 12,
                color: record.speed && record.speed > 80 ? '#cf1322' : 'inherit',
              }}
            >
              {record.speed !== undefined ? `${record.speed} km/h` : '0 km/h'}
            </Text>
          </div>
          <div>
            <Text style={{ fontSize: 12 }}>电压: </Text>
            <Text
              strong
              style={{
                fontSize: 12,
                color: record.voltage && record.voltage < 11.2 ? '#cf1322' : 'inherit',
              }}
            >
              {record.voltage !== undefined ? `${record.voltage.toFixed(1)} V` : '-'}
            </Text>
          </div>
        </div>
      ),
    },
    {
      title: '触发时间',
      dataIndex: 'triggeredAt',
      key: 'triggeredAt',
      width: 170,
      sorter: (a, b) => new Date(a.triggeredAt).getTime() - new Date(b.triggeredAt).getTime(),
      defaultSortOrder: 'descend',
      render: (time: string | Date) => (
        <Space size="small">
          <ClockCircleOutlined style={{ color: '#8c8c8c' }} />
          <Text style={{ fontSize: 12 }}>{formatDate(time)}</Text>
        </Space>
      ),
    },
    {
      title: '处置状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: AlarmStatus) => {
        const meta = ALARM_STATUS_METADATA[status];
        if (!meta) return <Badge status="default" text={status} />;
        return <Badge status={meta.badgeStatus} text={<Text style={{ fontSize: 13, fontWeight: 500 }}>{meta.label}</Text>} />;
      },
    },
    {
      title: '处置审计留痕',
      key: 'processInfo',
      width: 180,
      render: (_, record) => {
        if (record.status === AlarmStatus.PENDING) {
          return <Tag color="warning">待人工介入</Tag>;
        }
        return (
          <div>
            <div style={{ fontSize: 12, fontWeight: 500 }}>{record.processedBy || '管理员'}</div>
            <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)' }}>{formatDate(record.processedAt)}</div>
          </div>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          {record.status === AlarmStatus.PENDING ? (
            <Button
              type="primary"
              size="small"
              icon={<ToolOutlined />}
              onClick={() => handleOpenDrawer(record)}
            >
              人工处置
            </Button>
          ) : (
            <Button
              type="link"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleOpenDrawer(record)}
            >
              查看详情
            </Button>
          )}

          {record.lat && record.lng && (
            <Tooltip title="在地图中定位车辆">
              <Button
                type="text"
                size="small"
                icon={<EnvironmentOutlined style={{ color: '#1677ff' }} />}
                onClick={() => handleLocate(record)}
              />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 4 大核心 KPI 指标卡片 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card
            bordered={false}
            style={{
              borderRadius: 8,
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              background: '#fff',
            }}
          >
            <Statistic
              title={
                <Space>
                  <ClockCircleOutlined style={{ color: '#faad14' }} />
                  <span>待处置告警 (Pending)</span>
                </Space>
              }
              value={stats.pending}
              valueStyle={{ color: stats.pending > 0 ? '#faad14' : '#52c41a', fontWeight: 600 }}
              suffix={
                <Text type="secondary" style={{ fontSize: 13, marginLeft: 8 }}>
                  / {stats.total}
                </Text>
              }
            />
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
              今日新增上报: <Text strong>{stats.todayCount}</Text> 起
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            bordered={false}
            style={{
              borderRadius: 8,
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              background: '#fff',
            }}
          >
            <Statistic
              title={
                <Space>
                  <AlertOutlined style={{ color: '#cf1322' }} />
                  <span>紧急 P0 严重告警</span>
                </Space>
              }
              value={stats.criticalCount}
              valueStyle={{ color: '#cf1322', fontWeight: 600 }}
              suffix={<Text type="secondary" style={{ fontSize: 13 }}>条</Text>}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
              主电源剪线 / SOS / 异常拖车
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            bordered={false}
            style={{
              borderRadius: 8,
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              background: '#fff',
            }}
          >
            <Statistic
              title={
                <Space>
                  <CheckCircleOutlined style={{ color: '#52c41a' }} />
                  <span>闭环已处置 (Closed)</span>
                </Space>
              }
              value={stats.processed + stats.ignored}
              valueStyle={{ color: '#52c41a', fontWeight: 600 }}
              suffix={
                <Text type="secondary" style={{ fontSize: 13, marginLeft: 8 }}>
                  (误报 {stats.ignored})
                </Text>
              }
            />
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
              已解决: <Text strong>{stats.processed}</Text> | 误报忽略: <Text strong>{stats.ignored}</Text>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            bordered={false}
            style={{
              borderRadius: 8,
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              background: '#fff',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 14, color: 'rgba(0,0,0,0.45)', marginBottom: 4 }}>
                  <Space>
                    <SafetyCertificateOutlined style={{ color: '#1677ff' }} />
                    <span>处置闭环率</span>
                  </Space>
                </div>
                <div style={{ fontSize: 24, fontWeight: 600, color: '#1677ff' }}>
                  {stats.processRate}%
                </div>
              </div>
              <Progress
                type="circle"
                percent={stats.processRate}
                size={48}
                strokeColor="#1677ff"
              />
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
              安全运营闭环 SLA 达标率
            </div>
          </Card>
        </Col>
      </Row>

      {/* 检索工具栏与全景表格 */}
      <Card
        bordered={false}
        style={{
          borderRadius: 8,
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
        }}
      >
        {/* 顶部搜索与多维过滤条 */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 16,
          }}
        >
          <Space wrap size="middle">
            <Input
              placeholder="搜索车牌号 / VIN / 设备号 / 内容 / 处理人"
              prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,0.25)' }} />}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              style={{ width: 280 }}
              allowClear
            />

            <Select
              value={selectedType}
              onChange={setSelectedType}
              style={{ width: 170 }}
              options={[
                { label: '全部告警类型 (8类)', value: 'ALL' },
                ...Object.values(AlarmType).map((type) => ({
                  label: ALARM_TYPE_METADATA[type].label,
                  value: type,
                })),
              ]}
            />

            <Select
              value={selectedLevel}
              onChange={setSelectedLevel}
              style={{ width: 130 }}
              options={[
                { label: '全部级别', value: 'ALL' },
                { label: '紧急 P0', value: AlarmLevel.CRITICAL },
                { label: '警告 P1', value: AlarmLevel.WARNING },
                { label: '提示 P2', value: AlarmLevel.INFO },
              ]}
            />

            <DatePicker.RangePicker
              key={rangePickerKey}
              showTime
              placeholder={['触发开始时间', '触发截止时间']}
              onChange={(_, dateStrings) => {
                setDateRange([dateStrings[0] || undefined, dateStrings[1] || undefined]);
              }}
              style={{ width: 330 }}
            />

            {(keyword || selectedType !== 'ALL' || selectedLevel !== 'ALL' || selectedStatus !== 'ALL' || dateRange[0]) && (
              <Button type="link" onClick={handleResetFilters} style={{ padding: 0 }}>
                重置筛选
              </Button>
            )}
          </Space>

          <Space align="center" size="middle">
            <Segmented
              value={selectedStatus}
              onChange={(val) => setSelectedStatus(val as string)}
              options={[
                { label: `全部 (${stats.total})`, value: 'ALL' },
                { label: `待处置 (${stats.pending})`, value: AlarmStatus.PENDING },
                { label: `已处理 (${stats.processed})`, value: AlarmStatus.PROCESSED },
                { label: `已忽略 (${stats.ignored})`, value: AlarmStatus.IGNORED },
              ]}
            />

            <Button
              icon={<ReloadOutlined spin={loading} />}
              onClick={loadAlarms}
              loading={loading}
              title="刷新告警列表"
            >
              刷新
            </Button>
          </Space>
        </div>

        {/* 结果条数提示 */}
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            当前命中 <Text strong>{filteredAlarms.length}</Text> / {alarms.length} 条告警记录
          </Text>
        </div>

        {/* Ant Design 6 响应式表格 */}
        <Table<AlarmRecord>
          columns={columns}
          dataSource={filteredAlarms}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1400 }}
          pagination={{
            defaultPageSize: 10,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: (total) => `共 ${total} 条告警记录`,
          }}
        />
      </Card>

      {/* 人工闭环处置抽屉 */}
      <AlertProcessDrawer
        open={drawerOpen}
        alarm={activeAlarm}
        onClose={() => setDrawerOpen(false)}
        onSuccess={handleDrawerSuccess}
        onLocate={handleLocate}
      />
    </div>
  );
};

export default AlertCenterView;
