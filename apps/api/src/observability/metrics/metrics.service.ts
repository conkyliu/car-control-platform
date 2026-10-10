import { Injectable } from '@nestjs/common';
import {
  DEFAULT_HISTOGRAM_BUCKETS,
  IMetricsService,
} from './metrics.types.js';

interface CommandCounterItem {
  tenantId: string;
  commandCode: string;
  status: string;
  count: number;
}

interface HistogramItem {
  tenantId: string;
  commandCode: string;
  bucketCounts: Map<number, number>;
  sum: number;
  count: number;
}

interface TelemetryCounterItem {
  tenantId: string;
  productKey: string;
  count: number;
}

interface AlarmCounterItem {
  tenantId: string;
  alarmType: string;
  level: string;
  count: number;
}

interface LockContentionItem {
  tenantId: string;
  count: number;
}

function escapeLabel(val: string): string {
  return String(val)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

function formatNumber(num: number): string {
  if (Number.isInteger(num)) {
    return num.toString();
  }
  return parseFloat(num.toFixed(6)).toString();
}

@Injectable()
export class MetricsService implements IMetricsService {
  private readonly buckets: readonly number[] = DEFAULT_HISTOGRAM_BUCKETS;

  private readonly commandCounters = new Map<string, CommandCounterItem>();
  private readonly commandHistograms = new Map<string, HistogramItem>();
  private readonly telemetryCounters = new Map<string, TelemetryCounterItem>();
  private readonly alarmCounters = new Map<string, AlarmCounterItem>();
  private readonly activeSimulators = new Map<string, number>();
  private readonly websocketConnections = new Map<string, number>();
  private readonly lockContentions = new Map<string, LockContentionItem>();

  incrementCommands(tenantId: string, commandCode: string, status: string, amount = 1): void {
    const key = `${tenantId}\x00${commandCode}\x00${status}`;
    const existing = this.commandCounters.get(key);
    if (existing) {
      existing.count += amount;
    } else {
      this.commandCounters.set(key, {
        tenantId,
        commandCode,
        status,
        count: amount,
      });
    }
  }

  observeCommandDuration(tenantId: string, commandCode: string, durationSeconds: number): void {
    const key = `${tenantId}\x00${commandCode}`;
    let item = this.commandHistograms.get(key);
    if (!item) {
      const bucketCounts = new Map<number, number>();
      for (const b of this.buckets) {
        bucketCounts.set(b, 0);
      }
      item = {
        tenantId,
        commandCode,
        bucketCounts,
        sum: 0,
        count: 0,
      };
      this.commandHistograms.set(key, item);
    }

    item.sum += durationSeconds;
    item.count += 1;

    for (const b of this.buckets) {
      if (durationSeconds <= b) {
        item.bucketCounts.set(b, (item.bucketCounts.get(b) ?? 0) + 1);
      }
    }
  }

  incrementTelemetryUplinks(tenantId: string, productKey: string, amount = 1): void {
    const key = `${tenantId}\x00${productKey}`;
    const existing = this.telemetryCounters.get(key);
    if (existing) {
      existing.count += amount;
    } else {
      this.telemetryCounters.set(key, {
        tenantId,
        productKey,
        count: amount,
      });
    }
  }

  incrementAlarms(tenantId: string, alarmType: string, level: string, amount = 1): void {
    const key = `${tenantId}\x00${alarmType}\x00${level}`;
    const existing = this.alarmCounters.get(key);
    if (existing) {
      existing.count += amount;
    } else {
      this.alarmCounters.set(key, {
        tenantId,
        alarmType,
        level,
        count: amount,
      });
    }
  }

  setActiveSimulators(count: number, onlineStatus: string): void {
    this.activeSimulators.set(onlineStatus, count);
  }

  setWebsocketConnections(tenantId: string, count: number): void {
    this.websocketConnections.set(tenantId, count);
  }

  incrementLockContention(tenantId: string, amount = 1): void {
    const existing = this.lockContentions.get(tenantId);
    if (existing) {
      existing.count += amount;
    } else {
      this.lockContentions.set(tenantId, {
        tenantId,
        count: amount,
      });
    }
  }

  reset(): void {
    this.commandCounters.clear();
    this.commandHistograms.clear();
    this.telemetryCounters.clear();
    this.alarmCounters.clear();
    this.activeSimulators.clear();
    this.websocketConnections.clear();
    this.lockContentions.clear();
  }

  exportPrometheusMetrics(): string {
    const sections: string[] = [];

    // 1. car_commands_total
    {
      const lines: string[] = [
        '# HELP car_commands_total Total number of car control commands processed',
        '# TYPE car_commands_total counter',
      ];
      for (const item of this.commandCounters.values()) {
        lines.push(
          `car_commands_total{tenant_id="${escapeLabel(item.tenantId)}",command_code="${escapeLabel(item.commandCode)}",status="${escapeLabel(item.status)}"} ${item.count}`,
        );
      }
      sections.push(lines.join('\n'));
    }

    // 2. car_command_duration_seconds
    {
      const lines: string[] = [
        '# HELP car_command_duration_seconds End-to-end command execution latency in seconds',
        '# TYPE car_command_duration_seconds histogram',
      ];
      for (const item of this.commandHistograms.values()) {
        const tenantEscaped = escapeLabel(item.tenantId);
        const codeEscaped = escapeLabel(item.commandCode);

        for (const b of this.buckets) {
          const bucketCount = item.bucketCounts.get(b) ?? 0;
          lines.push(
            `car_command_duration_seconds_bucket{tenant_id="${tenantEscaped}",command_code="${codeEscaped}",le="${String(b)}"} ${bucketCount}`,
          );
        }
        lines.push(
          `car_command_duration_seconds_bucket{tenant_id="${tenantEscaped}",command_code="${codeEscaped}",le="+Inf"} ${item.count}`,
        );
        lines.push(
          `car_command_duration_seconds_sum{tenant_id="${tenantEscaped}",command_code="${codeEscaped}"} ${formatNumber(item.sum)}`,
        );
        lines.push(
          `car_command_duration_seconds_count{tenant_id="${tenantEscaped}",command_code="${codeEscaped}"} ${item.count}`,
        );
      }
      sections.push(lines.join('\n'));
    }

    // 3. car_telemetry_uplinks_total
    {
      const lines: string[] = [
        '# HELP car_telemetry_uplinks_total Total count of GPS and telemetry packets ingested',
        '# TYPE car_telemetry_uplinks_total counter',
      ];
      for (const item of this.telemetryCounters.values()) {
        lines.push(
          `car_telemetry_uplinks_total{tenant_id="${escapeLabel(item.tenantId)}",product_key="${escapeLabel(item.productKey)}"} ${item.count}`,
        );
      }
      sections.push(lines.join('\n'));
    }

    // 4. car_alarms_total
    {
      const lines: string[] = [
        '# HELP car_alarms_total Total count of trigger alarms',
        '# TYPE car_alarms_total counter',
      ];
      for (const item of this.alarmCounters.values()) {
        lines.push(
          `car_alarms_total{tenant_id="${escapeLabel(item.tenantId)}",alarm_type="${escapeLabel(item.alarmType)}",level="${escapeLabel(item.level)}"} ${item.count}`,
        );
      }
      sections.push(lines.join('\n'));
    }

    // 5. car_active_simulators
    {
      const lines: string[] = [
        '# HELP car_active_simulators Number of currently active simulators',
        '# TYPE car_active_simulators gauge',
      ];
      for (const [onlineStatus, count] of this.activeSimulators.entries()) {
        lines.push(
          `car_active_simulators{online_status="${escapeLabel(onlineStatus)}"} ${count}`,
        );
      }
      sections.push(lines.join('\n'));
    }

    // 6. car_websocket_connections
    {
      const lines: string[] = [
        '# HELP car_websocket_connections Number of active WebSocket connections',
        '# TYPE car_websocket_connections gauge',
      ];
      for (const [tenantId, count] of this.websocketConnections.entries()) {
        lines.push(
          `car_websocket_connections{tenant_id="${escapeLabel(tenantId)}"} ${count}`,
        );
      }
      sections.push(lines.join('\n'));
    }

    // 7. car_lock_contention_total
    {
      const lines: string[] = [
        '# HELP car_lock_contention_total Total count of distributed command lock contentions',
        '# TYPE car_lock_contention_total counter',
      ];
      for (const item of this.lockContentions.values()) {
        lines.push(
          `car_lock_contention_total{tenant_id="${escapeLabel(item.tenantId)}"} ${item.count}`,
        );
      }
      sections.push(lines.join('\n'));
    }

    return sections.join('\n\n') + '\n';
  }
}
