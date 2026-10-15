import React, { useState } from 'react';
import {
  Drawer,
  Descriptions,
  Tag,
  Typography,
  Space,
  Progress,
  Timeline,
  Alert,
  Button,
  Divider,
  Card,
  message,
  theme,
  Empty,
} from 'antd';
import {
  ClockCircleOutlined,
  DownloadOutlined,
  CheckCircleOutlined,
  CheckCircleFilled,
  SyncOutlined,
  CloseCircleFilled,
  StopOutlined,
  ReloadOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import {
  type OtaVehicleTaskRecord,
  type OtaTaskLogStep,
  OtaVehicleTaskStatus,
  OTA_VEHICLE_TASK_STATUS_METADATA,
} from './ota-dashboard-core.ts';
import { type OtaPlanDto } from './ota-plan-core.ts';
import { retrySingleVehicleTaskApi } from '../../api/ota-dashboard.ts';

const { Text, Title, Paragraph } = Typography;

export interface OtaVehicleLogDrawerProps {
  open: boolean;
  task: OtaVehicleTaskRecord | null;
  plan: OtaPlanDto | null;
  onClose: () => void;
  onRetrySuccess?: (updatedTask: OtaVehicleTaskRecord) => void;
}

/**
 * 格式化持续时间
 */
function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs} 秒`;
  return `${mins} 分 ${secs} 秒`;
}

/**
 * 单车 OTA 升级全链路执行日志诊断抽屉 (600px 宽)
 */
export const OtaVehicleLogDrawer: React.FC<OtaVehicleLogDrawerProps> = ({
  open,
  task,
  plan,
  onClose,
  onRetrySuccess,
}) => {
  const { token } = theme.useToken();
  const [retrying, setRetrying] = useState(false);

  if (!task) {
    return (
      <Drawer
        title="单车升级日志与执行履历"
        width={600}
        open={open}
        onClose={onClose}
        destroyOnClose
        styles={{ body: { padding: '24px' } }}
      >
        <Empty description="暂无选中车辆任务" />
      </Drawer>
    );
  }

  const statusMeta = OTA_VEHICLE_TASK_STATUS_METADATA[task.status];

  // 单车故障手动重试
  const handleRetry = async () => {
    if (!task) return;
    try {
      setRetrying(true);
      const updated = await retrySingleVehicleTaskApi(task.planId, task.id);
      message.success(`车辆 [${task.plateNumber}] 已重置为待下发状态，已启动重试流程`);
      onRetrySuccess?.(updated);
    } catch (err: any) {
      message.error(err?.message || '重试下发失败，请稍后重试');
    } finally {
      setRetrying(false);
    }
  };

  // 构建垂直升级生命周期时间线节点
  const renderTimelineItems = () => {
    const phases: { phase: OtaVehicleTaskStatus; label: string; desc: string }[] = [
      {
        phase: OtaVehicleTaskStatus.PENDING,
        label: '1. 任务建档与安全门禁',
        desc: '前置 SoC 与驻车档安全自检',
      },
      {
        phase: OtaVehicleTaskStatus.DOWNLOADING,
        label: '2. 差分固件下载',
        desc: `下载进度: ${task.downloadProgress}%`,
      },
      {
        phase: OtaVehicleTaskStatus.DOWNLOADED,
        label: '3. 完整性与签名校验',
        desc: 'SHA-256 哈希比对与安全校验',
      },
      {
        phase: OtaVehicleTaskStatus.UPGRADING,
        label: '4. ECU 擦除与固件烧录',
        desc: `烧录进度: ${task.installProgress}%`,
      },
    ];

    // 终态项
    if (task.status === OtaVehicleTaskStatus.FAILED) {
      phases.push({
        phase: OtaVehicleTaskStatus.FAILED,
        label: '5. 升级失败回滚',
        desc: task.errorMessage || 'ECU 烧录校验未通过，已安全回滚原版本',
      });
    } else if (task.status === OtaVehicleTaskStatus.CANCELLED) {
      phases.push({
        phase: OtaVehicleTaskStatus.CANCELLED,
        label: '5. 任务中止取消',
        desc: task.errorMessage || '批次熔断防御或管理员手动终止',
      });
    } else {
      phases.push({
        phase: OtaVehicleTaskStatus.SUCCESS,
        label: '5. 系统激活与自检通过',
        desc: '新固件版本上报并进入正常运营',
      });
    }

    return phases.map((item, idx) => {
      // 判定状态点展示
      let color = 'gray';
      let dotIcon: React.ReactNode = <ClockCircleOutlined />;

      if (task.status === OtaVehicleTaskStatus.SUCCESS) {
        color = 'green';
        dotIcon = <CheckCircleFilled style={{ color: token.colorSuccess }} />;
      } else if (task.status === OtaVehicleTaskStatus.FAILED && idx === phases.length - 1) {
        color = 'red';
        dotIcon = <CloseCircleFilled style={{ color: token.colorError }} />;
      } else if (task.status === OtaVehicleTaskStatus.CANCELLED && idx === phases.length - 1) {
        color = 'gray';
        dotIcon = <StopOutlined style={{ color: token.colorTextTertiary }} />;
      } else {
        // 进行中状态判定
        const order: OtaVehicleTaskStatus[] = [
          OtaVehicleTaskStatus.PENDING,
          OtaVehicleTaskStatus.DOWNLOADING,
          OtaVehicleTaskStatus.DOWNLOADED,
          OtaVehicleTaskStatus.UPGRADING,
          OtaVehicleTaskStatus.SUCCESS,
        ];
        const currentIdx = order.indexOf(task.status);
        if (idx < currentIdx) {
          color = 'green';
          dotIcon = <CheckCircleOutlined style={{ color: token.colorSuccess }} />;
        } else if (idx === currentIdx) {
          color = 'blue';
          dotIcon = <SyncOutlined spin style={{ color: token.colorPrimary }} />;
        } else {
          color = 'gray';
          dotIcon = <ClockCircleOutlined style={{ color: token.colorTextTertiary }} />;
        }
      }

      return {
        color,
        dot: dotIcon,
        children: (
          <div style={{ paddingBottom: 8 }}>
            <Text strong style={{ fontSize: 13 }}>
              {item.label}
            </Text>
            <div style={{ fontSize: 12, color: token.colorTextSecondary, marginTop: 2 }}>
              {item.desc}
            </div>
          </div>
        ),
      };
    });
  };

  return (
    <Drawer
      title={
        <Space align="center">
          <Text strong style={{ fontSize: 16 }}>
            单车升级履历诊断
          </Text>
          <Tag color="blue" style={{ fontFamily: 'monospace' }}>
            {task.plateNumber}
          </Tag>
          <Tag color={statusMeta.tagColor} icon={
            task.status === OtaVehicleTaskStatus.UPGRADING ? <SyncOutlined spin /> : undefined
          }>
            {statusMeta.label}
          </Tag>
        </Space>
      }
      width={600}
      open={open}
      onClose={onClose}
      destroyOnClose
      styles={{ body: { padding: '20px 24px', backgroundColor: token.colorBgLayout } }}
      extra={
        task.status === OtaVehicleTaskStatus.FAILED ? (
          <Button
            type="primary"
            danger
            icon={<ReloadOutlined />}
            loading={retrying}
            onClick={handleRetry}
            size="small"
          >
            立即重试下发
          </Button>
        ) : null
      }
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {/* 失败报警横幅 */}
        {task.status === OtaVehicleTaskStatus.FAILED && (
          <Alert
            type="error"
            showIcon
            message={
              <Space>
                <Text strong>升级失败: {task.errorCode || 'UNKNOWN_ERROR'}</Text>
                <Tag color="red">已重试 {task.retries} / {task.maxRetries} 次</Tag>
              </Space>
            }
            description={
              <div>
                <Paragraph style={{ margin: '4px 0 8px 0', fontSize: 13 }}>
                  {task.errorMessage || '车载终端烧录中断或自检返回非零状态码，已自动安全保护'}
                </Paragraph>
                <Button
                  type="primary"
                  danger
                  size="small"
                  icon={<ReloadOutlined />}
                  loading={retrying}
                  onClick={handleRetry}
                >
                  故障重试 (剩余 {Math.max(0, task.maxRetries - task.retries)} 次)
                </Button>
              </div>
            }
          />
        )}

        {/* 熔断中止横幅 */}
        {task.status === OtaVehicleTaskStatus.CANCELLED && (
          <Alert
            type="warning"
            showIcon
            message="升级任务已中止取消"
            description={
              task.errorMessage ||
              '当前批次触发 5% 失败熔断红线防御或运维手动取消，任务已终止下发。'
            }
          />
        )}

        {/* 车辆与固件基本信息卡片 */}
        <Card
          bordered={false}
          size="small"
          style={{
            borderRadius: token.borderRadiusLG,
            backgroundColor: token.colorBgContainer,
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
          }}
        >
          <Descriptions
            title={<Text strong style={{ fontSize: 14 }}>车辆与固件版本档案</Text>}
            column={2}
            size="small"
            items={[
              {
                key: 'plate',
                label: '车牌号码',
                children: <Text strong>{task.plateNumber}</Text>,
              },
              {
                key: 'model',
                label: '车型',
                children: task.modelName,
              },
              {
                key: 'vin',
                label: 'VIN 码',
                span: 2,
                children: (
                  <Text copyable code style={{ fontFamily: 'monospace' }}>
                    {task.vin}
                  </Text>
                ),
              },
              {
                key: 'plan',
                label: '归属计划',
                span: 2,
                children: plan?.name || task.planId,
              },
              {
                key: 'version',
                label: '版本流转',
                children: (
                  <Space size={4}>
                    <Tag>{task.currentVersion}</Tag>
                    <span>➔</span>
                    <Tag color="cyan">{task.targetVersion}</Tag>
                  </Space>
                ),
              },
              {
                key: 'duration',
                label: '累计执行耗时',
                children: formatDuration(task.durationSeconds),
              },
              {
                key: 'startedAt',
                label: '下发启动时间',
                children: task.startedAt || '-',
              },
              {
                key: 'completedAt',
                label: '完成入库时间',
                children: task.completedAt || '-',
              },
            ]}
          />
        </Card>

        {/* 实时分项进度面板 */}
        <Card
          bordered={false}
          size="small"
          title={<Text strong style={{ fontSize: 14 }}>升级执行双阶段进度</Text>}
          style={{
            borderRadius: token.borderRadiusLG,
            backgroundColor: token.colorBgContainer,
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                1. 固件包空中下载 (4G/5G 网络传输)
              </Text>
              <Text strong style={{ fontSize: 12 }}>
                {task.downloadProgress}%
              </Text>
            </div>
            <Progress
              percent={task.downloadProgress}
              size="small"
              status={task.downloadProgress === 100 ? 'success' : 'active'}
              strokeColor={{ '0%': '#108ee9', '100%': '#87d068' }}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                2. 控制器 ECU 烧录与校验
              </Text>
              <Text strong style={{ fontSize: 12 }}>
                {task.installProgress}%
              </Text>
            </div>
            <Progress
              percent={task.installProgress}
              size="small"
              status={
                task.status === OtaVehicleTaskStatus.FAILED
                  ? 'exception'
                  : task.installProgress === 100
                  ? 'success'
                  : 'active'
              }
              strokeColor={{ '0%': '#fa8c16', '100%': '#52c41a' }}
            />
          </div>
        </Card>

        {/* 升级全链路阶段时间线 */}
        <Card
          bordered={false}
          size="small"
          title={<Text strong style={{ fontSize: 14 }}>升级阶段演进状态机</Text>}
          style={{
            borderRadius: token.borderRadiusLG,
            backgroundColor: token.colorBgContainer,
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
          }}
        >
          <Timeline
            style={{ marginTop: 12, marginLeft: 8 }}
            items={renderTimelineItems()}
          />
        </Card>

        {/* 全链路详细步骤日志流水 */}
        <Card
          bordered={false}
          size="small"
          title={
            <Space>
              <Text strong style={{ fontSize: 14 }}>执行步骤日志流水</Text>
              <Tag>{task.logs?.length ?? 0} 条记录</Tag>
            </Space>
          }
          style={{
            borderRadius: token.borderRadiusLG,
            backgroundColor: token.colorBgContainer,
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
          }}
        >
          {task.logs && task.logs.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {task.logs.map((step) => {
                const isError = step.level === 'error' || step.phase === OtaVehicleTaskStatus.FAILED;
                const isSuccess = step.level === 'success' || step.phase === OtaVehicleTaskStatus.SUCCESS;
                const isWarn = step.level === 'warn';

                return (
                  <div
                    key={step.id}
                    style={{
                      padding: '8px 12px',
                      borderRadius: token.borderRadiusSM,
                      backgroundColor: isError
                        ? token.colorErrorBg
                        : isSuccess
                        ? token.colorSuccessBg
                        : isWarn
                        ? token.colorWarningBg
                        : token.colorFillAlter,
                      border: `1px solid ${
                        isError
                          ? token.colorErrorBorder
                          : isSuccess
                          ? token.colorSuccessBorder
                          : token.colorBorderSecondary
                      }`,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 4,
                      }}
                    >
                      <Space size={6}>
                        <Tag
                          color={
                            isError ? 'red' : isSuccess ? 'green' : isWarn ? 'orange' : 'blue'
                          }
                          style={{ margin: 0, fontSize: 11 }}
                        >
                          {step.action}
                        </Tag>
                        {step.code && (
                          <Text
                            code
                            style={{
                              fontSize: 11,
                              fontFamily: 'monospace',
                            }}
                          >
                            {step.code}
                          </Text>
                        )}
                      </Space>
                      <Text
                        type="secondary"
                        style={{ fontSize: 11, fontFamily: 'monospace' }}
                      >
                        {step.timestamp}
                      </Text>
                    </div>
                    <Text
                      style={{
                        fontSize: 12,
                        color: isError
                          ? token.colorErrorText
                          : token.colorText,
                        lineHeight: 1.5,
                      }}
                    >
                      {step.description}
                    </Text>
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无执行流水日志"
            />
          )}
        </Card>
      </Space>
    </Drawer>
  );
};
