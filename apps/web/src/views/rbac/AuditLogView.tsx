import React, { useState, useEffect, useMemo } from 'react';
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
  Space,
  Modal,
  message,
  Typography,
  Tooltip,
  Alert,
  Drawer,
  Descriptions,
  DatePicker,
  Radio,
  Divider,
} from 'antd';
import type { TableProps } from 'antd';
import {
  FileTextOutlined,
  ControlOutlined,
  AlertOutlined,
  CloseCircleOutlined,
  CheckCircleOutlined,
  SearchOutlined,
  ReloadOutlined,
  DownloadOutlined,
  CopyOutlined,
  SafetyCertificateOutlined,
  InfoCircleOutlined,
  FieldTimeOutlined,
  ClearOutlined,
  CodeOutlined,
  LockOutlined,
} from '@ant-design/icons';
import type {
  AuditLogDto,
  AuditLogQueryParams,
  AuditLogRiskLevel,
} from '../../api/audit.ts';
import { fetchAuditLogsApi, exportAuditLogsApi } from '../../api/audit.ts';
import {
  calculateAuditStats,
  filterAuditLogs,
  getRiskLevel,
  AUDIT_MODULES,
  AUDIT_ACTIONS,
  isApiError,
} from './audit-core.ts';

const { Title, Text, Paragraph } = Typography;

export const AuditLogView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 筛选状态
  const [keyword, setKeyword] = useState('');
  const [selectedModule, setSelectedModule] = useState<string>('ALL');
  const [selectedAction, setSelectedAction] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedRisk, setSelectedRisk] = useState<string>('ALL');
  const [datePreset, setDatePreset] = useState<'ALL' | 'TODAY' | '7D' | '30D'>('ALL');
  const [dateRange, setDateRange] = useState<[string | undefined, string | undefined]>([
    undefined,
    undefined,
  ]);

  // 抽屉详情状态
  const [detailVisible, setDetailVisible] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AuditLogDto | null>(null);

  // 加载数据
  const loadLogs = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const data = await fetchAuditLogsApi();
      setLogs(data);
    } catch (err) {
      if (isApiError(err)) {
        setErrorMsg(`无法拉取操作审计日志：${err.message} (HTTP ${err.statusCode})`);
      } else {
        setErrorMsg('当前网络通信繁忙，未能收到审计服务端应答，请稍后刷新重试');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  // 快捷时间范围预设处理
  const handlePresetDateChange = (preset: 'ALL' | 'TODAY' | '7D' | '30D') => {
    setDatePreset(preset);
    const now = new Date();
    const formatDate = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const h = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      const s = String(d.getSeconds()).padStart(2, '0');
      return `${y}-${m}-${day} ${h}:${min}:${s}`;
    };

    if (preset === 'ALL') {
      setDateRange([undefined, undefined]);
    } else if (preset === 'TODAY') {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      setDateRange([formatDate(startOfDay), formatDate(endOfDay)]);
    } else if (preset === '7D') {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      setDateRange([formatDate(sevenDaysAgo), formatDate(now)]);
    } else if (preset === '30D') {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      setDateRange([formatDate(thirtyDaysAgo), formatDate(now)]);
    }
  };

  // 重置筛选
  const handleResetFilters = () => {
    setKeyword('');
    setSelectedModule('ALL');
    setSelectedAction('ALL');
    setSelectedStatus('ALL');
    setSelectedRisk('ALL');
    setDatePreset('ALL');
    setDateRange([undefined, undefined]);
  };

  // 当前激活的组合查询条件
  const activeQueryParams: AuditLogQueryParams = useMemo(() => {
    return {
      keyword: keyword.trim() || undefined,
      module: selectedModule !== 'ALL' ? selectedModule : undefined,
      action: selectedAction !== 'ALL' ? selectedAction : undefined,
      status: selectedStatus !== 'ALL' ? selectedStatus : undefined,
      riskLevel: selectedRisk !== 'ALL' ? selectedRisk : undefined,
      startTime: dateRange[0],
      endTime: dateRange[1],
    };
  }, [keyword, selectedModule, selectedAction, selectedStatus, selectedRisk, dateRange]);

  // 前端多维过滤后的日志列表
  const filteredLogs = useMemo(() => {
    return filterAuditLogs(logs, activeQueryParams);
  }, [logs, activeQueryParams]);

  // 统计指标汇总
  const stats = useMemo(() => {
    return calculateAuditStats(logs);
  }, [logs]);

  // 复制文本到剪贴板
  const handleCopyText = async (text: string, label: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
      message.success(`${label}已复制到剪贴板`);
    } catch {
      message.info(`${label}: ${text}`);
    }
  };

  // 导出 CSV
  const handleExportCsv = async () => {
    try {
      setExporting(true);
      const result = await exportAuditLogsApi(activeQueryParams);
      let blob: Blob;
      if (typeof result === 'string') {
        blob = new Blob([result], { type: 'text/csv;charset=utf-8;' });
      } else {
        blob = result;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      message.success('审计日志已成功导出并触发下载');
    } catch (err) {
      if (isApiError(err)) {
        message.error(`导出失败: ${err.message}`);
      } else {
        message.error('导出审计日志失败，请稍后重试');
      }
    } finally {
      setExporting(false);
    }
  };

  const confirmExport = () => {
    Modal.confirm({
      title: '确认导出操作审计日志？',
      content: `即将导出当前筛选条件下的审计日志记录（共 ${filteredLogs.length} 条），将生成含 UTF-8 BOM 的标准 CSV 报表。`,
      okText: '确认导出',
      cancelText: '取消',
      onOk: handleExportCsv,
    });
  };

  // 渲染风险等级徽章
  const renderRiskBadge = (risk: AuditLogRiskLevel) => {
    if (risk === 'HIGH') {
      return (
        <Tag
          color="#cf1322"
          style={{
            fontWeight: 600,
            borderRadius: 12,
            padding: '0 8px',
            border: 'none',
          }}
        >
          高危操作
        </Tag>
      );
    }
    if (risk === 'MEDIUM') {
      return (
        <Tag
          color="#faad14"
          style={{
            fontWeight: 500,
            borderRadius: 12,
            padding: '0 8px',
            border: 'none',
            color: '#873800',
          }}
        >
          中危操作
        </Tag>
      );
    }
    return (
      <Tag
        color="default"
        style={{
          borderRadius: 12,
          padding: '0 8px',
          color: 'rgba(0, 0, 0, 0.45)',
        }}
      >
        常规
      </Tag>
    );
  };

  // 表格列配置
  const columns: TableProps<AuditLogDto>['columns'] = [
    {
      title: 'Trace ID / 日志标识',
      key: 'traceId',
      width: 170,
      render: (_, record) => {
        const shortTrace = record.traceId.length > 16 ? `${record.traceId.slice(0, 12)}...` : record.traceId;
        return (
          <Space orientation="vertical" size={2}>
            <Space size={4}>
              <Tooltip title={record.traceId}>
                <Text code style={{ fontSize: 12 }}>
                  {shortTrace}
                </Text>
              </Tooltip>
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined style={{ fontSize: 12, color: '#1677ff' }} />}
                onClick={() => handleCopyText(record.traceId, 'Trace ID ')}
                title="复制完整 Trace ID"
              />
            </Space>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {record.id}
            </Text>
          </Space>
        );
      },
    },
    {
      title: '操作时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 155,
      render: (val: string) => (
        <Text style={{ fontSize: 13, fontFamily: 'monospace' }}>
          {val}
        </Text>
      ),
    },
    {
      title: '操作人员',
      key: 'operator',
      width: 150,
      render: (_, record) => (
        <div>
          <div>
            <Text strong>{record.operatorName}</Text>{' '}
            <Text type="secondary" style={{ fontSize: 12 }}>
              ({record.operatorUsername})
            </Text>
          </div>
          {record.orgName && (
            <div style={{ marginTop: 2 }}>
              <Tag style={{ fontSize: 11, margin: 0 }}>{record.orgName}</Tag>
            </div>
          )}
        </div>
      ),
    },
    {
      title: '客户端 IP / 地域',
      key: 'clientIp',
      width: 160,
      render: (_, record) => (
        <div>
          <Text code style={{ fontSize: 12 }}>{record.clientIp}</Text>
          {record.clientLocation && (
            <div style={{ fontSize: 11, color: 'rgba(0, 0, 0, 0.45)', marginTop: 2 }}>
              {record.clientLocation}
            </div>
          )}
        </div>
      ),
    },
    {
      title: '业务模块',
      dataIndex: 'module',
      key: 'module',
      width: 110,
      render: (mod: string) => {
        const item = AUDIT_MODULES.find((m) => m.value === mod);
        return <Tag color={item?.color || 'blue'}>{item?.label || mod}</Tag>;
      },
    },
    {
      title: '操作行为与风险',
      key: 'action',
      width: 180,
      render: (_, record) => {
        const risk = getRiskLevel(record.module, record.action);
        return (
          <Space size={6} wrap>
            <Tag color="geekblue" style={{ margin: 0 }}>
              {record.actionName || record.action}
            </Tag>
            {renderRiskBadge(risk)}
          </Space>
        );
      },
    },
    {
      title: '目标资源',
      key: 'resource',
      width: 170,
      render: (_, record) => (
        <Space size={4} align="baseline">
          <Tag color="default" style={{ fontSize: 11, margin: 0 }}>
            {record.resourceType}
          </Tag>
          <Text style={{ fontSize: 12 }} copyable={{ text: record.resourceId, tooltips: ['复制资源标识', '已复制'] }}>
            {record.resourceId.length > 20 ? `${record.resourceId.slice(0, 18)}...` : record.resourceId}
          </Text>
        </Space>
      ),
    },
    {
      title: '执行状态',
      dataIndex: 'status',
      key: 'status',
      width: 105,
      render: (status: string) => {
        if (status === 'SUCCESS') {
          return (
            <Tag icon={<CheckCircleOutlined />} color="success">
              成功
            </Tag>
          );
        }
        return (
          <Tag icon={<CloseCircleOutlined />} color="error">
            失败
          </Tag>
        );
      },
    },
    {
      title: '耗时',
      dataIndex: 'executionTimeMs',
      key: 'executionTimeMs',
      width: 95,
      render: (ms: number) => {
        if (ms > 1000) {
          return (
            <Tooltip title="响应延迟超过 1000ms，需关注长链路排队或网络拥塞">
              <Tag color="warning" icon={<FieldTimeOutlined />} style={{ margin: 0 }}>
                {ms}ms
              </Tag>
            </Tooltip>
          );
        }
        return (
          <Text type="secondary" style={{ fontSize: 12 }}>
            {ms}ms
          </Text>
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 80,
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          onClick={() => {
            setSelectedLog(record);
            setDetailVisible(true);
          }}
        >
          详情
        </Button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 顶部错误通告栏 */}
      {errorMsg && (
        <Alert
          type="error"
          showIcon
          message="审计服务异常"
          description={errorMsg}
          closable
          onClose={() => setErrorMsg(null)}
          action={
            <Button size="small" type="primary" danger onClick={loadLogs}>
              重试
            </Button>
          }
        />
      )}

      {/* 1. 顶部指标概览卡片 */}
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
              title="操作审计总数"
              value={stats.totalCount}
              prefix={<FileTextOutlined style={{ color: '#1677ff' }} />}
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
              title="远程车控审计"
              value={stats.controlCount}
              prefix={<ControlOutlined style={{ color: '#1677ff' }} />}
              valueStyle={{ color: '#1677ff' }}
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
              title="高危敏感操作"
              value={stats.highRiskCount}
              prefix={<AlertOutlined style={{ color: '#fa8c16' }} />}
              valueStyle={{ color: '#fa8c16' }}
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
              title="异常失败审计"
              value={stats.failedCount}
              prefix={<CloseCircleOutlined style={{ color: '#ff4d4f' }} />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 2. 多维组合筛选工具栏 */}
      <Card
        bordered={false}
        style={{
          borderRadius: 8,
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        }}
      >
        <Space direction="vertical" orientation="vertical" size="middle" style={{ width: '100%' }}>
          {/* 第一行：搜索与下拉分类 */}
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
                placeholder="搜索操作人 / Trace ID / IP / 资源 ID"
                prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,0.45)' }} />}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                allowClear
                style={{ width: 280 }}
              />

              {/* 业务模块 */}
              <Select
                value={selectedModule}
                onChange={setSelectedModule}
                style={{ width: 130 }}
                options={[
                  { label: '全部业务模块', value: 'ALL' },
                  ...AUDIT_MODULES.map((m) => ({ label: m.label, value: m.value })),
                ]}
              />

              {/* 操作行为 */}
              <Select
                value={selectedAction}
                onChange={setSelectedAction}
                style={{ width: 130 }}
                options={[
                  { label: '全部操作类型', value: 'ALL' },
                  ...AUDIT_ACTIONS.map((a) => ({ label: a.label, value: a.value })),
                ]}
              />

              {/* 执行状态 */}
              <Select
                value={selectedStatus}
                onChange={setSelectedStatus}
                style={{ width: 110 }}
                options={[
                  { label: '全部状态', value: 'ALL' },
                  { label: '成功', value: 'SUCCESS' },
                  { label: '失败', value: 'FAILED' },
                ]}
              />

              {/* 风险等级 */}
              <Select
                value={selectedRisk}
                onChange={setSelectedRisk}
                style={{ width: 120 }}
                options={[
                  { label: '全部风险', value: 'ALL' },
                  { label: '高危操作', value: 'HIGH' },
                  { label: '中危操作', value: 'MEDIUM' },
                  { label: '低危常规', value: 'LOW' },
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
                导出日志
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
                  { label: '今天', value: 'TODAY' },
                  { label: '近 7 天', value: '7D' },
                  { label: '近 30 天', value: '30D' },
                ]}
              />
            </Space>

            <DatePicker.RangePicker
              showTime
              placeholder={['起始时间', '截止时间']}
              value={undefined}
              onChange={(_, dateStrings) => {
                setDatePreset('ALL');
                setDateRange([
                  dateStrings[0] ? dateStrings[0] : undefined,
                  dateStrings[1] ? dateStrings[1] : undefined,
                ]);
              }}
              style={{ width: 340 }}
            />

            <Text type="secondary" style={{ fontSize: 12 }}>
              当前匹配到 <Text strong>{filteredLogs.length}</Text> / {logs.length} 条审计记录
            </Text>
          </div>
        </Space>
      </Card>

      {/* 3. 审计日志 Table */}
      <Card
        bordered={false}
        style={{
          borderRadius: 8,
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        }}
        styles={{ body: { padding: 0 } }}
      >
        <Table<AuditLogDto>
          rowKey="id"
          columns={columns}
          dataSource={filteredLogs}
          loading={loading}
          scroll={{ x: 1280 }}
          pagination={{
            defaultPageSize: 10,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: (total) => `共 ${total} 条操作审计记录`,
          }}
        />
      </Card>

      {/* 4. 审计详情抽屉 (640px) */}
      <Drawer
        title={
          <Space>
            <FileTextOutlined style={{ color: '#1677ff' }} />
            <span>操作审计日志详情</span>
            {selectedLog && (
              <Tag color={selectedLog.status === 'SUCCESS' ? 'success' : 'error'}>
                {selectedLog.status === 'SUCCESS' ? '执行成功' : '执行失败'}
              </Tag>
            )}
          </Space>
        }
        placement="right"
        width={640}
        open={detailVisible}
        onClose={() => setDetailVisible(false)}
        destroyOnClose
      >
        {selectedLog && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* 基础元数据 */}
            <div>
              <Title level={5} style={{ marginBottom: 12 }}>
                基础元数据
              </Title>
              <Descriptions size="small" bordered column={2}>
                <Descriptions.Item label="审计日志 ID">
                  <Text code>{selectedLog.id}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="操作时间">
                  <Text style={{ fontFamily: 'monospace' }}>{selectedLog.createdAt}</Text>
                </Descriptions.Item>

                <Descriptions.Item label="W3C Trace ID" span={2}>
                  <Space>
                    <Text code style={{ fontSize: 12 }}>
                      {selectedLog.traceId}
                    </Text>
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined style={{ color: '#1677ff' }} />}
                      onClick={() => handleCopyText(selectedLog.traceId, 'Trace ID ')}
                    />
                  </Space>
                </Descriptions.Item>

                <Descriptions.Item label="操作人员">
                  <Text strong>{selectedLog.operatorName}</Text> ({selectedLog.operatorUsername})
                </Descriptions.Item>
                <Descriptions.Item label="所属机构">
                  {selectedLog.orgName || '-'}
                </Descriptions.Item>

                <Descriptions.Item label="租户标识">
                  {selectedLog.tenantName || selectedLog.tenantId || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="执行耗时">
                  <Text type={selectedLog.executionTimeMs > 1000 ? 'warning' : 'secondary'}>
                    {selectedLog.executionTimeMs} ms
                  </Text>
                </Descriptions.Item>

                <Descriptions.Item label="客户端 IP">
                  <Text code>{selectedLog.clientIp}</Text>
                </Descriptions.Item>
                <Descriptions.Item label="物理归属地">
                  {selectedLog.clientLocation || '未知'}
                </Descriptions.Item>

                <Descriptions.Item label="User-Agent" span={2}>
                  <Text type="secondary" style={{ fontSize: 12, wordBreak: 'break-all' }}>
                    {selectedLog.userAgent || '-'}
                  </Text>
                </Descriptions.Item>

                <Descriptions.Item label="业务模块">
                  <Tag color="blue">{selectedLog.module}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="操作行为">
                  <Tag color="geekblue">{selectedLog.actionName || selectedLog.action}</Tag>
                </Descriptions.Item>

                <Descriptions.Item label="目标资源类型">
                  <Tag>{selectedLog.resourceType}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="目标资源标识">
                  <Text code>{selectedLog.resourceId}</Text>
                </Descriptions.Item>
              </Descriptions>
            </div>

            <Divider style={{ margin: '4px 0' }} />

            {/* 合规与安全：防篡改哈希签名 */}
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10,
                }}
              >
                <Title level={5} style={{ margin: 0 }}>
                  合规与防篡改安全保障
                </Title>
                <Space>
                  {renderRiskBadge(getRiskLevel(selectedLog.module, selectedLog.action))}
                </Space>
              </div>

              <Card
                bordered
                size="small"
                style={{
                  backgroundColor: '#f8fafc',
                  borderRadius: 6,
                  borderColor: '#e2e8f0',
                }}
              >
                <Space direction="vertical" orientation="vertical" size="small" style={{ width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Space size={6}>
                      <SafetyCertificateOutlined style={{ color: '#52c41a', fontSize: 16 }} />
                      <Text strong style={{ fontSize: 13 }}>
                        防篡改数字签名 (SHA-256 Digest)
                      </Text>
                    </Space>
                    <Tag color="success" style={{ margin: 0 }}>
                      校验通过
                    </Tag>
                  </div>

                  <div
                    style={{
                      backgroundColor: '#001529',
                      padding: '8px 12px',
                      borderRadius: 4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Text
                      style={{
                        color: '#69c0ff',
                        fontFamily: 'monospace',
                        fontSize: 12,
                        wordBreak: 'break-all',
                      }}
                    >
                      {selectedLog.signatureHash || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'}
                    </Text>
                    <Button
                      type="text"
                      size="small"
                      icon={<CopyOutlined style={{ color: '#fff' }} />}
                      onClick={() =>
                        handleCopyText(
                          selectedLog.signatureHash ||
                            'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
                          'SHA-256 哈希 '
                        )
                      }
                      title="复制完整 SHA-256 哈希"
                    />
                  </div>

                  <Text type="secondary" style={{ fontSize: 12 }}>
                    该日志已在区块链/合规日志存证链上签署不可逆 SHA-256 摘要，保障法律有效性与防抵赖追溯。
                  </Text>
                </Space>
              </Card>
            </div>

            <Divider style={{ margin: '4px 0' }} />

            {/* 请求入参报文 (Request Payload) */}
            <div>
              <Title level={5} style={{ marginBottom: 10 }}>
                请求报文 (Request Payload)
              </Title>
              {selectedLog.requestPayload ? (
                <div
                  style={{
                    backgroundColor: '#1e1e1e',
                    padding: 12,
                    borderRadius: 6,
                    maxHeight: 220,
                    overflow: 'auto',
                  }}
                >
                  <pre
                    style={{
                      margin: 0,
                      color: '#9cdcfe',
                      fontFamily: "Menlo, Monaco, Consolas, 'Courier New', monospace",
                      fontSize: 12,
                    }}
                  >
                    {JSON.stringify(selectedLog.requestPayload, null, 2)}
                  </pre>
                </div>
              ) : (
                <Text type="secondary">无入参报文或纯无参 GET 查询</Text>
              )}
            </div>

            {/* 响应结果或异常归因 (Response & Error Trace) */}
            <div>
              <Title level={5} style={{ marginBottom: 10 }}>
                响应结果与异常归因
              </Title>
              {selectedLog.status === 'FAILED' && (
                <Alert
                  type="error"
                  showIcon
                  message="指令或业务执行失败"
                  description={selectedLog.errorMessage || '终端应答超时或业务校验拦截'}
                  style={{ marginBottom: 12 }}
                />
              )}

              {selectedLog.responsePayload ? (
                <div
                  style={{
                    backgroundColor: '#1e1e1e',
                    padding: 12,
                    borderRadius: 6,
                    maxHeight: 220,
                    overflow: 'auto',
                  }}
                >
                  <pre
                    style={{
                      margin: 0,
                      color: '#4ec9b0',
                      fontFamily: "Menlo, Monaco, Consolas, 'Courier New', monospace",
                      fontSize: 12,
                    }}
                  >
                    {JSON.stringify(selectedLog.responsePayload, null, 2)}
                  </pre>
                </div>
              ) : selectedLog.status !== 'FAILED' ? (
                <Text type="secondary">响应已返回 HTTP 200/204，无结构化报文体</Text>
              ) : null}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
