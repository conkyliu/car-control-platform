import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Setup mock localStorage before importing stores & helpers
const mockStorage = new Map<string, string>();
const storageMock = {
  getItem: (key: string) => mockStorage.get(key) ?? null,
  setItem: (key: string, val: string) => { mockStorage.set(key, String(val)); },
  removeItem: (key: string) => { mockStorage.delete(key); },
  clear: () => { mockStorage.clear(); },
  key: (i: number) => Array.from(mockStorage.keys())[i] ?? null,
  get length() { return mockStorage.size; },
};

(globalThis as any).localStorage = storageMock;
if (typeof window === 'undefined') {
  (globalThis as any).window = globalThis;
}

import {
  AlarmLevel,
  AlarmType,
  AlarmStatus,
  type AlarmRecord,
} from '../views/alarm/alarm-core.ts';
import {
  playAlarmSound,
  shouldTriggerNotification,
  formatNotificationTitle,
  formatNotificationContent,
  getAlarmSoundMuted,
  setAlarmSoundMuted,
  subscribeAlarmMute,
  getNotificationSeverityColor,
  computePendingAlarmCount,
} from '../views/alarm/alert-notification-core.ts';
import {
  subscribeRealtimeAlarms,
  broadcastRealtimeAlarm,
  getRealtimeAlarmSubscribersCount,
  resetRealtimeAlarmSubscribers,
} from '../api/alarm.ts';

const SAMPLE_CRITICAL_ALARM: AlarmRecord = {
  id: 'alm-test-crit-001',
  tenantId: 'tenant-alpha',
  projectId: 'proj-01',
  vehicleId: 'veh-001',
  plateNumber: '粤B·88888',
  vin: 'LSVAA2180E2034912',
  vehicleModel: '仰望 U8 越野豪华版',
  deviceNo: 'DEV-SZ-001',
  alarmType: AlarmType.SOS,
  alarmLevel: AlarmLevel.CRITICAL,
  lat: 22.5428,
  lng: 113.9389,
  speed: 65,
  voltage: 12.6,
  status: AlarmStatus.PENDING,
  message: '车机物理 SOS 按键被车主紧急触发',
  triggeredAt: '2026-10-15T09:00:00Z',
  createdAt: '2026-10-15T09:00:00Z',
  updatedAt: '2026-10-15T09:00:00Z',
};

const SAMPLE_WARNING_ALARM: AlarmRecord = {
  id: 'alm-test-warn-002',
  tenantId: 'tenant-alpha',
  projectId: 'proj-01',
  vehicleId: 'veh-002',
  plateNumber: '粤B·66666',
  vin: 'LSVBA2180K2098231',
  vehicleModel: '比亚迪 汉 EV',
  deviceNo: 'DEV-SZ-002',
  alarmType: AlarmType.LOW_BATTERY,
  alarmLevel: AlarmLevel.WARNING,
  lat: 22.5312,
  lng: 113.9451,
  speed: 0,
  voltage: 10.8,
  status: AlarmStatus.PENDING,
  message: '12V 蓄电池电压严重偏低 (10.8V)',
  triggeredAt: '2026-10-15T09:05:00Z',
  createdAt: '2026-10-15T09:05:00Z',
  updatedAt: '2026-10-15T09:05:00Z',
};

const SAMPLE_INFO_ALARM: AlarmRecord = {
  id: 'alm-test-info-003',
  tenantId: 'tenant-beta',
  projectId: 'proj-02',
  vehicleId: 'veh-003',
  vin: 'LSVCA3180F3012984',
  deviceNo: 'DEV-SH-001',
  alarmType: AlarmType.OVERSPEED,
  alarmLevel: AlarmLevel.INFO,
  lat: 31.2382,
  lng: 121.5015,
  speed: 125,
  status: AlarmStatus.PENDING,
  message: '高速路段轻度超速 125km/h',
  triggeredAt: '2026-10-15T09:10:00Z',
  createdAt: '2026-10-15T09:10:00Z',
  updatedAt: '2026-10-15T09:10:00Z',
};

describe('Realtime Alarm Audio-Visual Notification & Core Pipeline (TDD)', () => {
  beforeEach(() => {
    mockStorage.clear();
    resetRealtimeAlarmSubscribers();
  });

  describe('1. Web Audio API Tone Generation Engine (playAlarmSound)', () => {
    it('returns false immediately when muted is true without invoking AudioContext', () => {
      let createdOscillator = false;
      const mockCtx = {
        currentTime: 0,
        destination: {},
        createOscillator: () => {
          createdOscillator = true;
          return {
            type: 'sine',
            frequency: { setValueAtTime: () => {} },
            connect: () => {},
            start: () => {},
            stop: () => {},
          };
        },
        createGain: () => ({
          gain: { setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
          connect: () => {},
        }),
      };

      const result = playAlarmSound(AlarmLevel.CRITICAL, true, mockCtx);
      assert.equal(result, false);
      assert.equal(createdOscillator, false);
    });

    it('synthesizes CRITICAL high-frequency double beep (880Hz -> 1760Hz pulse, 300ms total)', () => {
      const frequencies: number[] = [];
      const times: number[] = [];
      let gainConnected = false;

      const mockCtx = {
        currentTime: 10,
        destination: {},
        createOscillator: () => ({
          type: 'sine',
          frequency: {
            setValueAtTime: (freq: number, time: number) => {
              frequencies.push(freq);
              times.push(time);
            },
          },
          connect: () => {},
          start: () => {},
          stop: () => {},
        }),
        createGain: () => ({
          gain: {
            setValueAtTime: () => {},
            linearRampToValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {},
          },
          connect: (dest: any) => {
            if (dest === mockCtx.destination) gainConnected = true;
          },
        }),
      };

      const played = playAlarmSound(AlarmLevel.CRITICAL, false, mockCtx);
      assert.equal(played, true);
      assert.equal(gainConnected, true);
      // Double beep contains 880Hz and 1760Hz
      assert.ok(frequencies.includes(880), 'Should contain 880Hz base pulse');
      assert.ok(frequencies.includes(1760), 'Should contain 1760Hz high pulse');
    });

    it('synthesizes WARNING mid-frequency double short tone (660Hz)', () => {
      const frequencies: number[] = [];
      const mockCtx = {
        currentTime: 0,
        destination: {},
        createOscillator: () => ({
          type: 'sine',
          frequency: {
            setValueAtTime: (freq: number) => {
              frequencies.push(freq);
            },
          },
          connect: () => {},
          start: () => {},
          stop: () => {},
        }),
        createGain: () => ({
          gain: {
            setValueAtTime: () => {},
            linearRampToValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {},
          },
          connect: () => {},
        }),
      };

      const played = playAlarmSound(AlarmLevel.WARNING, false, mockCtx);
      assert.equal(played, true);
      assert.ok(frequencies.includes(660), 'Should contain 660Hz tone');
    });

    it('synthesizes INFO low-frequency water drop tone (440Hz)', () => {
      const frequencies: number[] = [];
      const mockCtx = {
        currentTime: 0,
        destination: {},
        createOscillator: () => ({
          type: 'sine',
          frequency: {
            setValueAtTime: (freq: number) => {
              frequencies.push(freq);
            },
          },
          connect: () => {},
          start: () => {},
          stop: () => {},
        }),
        createGain: () => ({
          gain: {
            setValueAtTime: () => {},
            linearRampToValueAtTime: () => {},
            exponentialRampToValueAtTime: () => {},
          },
          connect: () => {},
        }),
      };

      const played = playAlarmSound(AlarmLevel.INFO, false, mockCtx);
      assert.equal(played, true);
      assert.ok(frequencies.includes(440), 'Should contain 440Hz tone');
    });

    it('catches audio context errors gracefully and returns false without throwing', () => {
      const brokenCtx = {
        get currentTime(): number {
          throw new Error('Autoplay restriction: AudioContext not allowed to start');
        },
      };

      assert.doesNotThrow(() => {
        const result = playAlarmSound(AlarmLevel.CRITICAL, false, brokenCtx as any);
        assert.equal(result, false);
      });
    });

    it('returns false safely in Node.js when window.AudioContext is absent', () => {
      const result = playAlarmSound(AlarmLevel.CRITICAL, false, undefined);
      assert.equal(result, false);
    });
  });

  describe('2. Multi-Tenant Isolation & Level Filter (shouldTriggerNotification)', () => {
    it('allows alarm triggering only when tenantId matches currentTenantId', () => {
      assert.equal(
        shouldTriggerNotification(SAMPLE_CRITICAL_ALARM, 'tenant-alpha'),
        true,
        'Should trigger for matching tenant'
      );
      assert.equal(
        shouldTriggerNotification(SAMPLE_CRITICAL_ALARM, 'tenant-beta'),
        false,
        'Should block alarm from another tenant'
      );
      assert.equal(
        shouldTriggerNotification(SAMPLE_CRITICAL_ALARM, ''),
        false,
        'Should block when current tenant is empty'
      );
    });

    it('respects minLevel threshold filtering (CRITICAL > WARNING > INFO)', () => {
      // Threshold: WARNING
      assert.equal(
        shouldTriggerNotification(SAMPLE_CRITICAL_ALARM, 'tenant-alpha', AlarmLevel.WARNING),
        true,
        'CRITICAL passes WARNING threshold'
      );
      assert.equal(
        shouldTriggerNotification(SAMPLE_WARNING_ALARM, 'tenant-alpha', AlarmLevel.WARNING),
        true,
        'WARNING meets WARNING threshold'
      );
      // For INFO alarm with tenant-beta
      assert.equal(
        shouldTriggerNotification(SAMPLE_INFO_ALARM, 'tenant-beta', AlarmLevel.WARNING),
        false,
        'INFO is filtered out by WARNING threshold'
      );

      // Threshold: CRITICAL
      assert.equal(
        shouldTriggerNotification(SAMPLE_WARNING_ALARM, 'tenant-alpha', AlarmLevel.CRITICAL),
        false,
        'WARNING is filtered out by CRITICAL threshold'
      );
      assert.equal(
        shouldTriggerNotification(SAMPLE_CRITICAL_ALARM, 'tenant-alpha', AlarmLevel.CRITICAL),
        true,
        'CRITICAL passes CRITICAL threshold'
      );
    });

    it('blocks already processed or ignored terminal alarms from triggering notifications', () => {
      const processedAlarm: AlarmRecord = {
        ...SAMPLE_CRITICAL_ALARM,
        status: AlarmStatus.PROCESSED,
      };
      assert.equal(
        shouldTriggerNotification(processedAlarm, 'tenant-alpha'),
        false,
        'Terminal processed alarm should not trigger notification'
      );

      const ignoredAlarm: AlarmRecord = {
        ...SAMPLE_WARNING_ALARM,
        status: AlarmStatus.IGNORED,
      };
      assert.equal(
        shouldTriggerNotification(ignoredAlarm, 'tenant-alpha'),
        false,
        'Terminal ignored alarm should not trigger notification'
      );
    });
  });

  describe('3. Semantic Formatting Helpers (Title & Content)', () => {
    it('formats notification title with level prefix, vehicle identifier, and alarm type label', () => {
      const title = formatNotificationTitle(SAMPLE_CRITICAL_ALARM);
      assert.ok(title.includes('[P0 严重]'), 'Title should include [P0 严重]');
      assert.ok(title.includes('粤B·88888'), 'Title should include plate number');
      assert.ok(title.includes('车主紧急呼救 (SOS)'), 'Title should include alarm type label');
    });

    it('falls back to VIN or deviceNo when plateNumber is missing', () => {
      const title = formatNotificationTitle(SAMPLE_INFO_ALARM);
      assert.ok(title.includes('[P2 提示]'), 'Title should include [P2 提示]');
      assert.ok(title.includes('LSVCA3180F3012984'), 'Title should fallback to VIN');
      assert.ok(title.includes('超速预警'), 'Title should include alarm type label');
    });

    it('formats notification content with deviceNo, telemetry coords, speed, and remark message', () => {
      const content = formatNotificationContent(SAMPLE_CRITICAL_ALARM);
      assert.ok(content.includes('DEV-SZ-001'), 'Content should include deviceNo');
      assert.ok(content.includes('22.5428, 113.9389'), 'Content should include formatted coordinates');
      assert.ok(content.includes('65 km/h'), 'Content should include speed');
      assert.ok(content.includes('车机物理 SOS 按键被车主紧急触发'), 'Content should include message');
    });

    it('maps severity colors accurately to design tokens', () => {
      assert.equal(getNotificationSeverityColor(AlarmLevel.CRITICAL), '#cf1322');
      assert.equal(getNotificationSeverityColor(AlarmLevel.WARNING), '#fa8c16');
      assert.equal(getNotificationSeverityColor(AlarmLevel.INFO), '#1677ff');
    });
  });

  describe('4. Alarm Sound Mute Storage & Subscription (localStorage)', () => {
    it('defaults to muted = false when no key is present in localStorage', () => {
      assert.equal(getAlarmSoundMuted(), false);
    });

    it('updates localStorage and returns updated muted state', () => {
      setAlarmSoundMuted(true);
      assert.equal(getAlarmSoundMuted(), true);
      assert.equal(mockStorage.get('car_alarm_sound_muted'), 'true');

      setAlarmSoundMuted(false);
      assert.equal(getAlarmSoundMuted(), false);
      assert.equal(mockStorage.get('car_alarm_sound_muted'), 'false');
    });

    it('notifies registered listeners upon mute state changes and allows unsubscription', () => {
      const events: boolean[] = [];
      const unsub = subscribeAlarmMute((muted) => {
        events.push(muted);
      });

      setAlarmSoundMuted(true);
      setAlarmSoundMuted(false);
      unsub();
      setAlarmSoundMuted(true);

      assert.deepEqual(events, [true, false], 'Listener should only receive events before unsubscription');
    });
  });

  describe('5. Realtime Alarm Subscription Stream Lifecycle (subscribeRealtimeAlarms)', () => {
    it('registers subscriber, dispatches broadcasted alarm, and cleans up on unsubscribe', () => {
      assert.equal(getRealtimeAlarmSubscribersCount(), 0);

      const received: AlarmRecord[] = [];
      const unsub = subscribeRealtimeAlarms((alarm) => {
        received.push(alarm);
      });

      assert.equal(getRealtimeAlarmSubscribersCount(), 1);

      broadcastRealtimeAlarm(SAMPLE_CRITICAL_ALARM);
      assert.equal(received.length, 1);
      assert.equal(received[0]?.id, SAMPLE_CRITICAL_ALARM.id);

      // Unsubscribe
      unsub();
      assert.equal(getRealtimeAlarmSubscribersCount(), 0);

      broadcastRealtimeAlarm(SAMPLE_WARNING_ALARM);
      assert.equal(received.length, 1, 'Should not receive alarms after unsubscription');
    });

    it('supports multiple independent subscribers simultaneously', () => {
      const streamA: string[] = [];
      const streamB: string[] = [];

      const unsubA = subscribeRealtimeAlarms((alarm) => streamA.push(alarm.id));
      const unsubB = subscribeRealtimeAlarms((alarm) => streamB.push(alarm.id));

      assert.equal(getRealtimeAlarmSubscribersCount(), 2);

      broadcastRealtimeAlarm(SAMPLE_CRITICAL_ALARM);
      assert.deepEqual(streamA, [SAMPLE_CRITICAL_ALARM.id]);
      assert.deepEqual(streamB, [SAMPLE_CRITICAL_ALARM.id]);

      unsubA();
      assert.equal(getRealtimeAlarmSubscribersCount(), 1);

      broadcastRealtimeAlarm(SAMPLE_WARNING_ALARM);
      assert.deepEqual(streamA, [SAMPLE_CRITICAL_ALARM.id]);
      assert.deepEqual(streamB, [SAMPLE_CRITICAL_ALARM.id, SAMPLE_WARNING_ALARM.id]);

      unsubB();
      assert.equal(getRealtimeAlarmSubscribersCount(), 0);
    });
  });

  describe('6. Pending Alarm Count Calculation & Multi-Tenant Partitioning (computePendingAlarmCount)', () => {
    it('returns 0 for empty alarm array', () => {
      assert.equal(computePendingAlarmCount([]), 0);
    });

    it('filters strictly by PENDING status and partitions by tenantId', () => {
      const mixedAlarms: AlarmRecord[] = [
        SAMPLE_CRITICAL_ALARM, // PENDING, tenant-alpha
        SAMPLE_WARNING_ALARM, // PENDING, tenant-alpha
        { ...SAMPLE_CRITICAL_ALARM, id: 'alm-done-1', status: AlarmStatus.PROCESSED }, // PROCESSED, tenant-alpha
        { ...SAMPLE_WARNING_ALARM, id: 'alm-ignored-1', status: AlarmStatus.IGNORED }, // IGNORED, tenant-alpha
        SAMPLE_INFO_ALARM, // PENDING, tenant-beta
      ];

      // All tenants pending count
      assert.equal(computePendingAlarmCount(mixedAlarms), 3);

      // tenant-alpha pending count
      assert.equal(computePendingAlarmCount(mixedAlarms, 'tenant-alpha'), 2);

      // tenant-beta pending count
      assert.equal(computePendingAlarmCount(mixedAlarms, 'tenant-beta'), 1);

      // Non-existent tenant
      assert.equal(computePendingAlarmCount(mixedAlarms, 'tenant-unknown'), 0);
    });
  });

  describe('7. Module Public Exports Completeness (alarm/index.ts & AlertRealtimeNotification)', () => {
    it('verifies alarm/index.ts exports AlertRealtimeNotification and alert-notification-core', async () => {
      const fs = await import('node:fs');
      const indexPath = new URL('../views/alarm/index.ts', import.meta.url);
      assert.ok(fs.existsSync(indexPath), 'alarm/index.ts must exist');

      const content = fs.readFileSync(indexPath, 'utf-8');
      assert.ok(content.includes("from './AlertRealtimeNotification.tsx'"), 'Must export AlertRealtimeNotification');
      assert.ok(content.includes("from './alert-notification-core.ts'"), 'Must re-export alert-notification-core.ts');

      const componentPath = new URL('../views/alarm/AlertRealtimeNotification.tsx', import.meta.url);
      assert.ok(fs.existsSync(componentPath), 'AlertRealtimeNotification.tsx must exist');

      const compContent = fs.readFileSync(componentPath, 'utf-8');
      assert.ok(compContent.includes('export const AlertRealtimeNotification: React.FC<AlertRealtimeNotificationProps>'), 'Must export AlertRealtimeNotification component');
      assert.ok(compContent.includes('export interface AlertRealtimeNotificationProps'), 'Must export AlertRealtimeNotificationProps');
    });
  });
});
