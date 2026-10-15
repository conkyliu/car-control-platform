import React, { useState, useEffect } from 'react';
import {
  Drawer,
  Card,
  Descriptions,
  Tag,
  Badge,
  Typography,
  Space,
  Button,
  Form,
  Radio,
  Input,
  Popconfirm,
  Timeline,
  Alert,
  Divider,
  message,
} from 'antd';
import {
  ThunderboltOutlined,
  AlertOutlined,
  DashboardOutlined,
  DisconnectOutlined,
  PhoneOutlined,
  CarOutlined,
  CompassOutlined,
  AimOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  UserOutlined,
  EnvironmentOutlined,
  InfoCircleOutlined,
  ExclamationCircleOutlined,
  AuditOutlined,
  SendOutlined,
} from '@ant-design/icons';
import {
  type AlarmRecord,
  AlarmType,
  AlarmLevel,
  AlarmStatus,
  isTerminalAlarmStatus,
  ALARM_TYPE_METADATA,
  ALARM_LEVEL_METADATA,
  ALARM_STATUS_METADATA,
} from './alarm-core.ts';
import { processAlarmApi } from '../../api/alarm.ts';

const { Text, Title, Paragraph } = Typography;
const { TextArea } = Input;

export interface AlertProcessDrawerProps {
  open: boolean;
  alarm: AlarmRecord | null;
  onClose: () => void;
  onSuccess?: (updated: AlarmRecord) => void;
  onLocate?: (alarm: AlarmRecord) => void;
}

export const renderAlarmTypeIcon = (type: AlarmType) => {
  switch (type) {
    case AlarmType.LOW_BATTERY:
      return <ThunderboltOutlined />;
    case AlarmType.VIBRATION:
      return <AlertOutlined />;
    case AlarmType.OVERSPEED:
      return <DashboardOutlined />;
    case AlarmType.POWER_CUT:
      return <DisconnectOutlined />;
    case AlarmType.SOS:
      return <PhoneOutlined />;
    case AlarmType.TOW_AWAY:
      return <CarOutlined />;
    case AlarmType.GEOFENCE_IN:
      return <CompassOutlined />;
    case AlarmType.GEOFENCE_OUT:
      return <AimOutlined />;
    default:
      return <AlertOutlined />;
  }
};

export const AlertProcessDrawer: React.FC<AlertProcessDrawerProps> = ({
  open,
  alarm,
  onClose,
  onSuccess,
  onLocate,
}) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && alarm && alarm.status === AlarmStatus.PENDING) {
      form.setFieldsValue({
        status: AlarmStatus.PROCESSED,
        remark: '',
      });
    }
  }, [open, alarm, form]);

  if (!alarm) return null;

  const typeMeta = ALARM_TYPE_METADATA[alarm.alarmType] ?? ALARM_TYPE_METADATA[AlarmType.LOW_BATTERY];
  const levelMeta = ALARM_LEVEL_METADATA[alarm.alarmLevel] ?? ALARM_LEVEL_METADATA[AlarmLevel.INFO];
  const statusMeta = ALARM_STATUS_METADATA[alarm.status] ?? ALARM_STATUS_METADATA[AlarmStatus.PENDING];
  const isTerminal = isTerminalAlarmStatus(alarm.status);

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);

      const updated = await processAlarmApi(alarm.id, {
        status: values.status,
        remark: values.remark.trim(),
        operatorId: '当前管理员 (Admin)',
      });

      message.success(
        values.status === AlarmStatus.PROCESSED
          ? '告警已确认闭环处理并归档'
          : '已将告警标记为误报并安全归档'
      );

      if (onSuccess) {
        onSuccess(updated);
      }
      onClose();
    } catch (err: any) {
      if (err?.errorFields) {
        // Form validation failed
        return;
      }
      message.error(err?.message || '人工处置失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
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

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <Space align="center" size="small">
            <span style={{ fontSize: 18, color: typeMeta.color }}>
              {renderAlarmTypeIcon(alarm.alarmType)}
            </span>
            <span style={{ fontWeight: 600, fontSize: 16 }}>车辆异常告警处置档案</span>
          </Space>
          <Badge
            status={statusMeta.badgeStatus}
            text={
              <span style={{ fontWeight: 500, color: statusMeta.color }}>
                {statusMeta.label}
              </span>
            }
          />
        </div>
      }
      placement="right"
      width={640}
      destroyOnClose
      open={open}
      onClose={onClose}
      styles={{
        body: {
          padding: '20px 24px',
          background: '#fafbfc',
        },
      }}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            {alarm.lat && alarm.lng && (
              <Button
                type="link"
                icon={<EnvironmentOutlined />}
                onClick={() => onLocate?.(alarm)}
                style={{ paddingLeft: 0 }}
              >
                在地图中查看车辆定位
              </Button>
            )}
          </div>
          <Space>
            <Button onClick={onClose}>关闭</Button>
            {!isTerminal && (
              <Popconfirm
                title="确认提交人工处置？"
                description="提交后状态将永久流转为不可逆终态，并生成不可篡改的操作审计留痕。"
                onConfirm={handleSubmit}
                okText="确认提交"
                cancelText="取消"
                okButtonProps={{ danger: form.getFieldValue('status') === AlarmStatus.IGNORED }}
              >
                <Button type="primary" loading={submitting}>
                  提交处置结论
                </Button>
              </Popconfirm>
            )}
          </Space>
        </div>
      }
    >
      {/* 头部元数据条 */}
      <Card
        size="small"
        style={{
          borderRadius: 8,
          marginBottom: 16,
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Text type="secondary" style={{ fontSize: 12, marginRight: 8 }}>
              告警流水号:
            </Text>
            <Text code copyable style={{ fontFamily: 'monospace', fontWeight: 600 }}>
              {alarm.id}
            </Text>
          </div>
          <Space size="small">
            <Tag color={typeMeta.tagColor} icon={renderAlarmTypeIcon(alarm.alarmType)}>
              {typeMeta.label}
            </Tag>
            <Tag color={levelMeta.tagColor}>{levelMeta.label}</Tag>
          </Space>
        </div>
      </Card>

      {/* 处置操作指引建议 */}
      <Alert
        message="运营中台处理指引"
        description={typeMeta.guide}
        type={alarm.alarmLevel === AlarmLevel.CRITICAL ? 'error' : 'warning'}
        showIcon
        icon={alarm.alarmLevel === AlarmLevel.CRITICAL ? <ExclamationCircleOutlined /> : <InfoCircleOutlined />}
        style={{ marginBottom: 16, borderRadius: 8 }}
      />

      {/* 告警工况与关联车辆详情卡片 */}
      <Card
        title={
          <Space size="small">
            <CarOutlined style={{ color: '#1677ff' }} />
            <span>告警工况与车辆遥测</span>
          </Space>
        }
        size="small"
        style={{
          borderRadius: 8,
          marginBottom: 16,
          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
        }}
      >
        <Descriptions bordered size="small" column={2}>
          <Descriptions.Item label="车牌号码">
            {alarm.plateNumber ? (
              <Tag color="blue" style={{ fontWeight: 600 }}>
                {alarm.plateNumber}
              </Tag>
            ) : (
              '-'
            )}
          </Descriptions.Item>
          <Descriptions.Item label="车辆车型">
            <Text>{alarm.vehicleModel || '-'}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="车辆 VIN 码" span={2}>
            <Text copyable code style={{ fontFamily: 'monospace' }}>
              {alarm.vin || '-'}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="关联设备号">
            <Text copyable code style={{ fontFamily: 'monospace' }}>
              {alarm.deviceNo}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="触发瞬时车速">
            <Text strong style={{ color: alarm.speed && alarm.speed > 80 ? '#cf1322' : 'inherit' }}>
              {alarm.speed !== undefined ? `${alarm.speed} km/h` : '0 km/h'}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="蓄电池电压">
            <Text strong style={{ color: alarm.voltage && alarm.voltage < 11.2 ? '#cf1322' : 'inherit' }}>
              {alarm.voltage !== undefined ? `${alarm.voltage.toFixed(1)} V` : '-'}
            </Text>
            {alarm.voltage && alarm.voltage < 11.2 && (
              <Tag color="red" style={{ marginLeft: 6, fontSize: 11 }}>
                欠压
              </Tag>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="触发经纬度">
            {alarm.lat && alarm.lng ? (
              <Text copyable style={{ fontFamily: 'monospace', fontSize: 12 }}>
                {`${alarm.lat.toFixed(4)}, ${alarm.lng.toFixed(4)}`}
              </Text>
            ) : (
              '-'
            )}
          </Descriptions.Item>
          <Descriptions.Item label="触发时间" span={2}>
            <Space>
              <ClockCircleOutlined style={{ color: '#8c8c8c' }} />
              <Text>{formatDate(alarm.triggeredAt)}</Text>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="告警上报内容" span={2}>
            <Text type="danger" style={{ fontWeight: 500 }}>
              {alarm.message || '未包含附加告警描述'}
            </Text>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 待处置模式：人工闭环处置表单 */}
      {!isTerminal ? (
        <Card
          title={
            <Space size="small">
              <AuditOutlined style={{ color: '#1677ff' }} />
              <span>人工处置闭环录入</span>
            </Space>
          }
          size="small"
          style={{
            borderRadius: 8,
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
          }}
        >
          <Form form={form} layout="vertical">
            <Form.Item
              name="status"
              label="处置结论"
              rules={[{ required: true, message: '请选择处置结论' }]}
            >
              <Radio.Group buttonStyle="solid">
                <Radio.Button value={AlarmStatus.PROCESSED}>
                  <CheckCircleOutlined style={{ marginRight: 6, color: '#52c41a' }} />
                  确认已处理 (已联系车主 / 派工检修)
                </Radio.Button>
                <Radio.Button value={AlarmStatus.IGNORED}>
                  <InfoCircleOutlined style={{ marginRight: 6, color: '#8c8c8c' }} />
                  判定为误报 / 忽略
                </Radio.Button>
              </Radio.Group>
            </Form.Item>

            <Form.Item
              name="remark"
              label="处置原因及闭环说明 (2~200 字)"
              rules={[
                { required: true, message: '请输入人工处置原因及闭环处理说明' },
                { min: 2, message: '处置原因说明至少需要 2 个字符' },
                { max: 200, message: '处置原因说明不能超过 200 个字符' },
              ]}
              extra="请详实记录与车主的沟通结果、检修工单号或误报判定依据，此信息将进入风控审计存证。"
            >
              <TextArea
                rows={4}
                maxLength={200}
                showCount
                placeholder="例如：已电话联系车主，车主确认在车库检修时不慎误碰碰撞传感器，车辆状态安全正常，已解除告警。"
              />
            </Form.Item>
          </Form>
        </Card>
      ) : (
        /* 终态模式：不可逆履历审计卡片与垂直生命周期时间轴 */
        <Card
          title={
            <Space size="small">
              <AuditOutlined style={{ color: '#52c41a' }} />
              <span>终态闭环归档履历 (不可逆审计)</span>
            </Space>
          }
          size="small"
          style={{
            borderRadius: 8,
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
          }}
        >
          <Descriptions bordered size="small" column={1} style={{ marginBottom: 20 }}>
            <Descriptions.Item label="最终状态">
              <Tag
                color={alarm.status === AlarmStatus.PROCESSED ? 'success' : 'default'}
                icon={alarm.status === AlarmStatus.PROCESSED ? <CheckCircleOutlined /> : <InfoCircleOutlined />}
              >
                {alarm.status === AlarmStatus.PROCESSED ? '已确认处理闭环' : '已判定为误报并忽略'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="处置操作人">
              <Space>
                <UserOutlined style={{ color: '#1677ff' }} />
                <Text strong>{alarm.processedBy || alarm.operatorId || '系统管理员'}</Text>
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="完成处置时间">
              <Space>
                <ClockCircleOutlined style={{ color: '#52c41a' }} />
                <Text>{formatDate(alarm.processedAt)}</Text>
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="处置审计说明">
              <div
                style={{
                  background: '#f9f9f9',
                  padding: '8px 12px',
                  borderRadius: 6,
                  borderLeft: '3px solid #1677ff',
                }}
              >
                <Text style={{ whiteSpace: 'pre-wrap' }}>{alarm.remark || '-'}</Text>
              </div>
            </Descriptions.Item>
          </Descriptions>

          <Divider style={{ margin: '16px 0 12px' }} />
          <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 12, fontWeight: 500 }}>
            告警全生命周期事件轴
          </div>

          <Timeline
            items={[
              {
                color: alarm.alarmLevel === AlarmLevel.CRITICAL ? 'red' : 'orange',
                children: (
                  <div>
                    <Text strong>终端硬件上报告警</Text>
                    <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginTop: 2 }}>
                      {formatDate(alarm.triggeredAt)}
                    </div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>
                      {alarm.message || `${typeMeta.label} 触发`}
                    </div>
                  </div>
                ),
              },
              {
                color: 'blue',
                children: (
                  <div>
                    <Text strong>中台声光分发与入库</Text>
                    <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginTop: 2 }}>
                      {formatDate(alarm.createdAt || alarm.triggeredAt)}
                    </div>
                    <div style={{ fontSize: 13, marginTop: 4, color: 'rgba(0,0,0,0.65)' }}>
                      系统分发至监控坐席并向车主 App 推送高优先级安全通知
                    </div>
                  </div>
                ),
              },
              {
                color: alarm.status === AlarmStatus.PROCESSED ? 'green' : 'gray',
                dot: <CheckCircleOutlined style={{ fontSize: 14 }} />,
                children: (
                  <div>
                    <Text strong>
                      {alarm.status === AlarmStatus.PROCESSED ? '人工闭环处置完成' : '判定误报并归档'}
                    </Text>
                    <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)', marginTop: 2 }}>
                      {formatDate(alarm.processedAt)}
                    </div>
                    <div style={{ fontSize: 13, marginTop: 4, color: 'rgba(0,0,0,0.65)' }}>
                      处理人: {alarm.processedBy || '系统管理员'}
                    </div>
                  </div>
                ),
              },
            ]}
          />
        </Card>
      )}
    </Drawer>
  );
};

export default AlertProcessDrawer;
