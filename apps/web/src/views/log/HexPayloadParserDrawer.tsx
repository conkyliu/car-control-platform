import React, { useState } from 'react';
import {
  Drawer,
  Descriptions,
  Tabs,
  Tag,
  Badge,
  Alert,
  Button,
  Table,
  Space,
  Typography,
  Tooltip,
  message,
  Card,
  Empty,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CopyOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CodeOutlined,
  TableOutlined,
  FileTextOutlined,
  ThunderboltOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import {
  type CommLogRecord,
  type BodyPayloadField,
  COMM_PROTOCOL_METADATA,
  COMM_DIRECTION_METADATA,
  formatHexDump,
  parseMessageHeader,
  unescapeJt808Hex,
  CommProtocolType,
} from './comm-log-core.ts';

const { Text, Paragraph } = Typography;

export interface HexPayloadParserDrawerProps {
  open: boolean;
  onClose: () => void;
  record: CommLogRecord | null;
}

export const HexPayloadParserDrawer: React.FC<HexPayloadParserDrawerProps> = ({
  open,
  onClose,
  record,
}) => {
  const [activeTab, setActiveTab] = useState<string>('hexDump');

  if (!record) {
    return (
      <Drawer
        title="报文深度解析"
        placement="right"
        width={680}
        open={open}
        onClose={onClose}
        destroyOnClose
        styles={{ body: { padding: 24 } }}
      >
        <Empty description="请选择一条通讯流水报文以进行深度解析" />
      </Drawer>
    );
  }

  const protocolMeta = COMM_PROTOCOL_METADATA[record.protocolType];
  const directionMeta = COMM_DIRECTION_METADATA[record.direction];
  const hexDumpRows = formatHexDump(record.rawHex, 16);
  const headerFields = parseMessageHeader(record);

  // 复制文本到剪贴板
  const handleCopy = (text: string, label: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => message.success(`已成功复制${label}至剪贴板`),
        () => message.warning('复制失败，请手动选取复制')
      );
    } else {
      message.info('当前浏览器不支持自动复制，请手动选择');
    }
  };

  // 生成完整 Hex Dump 文本供一次性拷贝
  const fullHexDumpText = hexDumpRows
    .map(
      (row) =>
        `${row.offset}  ${row.hexBytes.join(' ').padEnd(48, ' ')}  |${row.asciiText}|`
    )
    .join('\n');

  // Tab 2: 报文体结构化字段表格列定义
  const bodyColumns: ColumnsType<BodyPayloadField> = [
    {
      title: '字段名称',
      dataIndex: 'name',
      key: 'name',
      width: 140,
      render: (name: string) => <Text strong>{name}</Text>,
    },
    {
      title: '类型',
      dataIndex: 'dataType',
      key: 'dataType',
      width: 100,
      render: (type: string) => <Tag color="blue">{type}</Tag>,
    },
    {
      title: '原始 Hex',
      dataIndex: 'rawHex',
      key: 'rawHex',
      width: 130,
      render: (hex: string) => (
        <Text code copyable={{ tooltips: ['复制Hex', '已复制'] }}>
          {hex}
        </Text>
      ),
    },
    {
      title: '解析值',
      dataIndex: 'parsedValue',
      key: 'parsedValue',
      width: 130,
      render: (val: any, row) => (
        <Text strong style={{ color: '#1677ff' }}>
          {String(val)} {row.unit ? <Text type="secondary">({row.unit})</Text> : null}
        </Text>
      ),
    },
    {
      title: '语义说明',
      dataIndex: 'description',
      key: 'description',
      render: (desc: string) => (
        <Text type="secondary" style={{ fontSize: 13 }}>
          {desc || '--'}
        </Text>
      ),
    },
  ];

  // 构建报文头展示条目
  const headerEntries = Object.entries(headerFields).filter(
    ([k]) => !['protocolType', 'messageId', 'messageName'].includes(k)
  );

  return (
    <Drawer
      title={
        <Space align="center">
          <CodeOutlined style={{ color: '#1677ff', fontSize: 18 }} />
          <span>报文深度解析</span>
          <Tag color={protocolMeta.tagColor}>{protocolMeta.shortLabel}</Tag>
          <Tag color={directionMeta.tagColor}>
            {directionMeta.arrow} {directionMeta.shortLabel}
          </Tag>
          <Text type="secondary" style={{ fontSize: 13 }}>
            [{record.messageId}] {record.messageName}
          </Text>
        </Space>
      }
      placement="right"
      width={680}
      open={open}
      onClose={onClose}
      destroyOnClose
      styles={{ body: { padding: '16px 20px', backgroundColor: '#f9fbfd' } }}
    >
      {/* 顶部报文元数据概要 */}
      <Card
        size="small"
        style={{ marginBottom: 16, borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
      >
        <Descriptions size="small" column={2} bordered>
          <Descriptions.Item label="通讯流水ID">
            <Text code copyable>
              {record.id}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="精确时间戳">
            <Text style={{ fontFamily: 'monospace' }}>{record.timestampFormatted}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="终端设备号">
            <Text code copyable>
              {record.deviceNo}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="车辆 VIN">
            <Text code copyable>
              {record.vin}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="车牌号码">
            {record.plateNumber ? (
              <Tag color="geekblue">{record.plateNumber}</Tag>
            ) : (
              <Text type="secondary">未登记</Text>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="报文长度">
            <Text strong>
              {record.byteLength} Bytes{' '}
              <Text type="secondary" style={{ fontSize: 12 }}>
                ({record.rawHex.length} Hex Chars)
              </Text>
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="校验状态" span={2}>
            <Space>
              <Badge
                status={record.checksumValid ? 'success' : 'error'}
                text={
                  record.checksumValid ? (
                    <Text type="success" strong>
                      校验通过 (MATCH)
                    </Text>
                  ) : (
                    <Text type="danger" strong>
                      校验异常 (MISMATCH)
                    </Text>
                  )
                }
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                (网关计算值: 0x{record.calculatedChecksum} / 报文携带值: 0x{record.actualChecksum})
              </Text>
            </Space>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 校验比对诊断警示条 */}
      <div style={{ marginBottom: 16 }}>
        {record.checksumValid ? (
          <Alert
            type="success"
            showIcon
            icon={<CheckCircleOutlined />}
            message="报文校验一致性诊断通过"
            description={`根据 ${protocolMeta.shortLabel} 规范，计算校验码 0x${record.calculatedChecksum} 与报文实际尾部校验码 0x${record.actualChecksum} 完全吻合，数据链路传输完整无误。`}
          />
        ) : (
          <Alert
            type="error"
            showIcon
            icon={<CloseCircleOutlined />}
            message="异或校验码不匹配 (高危数据传输异常)"
            description={
              record.errorMessage ||
              `网关验算校验码 0x${record.calculatedChecksum} 与帧内标识 0x${record.actualChecksum} 不一致，疑似无线通信信道抖动丢包、空中噪音或报文被恶意篡改！`
            }
          />
        )}
      </div>

      {/* 核心三合一 Tabs: Hex Dump / 结构拆解 / 明文 JSON */}
      <Card
        size="small"
        style={{ borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
        styles={{ body: { padding: '12px 16px' } }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: 'hexDump',
              label: (
                <Space>
                  <CodeOutlined />
                  <span>十六进制 Hex 视图</span>
                </Space>
              ),
              children: (
                <div>
                  {/* Hex 工具栏 */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 10,
                    }}
                  >
                    <Space size={8}>
                      <Tag color="cyan">Wireshark 矩阵模式 (16 字节/行)</Tag>
                      {record.protocolType === CommProtocolType.JT808 && (
                        <Tooltip title="JT/T 808 自动还原 7D 02 -> 7E 与 7D 01 -> 7D">
                          <Tag color="geekblue" icon={<InfoCircleOutlined />}>
                            转义后: {unescapeJt808Hex(record.rawHex).length / 2} 字节
                          </Tag>
                        </Tooltip>
                      )}
                    </Space>
                    <Space size={8}>
                      <Button
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() => handleCopy(record.rawHex, '原始 Hex 报文')}
                      >
                        复制 Hex
                      </Button>
                      <Button
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={() => handleCopy(fullHexDumpText, 'Hex Dump 格式文本')}
                      >
                        复制 Dump
                      </Button>
                    </Space>
                  </div>

                  {/* Wireshark 风格深色控制台 Hex Viewer */}
                  <div
                    style={{
                      backgroundColor: '#1e1e1e',
                      color: '#d4d4d4',
                      borderRadius: 6,
                      padding: '12px 16px',
                      fontFamily:
                        'SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                      fontSize: 12.5,
                      lineHeight: '22px',
                      overflowX: 'auto',
                      border: '1px solid #333',
                    }}
                  >
                    {/* 表头提示 */}
                    <div
                      style={{
                        display: 'flex',
                        borderBottom: '1px solid #333',
                        paddingBottom: 6,
                        marginBottom: 6,
                        color: '#858585',
                        fontWeight: 600,
                      }}
                    >
                      <span style={{ width: 64 }}>Offset</span>
                      <span style={{ flex: 1, paddingLeft: 8 }}>
                        00 01 02 03 04 05 06 07  08 09 0A 0B 0C 0D 0E 0F
                      </span>
                      <span style={{ width: 140, paddingLeft: 12, borderLeft: '1px solid #333' }}>
                        ASCII
                      </span>
                    </div>

                    {/* Dump 行循环 */}
                    {hexDumpRows.map((row) => {
                      // 将 16 字节拆为前 8 与后 8 字节并呈现微间距
                      const firstHalf = row.hexBytes.slice(0, 8).join(' ');
                      const secondHalf = row.hexBytes.slice(8, 16).join(' ');
                      const hexFormatted =
                        secondHalf.length > 0 ? `${firstHalf}  ${secondHalf}` : firstHalf;

                      return (
                        <div
                          key={row.offset}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                          }}
                        >
                          {/* 4 位偏移量 */}
                          <span style={{ width: 64, color: '#4ec9b0', userSelect: 'none' }}>
                            {row.offset}
                          </span>

                          {/* 16 字节十六进制列 */}
                          <span
                            style={{
                              flex: 1,
                              paddingLeft: 8,
                              color: '#ce9178',
                              letterSpacing: '0.5px',
                            }}
                          >
                            {hexFormatted.padEnd(49, ' ')}
                          </span>

                          {/* 右侧 ASCII 可打印字符 */}
                          <span
                            style={{
                              width: 140,
                              paddingLeft: 12,
                              borderLeft: '1px solid #333',
                              color: '#9cdcfe',
                              letterSpacing: '1px',
                            }}
                          >
                            {row.asciiText}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ),
            },
            {
              key: 'protocolStruct',
              label: (
                <Space>
                  <TableOutlined />
                  <span>协议结构拆解</span>
                </Space>
              ),
              children: (
                <div>
                  {/* 报文头 Header 属性表格 */}
                  <div style={{ marginBottom: 16 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 8,
                      }}
                    >
                      <Text strong style={{ fontSize: 13 }}>
                        <ThunderboltOutlined style={{ color: '#1677ff', marginRight: 4 }} />
                        报文头 Header 属性
                      </Text>
                      <Tag color="blue">
                        界定符:{' '}
                        {COMM_PROTOCOL_METADATA[record.protocolType].framingDelimiter || 'N/A'}
                      </Tag>
                    </div>
                    <Descriptions size="small" bordered column={2}>
                      <Descriptions.Item label="协议类型">
                        <Tag color={protocolMeta.tagColor}>{protocolMeta.label}</Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="消息流水号">
                        <Text strong>{headerFields.sequenceNo ?? '--'}</Text>
                      </Descriptions.Item>
                      <Descriptions.Item label="消息 ID">
                        <Text code>{record.messageId}</Text> ({record.messageName})
                      </Descriptions.Item>
                      <Descriptions.Item label="终端手机/标识">
                        <Text code>{headerFields.phoneOrDevice || record.deviceNo}</Text>
                      </Descriptions.Item>
                      {headerEntries.map(([k, v]) => (
                        <Descriptions.Item key={k} label={k}>
                          <Text>{String(v)}</Text>
                        </Descriptions.Item>
                      ))}
                    </Descriptions>
                  </div>

                  {/* 报文体 Body 结构化表格 */}
                  <div>
                    <div style={{ marginBottom: 8 }}>
                      <Text strong style={{ fontSize: 13 }}>
                        <TableOutlined style={{ color: '#52c41a', marginRight: 4 }} />
                        报文体 Payload 结构化明细
                      </Text>
                    </div>
                    {record.bodyFieldsList && record.bodyFieldsList.length > 0 ? (
                      <Table<BodyPayloadField>
                        dataSource={record.bodyFieldsList}
                        columns={bodyColumns}
                        rowKey="name"
                        size="small"
                        pagination={false}
                        bordered
                      />
                    ) : (
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="该协议报文类型暂未定义结构化字段映射表"
                      />
                    )}
                  </div>
                </div>
              ),
            },
            {
              key: 'jsonPayload',
              label: (
                <Space>
                  <FileTextOutlined />
                  <span>JSON 明文与可读报文</span>
                </Space>
              ),
              children: (
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 10,
                    }}
                  >
                    <Text type="secondary" style={{ fontSize: 13 }}>
                      结构化 JSON 树展开：包含 Header 解构、解析值以及遥测指标。
                    </Text>
                    <Button
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() =>
                        handleCopy(
                          JSON.stringify(
                            {
                              meta: {
                                id: record.id,
                                timestamp: record.timestampFormatted,
                                protocol: record.protocolType,
                                direction: record.direction,
                                messageId: record.messageId,
                                messageName: record.messageName,
                                byteLength: record.byteLength,
                              },
                              header: headerFields,
                              payload: record.bodyPayload,
                              rawHex: record.rawHex,
                            },
                            null,
                            2
                          ),
                          'JSON 明文'
                        )
                      }
                    >
                      复制完整 JSON
                    </Button>
                  </div>

                  <pre
                    style={{
                      backgroundColor: '#1e1e1e',
                      color: '#dcdcaa',
                      borderRadius: 6,
                      padding: 14,
                      fontSize: 12.5,
                      fontFamily:
                        'SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                      overflowX: 'auto',
                      maxHeight: 460,
                      border: '1px solid #333',
                    }}
                  >
                    {JSON.stringify(
                      {
                        meta: {
                          id: record.id,
                          timestamp: record.timestampFormatted,
                          protocol: record.protocolType,
                          direction: record.direction,
                          messageId: record.messageId,
                          messageName: record.messageName,
                          byteLength: record.byteLength,
                          checksumValid: record.checksumValid,
                          checksum: {
                            calculated: `0x${record.calculatedChecksum}`,
                            actual: `0x${record.actualChecksum}`,
                          },
                        },
                        header: headerFields,
                        bodyPayload: record.bodyPayload,
                        rawHex: record.rawHex,
                      },
                      null,
                      2
                    )}
                  </pre>
                </div>
              ),
            },
          ]}
        />
      </Card>
    </Drawer>
  );
};
