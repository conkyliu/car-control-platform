import React, { useState, useEffect, useMemo } from 'react';
import {
  Drawer,
  Steps,
  Tabs,
  Tag,
  Badge,
  Alert,
  Card,
  Space,
  Button,
  Spin,
  Empty,
  Typography,
  Tooltip,
  Divider,
  Row,
  Col,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  ClockCircleOutlined,
  LoadingOutlined,
  CopyOutlined,
  LockOutlined,
  ThunderboltOutlined,
  CloudUploadOutlined,
  CloudDownloadOutlined,
  CodeOutlined,
  ReloadOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { CommandCode, CommandStatus, SecurityLevel } from '@car-control/contracts';
import {
  COMMAND_METADATA,
  formatExecutionDuration,
} from './command-core.ts';
import {
  getCommandStatusStepIndex,
  calculateStepTimings,
  parseCommandLockDetails,
  type CommandTraceDto,
  type CommandLifecycleStep,
  type StepTimingBreakdown,
  type CommandLockDetails,
} from './command-stream-core.ts';
import { fetchCommandTraceApi } from '../../api/command.ts';

const { Text, Title, Paragraph } = Typography;

export interface CommandStreamDrawerProps {
  open: boolean;
  onClose: () => void;
  commandId?: string | null;
  vehicleId?: string;
}

export const CommandStreamDrawer: React.FC<CommandStreamDrawerProps> = ({
  open,
  onClose,
  commandId,
}) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [trace, setTrace] = useState<CommandTraceDto | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // 加载全链路追踪详情
  const loadTrace = async (id: string) => {
    setLoading(true);
    try {
      const data = await fetchCommandTraceApi(id);
      setTrace(data);
    } catch {
      message.error('获取指令链路数据失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && commandId) {
      loadTrace(commandId);
    } else if (!open) {
      setTrace(null);
    }
  }, [open, commandId]);

  // 耗时阶梯统计
  const timings: StepTimingBreakdown = useMemo(() => {
    return calculateStepTimings(trace?.steps || []);
  }, [trace?.steps]);

  // 409 排他锁解析
  const lockDetails: CommandLockDetails = useMemo(() => {
    if (trace?.lockDetails) {
      return trace.lockDetails;
    }
    if (trace?.errorMessage) {
      return parseCommandLockDetails(trace.errorMessage);
    }
    return {
      isConflict: false,
      lockKey: '',
      waitSuggestion: '',
    };
  }, [trace?.lockDetails, trace?.errorMessage]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedKey(key);
    message.success('已复制到剪贴板');
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  if (!open) return null;

  const meta = trace ? COMMAND_METADATA[trace.commandCode] : null;
  const fsmInfo = trace ? getCommandStatusStepIndex(trace.status) : null;

  // 渲染状态 Tag
  const renderStatusBadge = (status: CommandStatus) => {
    switch (status) {
      case CommandStatus.SUCCESS:
        return (
          <Tag color="success" icon={<CheckCircleOutlined />}>
            SUCCESS (执行成功)
          </Tag>
        );
      case CommandStatus.DEVICE_REJECTED:
        return (
          <Tag color="warning" icon={<WarningOutlined />}>
            REJECTED (车机拒绝)
          </Tag>
        );
      case CommandStatus.TIMEOUT:
        return (
          <Tag color="error" icon={<ClockCircleOutlined />}>
            TIMEOUT (应答超时)
          </Tag>
        );
      case CommandStatus.FAILED:
        return (
          <Tag color="error" icon={<CloseCircleOutlined />}>
            FAILED (执行失败)
          </Tag>
        );
      case CommandStatus.WAITING_ACK:
        return (
          <Tag color="processing" icon={<LoadingOutlined spin />}>
            WAITING_ACK (等待应答)
          </Tag>
        );
      default:
        return <Tag color="default">{status}</Tag>;
    }
  };

  // 动态控制 Steps 节点图标
  const getStepIcon = (index: number) => {
    if (!fsmInfo || !trace) return undefined;
    const currentIndex = fsmInfo.stepIndex;
    if (index < currentIndex) {
      return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
    }
    if (index === currentIndex) {
      if (fsmInfo.isError) {
        if (trace.status === CommandStatus.DEVICE_REJECTED) {
          return <WarningOutlined style={{ color: '#faad14' }} />;
        }
        return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
      }
      if (fsmInfo.stepStatus === 'finish') {
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      }
      return <LoadingOutlined spin style={{ color: '#1677ff' }} />;
    }
    return undefined;
  };

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingRight: 24 }}>
          <Space align="center" size="small">
            <ThunderboltOutlined style={{ color: '#1677ff', fontSize: 18 }} />
            <span style={{ fontWeight: 600, fontSize: 16 }}>指令全生命周期流水与状态机追踪</span>
          </Space>
          {trace && (
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => commandId && loadTrace(commandId)}
            >
              刷新
            </Button>
          )}
        </div>
      }
      placement="right"
      width={720}
      destroyOnClose
      open={open}
      onClose={onClose}
      styles={{
        body: {
          padding: '20px 24px',
          background: '#fafbfc',
        },
      }}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: '120px 0' }}>
          <Spin size="large" tip="加载全链路遥测数据中..." />
        </div>
      ) : !trace ? (
        <Empty description="未检索到指定指令全链路追踪数据" style={{ marginTop: 100 }} />
      ) : (
        <div>
          {/* 抽屉头部信息卡片 */}
          <Card
            styles={{ body: { padding: '16px 20px' } }}
            style={{
              borderRadius: 8,
              marginBottom: 16,
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              background: '#ffffff',
            }}
          >
            <Row justify="space-between" align="middle" gutter={[12, 12]}>
              <Col span={24}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <Space align="center" size="middle">
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#1f1f1f' }}>
                      {meta?.name || trace.commandCode}
                    </span>
                    <Tag
                      color={
                        meta?.securityLevel === SecurityLevel.L2
                          ? 'error'
                          : meta?.securityLevel === SecurityLevel.L1
                          ? 'warning'
                          : 'default'
                      }
                    >
                      {meta?.securityLevel || 'L0'}
                    </Tag>
                    {renderStatusBadge(trace.status)}
                  </Space>
                  <Space size="small">
                    <Text type="secondary" style={{ fontSize: 12 }}>总耗时:</Text>
                    <Text strong style={{ color: timings.slaColor, fontSize: 14 }}>
                      {formatExecutionDuration(trace.durationMs)}
                    </Text>
                  </Space>
                </div>
              </Col>

              <Col span={24}>
                <Divider style={{ margin: '8px 0 12px 0' }} />
                <Row gutter={[16, 8]} style={{ fontSize: 12 }}>
                  <Col xs={24} sm={12}>
                    <Text type="secondary">指令编号: </Text>
                    <Text
                      code
                      style={{
                        fontFamily: 'SFMono-Regular, Consolas, Monaco, monospace',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                      onClick={() => copyToClipboard(trace.commandId, 'commandId')}
                    >
                      {trace.commandId}
                    </Text>
                    <Tooltip title="复制指令ID">
                      <Button
                        type="text"
                        size="small"
                        icon={copiedKey === 'commandId' ? <CheckOutlined style={{ color: '#52c41a' }} /> : <CopyOutlined />}
                        style={{ marginLeft: 4 }}
                        onClick={() => copyToClipboard(trace.commandId, 'commandId')}
                      />
                    </Tooltip>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Text type="secondary">下发操作员: </Text>
                    <Text strong>{trace.operatorId}</Text>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Text type="secondary">目标车辆ID: </Text>
                    <Text code>{trace.vehicleId}</Text>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Text type="secondary">触发时间: </Text>
                    <Text>{new Date(trace.createdAt).toLocaleString('zh-CN', { hour12: false })}</Text>
                  </Col>
                </Row>
              </Col>
            </Row>
          </Card>

          {/* 板块 4: 409 排他锁冲突警示卡片 (条件展示) */}
          {lockDetails.isConflict && (
            <Card
              styles={{ body: { padding: '16px' } }}
              style={{
                borderRadius: 8,
                marginBottom: 16,
                background: '#fff2f0',
                borderColor: '#ffccc7',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <LockOutlined style={{ color: '#ff4d4f', fontSize: 20, marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text strong style={{ color: '#cf1322', fontSize: 14 }}>
                      409 分布式排他锁冲突归因 (VEHICLE_COMMAND_LOCK_COLLISION)
                    </Text>
                    {lockDetails.ttlSeconds !== undefined && (
                      <Tag color="error">TTL 保护剩余: {lockDetails.ttlSeconds}s</Tag>
                    )}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(0,0,0,0.65)' }}>
                    <div>
                      <Text type="secondary">独占互斥锁 Key: </Text>
                      <Text code copyable>{lockDetails.lockKey}</Text>
                    </div>
                    {lockDetails.holderCommandId && (
                      <div style={{ marginTop: 4 }}>
                        <Text type="secondary">当前持锁指令 ID: </Text>
                        <Text strong style={{ color: '#1677ff' }}>{lockDetails.holderCommandId}</Text>
                      </div>
                    )}
                    <div style={{ marginTop: 6, background: '#ffffff', padding: '8px 12px', borderRadius: 6, border: '1px solid #ffd8d2' }}>
                      <Text type="secondary">防风暴建议: </Text>
                      <Text style={{ color: '#d4380d' }}>{lockDetails.waitSuggestion}</Text>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* 异常拒绝提示条 */}
          {trace.errorMessage && !lockDetails.isConflict && (
            <Alert
              message={
                <div style={{ fontWeight: 600 }}>
                  {trace.status === CommandStatus.DEVICE_REJECTED ? '车载终端安全互锁拒绝执行' : '指令执行中断异常'}
                </div>
              }
              description={trace.errorMessage}
              type={trace.status === CommandStatus.DEVICE_REJECTED ? 'warning' : 'error'}
              showIcon
              style={{ marginBottom: 16, borderRadius: 8 }}
            />
          )}

          {/* 板块 2: 耗时阶梯分布图 (Timing Breakdown) */}
          <Card
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space size="small">
                  <ClockCircleOutlined style={{ color: '#1677ff' }} />
                  <span style={{ fontWeight: 600, fontSize: 14 }}>全链路耗时阶梯切片分布</span>
                </Space>
                <Tag color={timings.slaColor} style={{ fontWeight: 600, marginRight: 0 }}>
                  SLA 等级: {timings.slaText}
                </Tag>
              </div>
            }
            styles={{ body: { padding: '16px 20px' } }}
            style={{ borderRadius: 8, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          >
            {/* 分段条形图 */}
            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  height: 14,
                  width: '100%',
                  display: 'flex',
                  borderRadius: 7,
                  overflow: 'hidden',
                  background: '#f0f0f0',
                }}
              >
                {timings.segments.map((seg) => (
                  <Tooltip
                    key={seg.key}
                    title={`${seg.label}: ${seg.durationMs}ms (${seg.percentage}%)`}
                  >
                    <div
                      style={{
                        width: `${seg.percentage}%`,
                        backgroundColor: seg.color,
                        height: '100%',
                        transition: 'all 0.3s ease',
                      }}
                    />
                  </Tooltip>
                ))}
              </div>
            </div>

            {/* 四段指标徽标 */}
            <Row gutter={[12, 12]}>
              {timings.segments.map((seg) => (
                <Col xs={12} sm={6} key={seg.key}>
                  <div
                    style={{
                      background: '#f9f9fa',
                      border: '1px solid #f0f0f0',
                      borderRadius: 6,
                      padding: '8px 10px',
                      borderLeft: `4px solid ${seg.color}`,
                    }}
                  >
                    <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)' }}>{seg.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
                      +{seg.durationMs}ms
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.45)' }}>
                      占比 {seg.percentage}%
                    </div>
                  </div>
                </Col>
              ))}
            </Row>

            <div
              style={{
                marginTop: 12,
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                color: 'rgba(0,0,0,0.45)',
              }}
            >
              <span>端到端全链路总时延: <Text strong style={{ color: timings.slaColor }}>{timings.totalDurationMs} ms</Text></span>
              <span>SLA 指标基准: &lt; 1500ms 优 / 1500~3000ms 良 / &gt; 3000ms 差</span>
            </div>
          </Card>

          {/* 板块 1: 全链路状态机跃迁时间轴 (Steps) */}
          <Card
            title={
              <Space size="small">
                <ThunderboltOutlined style={{ color: '#1677ff' }} />
                <span style={{ fontWeight: 600, fontSize: 14 }}>11 步有限状态机 (FSM) 跃迁时间轴</span>
              </Space>
            }
            styles={{ body: { padding: '20px 24px' } }}
            style={{ borderRadius: 8, marginBottom: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          >
            <Steps
              direction="vertical"
              size="small"
              current={fsmInfo?.stepIndex ?? 5}
              status={fsmInfo?.stepStatus || 'process'}
              items={[
                {
                  title: (
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                      <Text strong>Step 0: 客户端指令创建 (CREATED)</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {trace.steps[0]?.timestamp ? new Date(trace.steps[0].timestamp).toLocaleTimeString('zh-CN', { hour12: false }) : '-'}
                      </Text>
                    </div>
                  ),
                  description: (
                    <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginTop: 2 }}>
                      Web 控制台生成指令跟踪流，分配初始幂等 Key (+0ms)
                    </div>
                  ),
                  icon: getStepIcon(0),
                },
                {
                  title: (
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                      <Text strong>Step 1: 网关安全与权限校验 (VALIDATING)</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        +{timings.validationDurationMs}ms
                      </Text>
                    </div>
                  ),
                  description: (
                    <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginTop: 2 }}>
                      {meta?.securityLevel === SecurityLevel.L2 ? 'L2 6位数字安全码校验' : 'L0/L1 基础鉴权'} · 车型能力配置比对通过
                    </div>
                  ),
                  icon: getStepIcon(1),
                },
                {
                  title: (
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                      <Text strong>Step 2: 分布式排他加锁与入队 (QUEUED)</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        +{timings.lockingDurationMs}ms
                      </Text>
                    </div>
                  ),
                  description: (
                    <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginTop: 2 }}>
                      {lockDetails.isConflict ? (
                        <Text type="danger">排他锁冲突拦截：检测到已有指令持锁</Text>
                      ) : (
                        `获取独占分布式锁成功 (lock:cmd:${trace.vehicleId})`
                      )}
                    </div>
                  ),
                  icon: lockDetails.isConflict ? (
                    <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                  ) : (
                    getStepIcon(2)
                  ),
                },
                {
                  title: (
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                      <Text strong>Step 3: MQTT Broker 报文下发 (SENT)</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        +{timings.downlinkDurationMs}ms
                      </Text>
                    </div>
                  ),
                  description: (
                    <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginTop: 2 }}>
                      下发 QoS=1 二进制控制帧至车载设备订阅主题
                    </div>
                  ),
                  icon: getStepIcon(3),
                },
                {
                  title: (
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                      <Text strong>Step 4: 车载终端执行中 (WAITING_ACK)</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        终端就绪
                      </Text>
                    </div>
                  ),
                  description: (
                    <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginTop: 2 }}>
                      T-Box 接收控制帧并向车身 BCM/VCU 发送 CAN 指令
                    </div>
                  ),
                  icon: getStepIcon(4),
                },
                {
                  title: (
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                      <Text strong>Step 5: 最终执行应答反馈 ({trace.status})</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        +{timings.ackDurationMs}ms
                      </Text>
                    </div>
                  ),
                  description: (
                    <div style={{ fontSize: 12, marginTop: 2 }}>
                      {trace.status === CommandStatus.SUCCESS && (
                        <Text type="success">车载终端闭环校验成功，上报 ACK (0) 执行完成</Text>
                      )}
                      {trace.status === CommandStatus.DEVICE_REJECTED && (
                        <Text type="warning">{trace.errorMessage || '车身互锁逻辑拦截并回传拒绝报文'}</Text>
                      )}
                      {trace.status === CommandStatus.TIMEOUT && (
                        <Text type="danger">{trace.errorMessage || '超时未收到车机 ACK 响应 (10,000ms)'}</Text>
                      )}
                      {trace.status === CommandStatus.FAILED && (
                        <Text type="danger">{trace.errorMessage || '指令执行失败'}</Text>
                      )}
                    </div>
                  ),
                  icon: getStepIcon(5),
                },
              ]}
            />
          </Card>

          {/* 板块 3: 原始通信报文对照 (JSON Payload Viewer) */}
          <Card
            title={
              <Space size="small">
                <CodeOutlined style={{ color: '#1677ff' }} />
                <span style={{ fontWeight: 600, fontSize: 14 }}>原始通信报文与审计对照 (Raw JSON Payload)</span>
              </Space>
            }
            styles={{ body: { padding: '12px 16px 20px 16px' } }}
            style={{ borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          >
            <Tabs
              defaultActiveKey="downlink"
              items={[
                {
                  key: 'downlink',
                  label: (
                    <Space size={6}>
                      <CloudDownloadOutlined style={{ color: '#1677ff' }} />
                      <span>下行指令报文 (Downlink Payload)</span>
                    </Space>
                  ),
                  children: (
                    <div style={{ position: 'relative' }}>
                      <div
                        style={{
                          position: 'absolute',
                          right: 12,
                          top: 12,
                          zIndex: 2,
                        }}
                      >
                        <Button
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() =>
                            copyToClipboard(
                              JSON.stringify(trace.downlinkPayload || {}, null, 2),
                              'downlink'
                            )
                          }
                        >
                          复制 JSON
                        </Button>
                      </div>
                      <pre
                        style={{
                          background: '#1e1e1e',
                          color: '#9cdcfe',
                          padding: '16px',
                          borderRadius: 6,
                          fontSize: 12,
                          lineHeight: 1.6,
                          maxHeight: 280,
                          overflowY: 'auto',
                          fontFamily: 'SFMono-Regular, Consolas, Monaco, monospace',
                          margin: 0,
                        }}
                      >
                        {JSON.stringify(trace.downlinkPayload || {}, null, 2)}
                      </pre>
                    </div>
                  ),
                },
                {
                  key: 'uplink',
                  label: (
                    <Space size={6}>
                      <CloudUploadOutlined style={{ color: '#52c41a' }} />
                      <span>上行应答报文 (Uplink ACK Payload)</span>
                    </Space>
                  ),
                  children: trace.uplinkPayload ? (
                    <div style={{ position: 'relative' }}>
                      <div
                        style={{
                          position: 'absolute',
                          right: 12,
                          top: 12,
                          zIndex: 2,
                        }}
                      >
                        <Button
                          size="small"
                          icon={<CopyOutlined />}
                          onClick={() =>
                            copyToClipboard(
                              JSON.stringify(trace.uplinkPayload || {}, null, 2),
                              'uplink'
                            )
                          }
                        >
                          复制 JSON
                        </Button>
                      </div>
                      <pre
                        style={{
                          background: '#1e1e1e',
                          color: '#4ec9b0',
                          padding: '16px',
                          borderRadius: 6,
                          fontSize: 12,
                          lineHeight: 1.6,
                          maxHeight: 280,
                          overflowY: 'auto',
                          fontFamily: 'SFMono-Regular, Consolas, Monaco, monospace',
                          margin: 0,
                        }}
                      >
                        {JSON.stringify(trace.uplinkPayload || {}, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: '30px 0',
                        textAlign: 'center',
                        background: '#fafafa',
                        borderRadius: 6,
                        border: '1px dashed #d9d9d9',
                      }}
                    >
                      <Text type="secondary">
                        {trace.status === CommandStatus.TIMEOUT
                          ? '车载终端超时未回复上行报文 (TIMEOUT)'
                          : trace.status === CommandStatus.WAITING_ACK
                          ? '等待车载设备回传上行 ACK 报文中...'
                          : '无上行应答报文记录'}
                      </Text>
                    </div>
                  ),
                },
              ]}
            />
          </Card>
        </div>
      )}
    </Drawer>
  );
};
