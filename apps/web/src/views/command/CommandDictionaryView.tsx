import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Card,
  Row,
  Col,
  Table,
  Button,
  Input,
  Select,
  Tag,
  Space,
  Badge,
  Typography,
  Tooltip,
  Drawer,
  Modal,
  Form,
  InputNumber,
  Descriptions,
  Alert,
  message,
} from 'antd';
import type { TableProps } from 'antd';
import {
  LockOutlined,
  UnlockOutlined,
  InboxOutlined,
  CarOutlined,
  BellOutlined,
  ThunderboltOutlined,
  PoweroffOutlined,
  FireOutlined,
  PauseCircleOutlined,
  HeatMapOutlined,
  DownSquareOutlined,
  UpSquareOutlined,
  BorderOutlined,
  SearchOutlined,
  DownloadOutlined,
  ReloadOutlined,
  EditOutlined,
  FileTextOutlined,
  CopyOutlined,
  InfoCircleOutlined,
  CodeOutlined,
  BookOutlined,
} from '@ant-design/icons';
import {
  CommandCode,
  SecurityLevel,
  CommandCategory,
  type CommandDictionaryItem,
  type ProtocolParamSchema,
  calculateDictionaryStats,
  filterDictionaryItems,
  generateDictionaryMarkdown,
  generateDictionaryCsv,
} from './command-dictionary-core.ts';
import { COMMAND_CATEGORY_MAP } from './capability-core.ts';
import {
  fetchCommandDictionaryApi,
  updateCommandDictionaryItemApi,
} from '../../api/command-dictionary.ts';

const { Title, Text, Paragraph } = Typography;

// 指令图标映射
const COMMAND_ICON_MAP: Record<CommandCode, React.ReactNode> = {
  [CommandCode.CMD_LOCK]: <LockOutlined />,
  [CommandCode.CMD_UNLOCK]: <UnlockOutlined />,
  [CommandCode.CMD_TRUNK_OPEN]: <InboxOutlined />,
  [CommandCode.CMD_TRUNK_CLOSE]: <CarOutlined />,
  [CommandCode.CMD_FIND_VEHICLE]: <BellOutlined />,
  [CommandCode.CMD_ENGINE_START]: <ThunderboltOutlined />,
  [CommandCode.CMD_ENGINE_STOP]: <PoweroffOutlined />,
  [CommandCode.CMD_AC_START]: <FireOutlined />,
  [CommandCode.CMD_AC_STOP]: <PauseCircleOutlined />,
  [CommandCode.CMD_SEAT_HEAT]: <HeatMapOutlined />,
  [CommandCode.CMD_WINDOW_OPEN]: <DownSquareOutlined />,
  [CommandCode.CMD_WINDOW_CLOSE]: <UpSquareOutlined />,
  [CommandCode.CMD_SUNROOF_CONTROL]: <BorderOutlined />,
};

// 安全等级色彩与标签定义
const SECURITY_LEVEL_TAG_MAP: Record<
  SecurityLevel,
  { label: string; color: string; desc: string }
> = {
  [SecurityLevel.L0]: { label: 'L0 无感直发', color: 'default', desc: '无需二次验证，常规读取/控车' },
  [SecurityLevel.L1]: { label: 'L1 二次确认', color: 'blue', desc: '弹窗二次确认，中风险开关' },
  [SecurityLevel.L2]: { label: 'L2 强安全码', color: 'red', desc: '强制校验6位安全码，高风险动力' },
};

// 文件下载辅助函数
function downloadBlob(content: string, filename: string, mimeType: string) {
  if (typeof window === 'undefined') return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface CommandDictionaryViewProps {
  isModal?: boolean;
  initialCommandCode?: CommandCode;
}

export const CommandDictionaryView: React.FC<CommandDictionaryViewProps> = ({
  isModal = false,
  initialCommandCode,
}) => {
  // 数据池与加载态
  const [items, setItems] = useState<CommandDictionaryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [updating, setUpdating] = useState<boolean>(false);

  // 筛选状态
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<CommandCategory | 'ALL'>('ALL');
  const [selectedSecurityLevel, setSelectedSecurityLevel] = useState<SecurityLevel | 'ALL'>('ALL');

  // Drawer 与 编辑弹窗
  const [detailDrawerOpen, setDetailDrawerOpen] = useState<boolean>(false);
  const [activeItem, setActiveItem] = useState<CommandDictionaryItem | null>(null);
  const [editModalOpen, setEditModalOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<CommandDictionaryItem | null>(null);

  const [editForm] = Form.useForm();

  // 加载字典数据
  const loadDictionary = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCommandDictionaryApi();
      setItems(data);
      if (initialCommandCode) {
        const found = data.find((i) => i.code === initialCommandCode);
        if (found) {
          setActiveItem(found);
          setDetailDrawerOpen(true);
        }
      }
    } catch (err: any) {
      message.error(err?.message || '加载指令字典失败');
    } finally {
      setLoading(false);
    }
  }, [initialCommandCode]);

  useEffect(() => {
    loadDictionary();
  }, [loadDictionary]);

  // 过滤后的列表
  const filteredItems = useMemo(() => {
    return filterDictionaryItems(items, {
      keyword: searchKeyword,
      category: selectedCategory,
      securityLevel: selectedSecurityLevel,
    });
  }, [items, searchKeyword, selectedCategory, selectedSecurityLevel]);

  // 统计指标
  const stats = useMemo(() => {
    return calculateDictionaryStats(items);
  }, [items]);

  // 导出 Markdown 手册
  const handleExportMarkdown = () => {
    const md = generateDictionaryMarkdown(filteredItems);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadBlob(md, `车控平台指令协议手册_${dateStr}.md`, 'text/markdown;charset=utf-8');
    message.success('已成功生成并导出 Markdown 协议手册！');
  };

  // 导出 CSV 字典
  const handleExportCsv = () => {
    const csv = generateDictionaryCsv(filteredItems);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadBlob(csv, `车控平台指令字典_${dateStr}.csv`, 'text/csv;charset=utf-8');
    message.success('已成功生成并导出 CSV 指令字典！');
  };

  // 打开协议详情抽屉
  const handleOpenDetail = (item: CommandDictionaryItem) => {
    setActiveItem(item);
    setDetailDrawerOpen(true);
  };

  // 打开编辑弹窗
  const handleOpenEdit = (item: CommandDictionaryItem) => {
    setEditingItem(item);
    editForm.setFieldsValue({
      code: item.code,
      name: item.name,
      downlinkOpcode: item.downlinkOpcode,
      canSignalName: item.canSignalName,
      defaultSecurityLevel: item.defaultSecurityLevel,
      defaultTimeoutMs: item.defaultTimeoutMs,
      defaultFrequencyLimitSeconds: item.defaultFrequencyLimitSeconds,
      description: item.description,
      safetyWarning: item.safetyWarning || '',
    });
    setEditModalOpen(true);
  };

  // 保存字典修改
  const handleSaveEdit = async () => {
    if (!editingItem) return;
    try {
      const values = await editForm.validateFields();
      setUpdating(true);
      const updated = await updateCommandDictionaryItemApi(editingItem.code, {
        defaultTimeoutMs: values.defaultTimeoutMs,
        defaultFrequencyLimitSeconds: values.defaultFrequencyLimitSeconds,
        description: values.description,
        safetyWarning: values.safetyWarning ? values.safetyWarning.trim() : undefined,
      });

      message.success(`指令【${updated.name}】字典元数据已更新！`);
      setItems((prev) => prev.map((item) => (item.code === updated.code ? updated : item)));
      if (activeItem?.code === updated.code) {
        setActiveItem(updated);
      }
      setEditModalOpen(false);
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || '保存指令字典失败');
    } finally {
      setUpdating(false);
    }
  };

  // 复制文本辅助函数
  const handleCopyText = (text: string, label = '内容') => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      message.success(`已复制 ${label} 到剪贴板`);
    }
  };

  // 主表格列定义
  const columns: TableProps<CommandDictionaryItem>['columns'] = [
    {
      title: '指令名称与图标',
      dataIndex: 'name',
      key: 'name',
      width: 220,
      render: (_, record) => {
        const icon = COMMAND_ICON_MAP[record.code] || <CarOutlined />;
        const catMeta = COMMAND_CATEGORY_MAP[record.category];
        return (
          <Space align="center" size={10}>
            <span style={{ fontSize: 18, color: catMeta?.color || '#1677ff' }}>{icon}</span>
            <div>
              <Tooltip title={record.description}>
                <Text strong style={{ fontSize: 14, cursor: 'help' }}>
                  {record.name}
                </Text>
              </Tooltip>
              <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginTop: 2 }}>
                {record.code}
              </div>
            </div>
          </Space>
        );
      },
    },
    {
      title: '下行控制字 (Opcode)',
      dataIndex: 'downlinkOpcode',
      key: 'downlinkOpcode',
      width: 140,
      render: (opcode: string) => (
        <Tooltip title="点击复制下行控制字 Hex">
          <Tag
            color="geekblue"
            style={{
              fontFamily: 'monospace',
              cursor: 'pointer',
              fontSize: 13,
              padding: '2px 8px',
            }}
            onClick={() => handleCopyText(opcode, 'Opcode')}
          >
            {opcode}
          </Tag>
        </Tooltip>
      ),
    },
    {
      title: '业务集群',
      dataIndex: 'category',
      key: 'category',
      width: 130,
      render: (cat: CommandCategory) => {
        const catMeta = COMMAND_CATEGORY_MAP[cat];
        return <Tag color={catMeta?.tagColor || 'blue'}>{catMeta?.label || cat}</Tag>;
      },
    },
    {
      title: '默认安全等级',
      dataIndex: 'defaultSecurityLevel',
      key: 'defaultSecurityLevel',
      width: 130,
      render: (sec: SecurityLevel) => {
        const secMeta = SECURITY_LEVEL_TAG_MAP[sec];
        return (
          <Tooltip title={secMeta?.desc}>
            <Tag color={secMeta?.color} style={{ cursor: 'help' }}>
              {secMeta?.label || sec}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: '默认超时 / 冷却',
      key: 'timeoutAndFreq',
      width: 160,
      render: (_, record) => (
        <div>
          <Text style={{ fontSize: 13 }}>{record.defaultTimeoutMs / 1000}s</Text>
          <span style={{ color: 'rgba(0,0,0,0.45)', margin: '0 4px' }}>/</span>
          <Text type="secondary" style={{ fontSize: 12 }}>
            频控 {record.defaultFrequencyLimitSeconds}s
          </Text>
        </div>
      ),
    },
    {
      title: '参数 Schema / CAN 映射',
      key: 'paramsAndCan',
      width: 220,
      render: (_, record) => {
        const paramCount = Object.keys(record.payloadSchema || {}).length;
        return (
          <Space direction="vertical" size={2}>
            <Space align="center" size={6}>
              <Badge
                count={paramCount}
                style={{
                  backgroundColor: paramCount > 0 ? '#1677ff' : '#d9d9d9',
                }}
              />
              <Text style={{ fontSize: 12 }}>
                {paramCount > 0 ? '项下行约束参数' : '标准固定帧'}
              </Text>
            </Space>
            <Tooltip title="点击复制 CAN 映射信号名称">
              <Text
                code
                style={{
                  fontSize: 11,
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                  maxWidth: 190,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: 'inline-block',
                  whiteSpace: 'nowrap',
                }}
                onClick={() => handleCopyText(record.canSignalName, 'CAN 信号')}
              >
                {record.canSignalName}
              </Text>
            </Tooltip>
          </Space>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right',
      render: (_, record) => (
        <Space size={8}>
          <Button
            type="link"
            size="small"
            icon={<FileTextOutlined />}
            onClick={() => handleOpenDetail(record)}
          >
            协议报文
          </Button>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenEdit(record)}
          >
            编辑
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 4 大核心统计 KPI 看板卡片 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card styles={{ body: { padding: '16px 20px' } }} style={{ borderRadius: 8 }}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              标准控车指令总数
            </Text>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#1677ff', marginTop: 4 }}>
              {stats.total}{' '}
              <span style={{ fontSize: 14, fontWeight: 'normal', color: 'rgba(0,0,0,0.45)' }}>
                类
              </span>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(0,0,0,0.65)' }}>
              覆盖 4 大业务功能集群协议标准
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card styles={{ body: { padding: '16px 20px' } }} style={{ borderRadius: 8 }}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              L2 强安全高危门禁指令
            </Text>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#cf1322', marginTop: 4 }}>
              {stats.l2Count}{' '}
              <span style={{ fontSize: 14, fontWeight: 'normal', color: 'rgba(0,0,0,0.45)' }}>
                项
              </span>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(0,0,0,0.65)' }}>
              远程点火/熄火强制校验 6 位安全码
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card styles={{ body: { padding: '16px 20px' } }} style={{ borderRadius: 8 }}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              4 大业务功能分类分布
            </Text>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#52c41a', marginTop: 8 }}>
              {stats.categoryCounts[CommandCategory.DOOR_BODY]}
              <span style={{ fontSize: 12, fontWeight: 'normal', color: 'rgba(0,0,0,0.45)' }}> 门锁 </span>·{' '}
              {stats.categoryCounts[CommandCategory.POWER_FIND]}
              <span style={{ fontSize: 12, fontWeight: 'normal', color: 'rgba(0,0,0,0.45)' }}> 动力 </span>·{' '}
              {stats.categoryCounts[CommandCategory.CABIN_CLIMATE]}
              <span style={{ fontSize: 12, fontWeight: 'normal', color: 'rgba(0,0,0,0.45)' }}> 座舱 </span>·{' '}
              {stats.categoryCounts[CommandCategory.WINDOW_ROOF]}
              <span style={{ fontSize: 12, fontWeight: 'normal', color: 'rgba(0,0,0,0.45)' }}> 车窗</span>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(0,0,0,0.65)' }}>
              L0: {stats.l0Count} 项 · L1: {stats.l1Count} 项 · L2: {stats.l2Count} 项
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card styles={{ body: { padding: '16px 20px' } }} style={{ borderRadius: 8 }}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              支持下行动态参数指令
            </Text>
            <div style={{ fontSize: 28, fontWeight: 700, color: '#722ed1', marginTop: 4 }}>
              {stats.parametricCount}{' '}
              <span style={{ fontSize: 14, fontWeight: 'normal', color: 'rgba(0,0,0,0.45)' }}>
                项
              </span>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(0,0,0,0.65)' }}>
              具备温度、风速、时长等 Schema 约束
            </div>
          </Card>
        </Col>
      </Row>

      {/* 搜索与筛选工具栏 */}
      <Card styles={{ body: { padding: '16px 20px' } }} style={{ borderRadius: 8 }}>
        <Row gutter={[16, 12]} align="middle" justify="space-between">
          <Col xs={24} md={16} lg={14}>
            <Space wrap size={12}>
              <Input
                prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,0.35)' }} />}
                placeholder="搜索指令代码、名称、Opcode、CAN信号或描述..."
                allowClear
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                style={{ width: 260 }}
              />

              <Select
                value={selectedCategory}
                onChange={(val) => setSelectedCategory(val)}
                style={{ width: 140 }}
                options={[
                  { label: '全部集群 (13)', value: 'ALL' },
                  { label: '车门与车身 (4)', value: CommandCategory.DOOR_BODY },
                  { label: '动力与寻车 (3)', value: CommandCategory.POWER_FIND },
                  { label: '座舱温控 (3)', value: CommandCategory.CABIN_CLIMATE },
                  { label: '车窗天窗 (3)', value: CommandCategory.WINDOW_ROOF },
                ]}
              />

              <Select
                value={selectedSecurityLevel}
                onChange={(val) => setSelectedSecurityLevel(val)}
                style={{ width: 140 }}
                options={[
                  { label: '全部安全等级', value: 'ALL' },
                  { label: 'L0 无感直发', value: SecurityLevel.L0 },
                  { label: 'L1 二次确认', value: SecurityLevel.L1 },
                  { label: 'L2 强安全码', value: SecurityLevel.L2 },
                ]}
              />
            </Space>
          </Col>

          <Col xs={24} md={8} lg={10} style={{ textAlign: 'right' }}>
            <Space wrap size={8}>
              <Button
                icon={<FileTextOutlined />}
                onClick={handleExportMarkdown}
                title="导出标准 Markdown 协议手册"
              >
                导出 Markdown 手册
              </Button>
              <Button
                icon={<DownloadOutlined />}
                onClick={handleExportCsv}
                title="导出 RFC 4180 CSV 字典"
              >
                导出 CSV 字典
              </Button>
              <Button icon={<ReloadOutlined />} onClick={loadDictionary} loading={loading}>
                刷新
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 核心 Table 列表 */}
      <Card styles={{ body: { padding: 0 } }} style={{ borderRadius: 8, overflow: 'hidden' }}>
        <Table<CommandDictionaryItem>
          columns={columns}
          dataSource={filteredItems}
          rowKey="code"
          loading={loading}
          pagination={{
            pageSize: 13,
            showTotal: (total) => `共 ${total} 条标准指令`,
            hideOnSinglePage: true,
          }}
          scroll={{ x: 1000 }}
        />
      </Card>

      {/* 协议报文详情抽屉 (ProtocolDetailDrawer - 600px) */}
      <Drawer
        title={
          <Space align="center" size={8}>
            <CodeOutlined style={{ color: '#1677ff' }} />
            <span>
              {activeItem?.name} ({activeItem?.code}) 协议报文规范
            </span>
          </Space>
        }
        placement="right"
        width={600}
        open={detailDrawerOpen}
        onClose={() => setDetailDrawerOpen(false)}
        extra={
          <Button
            type="primary"
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              if (activeItem) {
                handleOpenEdit(activeItem);
              }
            }}
          >
            编辑元数据
          </Button>
        }
      >
        {activeItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* 安全警示通告 */}
            {activeItem.safetyWarning && (
              <Alert
                message="高危操作人机交互安全提示"
                description={activeItem.safetyWarning}
                type="warning"
                showIcon
              />
            )}

            {/* 基础通信与安全属性 */}
            <Descriptions
              title="1. 基础通信与安全属性"
              bordered
              size="small"
              column={1}
              styles={{ label: { width: 140, fontWeight: 500 } }}
            >
              <Descriptions.Item label="指令代号 (Code)">
                <Text code copyable>
                  {activeItem.code}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="下行控制字 (Opcode)">
                <Tag color="geekblue" style={{ fontFamily: 'monospace', fontSize: 13 }}>
                  {activeItem.downlinkOpcode}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="业务功能集群">
                <Tag color={COMMAND_CATEGORY_MAP[activeItem.category]?.tagColor || 'blue'}>
                  {COMMAND_CATEGORY_MAP[activeItem.category]?.label || activeItem.category}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="默认安全等级">
                <Tag color={SECURITY_LEVEL_TAG_MAP[activeItem.defaultSecurityLevel]?.color}>
                  {SECURITY_LEVEL_TAG_MAP[activeItem.defaultSecurityLevel]?.label}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="默认超时时间">
                {activeItem.defaultTimeoutMs} ms ({activeItem.defaultTimeoutMs / 1000} 秒)
              </Descriptions.Item>
              <Descriptions.Item label="频控冷却限制">
                {activeItem.defaultFrequencyLimitSeconds} 秒
              </Descriptions.Item>
              <Descriptions.Item label="CAN 总线信号映射">
                <Text code copyable style={{ fontFamily: 'monospace' }}>
                  {activeItem.canSignalName}
                </Text>
              </Descriptions.Item>
              <Descriptions.Item label="功能描述">
                {activeItem.description}
              </Descriptions.Item>
            </Descriptions>

            {/* 下行 Payload Schema 约束表格 */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text strong style={{ fontSize: 15 }}>
                  2. 下行 JSON Payload Schema 约束
                </Text>
                <Badge
                  count={Object.keys(activeItem.payloadSchema || {}).length}
                  style={{ backgroundColor: '#1677ff' }}
                />
              </div>

              {Object.keys(activeItem.payloadSchema || {}).length > 0 ? (
                <Table
                  dataSource={Object.values(activeItem.payloadSchema)}
                  rowKey="paramName"
                  pagination={false}
                  size="small"
                  columns={[
                    {
                      title: '参数名',
                      dataIndex: 'paramName',
                      key: 'paramName',
                      width: 130,
                      render: (text: string) => <Text code>{text}</Text>,
                    },
                    {
                      title: '类型',
                      dataIndex: 'type',
                      key: 'type',
                      width: 80,
                      render: (type: string) => <Tag color="cyan">{type}</Tag>,
                    },
                    {
                      title: '必填',
                      dataIndex: 'required',
                      key: 'required',
                      width: 65,
                      render: (req: boolean) => (
                        <Tag color={req ? 'red' : 'default'}>{req ? '必填' : '选填'}</Tag>
                      ),
                    },
                    {
                      title: '约束范围 / 允许值',
                      key: 'constraint',
                      render: (_, p: ProtocolParamSchema) => {
                        if (p.allowedValues) {
                          return (
                            <Text style={{ fontSize: 12 }}>
                              [{p.allowedValues.join(', ')}]
                            </Text>
                          );
                        }
                        if (p.minimum !== undefined || p.maximum !== undefined) {
                          return (
                            <Text style={{ fontSize: 12 }}>
                              {p.minimum ?? '-'} ~ {p.maximum ?? '-'} {p.unit || ''}
                              {p.step ? ` (步长 ${p.step})` : ''}
                            </Text>
                          );
                        }
                        return <Text type="secondary">-</Text>;
                      },
                    },
                    {
                      title: '说明',
                      dataIndex: 'description',
                      key: 'description',
                      render: (desc: string) => (
                        <Text style={{ fontSize: 12 }}>{desc}</Text>
                      ),
                    },
                  ]}
                />
              ) : (
                <Alert
                  type="info"
                  showIcon
                  message="标准固定控制帧"
                  description="该指令为无参数控制指令，下行帧采用固定 Payload 结构，无需下发动态约束参数。"
                />
              )}
            </div>

            {/* 示例报文与一键复制 */}
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <Text strong style={{ fontSize: 15 }}>
                  3. 下行 JSON 示例报文与终端应答协议
                </Text>
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() =>
                    handleCopyText(
                      JSON.stringify(activeItem.samplePayload, null, 2),
                      'JSON 示例报文'
                    )
                  }
                >
                  复制 JSON
                </Button>
              </div>

              <div
                style={{
                  backgroundColor: '#f5f7fa',
                  border: '1px solid #d9d9d9',
                  borderRadius: 6,
                  padding: '12px 16px',
                  fontFamily: 'monospace',
                  fontSize: 13,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {JSON.stringify(activeItem.samplePayload, null, 2)}
              </div>

              <div style={{ marginTop: 12 }}>
                <Alert
                  type="success"
                  showIcon
                  message="终端 ACK 应答规范"
                  description={
                    <div style={{ fontSize: 12, lineHeight: '20px' }}>
                      <div>• 应答超时：车载 T-Box 须在 {activeItem.defaultTimeoutMs}ms 内回传执行状态</div>
                      <div>• 成功响应：<code>{`{ "ackCode": 0, "status": "SUCCESS" }`}</code></div>
                      <div>• 异常拦截：若遭遇设防或车速不为0将返回 <code>400 BUSINESS_REJECTED</code></div>
                    </div>
                  }
                />
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* 编辑字典项元数据 Modal */}
      <Modal
        title={`编辑指令字典元数据 - ${editingItem?.name}`}
        open={editModalOpen}
        onCancel={() => setEditModalOpen(false)}
        onOk={handleSaveEdit}
        confirmLoading={updating}
        destroyOnClose
        width={560}
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="指令代号 (Code)" name="code">
                <Input disabled style={{ fontFamily: 'monospace' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="下行控制字 (Opcode)" name="downlinkOpcode">
                <Input disabled style={{ fontFamily: 'monospace' }} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="CAN 信号名称" name="canSignalName">
                <Input disabled style={{ fontFamily: 'monospace' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="默认安全等级" name="defaultSecurityLevel">
                <Select
                  disabled
                  options={[
                    { label: 'L0 无感直发', value: SecurityLevel.L0 },
                    { label: 'L1 二次确认', value: SecurityLevel.L1 },
                    { label: 'L2 强安全码', value: SecurityLevel.L2 },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="默认超时时间 (ms)"
                name="defaultTimeoutMs"
                rules={[
                  { required: true, message: '请输入默认超时时间' },
                  {
                    type: 'number',
                    min: 3000,
                    max: 60000,
                    message: '超时时间须介于 3,000 ~ 60,000 ms',
                  },
                ]}
              >
                <InputNumber
                  step={1000}
                  addonAfter="ms"
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="频控冷却限制 (秒)"
                name="defaultFrequencyLimitSeconds"
                rules={[
                  { required: true, message: '请输入冷却时间' },
                  {
                    type: 'number',
                    min: 0,
                    max: 300,
                    message: '冷却时间须介于 0 ~ 300 秒',
                  },
                ]}
              >
                <InputNumber
                  min={0}
                  max={300}
                  step={1}
                  addonAfter="s"
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            label="业务功能说明"
            name="description"
            rules={[
              { required: true, message: '请输入功能说明' },
              { min: 5, message: '功能说明不得少于 5 个字符' },
            ]}
          >
            <Input.TextArea rows={2} placeholder="简述该指令的业务控制作用" />
          </Form.Item>

          <Form.Item
            label="人机交互安全警示提示文案 (可选)"
            name="safetyWarning"
          >
            <Input.TextArea
              rows={2}
              placeholder="用于在下发高风险指令前弹窗二次警示车主/操作员（如防夹手、行车防盗等）"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
