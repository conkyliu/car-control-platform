import React, { useEffect, useState, useCallback, useRef } from 'react';
import { notification, Button, Space, Tag, Typography } from 'antd';
import {
  EnvironmentOutlined,
  CloseOutlined,
  CheckCircleOutlined,
  CompassOutlined,
} from '@ant-design/icons';
import {
  AlarmLevel,
  type AlarmRecord,
  ALARM_TYPE_METADATA,
  ALARM_LEVEL_METADATA,
} from './alarm-core.ts';
import {
  playAlarmSound,
  getAlarmSoundMuted,
  shouldTriggerNotification,
  getNotificationSeverityColor,
} from './alert-notification-core.ts';
import { subscribeRealtimeAlarms } from '../../api/alarm.ts';
import { useTenantStore } from '../../store/useTenantStore.ts';
import { useNavTabsStore } from '../../store/useNavTabsStore.ts';
import { RoutePath } from '../../router/routes.ts';
import { AlertProcessDrawer, renderAlarmTypeIcon } from './AlertProcessDrawer.tsx';

const { Text } = Typography;

export interface AlertRealtimeNotificationProps {
  minLevel?: AlarmLevel;
  onProcess?: (alarm: AlarmRecord) => void;
  onLocate?: (alarm: AlarmRecord) => void;
}

export const AlertRealtimeNotification: React.FC<AlertRealtimeNotificationProps> = ({
  minLevel,
  onProcess,
  onLocate,
}) => {
  const [api, contextHolder] = notification.useNotification();
  const currentTenantId = useTenantStore((s) => s.currentTenantId);
  const openTab = useNavTabsStore((s) => s.openTab);

  // 抽屉处置状态
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedAlarm, setSelectedAlarm] = useState<AlarmRecord | null>(null);

  // 保持最新 tenantId 的 ref，防止闭包失效
  const tenantIdRef = useRef(currentTenantId);
  useEffect(() => {
    tenantIdRef.current = currentTenantId;
  }, [currentTenantId]);

  const handleOpenDrawer = useCallback(
    (alarm: AlarmRecord) => {
      api.destroy(alarm.id);
      setSelectedAlarm(alarm);
      setDrawerOpen(true);
      if (onProcess) {
        onProcess(alarm);
      }
    },
    [api, onProcess]
  );

  const handleLocateVehicle = useCallback(
    (alarm: AlarmRecord) => {
      api.destroy(alarm.id);
      openTab({
        key: RoutePath.TELEMETRY,
        title: '车辆实时监控',
        closable: true,
      });
      if (onLocate) {
        onLocate(alarm);
      }
    },
    [api, openTab, onLocate]
  );

  const handleCloseNotification = useCallback(
    (alarmId: string) => {
      api.destroy(alarmId);
    },
    [api]
  );

  // 格式化简要时间
  const formatTime = (timeInput?: string | Date) => {
    if (!timeInput) return '';
    const d = new Date(timeInput);
    if (isNaN(d.getTime())) return String(timeInput);
    return d.toLocaleTimeString('zh-CN', { hour12: false });
  };

  const triggerModal = useCallback(
    (alarm: AlarmRecord) => {
      const typeMeta = ALARM_TYPE_METADATA[alarm.alarmType] ?? ALARM_TYPE_METADATA.SOS;
      const levelMeta = ALARM_LEVEL_METADATA[alarm.alarmLevel] ?? ALARM_LEVEL_METADATA.CRITICAL;
      const color = getNotificationSeverityColor(alarm.alarmLevel);

      const animClass =
        alarm.alarmLevel === AlarmLevel.CRITICAL
          ? 'alarm-pulse-crit'
          : alarm.alarmLevel === AlarmLevel.WARNING
          ? 'alarm-pulse-warn'
          : 'alarm-pulse-info';

      api.open({
        key: alarm.id,
        placement: 'topRight',
        duration: alarm.alarmLevel === AlarmLevel.CRITICAL ? 0 : 12,
        style: {
          borderRadius: 8,
          borderLeft: `5px solid ${color}`,
          boxShadow: '0 6px 16px 0 rgba(0, 0, 0, 0.08)',
          padding: '14px 16px',
          width: 400,
        },
        message: (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <Space align="center" size="small">
              <span className={`alarm-pulse-dot ${animClass}`} style={{ backgroundColor: color }} />
              <span style={{ fontSize: 16, color }}>
                {renderAlarmTypeIcon(alarm.alarmType)}
              </span>
              <Text strong style={{ fontSize: 14 }}>
                {typeMeta.label}
              </Text>
            </Space>
            <Tag color={levelMeta.tagColor} style={{ marginRight: 0, fontWeight: 600 }}>
              {levelMeta.label}
            </Tag>
          </div>
        ),
        description: (
          <div style={{ marginTop: 8 }}>
            {/* 车辆与设备信息 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              {alarm.plateNumber ? (
                <Tag color="blue" style={{ fontWeight: 600, fontSize: 13, margin: 0 }}>
                  {alarm.plateNumber}
                </Tag>
              ) : (
                <Tag color="default" style={{ margin: 0, fontFamily: 'monospace' }}>
                  {alarm.vin || alarm.deviceNo}
                </Tag>
              )}
              {alarm.vehicleModel && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {alarm.vehicleModel}
                </Text>
              )}
            </div>

            {/* 遥测与告警描述 */}
            <div style={{ fontSize: 12, color: 'rgba(0, 0, 0, 0.75)', lineHeight: 1.6, marginBottom: 8 }}>
              {alarm.message && (
                <div style={{ color: alarm.alarmLevel === AlarmLevel.CRITICAL ? '#cf1322' : 'inherit', fontWeight: 500 }}>
                  {alarm.message}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'rgba(0,0,0,0.45)', marginTop: 4 }}>
                <span>设备: {alarm.deviceNo}</span>
                {alarm.speed !== undefined && <span>车速: {alarm.speed} km/h</span>}
                <span>{formatTime(alarm.triggeredAt)}</span>
              </div>
              {alarm.lat && alarm.lng && (
                <div style={{ color: 'rgba(0,0,0,0.45)', marginTop: 2, fontSize: 11, fontFamily: 'monospace' }}>
                  坐标: {alarm.lat.toFixed(4)}, {alarm.lng.toFixed(4)}
                </div>
              )}
            </div>

            {/* 底部动作按钮栏 */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: 8,
                marginTop: 10,
                borderTop: '1px solid #f0f0f0',
                paddingTop: 8,
              }}
            >
              <Button
                size="small"
                icon={<CloseOutlined />}
                onClick={() => handleCloseNotification(alarm.id)}
              >
                关闭
              </Button>
              <Button
                size="small"
                icon={<CompassOutlined />}
                onClick={() => handleLocateVehicle(alarm)}
              >
                地图定位
              </Button>
              <Button
                size="small"
                type="primary"
                danger={alarm.alarmLevel === AlarmLevel.CRITICAL}
                icon={<CheckCircleOutlined />}
                onClick={() => handleOpenDrawer(alarm)}
              >
                立即处置
              </Button>
            </div>
          </div>
        ),
      });
    },
    [api, handleCloseNotification, handleLocateVehicle, handleOpenDrawer]
  );

  useEffect(() => {
    const unsubscribe = subscribeRealtimeAlarms((alarm) => {
      // 1. 租户隔离与级别阈值安全过滤
      const activeTenant = tenantIdRef.current || '';
      if (!shouldTriggerNotification(alarm, activeTenant, minLevel)) {
        return;
      }

      // 2. 原生纯合成 Web Audio 声效触发 (非静音状态)
      const muted = getAlarmSoundMuted();
      playAlarmSound(alarm.alarmLevel, muted);

      // 3. 弹出多模态气泡卡片
      triggerModal(alarm);
    });

    return () => {
      unsubscribe();
    };
  }, [minLevel, triggerModal]);

  return (
    <>
      {/* 注入呼吸脉冲 CSS 动画 */}
      <style>{`
        .alarm-pulse-dot {
          display: inline-block;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        @keyframes alarmPulseCritAnim {
          0% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(207, 19, 34, 0.7); }
          70% { transform: scale(1.15); box-shadow: 0 0 0 8px rgba(207, 19, 34, 0); }
          100% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(207, 19, 34, 0); }
        }
        @keyframes alarmPulseWarnAnim {
          0% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(250, 140, 22, 0.7); }
          70% { transform: scale(1.15); box-shadow: 0 0 0 8px rgba(250, 140, 22, 0); }
          100% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(250, 140, 22, 0); }
        }
        @keyframes alarmPulseInfoAnim {
          0% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(22, 119, 255, 0.7); }
          70% { transform: scale(1.15); box-shadow: 0 0 0 8px rgba(22, 119, 255, 0); }
          100% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(22, 119, 255, 0); }
        }
        .alarm-pulse-crit {
          animation: alarmPulseCritAnim 1.4s infinite;
        }
        .alarm-pulse-warn {
          animation: alarmPulseWarnAnim 1.6s infinite;
        }
        .alarm-pulse-info {
          animation: alarmPulseInfoAnim 2s infinite;
        }
      `}</style>

      {/* Ant Design 6 顶层通知挂载器 */}
      {contextHolder}

      {/* 嵌入式告警闭环处置抽屉 */}
      <AlertProcessDrawer
        open={drawerOpen}
        alarm={selectedAlarm}
        onClose={() => setDrawerOpen(false)}
        onSuccess={(updated) => {
          setDrawerOpen(false);
        }}
        onLocate={(alarm) => {
          setDrawerOpen(false);
          openTab({
            key: RoutePath.TELEMETRY,
            title: '车辆实时监控',
            closable: true,
          });
        }}
      />
    </>
  );
};

export default AlertRealtimeNotification;
