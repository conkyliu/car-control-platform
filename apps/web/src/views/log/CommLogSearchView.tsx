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
  Radio,
  Button,
  Table,
  Tag,
  Badge,
  Space,
  Typography,
  Tooltip,
  Modal,
  message,
} from 'antd';
import type { TableColumnsType } from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  ClearOutlined,
  DownloadOutlined,
  CodeOutlined,
  FileTextOutlined,
  AlertOutlined,
  SwapOutlined,
  ApiOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import {
  type CommLogRecord,
  type CommLogQueryParams,
  CommProtocolType,
  CommDirection,
  COMM_PROTOCOL_METADATA,
  COMM_DIRECTION_METADATA,
  calculateCommLogStats,
  filterCommLogs,
} from './comm-log-core.ts';
import { fetchCommLogsApi, exportCommLogsCsvApi } from '../../api/comm-log.ts';
import { HexPayloadParserDrawer } from './HexPayloadParserDrawer.tsx';

const { Text } = Typography;

export const CommLogSearchView: React.FC = () => {
  const [logs, setLogs] = useState<CommLogRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);

  // 筛选状态
  const [keyword, setKeyword] = useState<string>('');
  const [selectedProtocol, setSelectedProtocol] = useState<CommProtocolType | 'ALL'>('ALL');
  const [selectedDirection, setSelectedDirection] = useState<CommDirection | 'ALL'>('ALL');
  const [selectedChecksum, setSelectedChecksum] = useState<'ALL' | 'VALID' | 'INVALID'>('ALL');
  const [datePreset, setDatePreset] = useState<string>('ALL');
  const [dateRange, setDateRange] = useState<[string | undefined, string | undefined]>([
    undefined,
    undefined,
  ]);
  const [rangePickerKey, setRangePickerKey] = useState<number>(0);

  // 深度解析抽屉状态
  const [drawerVisible, setDrawerVisible] = useState<boolean>(false);
  const [selectedRecord, setSelectedRecord] = useState<CommLogRecord | null>(null);

  // 加载报文流水
  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCommLogsApi();
      setLogs(data);
    } catch (err: any) {
      message.error(err?.message || '拉取通讯流水日志失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // 处理时间跨度快速切换
  const handlePresetDateChange = (preset: string) => {
    setDatePreset(preset);
    setRangePickerKey((k) => k + 1);

    const now = Date.now();
    if (preset === '1H') {
      const start = new Date(now - 3600 * 1000).toISOString();
      setDateRange([start, new Date(now).toISOString()]);
    } else if (preset === 'TODAY') {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      setDateRange([todayStart.toISOString(), new Date(now).toISOString()]);
    } else if (preset === '3D') {
      const start = new Date(now - 3 * 86400 * 1000).toISOString();
      setDateRange([start, new Date(now).toISOString()]);
    } else if (preset === '7D') {
      const start = new Date(now - 7 * 86400 * 1000).toISOString();
      setDateRange([start, new Date(now).toISOString()]);
    } else {
      setDateRange([undefined, undefined]);
    }
  };

  // 重置全部筛选条件
  const handleResetFilters = () => {
    setKeyword('');
    setSelectedProtocol('ALL');
    setSelectedDirection('ALL');
    setSelectedChecksum('ALL');
    setDatePreset('ALL');
    setDateRange([undefined, undefined]);
    setRangePickerKey((k) => k + 1);
    message.info('筛选条件已重置');
  };

  // 当前构造的查询参数
  const currentQueryParams = useMemo<CommLogQueryParams>(() => {
    return {
      keyword: keyword.trim() || undefined,
      protocolType: selectedProtocol,
      direction: selectedDirection,
      checksumStatus: selectedChecksum,
      startTime: dateRange[0],
      endTime: dateRange[1],
    };
  }, [keyword, selectedProtocol, selectedDirection, selectedChecksum, dateRange]);

  // 过滤后的日志记录
  const filteredLogs = useMemo(() => {
    return filterCommLogs(logs, currentQueryParams);
  }, [logs, currentQueryParams]);

  // KPI 统计指标计算
  const stats = useMemo(() => {
    return calculateCommLogStats(filteredLogs);
  }, [filteredLogs]);

  // 打开深度解析抽屉
  const handleInspect = (record: CommLogRecord) => {
    setSelectedRecord(record);
    setDrawerVisible(true);
  };

  // 导出 CSV 报表
  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const blob = await exportCommLogsCsvApi(currentQueryParams);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `comm_telemetry_logs_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      message.success(`成功导出 ${filteredLogs.length} 条通讯日志 CSV 报表`);
    } catch (err: any) {
      message.error(err?.message || '导出通讯日志失败，请稍后重试');
    } finally {
      setExporting(false);
    }
  };

  const confirmExport = () => {
    Modal.confirm({
      title: '确认导出原始通讯日志？',
      content: `即将导出当前筛选条件下的通讯流水记录（共 ${filteredLogs.length} 条），报表包含 UTF-8 BOM 编码，并已启用防公式注入安全清洗。`,
      okText: '确认导出',
      cancelText: '取消',
      onOk: handleExportCsv,
    });
  };

  // 表格列定义
  const columns: TableColumnsType<CommLogRecord> = [
    {
      title: '时间戳 (毫秒级)',
      dataIndex: 'timestampFormatted',
      key: 'timestampFormatted',
      width: 190,
      render: (time: string) => (
        <Text style={{ fontFamily: 'monospace', fontSize: 13, color: '#262626' }}>
          {time}
        </Text>
      ),
    },
    {
      title: '协议类型',
      dataIndex: 'protocolType',
      key: 'protocolType',
      width: 140,
      render: (proto: CommProtocolType) => {
        const meta = COMM_PROTOCOL_METADATA[proto];
        return <Tag color={meta.tagColor}>{meta.shortLabel}</Tag>;
      },
    },
    {
      title: '流向',
      dataIndex: 'direction',
      key: 'direction',
      width: 100,
      render: (dir: CommDirection) => {
        const meta = COMM_DIRECTION_METADATA[dir];
        return (
          <Tag color={meta.tagColor}>
            {meta.arrow} {meta.shortLabel}
          </Tag>
        );
      },
    },
    {
      title: '车辆标识 / VIN',
      key: 'vehicleVin',
      width: 200,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          {record.plateNumber ? (
            <Tag color="geekblue" style={{ margin: 0, fontWeight: 500 }}>
              {record.plateNumber}
            </Tag>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>
              未登记车牌
            </Text>
          )}
          <Text
            code
            style={{ fontSize: 12, margin: 0 }}
            copyable={{ text: record.vin, tooltips: ['复制 VIN', '已复制'] }}
          >
            {record.vin}
          </Text>
        </Space>
      ),
    },
    {
      title: '终端设备号',
      dataIndex: 'deviceNo',
      key: 'deviceNo',
      width: 160,
      render: (dev: string) => (
        <Text
          code
          copyable={{ text: dev, tooltips: ['复制设备号', '已复制'] }}
          style={{ fontSize: 12 }}
        >
          {dev}
        </Text>
      ),
    },
    {
      title: '消息 ID & 语义名称',
      key: 'messageIdName',
      width: 200,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ fontSize: 13 }}>
            {record.messageName}
          </Text>
          <Text code style={{ fontSize: 11, color: '#595959' }}>
            {record.messageId}
          </Text>
        </Space>
      ),
    },
    {
      title: '长度',
      dataIndex: 'byteLength',
      key: 'byteLength',
      width: 85,
      align: 'right',
      render: (len: number) => <Text strong>{len} B</Text>,
    },
    {
      title: '校验状态',
      key: 'checksum',
      width: 140,
      render: (_, record) => {
        if (record.checksumValid) {
          return (
            <Badge
              status="success"
              text={
                <Text type="success" style={{ fontSize: 12 }}>
                  正常 (0x{record.calculatedChecksum})
                </Text>
              }
            />
          );
        }
        return (
          <Tooltip title={`期望 0x${record.calculatedChecksum}，但收到 0x${record.actualChecksum}`}>
            <Badge
              status="error"
              text={
                <Text type="danger" strong style={{ fontSize: 12 }}>
                  异常 (0x{record.actualChecksum})
                </Text>
              }
            />
          </Tooltip>
        );
      },
    },
    {
      title: '原始 Hex 摘要',
      dataIndex: 'rawHex',
      key: 'rawHex',
      width: 170,
      render: (hex: string) => (
        <Tooltip title={hex} placement="topLeft">
          <Space size={4}>
            <Text
              style={{
                fontFamily: 'monospace',
                fontSize: 12,
                color: '#8c8c8c',
              }}
            >
              {hex.length > 18 ? `${hex.slice(0, 16)}...` : hex}
            </Text>
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined style={{ fontSize: 12 }} />}
              onClick={() => {
                if (navigator?.clipboard?.writeText) {
                  navigator.clipboard.writeText(hex);
                  message.success('已复制完整 Hex 报文');
                }
              }}
            />
          </Space>
        </Tooltip>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 110,
      fixed: 'right',
      render: (_, record) => (
        <Button
          type="primary"
          size="small"
          icon={<CodeOutlined />}
          onClick={() => handleInspect(record)}
        >
          深度解析
        </Button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 4 大核心 KPI 汇总卡片 */}
      <Row gutter={[16, 16]}>
        {/* 卡片 1: 报文总量 */}
        <Col xs={24} sm={12} md={6}>
          <Card
            bordered={false}
            style={{
              borderRadius: 8,
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
            }}
          >
            <Statistic
              title="当前报文检索总量"
              value={stats.totalLogs}
              suffix="帧"
              prefix={<FileTextOutlined style={{ color: '#1677ff' }} />}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
              平均帧长: <Text strong>{stats.avgByteLength} 字节</Text>
            </div>
          </Card>
        </Col>

        {/* 卡片 2: 上行 vs 下行流向比 */}
        <Col xs={24} sm={12} md={6}>
          <Card
            bordered={false}
            style={{
              borderRadius: 8,
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
            }}
          >
            <Statistic
              title="通讯流向分布 (上行 / 下行)"
              value={`${stats.uplinkCount} / ${stats.downlinkCount}`}
              prefix={<SwapOutlined style={{ color: '#722ed1' }} />}
              valueStyle={{ fontSize: 20 }}
            />
            <div style={{ marginTop: 8 }}>
              <Progress
                percent={
                  stats.totalLogs > 0
                    ? Math.round((stats.uplinkCount / stats.totalLogs) * 100)
                    : 0
                }
                size="small"
                strokeColor="#1677ff"
                trailColor="#fa8c16"
                format={(p) => (
                  <span style={{ fontSize: 11 }}>
                    ⬆️{p}% | ⬇️{100 - (p || 0)}%
                  </span>
                )}
              />
            </div>
          </Card>
        </Col>

        {/* 卡片 3: 协议分布 */}
        <Col xs={24} sm={12} md={6}>
          <Card
            bordered={false}
            style={{
              borderRadius: 8,
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
            }}
          >
            <Statistic
              title="协议覆盖矩阵"
              value={4}
              suffix="类协议"
              prefix={<ApiOutlined style={{ color: '#13c2c2' }} />}
            />
            <div
              style={{
                marginTop: 8,
                display: 'flex',
                gap: 6,
                flexWrap: 'wrap',
                fontSize: 12,
              }}
            >
              <Tag color="blue">808: {stats.protocolDistribution[CommProtocolType.JT808]}</Tag>
              <Tag color="purple">0x02: {stats.protocolDistribution[CommProtocolType.CAR_CONTROL_0X02]}</Tag>
              <Tag color="cyan">MQTT: {stats.protocolDistribution[CommProtocolType.MQTT_TELEMETRY]}</Tag>
              <Tag color="green">GB: {stats.protocolDistribution[CommProtocolType.GB32960]}</Tag>
            </div>
          </Card>
        </Col>

        {/* 卡片 4: 校验异常告警 */}
        <Col xs={24} sm={12} md={6}>
          <Card
            bordered={false}
            style={{
              borderRadius: 8,
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
            }}
          >
            <Statistic
              title="校验码异或异常率"
              value={stats.checksumAnomalyRate}
              precision={1}
              suffix="%"
              prefix={
                <AlertOutlined
                  style={{
                    color: stats.checksumAnomaliesCount > 0 ? '#ff4d4f' : '#52c41a',
                  }}
                />
              }
              valueStyle={{
                color: stats.checksumAnomaliesCount > 0 ? '#cf1322' : '#52c41a',
              }}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
              异常帧数:{' '}
              <Text type={stats.checksumAnomaliesCount > 0 ? 'danger' : 'success'} strong>
                {stats.checksumAnomaliesCount} 帧
              </Text>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 检索工具栏 */}
      <Card
        bordered={false}
        style={{
          borderRadius: 8,
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        }}
        styles={{ body: { padding: '16px 20px' } }}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {/* 第一行：搜索、下拉筛选、流向与操作按钮 */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Space wrap size="middle">
              {/* 关键字搜索 */}
              <Input
                placeholder="搜索 VIN / 车牌 / 设备号 / 消息名称"
                prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,0.45)' }} />}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                allowClear
                style={{ width: 280 }}
              />

              {/* 协议类型 */}
              <Select
                value={selectedProtocol}
                onChange={setSelectedProtocol}
                style={{ width: 170 }}
                options={[
                  { label: '全部通讯协议', value: 'ALL' },
                  { label: 'JT/T 808 部标车联', value: CommProtocolType.JT808 },
                  { label: '0x02 私有车控协议', value: CommProtocolType.CAR_CONTROL_0X02 },
                  { label: 'MQTT 遥测数据流', value: CommProtocolType.MQTT_TELEMETRY },
                  { label: 'GB/T 32960 国标', value: CommProtocolType.GB32960 },
                ]}
              />

              {/* 通讯流向 Segmented */}
              <Segmented
                value={selectedDirection}
                onChange={(v) => setSelectedDirection(v as any)}
                options={[
                  { label: '全部流向', value: 'ALL' },
                  { label: '⬆️ 上行', value: CommDirection.UPLINK },
                  { label: '⬇️ 下行', value: CommDirection.DOWNLINK },
                ]}
              />

              {/* 校验状态 */}
              <Select
                value={selectedChecksum}
                onChange={setSelectedChecksum}
                style={{ width: 130 }}
                options={[
                  { label: '全部校验状态', value: 'ALL' },
                  { label: '校验正常', value: 'VALID' },
                  { label: '校验异常', value: 'INVALID' },
                ]}
              />
            </Space>

            {/* 右侧动作按钮 */}
            <Space size="middle">
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                loading={exporting}
                onClick={confirmExport}
              >
                导出 CSV
              </Button>
              <Button icon={<ReloadOutlined />} loading={loading} onClick={loadLogs}>
                刷新
              </Button>
              <Button icon={<ClearOutlined />} onClick={handleResetFilters}>
                重置
              </Button>
            </Space>
          </div>

          {/* 第二行：时间范围预设与时间选择器 */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              alignItems: 'center',
            }}
          >
            <Space size="small" align="center">
              <Text type="secondary" style={{ fontSize: 13 }}>
                时间跨度:
              </Text>
              <Radio.Group
                value={datePreset}
                onChange={(e) => handlePresetDateChange(e.target.value)}
                optionType="button"
                buttonStyle="solid"
                size="small"
                options={[
                  { label: '全部时间', value: 'ALL' },
                  { label: '近 1 小时', value: '1H' },
                  { label: '今日', value: 'TODAY' },
                  { label: '近 3 天', value: '3D' },
                  { label: '近 7 天', value: '7D' },
                ]}
              />
            </Space>

            <DatePicker.RangePicker
              key={rangePickerKey}
              showTime
              placeholder={['起始时间', '截止时间']}
              onChange={(_, dateStrings) => {
                setDatePreset('CUSTOM');
                setDateRange([
                  dateStrings[0] ? dateStrings[0] : undefined,
                  dateStrings[1] ? dateStrings[1] : undefined,
                ]);
              }}
              style={{ width: 340 }}
            />

            <Text type="secondary" style={{ fontSize: 12, marginLeft: 'auto' }}>
              共检索到 <Text strong>{filteredLogs.length}</Text> 条原始通讯流水
            </Text>
          </div>
        </Space>
      </Card>

      {/* 数据表格区域 */}
      <Card
        bordered={false}
        style={{
          borderRadius: 8,
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        }}
        styles={{ body: { padding: 0 } }}
      >
        <Table<CommLogRecord>
          columns={columns}
          dataSource={filteredLogs}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1400 }}
          pagination={{
            defaultPageSize: 10,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: (total) => `共 ${total} 条通讯流水`,
          }}
        />
      </Card>

      {/* 报文深度解析抽屉 */}
      <HexPayloadParserDrawer
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        record={selectedRecord}
      />
    </div>
  );
};
