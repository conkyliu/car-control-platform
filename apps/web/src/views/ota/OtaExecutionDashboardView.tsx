import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Card,
  Row,
  Col,
  Space,
  Typography,
  Tag,
  Button,
  Select,
  Segmented,
  Input,
  Table,
  Progress,
  Alert,
  Popconfirm,
  Badge,
  Tooltip,
  Divider,
  message,
  theme,
  Empty,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CloudSyncOutlined,
  CarOutlined,
  CheckCircleOutlined,
  AlertOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  StopOutlined,
  ReloadOutlined,
  SearchOutlined,
  FileTextOutlined,
  SafetyCertificateOutlined,
  CopyOutlined,
  SyncOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import {
  type OtaVehicleTaskRecord,
  type OtaPlanSummary,
  type OtaPlanDetailDto,
  OtaVehicleTaskStatus,
  OTA_VEHICLE_TASK_STATUS_METADATA,
  calculateGlobalOtaStats,
  calculatePlanTaskSummary,
  filterVehicleTasks,
} from './ota-dashboard-core.ts';
import {
  type OtaPlanDto,
  OtaPlanStatus,
  OTA_PLAN_STATUS_METADATA,
  UPGRADE_MODE_METADATA,
} from './ota-plan-core.ts';
import {
  fetchOtaPlansApi,
  pauseOtaPlanApi,
  resumeOtaPlanApi,
  cancelOtaPlanApi,
} from '../../api/ota-plan.ts';
import {
  fetchOtaPlanExecutionDetailApi,
  retryFailedVehiclesApi,
  retrySingleVehicleTaskApi,
  subscribeRealtimeOtaProgress,
} from '../../api/ota-dashboard.ts';
import { getInMemoryFirmwarePackages } from '../../api/firmware.ts';
import { SEED_FIRMWARE_PACKAGES } from './firmware-core.ts';
import { OtaVehicleLogDrawer } from './OtaVehicleLogDrawer.tsx';

const { Text, Title, Paragraph } = Typography;

export interface OtaExecutionDashboardViewProps {
  /** 外部可指定默认选中的计划 ID (如从向导新建后带入) */
  selectedPlanId?: string;
  /** 计划切换通知回调 */
  onSelectPlanId?: (planId: string) => void;
}

/**
 * 格式化持续时间
 */
function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

/**
 * OTA 批量任务执行监控与实时大屏
 */
export const OtaExecutionDashboardView: React.FC<OtaExecutionDashboardViewProps> = ({
  selectedPlanId: propSelectedPlanId,
  onSelectPlanId,
}) => {
  const { token } = theme.useToken();

  // 计划列表与选中状态
  const [plans, setPlans] = useState<OtaPlanDto[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [planFilterStatus, setPlanFilterStatus] = useState<string>('ALL');
  const [currentPlanId, setCurrentPlanId] = useState<string>(propSelectedPlanId || '');

  // 当前选中计划的执行明细与统计
  const [planDetail, setPlanDetail] = useState<OtaPlanDetailDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // 表格过滤条件
  const [searchKeyword, setSearchKeyword] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState<string>('ALL');

  // 日志抽屉状态
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<OtaVehicleTaskRecord | null>(null);

  // 1. 加载所有计划列表
  const loadPlans = useCallback(async () => {
    try {
      setPlansLoading(true);
      const res = await fetchOtaPlansApi();
      setPlans(res);
      // 若当前未选中计划或选中的计划不存在，默认选中第一项
      if (res.length > 0) {
        if (!currentPlanId || !res.some((p) => p.id === currentPlanId)) {
          const defaultId = propSelectedPlanId && res.some((p) => p.id === propSelectedPlanId)
            ? propSelectedPlanId
            : res[0].id;
          setCurrentPlanId(defaultId);
          onSelectPlanId?.(defaultId);
        }
      }
    } catch (err: any) {
      message.error(err?.message || '加载升级计划列表失败');
    } finally {
      setPlansLoading(false);
    }
  }, [currentPlanId, propSelectedPlanId, onSelectPlanId]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  // 同步外部 propSelectedPlanId 变更
  useEffect(() => {
    if (propSelectedPlanId && propSelectedPlanId !== currentPlanId) {
      setCurrentPlanId(propSelectedPlanId);
    }
  }, [propSelectedPlanId, currentPlanId]);

  // 2. 加载当前选中计划的执行明细
  const loadPlanDetail = useCallback(async (planId: string) => {
    if (!planId) return;
    try {
      setDetailLoading(true);
      const detail = await fetchOtaPlanExecutionDetailApi(planId);
      setPlanDetail(detail);
      // 若当前打开抽屉的车辆在更新数据中，同步刷新抽屉
      setSelectedTask((prev) => {
        if (!prev) return null;
        return detail.vehicleTasks.find((t) => t.id === prev.id) || prev;
      });
    } catch (err: any) {
      message.error(err?.message || `加载升级计划 [${planId}] 执行明细失败`);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentPlanId) {
      loadPlanDetail(currentPlanId);
    }
  }, [currentPlanId, loadPlanDetail]);

  // 3. 订阅实时推流
  useEffect(() => {
    if (!currentPlanId) return;
    const unsubscribe = subscribeRealtimeOtaProgress(currentPlanId, (updatedTask) => {
      setPlanDetail((prev) => {
        if (!prev || prev.plan.id !== updatedTask.planId) return prev;
        const tasks = prev.vehicleTasks.map((t) =>
          t.id === updatedTask.id ? { ...t, ...updatedTask } : t
        );
        const threshold = prev.plan.executionConfig?.failureThresholdPercent ?? 5;
        const newSummary = calculatePlanTaskSummary(tasks, threshold);
        return {
          ...prev,
          summary: newSummary,
          vehicleTasks: tasks,
        };
      });

      setSelectedTask((prev) => {
        if (prev && prev.id === updatedTask.id) {
          return { ...prev, ...updatedTask };
        }
        return prev;
      });
    });

    return () => {
      unsubscribe();
    };
  }, [currentPlanId]);

  // 4. 计算宏观 KPI 卡片指标
  const globalStats = useMemo(() => {
    return calculateGlobalOtaStats(plans);
  }, [plans]);

  // 5. 计划下拉过滤项
  const filteredPlanOptions = useMemo(() => {
    return plans.filter((p) => {
      if (planFilterStatus === 'ALL') return true;
      if (planFilterStatus === 'CIRCUIT_BREAKER') {
        return (
          p.status === OtaPlanStatus.ABORTED ||
          (p.failureRatePercent !== undefined && p.failureRatePercent >= 5.0)
        );
      }
      return p.status === planFilterStatus;
    });
  }, [plans, planFilterStatus]);

  // 6. 查找关联固件详情 (获取 SHA-256)
  const currentFirmware = useMemo(() => {
    if (!planDetail?.plan) return null;
    const pool = getInMemoryFirmwarePackages() || SEED_FIRMWARE_PACKAGES;
    return (
      pool.find((f) => f.id === planDetail.plan.firmwareId) || {
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      }
    );
  }, [planDetail]);

  // 7. 当前车辆任务过滤结果
  const filteredTasks = useMemo(() => {
    if (!planDetail?.vehicleTasks) return [];
    return filterVehicleTasks(planDetail.vehicleTasks, {
      keyword: searchKeyword,
      status: taskStatusFilter,
    });
  }, [planDetail, searchKeyword, taskStatusFilter]);

  // 切换选中计划
  const handleSelectPlan = (planId: string) => {
    setCurrentPlanId(planId);
    onSelectPlanId?.(planId);
  };

  // 暂停升级计划
  const handlePausePlan = async () => {
    if (!currentPlanId) return;
    try {
      setActionLoading(true);
      await pauseOtaPlanApi(currentPlanId);
      message.success('计划已暂停下发');
      await Promise.all([loadPlans(), loadPlanDetail(currentPlanId)]);
    } catch (err: any) {
      message.error(err?.message || '暂停失败');
    } finally {
      setActionLoading(false);
    }
  };

  // 恢复升级计划
  const handleResumePlan = async () => {
    if (!currentPlanId) return;
    try {
      setActionLoading(true);
      await resumeOtaPlanApi(currentPlanId);
      message.success('计划已恢复执行');
      await Promise.all([loadPlans(), loadPlanDetail(currentPlanId)]);
    } catch (err: any) {
      message.error(err?.message || '恢复失败');
    } finally {
      setActionLoading(false);
    }
  };

  // 紧急终止升级计划
  const handleAbortPlan = async () => {
    if (!currentPlanId) return;
    try {
      setActionLoading(true);
      await cancelOtaPlanApi(
        currentPlanId,
        '管理员在监控大屏手动紧急终止，已下发安全回滚指令'
      );
      message.warning('计划已紧急终止，剩余车辆已取消下发');
      await Promise.all([loadPlans(), loadPlanDetail(currentPlanId)]);
    } catch (err: any) {
      message.error(err?.message || '终止失败');
    } finally {
      setActionLoading(false);
    }
  };

  // 批量重试失败车辆
  const handleRetryFailedVehicles = async () => {
    if (!currentPlanId) return;
    try {
      setActionLoading(true);
      const res = await retryFailedVehiclesApi(currentPlanId);
      setPlanDetail(res);
      message.success('已重新重置所有失败车辆为待下发状态');
      await loadPlans();
    } catch (err: any) {
      message.error(err?.message || '批量重试失败');
    } finally {
      setActionLoading(false);
    }
  };

  // 单车重试
  const handleSingleRetry = async (taskId: string) => {
    if (!currentPlanId) return;
    try {
      const updated = await retrySingleVehicleTaskApi(currentPlanId, taskId);
      message.success(`车辆任务已重置，已排入下发队列`);
      // 刷新详情
      await loadPlanDetail(currentPlanId);
      if (selectedTask?.id === taskId) {
        setSelectedTask(updated);
      }
    } catch (err: any) {
      message.error(err?.message || '单车重试失败');
    }
  };

  // 打开日志抽屉
  const handleOpenDrawer = (record: OtaVehicleTaskRecord) => {
    setSelectedTask(record);
    setDrawerOpen(true);
  };

  // 表格列定义
  const columns: ColumnsType<OtaVehicleTaskRecord> = [
    {
      title: '车牌号码',
      dataIndex: 'plateNumber',
      key: 'plateNumber',
      width: 120,
      render: (plate: string) => (
        <Tag color="blue" style={{ fontWeight: 600, fontFamily: 'monospace' }}>
          {plate}
        </Tag>
      ),
    },
    {
      title: 'VIN 码',
      dataIndex: 'vin',
      key: 'vin',
      width: 180,
      render: (vin: string) => (
        <Text copyable code style={{ fontFamily: 'monospace', fontSize: 12 }}>
          {vin}
        </Text>
      ),
    },
    {
      title: '车型',
      dataIndex: 'modelName',
      key: 'modelName',
      width: 110,
    },
    {
      title: '固件版本流转',
      key: 'versionFlow',
      width: 160,
      render: (_, r) => (
        <Space size={4}>
          <Tag style={{ margin: 0 }}>{r.currentVersion}</Tag>
          <Text type="secondary" style={{ fontSize: 12 }}>➔</Text>
          <Tag color="cyan" style={{ margin: 0 }}>{r.targetVersion}</Tag>
        </Space>
      ),
    },
    {
      title: '执行阶段',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: OtaVehicleTaskStatus) => {
        const meta = OTA_VEHICLE_TASK_STATUS_METADATA[status];
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
      title: '下载进度',
      dataIndex: 'downloadProgress',
      key: 'downloadProgress',
      width: 130,
      render: (prog: number) => (
        <Progress
          percent={prog}
          size="small"
          status={prog === 100 ? 'success' : 'active'}
          strokeColor="#1677ff"
        />
      ),
    },
    {
      title: '烧录进度',
      dataIndex: 'installProgress',
      key: 'installProgress',
      width: 130,
      render: (prog: number, r) => (
        <Progress
          percent={prog}
          size="small"
          status={
            r.status === OtaVehicleTaskStatus.FAILED
              ? 'exception'
              : prog === 100
              ? 'success'
              : 'active'
          }
          strokeColor={r.status === OtaVehicleTaskStatus.FAILED ? '#ff4d4f' : '#fa8c16'}
        />
      ),
    },
    {
      title: '重试',
      key: 'retries',
      width: 80,
      render: (_, r) => (
        <Text style={{ fontSize: 12 }}>
          {r.retries}/{r.maxRetries}
        </Text>
      ),
    },
    {
      title: '耗时',
      dataIndex: 'durationSeconds',
      key: 'durationSeconds',
      width: 90,
      render: (secs?: number) => (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {formatDuration(secs)}
        </Text>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 140,
      fixed: 'right',
      render: (_, r) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<FileTextOutlined />}
            onClick={() => handleOpenDrawer(r)}
            style={{ padding: 0 }}
          >
            详细日志
          </Button>
          {r.status === OtaVehicleTaskStatus.FAILED && (
            <Popconfirm
              title="确定发起单车重试？"
              description="重置为待下发状态重新推送固件"
              onConfirm={() => handleSingleRetry(r.id)}
            >
              <Button type="link" size="small" danger style={{ padding: 0 }}>
                重试
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const currentPlan = planDetail?.plan;
  const currentSummary = planDetail?.summary;
  const planStatusMeta = currentPlan
    ? OTA_PLAN_STATUS_METADATA[currentPlan.status]
    : null;
  const upgradeModeMeta = currentPlan
    ? UPGRADE_MODE_METADATA[currentPlan.upgradeMode]
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 1. 顶部 4 大宏观 KPI 指标卡片 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card
            bordered={false}
            size="small"
            style={{
              borderRadius: token.borderRadiusLG,
              backgroundColor: token.colorBgContainer,
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  活跃升级计划
                </Text>
                <div style={{ marginTop: 4 }}>
                  <Text strong style={{ fontSize: 28, color: token.colorPrimary }}>
                    {globalStats.activePlansCount}
                  </Text>
                  <Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
                    / {plans.length} 个计划
                  </Text>
                </div>
              </div>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: token.colorPrimaryBg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: token.colorPrimary,
                  fontSize: 22,
                }}
              >
                <CloudSyncOutlined />
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            bordered={false}
            size="small"
            style={{
              borderRadius: token.borderRadiusLG,
              backgroundColor: token.colorBgContainer,
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  覆盖车辆规模
                </Text>
                <div style={{ marginTop: 4 }}>
                  <Text strong style={{ fontSize: 28 }}>
                    {globalStats.totalVehiclesCovered}
                  </Text>
                  <Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
                    辆车已排期
                  </Text>
                </div>
              </div>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: token.colorInfoBg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: token.colorInfo,
                  fontSize: 22,
                }}
              >
                <CarOutlined />
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            bordered={false}
            size="small"
            style={{
              borderRadius: token.borderRadiusLG,
              backgroundColor: token.colorBgContainer,
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  全局升级成功率
                </Text>
                <div style={{ marginTop: 4 }}>
                  <Text strong style={{ fontSize: 28, color: token.colorSuccess }}>
                    {globalStats.globalSuccessRate}%
                  </Text>
                  <Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
                    自检合规率
                  </Text>
                </div>
              </div>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: token.colorSuccessBg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: token.colorSuccess,
                  fontSize: 22,
                }}
              >
                <CheckCircleOutlined />
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={24} sm={12} lg={6}>
          <Card
            bordered={false}
            size="small"
            style={{
              borderRadius: token.borderRadiusLG,
              backgroundColor: token.colorBgContainer,
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  熔断预警计划
                </Text>
                <div style={{ marginTop: 4 }}>
                  <Text
                    strong
                    style={{
                      fontSize: 28,
                      color:
                        globalStats.circuitBreakerAlertCount > 0
                          ? token.colorError
                          : token.colorTextSecondary,
                    }}
                  >
                    {globalStats.circuitBreakerAlertCount}
                  </Text>
                  <Text type="secondary" style={{ marginLeft: 6, fontSize: 12 }}>
                    &gt;= 5% 阈值
                  </Text>
                </div>
              </div>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor:
                    globalStats.circuitBreakerAlertCount > 0
                      ? token.colorErrorBg
                      : token.colorFillAlter,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color:
                    globalStats.circuitBreakerAlertCount > 0
                      ? token.colorError
                      : token.colorTextTertiary,
                  fontSize: 22,
                }}
              >
                <AlertOutlined />
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 2. 计划选择工具栏与状态过滤 */}
      <Card
        bordered={false}
        size="small"
        style={{
          borderRadius: token.borderRadiusLG,
          backgroundColor: token.colorBgContainer,
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        }}
      >
        <Row gutter={[16, 12]} align="middle" justify="space-between">
          <Col xs={24} md={12} lg={10}>
            <Space align="center" style={{ width: '100%' }}>
              <Text strong style={{ whiteSpace: 'nowrap' }}>
                升级计划:
              </Text>
              <Select
                value={currentPlanId}
                onChange={handleSelectPlan}
                loading={plansLoading}
                style={{ minWidth: 280, width: '100%' }}
                options={filteredPlanOptions.map((p) => ({
                  value: p.id,
                  label: (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text ellipsis style={{ maxWidth: 220 }}>
                        {p.name}
                      </Text>
                      <Tag
                        color={OTA_PLAN_STATUS_METADATA[p.status]?.tagColor}
                        style={{ marginLeft: 8 }}
                      >
                        {OTA_PLAN_STATUS_METADATA[p.status]?.label}
                      </Tag>
                    </div>
                  ),
                }))}
              />
            </Space>
          </Col>

          <Col xs={24} md={12} lg={14} style={{ textAlign: 'right' }}>
            <Space wrap>
              <Segmented
                value={planFilterStatus}
                onChange={(val) => setPlanFilterStatus(val as string)}
                options={[
                  { label: '全部', value: 'ALL' },
                  { label: '执行中', value: OtaPlanStatus.RUNNING },
                  { label: '已暂停', value: OtaPlanStatus.PAUSED },
                  { label: '已完成', value: OtaPlanStatus.COMPLETED },
                  { label: '已熔断/中止', value: 'CIRCUIT_BREAKER' },
                ]}
              />
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  loadPlans();
                  if (currentPlanId) loadPlanDetail(currentPlanId);
                }}
                loading={plansLoading || detailLoading}
              >
                刷新看板
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 3. 选中计划概览看板卡片 */}
      {currentPlan && currentSummary ? (
        <Card
          bordered={false}
          loading={detailLoading}
          style={{
            borderRadius: token.borderRadiusLG,
            backgroundColor: token.colorBgContainer,
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
          }}
        >
          {/* 熔断报警红线 Banner */}
          {currentSummary.isCircuitBreakerTriggered && (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
              message={
                <Space>
                  <Text strong style={{ fontSize: 15 }}>
                    5% 失败熔断安全红线已触发！
                  </Text>
                  <Tag color="red">当前失败率: {currentSummary.failureRate}%</Tag>
                  <Tag color="volcano">
                    熔断阈值: {currentPlan.executionConfig.failureThresholdPercent}%
                  </Tag>
                </Space>
              }
              description={
                <div style={{ marginTop: 4 }}>
                  <Text>
                    {currentPlan.abortReason ||
                      '批次执行中失败率已突破安全红线防御阈值，为杜绝故障大面积扩散已触发熔断保护，暂停后续车辆下发。'}
                  </Text>
                  <div style={{ marginTop: 8 }}>
                    <Space>
                      <Button
                        type="primary"
                        danger
                        size="small"
                        icon={<ReloadOutlined />}
                        loading={actionLoading}
                        onClick={handleRetryFailedVehicles}
                      >
                        一键重试失败车辆 ({currentSummary.failedCount} 台)
                      </Button>
                      <Button
                        size="small"
                        icon={<FileTextOutlined />}
                        onClick={() => {
                          const failed = planDetail?.vehicleTasks.find(
                            (t) => t.status === OtaVehicleTaskStatus.FAILED
                          );
                          if (failed) handleOpenDrawer(failed);
                        }}
                      >
                        排查失败原因
                      </Button>
                    </Space>
                  </div>
                </div>
              }
            />
          )}

          {/* 计划核心信息栏 */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              flexWrap: 'wrap',
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div>
              <Space align="center" size="middle" wrap>
                <Title level={4} style={{ margin: 0 }}>
                  {currentPlan.name}
                </Title>
                {planStatusMeta && (
                  <Tag color={planStatusMeta.tagColor} style={{ fontSize: 13, padding: '2px 10px' }}>
                    {planStatusMeta.label}
                  </Tag>
                )}
                {upgradeModeMeta && (
                  <Tag color={upgradeModeMeta.tagColor}>
                    {upgradeModeMeta.label}
                  </Tag>
                )}
              </Space>

              <div style={{ marginTop: 8 }}>
                <Space size="middle" wrap style={{ color: token.colorTextSecondary, fontSize: 13 }}>
                  <span>
                    目标固件: <Text strong>{currentPlan.firmwareName}</Text> (
                    <Text code>{currentPlan.firmwareVersion}</Text>)
                  </span>
                  <span>
                    安全哈希 (SHA-256):{' '}
                    <Text
                      copyable
                      code
                      style={{ fontFamily: 'monospace', fontSize: 11 }}
                    >
                      {currentFirmware?.sha256
                        ? `${currentFirmware.sha256.slice(0, 16)}...`
                        : 'e3b0c442...'}
                    </Text>
                  </span>
                  <span>
                    创建时间: {currentPlan.createdAt}
                  </span>
                </Space>
              </div>
            </div>

            {/* 操作按钮组 */}
            <Space wrap>
              {currentPlan.status === OtaPlanStatus.RUNNING && (
                <Button
                  icon={<PauseCircleOutlined />}
                  onClick={handlePausePlan}
                  loading={actionLoading}
                >
                  暂停计划
                </Button>
              )}

              {currentPlan.status === OtaPlanStatus.PAUSED && (
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  onClick={handleResumePlan}
                  loading={actionLoading}
                >
                  恢复执行
                </Button>
              )}

              {currentPlan.status !== OtaPlanStatus.COMPLETED &&
                currentPlan.status !== OtaPlanStatus.ABORTED && (
                  <Popconfirm
                    title="紧急中止升级计划"
                    description="中止后未下发车辆将停止升级，已在烧录中的车辆将执行安全回滚，确认继续？"
                    okText="确认中止"
                    cancelText="取消"
                    okButtonProps={{ danger: true }}
                    onConfirm={handleAbortPlan}
                  >
                    <Button danger icon={<StopOutlined />} loading={actionLoading}>
                      紧急中止
                    </Button>
                  </Popconfirm>
                )}

              <Popconfirm
                title="批量重试失败车辆"
                description={`确认将 ${currentSummary.failedCount} 台失败车辆重置为待下发状态并重新推送？`}
                okText="确认重试"
                cancelText="取消"
                disabled={currentSummary.failedCount === 0}
                onConfirm={handleRetryFailedVehicles}
              >
                <Button
                  icon={<ReloadOutlined />}
                  disabled={currentSummary.failedCount === 0}
                  loading={actionLoading}
                >
                  重试失败车辆 ({currentSummary.failedCount})
                </Button>
              </Popconfirm>
            </Space>
          </div>

          <Divider style={{ margin: '12px 0 16px 0' }} />

          {/* 综合进度与各阶段状态指标 */}
          <Row gutter={[24, 16]} align="middle">
            <Col xs={24} md={12}>
              <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                <Text strong>批次全链路执行总进度</Text>
                <Text strong style={{ color: token.colorPrimary, fontSize: 16 }}>
                  {currentSummary.overallProgress}%
                </Text>
              </div>
              <Progress
                percent={currentSummary.overallProgress}
                status={
                  currentSummary.isCircuitBreakerTriggered
                    ? 'exception'
                    : currentSummary.overallProgress === 100
                    ? 'success'
                    : 'active'
                }
                strokeColor={
                  currentSummary.isCircuitBreakerTriggered
                    ? '#ff4d4f'
                    : { '0%': '#1677ff', '100%': '#52c41a' }
                }
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  已成功完成: {currentSummary.successCount} / {currentSummary.totalVehicles} 辆
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  成功率: {currentSummary.successRate}% | 失败率: {currentSummary.failureRate}%
                </Text>
              </div>
            </Col>

            <Col xs={24} md={12}>
              <Row gutter={[12, 12]}>
                <Col span={6}>
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '8px 0',
                      backgroundColor: token.colorFillAlter,
                      borderRadius: token.borderRadiusSM,
                    }}
                  >
                    <Text type="secondary" style={{ fontSize: 12 }}>排队待下发</Text>
                    <div><Text strong style={{ fontSize: 18 }}>{currentSummary.pendingCount}</Text></div>
                  </div>
                </Col>

                <Col span={6}>
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '8px 0',
                      backgroundColor: token.colorInfoBg,
                      borderRadius: token.borderRadiusSM,
                    }}
                  >
                    <Text style={{ fontSize: 12, color: token.colorInfo }}>固件下载中</Text>
                    <div><Text strong style={{ fontSize: 18, color: token.colorInfo }}>{currentSummary.downloadingCount}</Text></div>
                  </div>
                </Col>

                <Col span={6}>
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '8px 0',
                      backgroundColor: token.colorWarningBg,
                      borderRadius: token.borderRadiusSM,
                    }}
                  >
                    <Text style={{ fontSize: 12, color: token.colorWarning }}>ECU烧录中</Text>
                    <div><Text strong style={{ fontSize: 18, color: token.colorWarning }}>{currentSummary.upgradingCount}</Text></div>
                  </div>
                </Col>

                <Col span={6}>
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '8px 0',
                      backgroundColor:
                        currentSummary.failedCount > 0
                          ? token.colorErrorBg
                          : token.colorFillAlter,
                      borderRadius: token.borderRadiusSM,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        color:
                          currentSummary.failedCount > 0
                            ? token.colorError
                            : token.colorTextSecondary,
                      }}
                    >
                      升级失败
                    </Text>
                    <div>
                      <Text
                        strong
                        style={{
                          fontSize: 18,
                          color:
                            currentSummary.failedCount > 0
                              ? token.colorError
                              : token.colorTextSecondary,
                        }}
                      >
                        {currentSummary.failedCount}
                      </Text>
                    </div>
                  </div>
                </Col>
              </Row>
            </Col>
          </Row>
        </Card>
      ) : (
        <Card bordered={false}>
          <Empty description="暂无选中的升级计划数据" />
        </Card>
      )}

      {/* 4. 单车升级执行明细 Table */}
      <Card
        bordered={false}
        title={
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12,
              padding: '6px 0',
            }}
          >
            <Space align="center">
              <Text strong style={{ fontSize: 16 }}>
                车辆升级任务下发流水
              </Text>
              <Tag>{filteredTasks.length} 辆车</Tag>
            </Space>

            <Space wrap>
              <Input
                placeholder="搜索车牌 / VIN / 车型"
                prefix={<SearchOutlined />}
                allowClear
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                style={{ width: 220 }}
              />
              <Select
                value={taskStatusFilter}
                onChange={(val) => setTaskStatusFilter(val)}
                style={{ width: 140 }}
                options={[
                  { label: '全部状态', value: 'ALL' },
                  { label: '排队待下发', value: OtaVehicleTaskStatus.PENDING },
                  { label: '固件下载中', value: OtaVehicleTaskStatus.DOWNLOADING },
                  { label: '固件已就绪', value: OtaVehicleTaskStatus.DOWNLOADED },
                  { label: 'ECU烧录中', value: OtaVehicleTaskStatus.UPGRADING },
                  { label: '升级成功', value: OtaVehicleTaskStatus.SUCCESS },
                  { label: '升级失败', value: OtaVehicleTaskStatus.FAILED },
                  { label: '已中止取消', value: OtaVehicleTaskStatus.CANCELLED },
                ]}
              />
            </Space>
          </div>
        }
        style={{
          borderRadius: token.borderRadiusLG,
          backgroundColor: token.colorBgContainer,
          boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
        }}
      >
        <Table<OtaVehicleTaskRecord>
          columns={columns}
          dataSource={filteredTasks}
          rowKey="id"
          loading={detailLoading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showTotal: (total) => `共 ${total} 辆车`,
          }}
          scroll={{ x: 1200 }}
          size="middle"
        />
      </Card>

      {/* 5. 单车升级履历诊断抽屉 */}
      <OtaVehicleLogDrawer
        open={drawerOpen}
        task={selectedTask}
        plan={currentPlan || null}
        onClose={() => setDrawerOpen(false)}
        onRetrySuccess={(updated) => {
          setSelectedTask(updated);
          if (currentPlanId) {
            loadPlanDetail(currentPlanId);
          }
        }}
      />
    </div>
  );
};
