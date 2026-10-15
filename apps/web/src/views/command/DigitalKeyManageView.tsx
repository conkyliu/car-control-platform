import React, { useState, useEffect, useMemo } from 'react';
import {
  Card,
  Row,
  Col,
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Input,
  Select,
  DatePicker,
  Modal,
  Form,
  Radio,
  Switch,
  InputNumber,
  Checkbox,
  Popconfirm,
  Drawer,
  Timeline,
  Progress,
  Tooltip,
  Badge,
  message,
  notification,
  Divider,
  Alert,
  Statistic,
  Descriptions,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  KeyOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  StopOutlined,
  SafetyCertificateOutlined,
  CopyOutlined,
  CarOutlined,
  UserOutlined,
  PhoneOutlined,
  LockOutlined,
  ThunderboltOutlined,
  FireOutlined,
  ControlOutlined,
  CompassOutlined,
  CloudOutlined,
  CreditCardOutlined,
  InfoCircleOutlined,
  ExclamationCircleOutlined,
  SecurityScanOutlined,
  FileProtectOutlined,
} from '@ant-design/icons';
import { CommandCode, SecurityLevel } from '@car-control/contracts';
import {
  type DigitalKeyDto,
  type DigitalKeyType,
  type DigitalKeyStatus,
  type DigitalKeyQueryParams,
  type CreateDigitalKeyInput,
  type DigitalKeyStats,
  validateRecipientPhone,
  maskPhone,
  isKeyCurrentlyValid,
  calculateDigitalKeyStats,
  isKeyExpiringSoon,
  calculateRemainingHours,
  generateSimulatedCertificateFingerprint,
  DIGITAL_KEY_TYPE_META,
  DIGITAL_KEY_STATUS_META,
} from './digital-key-core.ts';
import {
  fetchDigitalKeysApi,
  createDigitalKeyApi,
  revokeDigitalKeyApi,
} from '../../api/digital-key.ts';
import { COMMAND_METADATA } from './command-core.ts';
import { SEED_WORKBENCH_VEHICLES } from './command-core.ts';

const { Title, Text, Paragraph } = Typography;

// 指令分组定义
const PERMISSION_GROUPS = [
  {
    key: 'DOOR_TRUNK',
    title: '门锁与后备箱',
    color: '#1677ff',
    codes: [
      CommandCode.CMD_LOCK,
      CommandCode.CMD_UNLOCK,
      CommandCode.CMD_TRUNK_OPEN,
      CommandCode.CMD_TRUNK_CLOSE,
    ],
  },
  {
    key: 'POWER_SEARCH',
    title: '动力与寻车',
    color: '#faad14',
    codes: [
      CommandCode.CMD_FIND_VEHICLE,
      CommandCode.CMD_ENGINE_START,
      CommandCode.CMD_ENGINE_STOP,
    ],
  },
  {
    key: 'CLIMATE',
    title: '座舱温控',
    color: '#52c41a',
    codes: [
      CommandCode.CMD_AC_START,
      CommandCode.CMD_AC_STOP,
      CommandCode.CMD_SEAT_HEAT,
    ],
  },
  {
    key: 'WINDOW_SUNROOF',
    title: '车窗天窗',
    color: '#722ed1',
    codes: [
      CommandCode.CMD_WINDOW_OPEN,
      CommandCode.CMD_WINDOW_CLOSE,
      CommandCode.CMD_SUNROOF_CONTROL,
    ],
  },
];

export const DigitalKeyManageView: React.FC = () => {
  // 数据与状态
  const [keys, setKeys] = useState<DigitalKeyDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // 筛选条件
  const [keyword, setKeyword] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<DigitalKeyType | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<DigitalKeyStatus | undefined>(undefined);
  const [dateRange, setDateRange] = useState<[string | undefined, string | undefined]>([
    undefined,
    undefined,
  ]);
  const [rangePickerKey, setRangePickerKey] = useState<number>(1);

  // 抽屉与模态框状态
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<DigitalKeyDto | null>(null);

  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [issueForm] = Form.useForm();
  const [limitUsage, setLimitUsage] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState<CommandCode[]>([
    CommandCode.CMD_LOCK,
    CommandCode.CMD_UNLOCK,
    CommandCode.CMD_FIND_VEHICLE,
    CommandCode.CMD_AC_START,
    CommandCode.CMD_AC_STOP,
  ]);

  // 加载数据
  const loadKeys = async () => {
    setLoading(true);
    try {
      const queryParams: DigitalKeyQueryParams = {
        keyword: keyword.trim() || undefined,
        keyType: typeFilter,
        status: statusFilter,
        startDate: dateRange[0],
        endDate: dateRange[1],
      };
      const res = await fetchDigitalKeysApi(queryParams);
      setKeys(res);
      // 若当前选中的钥匙更新了，同步更新详情
      if (selectedKey) {
        const updated = res.find((k) => k.id === selectedKey.id);
        if (updated) setSelectedKey(updated);
      }
    } catch (err) {
      console.error('Failed to fetch digital keys:', err);
      message.error('获取数字钥匙列表失败，已自动降级为本地离线数据');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, [keyword, typeFilter, statusFilter, dateRange]);

  // 重置筛选
  const handleResetFilters = () => {
    setKeyword('');
    setTypeFilter(undefined);
    setStatusFilter(undefined);
    setDateRange([undefined, undefined]);
    setRangePickerKey((k) => k + 1);
  };

  // 吊销数字钥匙
  const handleRevokeKey = async (key: DigitalKeyDto, customReason?: string) => {
    setActionLoading(true);
    try {
      const reason = customReason || '管理员安全中心手动吊销并下发 CRL 吊销名单';
      await revokeDigitalKeyApi(key.id, reason);
      notification.success({
        message: '数字钥匙已安全吊销',
        description: `钥匙 ${key.keyNumber} 已作废，CRL 吊销黑名单已实时同步至车端网关。`,
      });
      await loadKeys();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '吊销钥匙失败';
      message.error(msg);
    } finally {
      setActionLoading(false);
    }
  };

  // 提交发放数字钥匙
  const handleIssueSubmit = async () => {
    try {
      const values = await issueForm.validateFields();
      const phoneValidation = validateRecipientPhone(values.recipientPhone);
      if (!phoneValidation.valid) {
        message.error(phoneValidation.message || '接收人手机号码格式不正确');
        return;
      }

      if (selectedPermissions.length === 0) {
        message.warning('请至少为该钥匙分配一项可控操作权限！');
        return;
      }

      setActionLoading(true);

      const [startStr, endStr] = values.validityDates || [];
      const startTime =
        startStr || new Date().toISOString().replace('T', ' ').slice(0, 19);
      const endTime =
        endStr ||
        new Date(Date.now() + 30 * 24 * 3600 * 1000)
          .toISOString()
          .replace('T', ' ')
          .slice(0, 19);

      const targetVeh = SEED_WORKBENCH_VEHICLES.find((v) => v.id === values.vehicleId);

      const input: CreateDigitalKeyInput = {
        vehicleId: values.vehicleId,
        plateNumber: targetVeh?.plateNumber,
        vin: targetVeh?.vin,
        ownerName: '平台认证车主',
        ownerPhone: '13800138000',
        recipientName: values.recipientName.trim(),
        recipientPhone: values.recipientPhone.trim(),
        keyType: values.keyType,
        startTime,
        endTime,
        maxUsageCount: limitUsage ? values.maxUsageCount : undefined,
        permissions: selectedPermissions,
      };

      const created = await createDigitalKeyApi(input);

      notification.success({
        message: '数字钥匙发放成功',
        description: `钥匙序列号 ${created.keyNumber} 已成功生成并下发至 ${input.recipientName} (${maskPhone(input.recipientPhone)})。`,
      });

      setIssueModalOpen(false);
      issueForm.resetFields();
      setLimitUsage(false);
      setSelectedPermissions([
        CommandCode.CMD_LOCK,
        CommandCode.CMD_UNLOCK,
        CommandCode.CMD_FIND_VEHICLE,
        CommandCode.CMD_AC_START,
        CommandCode.CMD_AC_STOP,
      ]);

      await loadKeys();
    } catch (err: unknown) {
      if (err instanceof Error) {
        message.error(err.message);
      }
    } finally {
      setActionLoading(false);
    }
  };

  // 统计指标计算
  const stats: DigitalKeyStats = useMemo(() => {
    return calculateDigitalKeyStats(keys);
  }, [keys]);

  // 表格列定义
  const columns: ColumnsType<DigitalKeyDto> = [
    {
      title: '钥匙序列号 & 介质类型',
      dataIndex: 'keyNumber',
      key: 'keyNumber',
      width: 220,
      render: (val: string, record) => {
        const typeMeta = DIGITAL_KEY_TYPE_META[record.keyType];
        return (
          <Space orientation="vertical" size={2}>
            <Text
              strong
              copyable
              style={{
                fontFamily: 'monospace',
                fontSize: 13,
                letterSpacing: 0.5,
              }}
            >
              {val}
            </Text>
            <div>
              <Tag
                color={typeMeta.tagColor}
                icon={
                  record.keyType === 'BLE' ? (
                    <CompassOutlined />
                  ) : record.keyType === 'CLOUD' ? (
                    <CloudOutlined />
                  ) : (
                    <CreditCardOutlined />
                  )
                }
                style={{ fontSize: 11 }}
              >
                {typeMeta.label}
              </Tag>
            </div>
          </Space>
        );
      },
    },
    {
      title: '授权车辆',
      dataIndex: 'plateNumber',
      key: 'plateNumber',
      width: 170,
      render: (val: string, record) => (
        <Tooltip
          title={
            <div>
              <div>VIN: {record.vin}</div>
              <div style={{ color: 'rgba(255,255,255,0.7)' }}>ID: {record.vehicleId}</div>
            </div>
          }
        >
          <Space direction="vertical" size={2}>
            <Tag color="blue" style={{ fontWeight: 600 }}>
              {val}
            </Tag>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {record.vin.slice(0, 8)}...{record.vin.slice(-4)}
            </Text>
          </Space>
        </Tooltip>
      ),
    },
    {
      title: '车主 / 接收人',
      key: 'users',
      width: 200,
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <div>
            <Text strong>{record.recipientName}</Text>{' '}
            <Text type="secondary" style={{ fontSize: 12 }}>
              ({maskPhone(record.recipientPhone)})
            </Text>
          </div>
          <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)' }}>
            车主: {record.ownerName}
          </div>
        </Space>
      ),
    },
    {
      title: '有效时间区间',
      key: 'validity',
      width: 230,
      render: (_, record) => {
        const isExpiring = isKeyExpiringSoon(record, 24);
        const remainingHours = calculateRemainingHours(record.endTime);
        const isValidNow = isKeyCurrentlyValid(record);

        return (
          <Space direction="vertical" size={2}>
            <div style={{ fontSize: 12 }}>
              <div>起: {record.startTime}</div>
              <div>止: {record.endTime}</div>
            </div>
            {isExpiring && record.status === 'ACTIVE' && (
              <Tag color="warning" icon={<ClockCircleOutlined />}>
                即将到期 (剩 {remainingHours}h)
              </Tag>
            )}
            {!isValidNow && record.status === 'ACTIVE' && (
              <Tag color="default">未到生效时段</Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: '使用进度',
      key: 'usage',
      width: 180,
      render: (_, record) => {
        if (record.maxUsageCount === undefined || record.maxUsageCount === null) {
          return (
            <Space direction="vertical" size={2}>
              <Tag color="success">不限次数</Tag>
              <Text type="secondary" style={{ fontSize: 12 }}>
                已调用 {record.usedCount} 次
              </Text>
            </Space>
          );
        }

        const percent = Math.min(
          100,
          Math.round((record.usedCount / record.maxUsageCount) * 100)
        );
        const isFull = record.usedCount >= record.maxUsageCount;

        return (
          <div style={{ width: 140 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span>
                {record.usedCount}/{record.maxUsageCount} 次
              </span>
              <span>{percent}%</span>
            </div>
            <Progress
              percent={percent}
              size="small"
              status={isFull ? 'exception' : percent > 80 ? 'active' : 'normal'}
              showInfo={false}
            />
          </div>
        );
      },
    },
    {
      title: '权限范围',
      key: 'permissions',
      width: 220,
      render: (_, record) => {
        const permCodes = record.permissions || [];
        if (permCodes.length === 0) {
          return <Text type="secondary">无权限</Text>;
        }

        const displayed = permCodes.slice(0, 2);
        const rest = permCodes.slice(2);

        return (
          <Space size={[4, 4]} wrap>
            {displayed.map((c) => (
              <Tag key={c} style={{ fontSize: 11, marginInlineEnd: 4 }}>
                {COMMAND_METADATA[c]?.name || c}
              </Tag>
            ))}
            {rest.length > 0 && (
              <Tooltip
                title={
                  <div>
                    {rest.map((c) => (
                      <div key={c}>{COMMAND_METADATA[c]?.name || c}</div>
                    ))}
                  </div>
                }
              >
                <Tag color="processing" style={{ fontSize: 11, cursor: 'pointer' }}>
                  +{rest.length}
                </Tag>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    {
      title: '钥匙状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: DigitalKeyStatus) => {
        const meta = DIGITAL_KEY_STATUS_META[status];
        return (
          <Badge
            status={meta.badgeStatus}
            text={
              <Tag color={meta.tagColor} style={{ marginLeft: 6 }}>
                {meta.label}
              </Tag>
            }
          />
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right',
      width: 160,
      render: (_, record) => {
        const isRevoked = record.status === 'REVOKED';
        const isExpired = record.status === 'EXPIRED';
        const canRevoke = !isRevoked && !isExpired;

        return (
          <Space size="small">
            <Button
              type="link"
              size="small"
              onClick={() => {
                setSelectedKey(record);
                setDetailDrawerOpen(true);
              }}
            >
              详情
            </Button>

            <Popconfirm
              title="吊销作废数字钥匙"
              description={
                <div style={{ maxWidth: 280 }}>
                  <Text type="danger" strong>
                    ⚠️ 危险操作：
                  </Text>
                  <div>
                    作废后将下发 CRL 吊销黑名单至车端，接收人将立即失去该车辆的近场及远程控制权限，此操作不可逆！
                  </div>
                </div>
              }
              okText="确认吊销"
              okButtonProps={{ danger: true, loading: actionLoading }}
              cancelText="取消"
              disabled={!canRevoke}
              onConfirm={() => handleRevokeKey(record)}
            >
              <Button
                type="link"
                danger
                size="small"
                disabled={!canRevoke}
                title={
                  isRevoked
                    ? '该钥匙已作废'
                    : isExpired
                    ? '该钥匙已到期失效'
                    : '吊销作废钥匙'
                }
              >
                吊销作废
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      {/* 顶部标题与说明 */}
      <Card
        styles={{ body: { padding: '16px 20px' } }}
        style={{
          borderRadius: 8,
          marginBottom: 16,
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        }}
      >
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col xs={24} md={14}>
            <Space align="center" size="middle">
              <KeyOutlined style={{ fontSize: 24, color: '#1677ff' }} />
              <div>
                <Title level={4} style={{ margin: 0 }}>
                  数字钥匙授权与分享中心
                </Title>
                <Paragraph type="secondary" style={{ margin: 0, fontSize: 13 }}>
                  支持 BLE 低功耗蓝牙钥匙、Cloud 云端远程钥匙与 NFC 实体卡片的全生命周期鉴权管控与 CRL 安全吊销
                </Paragraph>
              </div>
            </Space>
          </Col>
          <Col xs={24} md={10} style={{ textAlign: 'right' }}>
            <Space wrap>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  issueForm.resetFields();
                  issueForm.setFieldsValue({
                    vehicleId: SEED_WORKBENCH_VEHICLES[0]!.id,
                    keyType: 'BLE',
                    maxUsageCount: 10,
                  });
                  setLimitUsage(false);
                  setIssueModalOpen(true);
                }}
              >
                发放数字钥匙
              </Button>
              <Button icon={<ReloadOutlined />} onClick={loadKeys} loading={loading}>
                刷新
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 4 张 KPI 指标卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <Card
            styles={{ body: { padding: '16px 20px' } }}
            style={{ borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)' }}
          >
            <Statistic
              title={
                <Space>
                  <FileProtectOutlined style={{ color: '#1677ff' }} />
                  <span>总数字钥匙数</span>
                </Space>
              }
              value={stats.totalCount}
              suffix="把"
              valueStyle={{ fontWeight: 700, color: '#1677ff' }}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
              BLE: {stats.typeDistribution.BLE} | 云端: {stats.typeDistribution.CLOUD} | NFC: {stats.typeDistribution.NFC}
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            styles={{ body: { padding: '16px 20px' } }}
            style={{ borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)' }}
          >
            <Statistic
              title={
                <Space>
                  <CheckCircleOutlined style={{ color: '#52c41a' }} />
                  <span>生效中授权 (ACTIVE)</span>
                </Space>
              }
              value={stats.activeCount}
              suffix="把"
              valueStyle={{ fontWeight: 700, color: '#52c41a' }}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
              累计鉴权调用: {stats.totalUsageCount} 次
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            styles={{ body: { padding: '16px 20px' } }}
            style={{ borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)' }}
          >
            <Statistic
              title={
                <Space>
                  <ClockCircleOutlined style={{ color: '#faad14' }} />
                  <span>已过期失效 (EXPIRED)</span>
                </Space>
              }
              value={stats.expiredCount}
              suffix="把"
              valueStyle={{ fontWeight: 700, color: '#faad14' }}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
              待激活授权: {stats.pendingCount} 把
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            styles={{ body: { padding: '16px 20px' } }}
            style={{ borderRadius: 8, boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)' }}
          >
            <Statistic
              title={
                <Space>
                  <StopOutlined style={{ color: '#ff4d4f' }} />
                  <span>已安全作废 (REVOKED)</span>
                </Space>
              }
              value={stats.revokedCount}
              suffix="把"
              valueStyle={{ fontWeight: 700, color: '#ff4d4f' }}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
              CRL 吊销名单已实时同步车端
            </div>
          </Card>
        </Col>
      </Row>

      {/* 过滤工具栏 Card */}
      <Card
        styles={{ body: { padding: '16px 20px' } }}
        style={{
          borderRadius: 8,
          marginBottom: 16,
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        }}
      >
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={12} md={6}>
            <Input
              placeholder="搜索钥匙编号/车牌/VIN/接收人/手机"
              prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,0.25)' }} />}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              allowClear
            />
          </Col>

          <Col xs={12} sm={6} md={4}>
            <Select
              style={{ width: '100%' }}
              placeholder="钥匙介质"
              value={typeFilter}
              onChange={setTypeFilter}
              allowClear
              options={[
                { label: '全部介质', value: undefined },
                { label: 'BLE 蓝牙钥匙', value: 'BLE' },
                { label: 'Cloud 云端钥匙', value: 'CLOUD' },
                { label: 'NFC 实体卡片', value: 'NFC' },
              ]}
            />
          </Col>

          <Col xs={12} sm={6} md={4}>
            <Select
              style={{ width: '100%' }}
              placeholder="钥匙状态"
              value={statusFilter}
              onChange={setStatusFilter}
              allowClear
              options={[
                { label: '全部状态', value: undefined },
                { label: '生效中 (ACTIVE)', value: 'ACTIVE' },
                { label: '待激活 (PENDING)', value: 'PENDING' },
                { label: '已过期 (EXPIRED)', value: 'EXPIRED' },
                { label: '已作废 (REVOKED)', value: 'REVOKED' },
              ]}
            />
          </Col>

          <Col xs={24} sm={12} md={6}>
            <DatePicker.RangePicker
              key={rangePickerKey}
              showTime
              placeholder={['创建起始时间', '创建截止时间']}
              style={{ width: '100%' }}
              onChange={(_, dateStrings) => {
                setDateRange([
                  dateStrings[0] ? dateStrings[0] : undefined,
                  dateStrings[1] ? dateStrings[1] : undefined,
                ]);
              }}
            />
          </Col>

          <Col xs={24} sm={12} md={4} style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={handleResetFilters}>重置</Button>
              <Button type="primary" onClick={loadKeys}>
                查询
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 主表格 Card */}
      <Card
        styles={{ body: { padding: '0' } }}
        style={{
          borderRadius: 8,
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
          overflow: 'hidden',
        }}
      >
        <Table<DigitalKeyDto>
          rowKey="id"
          columns={columns}
          dataSource={keys}
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 把数字钥匙`,
          }}
          scroll={{ x: 1300 }}
        />
      </Card>

      {/* 发放数字钥匙模态框 (IssueDigitalKeyModal) */}
      <Modal
        title={
          <Space>
            <KeyOutlined style={{ color: '#1677ff' }} />
            <span>发放并授权数字钥匙</span>
          </Space>
        }
        open={issueModalOpen}
        onCancel={() => {
          setIssueModalOpen(false);
          issueForm.resetFields();
        }}
        onOk={handleIssueSubmit}
        confirmLoading={actionLoading}
        width={720}
        destroyOnClose
      >
        <Form form={issueForm} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={24}>
              <Form.Item
                name="vehicleId"
                label="目标车辆"
                rules={[{ required: true, message: '请选择目标授权车辆' }]}
              >
                <Select
                  placeholder="请选择授权车辆"
                  options={SEED_WORKBENCH_VEHICLES.map((v) => ({
                    value: v.id,
                    label: `${v.plateNumber} · ${v.brandName} ${v.modelName} (VIN: ${v.vin})`,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="recipientName"
                label="被授权人姓名"
                rules={[{ required: true, message: '请输入被授权人姓名' }]}
              >
                <Input placeholder="例如：李思源" prefix={<UserOutlined />} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="recipientPhone"
                label="被授权人手机号码"
                rules={[
                  { required: true, message: '请输入被授权人手机号' },
                  {
                    validator: (_, value) => {
                      const res = validateRecipientPhone(value);
                      if (res.valid) return Promise.resolve();
                      return Promise.reject(new Error(res.message));
                    },
                  },
                ]}
              >
                <Input placeholder="例如：13912345678" prefix={<PhoneOutlined />} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={24}>
              <Form.Item
                name="keyType"
                label="数字钥匙通信介质"
                rules={[{ required: true, message: '请选择钥匙介质类型' }]}
                initialValue="BLE"
              >
                <Radio.Group style={{ width: '100%' }}>
                  <Row gutter={12}>
                    <Col span={8}>
                      <Radio.Button
                        value="BLE"
                        style={{
                          width: '100%',
                          height: 'auto',
                          padding: '10px 12px',
                          borderRadius: 6,
                        }}
                      >
                        <Space direction="vertical" size={2}>
                          <Space>
                            <CompassOutlined style={{ color: '#1677ff' }} />
                            <Text strong>BLE 蓝牙钥匙</Text>
                          </Space>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            地库近场离线通讯与迎宾感应
                          </Text>
                        </Space>
                      </Radio.Button>
                    </Col>
                    <Col span={8}>
                      <Radio.Button
                        value="CLOUD"
                        style={{
                          width: '100%',
                          height: 'auto',
                          padding: '10px 12px',
                          borderRadius: 6,
                        }}
                      >
                        <Space direction="vertical" size={2}>
                          <Space>
                            <CloudOutlined style={{ color: '#13c2c2' }} />
                            <Text strong>Cloud 云端钥匙</Text>
                          </Space>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            基于 MQTT/HTTPS 远程鉴权
                          </Text>
                        </Space>
                      </Radio.Button>
                    </Col>
                    <Col span={8}>
                      <Radio.Button
                        value="NFC"
                        style={{
                          width: '100%',
                          height: 'auto',
                          padding: '10px 12px',
                          borderRadius: 6,
                        }}
                      >
                        <Space direction="vertical" size={2}>
                          <Space>
                            <CreditCardOutlined style={{ color: '#722ed1' }} />
                            <Text strong>NFC 实体卡片</Text>
                          </Space>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            B 柱近场刷卡高频离线鉴权
                          </Text>
                        </Space>
                      </Radio.Button>
                    </Col>
                  </Row>
                </Radio.Group>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={16}>
              <Form.Item
                name="validityDates"
                label="钥匙有效期 (起止时段)"
                extra="未指定时默认从当前起有效 30 天"
              >
                <DatePicker.RangePicker
                  showTime
                  style={{ width: '100%' }}
                  placeholder={['开始生效时间', '到期失效时间']}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="使用次数限制">
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  <Space>
                    <Switch
                      checked={limitUsage}
                      onChange={setLimitUsage}
                      checkedChildren="限制"
                      unCheckedChildren="不限"
                    />
                    <Text style={{ fontSize: 12 }}>
                      {limitUsage ? '限制总调用次数' : '不限次数'}
                    </Text>
                  </Space>
                  {limitUsage && (
                    <Form.Item
                      name="maxUsageCount"
                      noStyle
                      rules={[{ required: true, message: '请输入最大可用次数' }]}
                      initialValue={10}
                    >
                      <InputNumber
                        min={1}
                        max={1000}
                        style={{ width: '100%' }}
                        placeholder="最大可用次数"
                        addonAfter="次"
                      />
                    </Form.Item>
                  )}
                </Space>
              </Form.Item>
            </Col>
          </Row>

          <Divider style={{ margin: '12px 0' }} />

          {/* 权限勾选矩阵 */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <Text strong style={{ fontSize: 14 }}>
                可控权限范围配置 (共 13 类指令)：
              </Text>
              <Space size="small">
                <Button
                  size="small"
                  type="link"
                  onClick={() => {
                    const allCodes = PERMISSION_GROUPS.flatMap((g) => g.codes);
                    setSelectedPermissions(allCodes);
                  }}
                >
                  全选所有
                </Button>
                <Button
                  size="small"
                  type="link"
                  onClick={() => {
                    // 仅选择排除 L2 发动机指令的安全指令
                    const safeCodes = PERMISSION_GROUPS.flatMap((g) => g.codes).filter(
                      (c) =>
                        c !== CommandCode.CMD_ENGINE_START &&
                        c !== CommandCode.CMD_ENGINE_STOP
                    );
                    setSelectedPermissions(safeCodes);
                  }}
                >
                  常用安全权限
                </Button>
                <Button
                  size="small"
                  type="link"
                  danger
                  onClick={() => setSelectedPermissions([])}
                >
                  清空
                </Button>
              </Space>
            </div>

            <Row gutter={[12, 12]}>
              {PERMISSION_GROUPS.map((group) => {
                const isGroupAll = group.codes.every((c) =>
                  selectedPermissions.includes(c)
                );
                const isGroupSome =
                  group.codes.some((c) => selectedPermissions.includes(c)) &&
                  !isGroupAll;

                const toggleGroup = () => {
                  if (isGroupAll) {
                    setSelectedPermissions((prev) =>
                      prev.filter((c) => !group.codes.includes(c))
                    );
                  } else {
                    setSelectedPermissions((prev) => [
                      ...prev,
                      ...group.codes.filter((c) => !prev.includes(c)),
                    ]);
                  }
                };

                return (
                  <Col span={12} key={group.key}>
                    <Card
                      size="small"
                      title={
                        <Space>
                          <Checkbox
                            checked={isGroupAll}
                            indeterminate={isGroupSome}
                            onChange={toggleGroup}
                          />
                          <span style={{ fontSize: 13, fontWeight: 600 }}>
                            {group.title}
                          </span>
                        </Space>
                      }
                      styles={{ body: { padding: '8px 12px' } }}
                      style={{ borderRadius: 6, background: '#fafafa' }}
                    >
                      <Space direction="vertical" size={6} style={{ width: '100%' }}>
                        {group.codes.map((code) => {
                          const meta = COMMAND_METADATA[code];
                          const checked = selectedPermissions.includes(code);
                          return (
                            <Checkbox
                              key={code}
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedPermissions((prev) => [...prev, code]);
                                } else {
                                  setSelectedPermissions((prev) =>
                                    prev.filter((c) => c !== code)
                                  );
                                }
                              }}
                            >
                              <Space size={6}>
                                <span>{meta?.name || code}</span>
                                {meta?.securityLevel === SecurityLevel.L2 && (
                                  <Tag color="error" style={{ fontSize: 10 }}>
                                    L2高危
                                  </Tag>
                                )}
                              </Space>
                            </Checkbox>
                          );
                        })}
                      </Space>
                    </Card>
                  </Col>
                );
              })}
            </Row>
          </div>
        </Form>
      </Modal>

      {/* 数字钥匙详情滑出抽屉 (DigitalKeyDetailDrawer) */}
      <Drawer
        title={
          selectedKey ? (
            <Space align="center">
              <SecurityScanOutlined style={{ color: '#1677ff', fontSize: 18 }} />
              <span>数字钥匙详情 · {selectedKey.keyNumber}</span>
              <Tag color={DIGITAL_KEY_STATUS_META[selectedKey.status].tagColor}>
                {DIGITAL_KEY_STATUS_META[selectedKey.status].label}
              </Tag>
            </Space>
          ) : (
            '数字钥匙详情'
          )
        }
        open={detailDrawerOpen}
        onClose={() => setDetailDrawerOpen(false)}
        width={620}
        destroyOnClose
        extra={
          selectedKey &&
          selectedKey.status !== 'REVOKED' &&
          selectedKey.status !== 'EXPIRED' ? (
            <Popconfirm
              title="吊销作废钥匙"
              description="确认紧急吊销该数字钥匙并下发 CRL 吊销黑名单至车端吗？"
              okText="确认吊销"
              okButtonProps={{ danger: true, loading: actionLoading }}
              cancelText="取消"
              onConfirm={() => {
                handleRevokeKey(selectedKey);
                setDetailDrawerOpen(false);
              }}
            >
              <Button type="primary" danger size="small">
                紧急吊销此钥匙
              </Button>
            </Popconfirm>
          ) : undefined
        }
      >
        {selectedKey && (
          <div>
            {/* 模拟 SHA-256 数字证书卡片 */}
            <Card
              styles={{ body: { padding: '14px 16px' } }}
              style={{
                borderRadius: 8,
                background: '#f0f5ff',
                borderColor: '#adc6ff',
                marginBottom: 20,
              }}
            >
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Text strong style={{ color: '#1d39c4' }}>
                    <SafetyCertificateOutlined /> 国密与双向非对称加密安全证书
                  </Text>
                  <Tag color="geekblue">
                    {selectedKey.keyType === 'BLE'
                      ? 'BLE 5.2 / ECC-P256'
                      : selectedKey.keyType === 'CLOUD'
                      ? 'TLS 1.3 / MQTT-Auth'
                      : 'NFC ISO-14443A'}
                  </Tag>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.65)' }}>
                  证书公钥指纹 (Fingerprint)：
                </div>
                <Text
                  copyable
                  code
                  style={{
                    fontSize: 11,
                    wordBreak: 'break-all',
                    fontFamily: 'monospace',
                  }}
                >
                  {generateSimulatedCertificateFingerprint(selectedKey.keyNumber)}
                </Text>
              </Space>
            </Card>

            {/* 钥匙主体描述信息 */}
            <Descriptions
              title="核心档案"
              bordered
              size="small"
              column={1}
              styles={{ label: { width: 130, background: '#fafafa' } }}
              style={{ marginBottom: 20 }}
            >
              <Descriptions.Item label="钥匙序列号">
                <Text copyable strong style={{ fontFamily: 'monospace' }}>
                  {selectedKey.keyNumber}
                </Text>
              </Descriptions.Item>

              <Descriptions.Item label="介质类型">
                <Tag color={DIGITAL_KEY_TYPE_META[selectedKey.keyType].tagColor}>
                  {DIGITAL_KEY_TYPE_META[selectedKey.keyType].label}
                </Tag>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {DIGITAL_KEY_TYPE_META[selectedKey.keyType].description}
                </Text>
              </Descriptions.Item>

              <Descriptions.Item label="目标车辆">
                <Space>
                  <Tag color="blue">{selectedKey.plateNumber}</Tag>
                  <Text style={{ fontSize: 12 }}>VIN: {selectedKey.vin}</Text>
                </Space>
              </Descriptions.Item>

              <Descriptions.Item label="授权接收人">
                <Space>
                  <Text strong>{selectedKey.recipientName}</Text>
                  <Text copyable style={{ fontSize: 12 }}>
                    {maskPhone(selectedKey.recipientPhone)}
                  </Text>
                </Space>
              </Descriptions.Item>

              <Descriptions.Item label="授权车主">
                {selectedKey.ownerName} ({maskPhone(selectedKey.ownerPhone)})
              </Descriptions.Item>

              <Descriptions.Item label="有效时段">
                <div>起: {selectedKey.startTime}</div>
                <div>止: {selectedKey.endTime}</div>
              </Descriptions.Item>

              <Descriptions.Item label="使用次数限制">
                {selectedKey.maxUsageCount ? (
                  <span>
                    已使用 {selectedKey.usedCount} 次 / 最大限额{' '}
                    {selectedKey.maxUsageCount} 次
                  </span>
                ) : (
                  <Tag color="success">不限使用次数 (已调用 {selectedKey.usedCount} 次)</Tag>
                )}
              </Descriptions.Item>

              {selectedKey.revokedAt && (
                <Descriptions.Item label="安全吊销信息">
                  <div style={{ color: '#ff4d4f' }}>
                    <div>吊销时间: {selectedKey.revokedAt}</div>
                    <div>吊销原因: {selectedKey.revokedReason || '管理员手动吊销'}</div>
                  </div>
                </Descriptions.Item>
              )}
            </Descriptions>

            {/* 权限清单展示 */}
            <div style={{ marginBottom: 24 }}>
              <Title level={5} style={{ marginBottom: 12 }}>
                授权指令清单 ({selectedKey.permissions?.length || 0} 项)
              </Title>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  padding: 12,
                  background: '#fafafa',
                  borderRadius: 6,
                  border: '1px solid #f0f0f0',
                }}
              >
                {(selectedKey.permissions || []).map((code) => {
                  const meta = COMMAND_METADATA[code];
                  return (
                    <Tag
                      key={code}
                      color={
                        meta?.securityLevel === SecurityLevel.L2
                          ? 'error'
                          : meta?.securityLevel === SecurityLevel.L1
                          ? 'warning'
                          : 'blue'
                      }
                      style={{ padding: '4px 8px', fontSize: 12 }}
                    >
                      {meta?.name || code} ({meta?.securityLevel || 'L0'})
                    </Tag>
                  );
                })}
              </div>
            </div>

            {/* 全生命周期审计垂直时间轴 */}
            <div>
              <Title level={5} style={{ marginBottom: 16 }}>
                钥匙全生命周期审计轨迹
              </Title>
              <Timeline
                items={[
                  {
                    color: 'green',
                    children: (
                      <div>
                        <Text strong>钥匙初始化建档</Text>
                        <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                          {selectedKey.createdAt} · 平台管理员生成鉴权公私钥对
                        </div>
                      </div>
                    ),
                  },
                  {
                    color: 'blue',
                    children: (
                      <div>
                        <Text strong>权限分发与推送</Text>
                        <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                          已成功分发至接收人手机终端: {maskPhone(selectedKey.recipientPhone)}
                        </div>
                      </div>
                    ),
                  },
                  ...(selectedKey.usedCount > 0
                    ? [
                        {
                          color: 'blue',
                          children: (
                            <div>
                              <Text strong>终端离线/云端近场控车调用</Text>
                              <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                                累计鉴权并执行远程指令 {selectedKey.usedCount} 次
                              </div>
                            </div>
                          ),
                        },
                      ]
                    : []),
                  ...(selectedKey.status === 'REVOKED'
                    ? [
                        {
                          color: 'red',
                          children: (
                            <div>
                              <Text strong style={{ color: '#ff4d4f' }}>
                                钥匙安全吊销 (CRL 同步)
                              </Text>
                              <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.65)' }}>
                                {selectedKey.revokedAt} · 原因: {selectedKey.revokedReason}
                              </div>
                            </div>
                          ),
                        },
                      ]
                    : selectedKey.status === 'EXPIRED'
                    ? [
                        {
                          color: 'orange',
                          children: (
                            <div>
                              <Text strong style={{ color: '#faad14' }}>
                                授权有效期满自动失效
                              </Text>
                              <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                                截止时间: {selectedKey.endTime}
                              </div>
                            </div>
                          ),
                        },
                      ]
                    : [
                        {
                          color: 'gray',
                          children: (
                            <div>
                              <Text type="secondary">当前状态持续生效中...</Text>
                              <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                                截止失效时间: {selectedKey.endTime}
                              </div>
                            </div>
                          ),
                        },
                      ]),
                ]}
              />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default DigitalKeyManageView;
