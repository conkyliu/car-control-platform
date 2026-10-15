import { useState, useEffect } from 'react';
import {
  AlarmLevel,
  AlarmStatus,
  type AlarmRecord,
  isTerminalAlarmStatus,
  ALARM_TYPE_METADATA,
} from './alarm-core.ts';
import { getInMemoryAlarms, subscribeRealtimeAlarms } from '../../api/alarm.ts';
import { useTenantStore } from '../../store/useTenantStore.ts';

const STORAGE_KEY_ALARM_MUTED = 'car_alarm_sound_muted';

type MuteListener = (muted: boolean) => void;
const muteListeners = new Set<MuteListener>();

/**
 * 检查当前环境是否处于静音状态 (默认未静音 false)
 */
export function getAlarmSoundMuted(): boolean {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(STORAGE_KEY_ALARM_MUTED) === 'true';
    }
    if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
      return (globalThis as any).localStorage.getItem(STORAGE_KEY_ALARM_MUTED) === 'true';
    }
  } catch {
    // 静默降级
  }
  return false;
}

/**
 * 设置全局告警声效静音状态并通知订阅者
 */
export function setAlarmSoundMuted(muted: boolean): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY_ALARM_MUTED, String(muted));
    } else if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
      (globalThis as any).localStorage.setItem(STORAGE_KEY_ALARM_MUTED, String(muted));
    }
  } catch {
    // 静默降级
  }

  for (const listener of muteListeners) {
    try {
      listener(muted);
    } catch {
      // 容错隔离
    }
  }
}

/**
 * 订阅静音状态变更
 * @param listener 回调函数
 * @returns 清理注销句柄
 */
export function subscribeAlarmMute(listener: MuteListener): () => void {
  muteListeners.add(listener);
  return () => {
    muteListeners.delete(listener);
  };
}

/**
 * React Hook: 响应式响应静音状态
 */
export function useAlarmMuteState(): {
  muted: boolean;
  toggleMute: () => void;
  setMuted: (val: boolean) => void;
} {
  const [muted, setMutedState] = useState<boolean>(getAlarmSoundMuted);

  useEffect(() => {
    return subscribeAlarmMute(setMutedState);
  }, []);

  const toggleMute = () => {
    setAlarmSoundMuted(!muted);
  };

  return {
    muted,
    toggleMute,
    setMuted: setAlarmSoundMuted,
  };
}

/**
 * 纯算法：统计待处置告警数量 (支持租户隔离)
 */
export function computePendingAlarmCount(
  alarms: AlarmRecord[],
  tenantId?: string | null
): number {
  if (!alarms || alarms.length === 0) return 0;
  return alarms.filter((a) => {
    if (a.status !== AlarmStatus.PENDING) return false;
    if (tenantId && a.tenantId !== tenantId) return false;
    return true;
  }).length;
}

/**
 * React Hook: 响应式监听当前租户待处置告警数量
 */
export function usePendingAlarmCount(): number {
  const currentTenantId = useTenantStore((s) => s.currentTenantId);
  const [count, setCount] = useState<number>(() => {
    return computePendingAlarmCount(getInMemoryAlarms(), currentTenantId);
  });

  useEffect(() => {
    // 1. 租户变化时立即重新计算
    setCount(computePendingAlarmCount(getInMemoryAlarms(), currentTenantId));

    // 2. 监听实时推流
    const unsub = subscribeRealtimeAlarms(() => {
      setCount(computePendingAlarmCount(getInMemoryAlarms(), currentTenantId));
    });

    return () => {
      unsub();
    };
  }, [currentTenantId]);

  return count;
}

/**
 * 告警级别优先级权重
 */
const ALARM_LEVEL_WEIGHT: Record<AlarmLevel, number> = {
  [AlarmLevel.INFO]: 1,
  [AlarmLevel.WARNING]: 2,
  [AlarmLevel.CRITICAL]: 3,
};

/**
 * 判定告警记录是否需要触发桌面弹窗及声效通知
 * 1. 严格多租户隔离：仅当前登录租户的数据才能触发
 * 2. 级别阈值过滤：支持指定最小等级 (如仅 P0/P1)
 * 3. 终态保护：已处置/已忽略的历史终态告警不弹窗
 */
export function shouldTriggerNotification(
  alarm: AlarmRecord,
  currentTenantId: string,
  minLevel?: AlarmLevel
): boolean {
  if (!alarm || !currentTenantId) return false;

  // 1. 租户隔离
  if (alarm.tenantId !== currentTenantId) {
    return false;
  }

  // 2. 终态过滤 (已处理或已忽略告警不触发)
  if (alarm.status && isTerminalAlarmStatus(alarm.status)) {
    return false;
  }

  // 3. 级别过滤
  if (minLevel) {
    const alarmWeight = ALARM_LEVEL_WEIGHT[alarm.alarmLevel] ?? 0;
    const minWeight = ALARM_LEVEL_WEIGHT[minLevel] ?? 0;
    if (alarmWeight < minWeight) {
      return false;
    }
  }

  return true;
}

/**
 * 格式化通知标题
 * 格式：`[P0 严重] 粤B·88888 触发 SOS 紧急呼救`
 */
export function formatNotificationTitle(alarm: AlarmRecord): string {
  const levelTag =
    alarm.alarmLevel === AlarmLevel.CRITICAL
      ? 'P0 严重'
      : alarm.alarmLevel === AlarmLevel.WARNING
      ? 'P1 警告'
      : 'P2 提示';

  const target = alarm.plateNumber || alarm.vin || alarm.deviceNo || '未知车辆';
  const typeLabel = ALARM_TYPE_METADATA[alarm.alarmType]?.label || '安全告警';

  return `[${levelTag}] ${target} 触发 ${typeLabel}`;
}

/**
 * 格式化通知紧凑内容详情
 */
export function formatNotificationContent(alarm: AlarmRecord): string {
  const parts: string[] = [];

  if (alarm.vehicleModel) {
    parts.push(`车型: ${alarm.vehicleModel}`);
  }
  parts.push(`设备号: ${alarm.deviceNo}`);

  if (alarm.speed !== undefined) {
    parts.push(`车速: ${alarm.speed} km/h`);
  }

  if (alarm.lat !== undefined && alarm.lng !== undefined) {
    parts.push(`坐标: ${alarm.lat.toFixed(4)}, ${alarm.lng.toFixed(4)}`);
  }

  if (alarm.message) {
    parts.push(`详情: ${alarm.message}`);
  }

  return parts.join(' | ');
}

/**
 * 获取告警级别对应的设计规范视觉主题色
 */
export function getNotificationSeverityColor(level: AlarmLevel): string {
  switch (level) {
    case AlarmLevel.CRITICAL:
      return '#cf1322';
    case AlarmLevel.WARNING:
      return '#fa8c16';
    case AlarmLevel.INFO:
      return '#1677ff';
    default:
      return '#1677ff';
  }
}

/**
 * Web Audio API 原生音效发生器
 * 1. CRITICAL: 高频急促双鸣声 (880Hz -> 1760Hz 脉冲, 增益 0.15, 持续 300ms)
 * 2. WARNING: 中频提示音 (660Hz 双短音, 增益 0.12, 持续 200ms)
 * 3. INFO: 低频柔和水滴音 (440Hz 单音, 增益 0.10, 持续 120ms)
 *
 * @param level 告警等级
 * @param muted 是否静音
 * @param mockAudioCtx 测试或受控音频上下文注入
 * @returns 是否成功触发音频调度
 */
export function playAlarmSound(
  level: AlarmLevel,
  muted?: boolean,
  mockAudioCtx?: any
): boolean {
  if (muted) return false;

  try {
    let ctx = mockAudioCtx;
    if (!ctx) {
      const AudioContextClass =
        typeof window !== 'undefined'
          ? (window as any).AudioContext || (window as any).webkitAudioContext
          : undefined;

      if (!AudioContextClass) {
        return false;
      }
      ctx = new AudioContextClass();
    }

    const now = ctx.currentTime || 0;
    const dest = ctx.destination;

    if (level === AlarmLevel.CRITICAL) {
      // 880Hz -> 1760Hz 急促双鸣 (300ms)
      // Pulse 1: 880Hz (0.0 ~ 0.12s)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      gain1.gain.setValueAtTime(0.15, now);
      if (gain1.gain.exponentialRampToValueAtTime) {
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      }
      osc1.connect(gain1);
      gain1.connect(dest);
      osc1.start(now);
      osc1.stop(now + 0.12);

      // Pulse 2: 1760Hz (0.15 ~ 0.30s)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1760, now + 0.15);
      gain2.gain.setValueAtTime(0.15, now + 0.15);
      if (gain2.gain.exponentialRampToValueAtTime) {
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      }
      osc2.connect(gain2);
      gain2.connect(dest);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.3);

      return true;
    }

    if (level === AlarmLevel.WARNING) {
      // 660Hz 双短音 (200ms)
      // Beep 1: 660Hz (0.0 ~ 0.08s)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(660, now);
      gain1.gain.setValueAtTime(0.12, now);
      if (gain1.gain.exponentialRampToValueAtTime) {
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      }
      osc1.connect(gain1);
      gain1.connect(dest);
      osc1.start(now);
      osc1.stop(now + 0.08);

      // Beep 2: 660Hz (0.10 ~ 0.20s)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(660, now + 0.1);
      gain2.gain.setValueAtTime(0.12, now + 0.1);
      if (gain2.gain.exponentialRampToValueAtTime) {
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      }
      osc2.connect(gain2);
      gain2.connect(dest);
      osc2.start(now + 0.1);
      osc2.stop(now + 0.2);

      return true;
    }

    // INFO 级别: 440Hz 柔和水滴单音 (120ms)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    gain.gain.setValueAtTime(0.1, now);
    if (gain.gain.exponentialRampToValueAtTime) {
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    }
    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.12);

    return true;
  } catch {
    // 捕获受限环境 (如无用户交互被浏览器阻止播放或 node 环境缺少接口)
    return false;
  }
}
