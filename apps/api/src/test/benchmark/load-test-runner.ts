import { EventEmitter } from 'node:events';
import { CommandCode, CommandStatus, WebSocketEvent } from '@car-control/contracts';
import { DeviceOnlineStatus } from '@car-control/domain-types';
import { InMemoryTransport, DeviceSimulator } from '@car-control/simulator';
import { InMemoryLockAdapter } from '../../common/cache/in-memory-cache.adapter.js';
import { DistributedLockPort } from '../../common/cache/cache.port.js';
import { InMemoryMessagingAdapter } from '../../messaging/in-memory-messaging.adapter.js';
import { DeviceStatusService } from '../../device/device-status.service.js';
import { WebSocketGatewayService } from '../../realtime/websocket.gateway.js';
import { CommandService } from '../../command/command.service.js';
import { MetricsService } from '../../observability/metrics/metrics.service.js';
import { TracerService } from '../../observability/tracing/tracer.service.js';
import {
  BenchmarkResult,
  LoadTestOptions,
  SlaThresholds,
  SlaVerificationResult,
  LoadTestRunnerInterface,
  DEFAULT_SLA_THRESHOLDS,
} from './benchmark.types.js';

export interface LoadTestRunnerDependencies {
  commandService?: CommandService;
  deviceStatusService?: DeviceStatusService;
  wsGateway?: WebSocketGatewayService;
  messagingAdapter?: InMemoryMessagingAdapter;
  simTransport?: InMemoryTransport;
  lockPort?: DistributedLockPort;
  tracerService?: TracerService;
  metricsService?: MetricsService;
}

/**
 * 计算给定分位数数值
 * Pk = sortedLatencies[Math.floor((k / 100) * N)]
 */
export function calculatePercentile(sortedLatencies: number[], percentile: number): number {
  if (sortedLatencies.length === 0) return 0;
  const index = Math.max(
    0,
    Math.min(
      Math.floor((percentile / 100) * sortedLatencies.length),
      sortedLatencies.length - 1
    )
  );
  return sortedLatencies[index];
}

/**
 * 校验压测结果是否满足 ADR-016 生产 SLA 门禁
 * P50 <= 1000ms, P95 <= 2000ms, P99 <= 5000ms, Success Rate >= 99.9%
 */
export function verifySla(
  result: BenchmarkResult,
  thresholds?: Partial<SlaThresholds>
): SlaVerificationResult {
  const merged: SlaThresholds = {
    ...DEFAULT_SLA_THRESHOLDS,
    ...thresholds,
  };

  const violations: string[] = [];

  const minSuccessRate =
    merged.minSuccessRate <= 1.0 ? merged.minSuccessRate * 100 : merged.minSuccessRate;
  const actualSuccessRate =
    result.successRate <= 1.0 && result.totalRequests > 0 && result.successRequests > 0
      ? result.successRate * 100
      : result.successRate;

  if (actualSuccessRate < minSuccessRate) {
    violations.push(
      `Success rate ${actualSuccessRate.toFixed(2)}% is below SLA threshold ${minSuccessRate.toFixed(2)}%`
    );
  }

  if (result.p50Ms > merged.maxP50Ms) {
    violations.push(
      `P50 latency ${result.p50Ms.toFixed(2)}ms exceeds SLA threshold ${merged.maxP50Ms}ms`
    );
  }

  if (result.p95Ms > merged.maxP95Ms) {
    violations.push(
      `P95 latency ${result.p95Ms.toFixed(2)}ms exceeds SLA threshold ${merged.maxP95Ms}ms`
    );
  }

  if (result.p99Ms > merged.maxP99Ms) {
    violations.push(
      `P99 latency ${result.p99Ms.toFixed(2)}ms exceeds SLA threshold ${merged.maxP99Ms}ms`
    );
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

/**
 * 格式化输出 GitHub Flavored Markdown 压测基准表格
 */
export function generateMarkdownReport(results: Record<string, BenchmarkResult>): string {
  const lines: string[] = [];
  lines.push('# Load Test Benchmark Report');
  lines.push('');
  lines.push(
    '| Scale / Tier | Requests | Success Rate | Duration (s) | TPS | P50 (ms) | P90 (ms) | P95 (ms) | P99 (ms) | SLA Gate |'
  );
  lines.push('|---|---|---|---|---|---|---|---|---|---|');

  for (const [key, res] of Object.entries(results)) {
    const tierName = res.tierName || key;
    const durationSec = (res.durationMs / 1000).toFixed(2);
    const gate = verifySla(res).passed ? 'PASS' : 'FAIL';
    lines.push(
      `| ${tierName} | ${res.totalRequests} | ${res.successRate.toFixed(2)}% | ${durationSec}s | ${res.tps.toFixed(2)} | ${res.p50Ms.toFixed(2)}ms | ${res.p90Ms.toFixed(2)}ms | ${res.p95Ms.toFixed(2)}ms | ${res.p99Ms.toFixed(2)}ms | ${gate} |`
    );
  }

  return lines.join('\n');
}

/**
 * 并发工作池执行器
 */
export async function runConcurrencyPool<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let currentIndex = 0;

  const poolSize = Math.max(1, Math.min(concurrency, tasks.length));
  const workers = Array.from({ length: poolSize }, async () => {
    while (true) {
      const idx = currentIndex++;
      if (idx >= tasks.length) break;
      results[idx] = await tasks[idx]();
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * 阶梯式并发压测执行器
 */
export class LoadTestRunner implements LoadTestRunnerInterface {
  constructor(private readonly deps?: LoadTestRunnerDependencies) {}

  async runTier(tierCount: number, options?: LoadTestOptions): Promise<BenchmarkResult> {
    const tierName = options?.tierName ?? `Tier (${tierCount})`;
    const concurrency =
      options?.concurrency ?? (tierCount >= 1000 ? 50 : tierCount >= 500 ? 35 : 20);
    const simulatedLatencyMs = options?.simulatedLatencyMs ?? 20;
    const tenantId = options?.tenantId ?? 'TENANT_BENCH';
    const commandCode =
      (options?.commandCode as CommandCode) ?? CommandCode.CMD_LOCK;
    const timeoutMs = options?.timeoutMs ?? 10000;

    let tierStart = 0;
    let tierEnd = 0;
    let taskResults: { ok: boolean; latency: number }[] = [];

    if (options?.requestExecutor) {
      // 模式 A: 自定义请求执行器
      const executor = options.requestExecutor;
      const tasks = Array.from({ length: tierCount }, (_, i) => async () => {
        const start = performance.now();
        let ok = false;
        try {
          const res = await executor(i);
          ok = res !== false;
        } catch {
          ok = false;
        }
        const latency = performance.now() - start;
        return { ok, latency };
      });

      tierStart = performance.now();
      taskResults = await runConcurrencyPool(tasks, concurrency);
      tierEnd = performance.now();
    } else {
      // 模式 B: 全真端到端闭环 CommandService + DeviceSimulator 执行器
      const bus = new EventEmitter();
      bus.setMaxListeners(10000);

      const isInternalTransport = !this.deps?.simTransport;
      const simTransport = this.deps?.simTransport ?? new InMemoryTransport(bus);
      const messagingAdapter = this.deps?.messagingAdapter ?? new InMemoryMessagingAdapter(bus);
      const deviceStatusService = this.deps?.deviceStatusService ?? new DeviceStatusService();
      const wsGateway = this.deps?.wsGateway ?? new WebSocketGatewayService();
      const lockPort = this.deps?.lockPort ?? new InMemoryLockAdapter();
      const tracerService = this.deps?.tracerService ?? new TracerService();
      const metricsService = this.deps?.metricsService ?? new MetricsService();

      const commandService =
        this.deps?.commandService ??
        new CommandService(
          messagingAdapter,
          deviceStatusService,
          wsGateway,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          lockPort,
          tracerService,
          metricsService
        );

      const productKey = 'PK_BENCH';
      const runId = Math.random().toString(36).substring(2, 8);
      const simulators: DeviceSimulator[] = [];

      for (let i = 0; i < tierCount; i++) {
        const deviceNo = `DEV_${runId}_${i}`;
        const vehicleId = `VEH_${runId}_${i}`;
        deviceStatusService.registerDevice({
          deviceNo,
          productKey,
          vehicleId,
          onlineStatus: DeviceOnlineStatus.ONLINE,
        });
        messagingAdapter.subscribeDevice(productKey, deviceNo);
        const sim = new DeviceSimulator(
          {
            productKey,
            deviceNo,
            defaultLatencyMs: simulatedLatencyMs,
          },
          simTransport
        );
        simulators.push(sim);
      }

      await Promise.all(simulators.map((s) => s.start()));

      try {
        const tasks = Array.from({ length: tierCount }, (_, i) => async () => {
          const deviceNo = `DEV_${runId}_${i}`;
          const vehicleId = `VEH_${runId}_${i}`;
          const idempotencyKey = `idemp_${runId}_${i}_${Math.random()}`;

          let cmdId: string | undefined;
          const start = performance.now();
          let ok = false;

          try {
            const completionPromise = new Promise<void>((resolve, reject) => {
              let resolved = false;
              let timer: NodeJS.Timeout | undefined;

              const cleanup = () => {
                if (timer) {
                  clearTimeout(timer);
                  timer = undefined;
                }
                unsubscribe();
              };

              const unsubscribe = wsGateway.joinVehicleRoom(vehicleId, (event, payload: any) => {
                if (resolved) return;
                if (!cmdId || (payload && payload.id === cmdId)) {
                  if (event === WebSocketEvent.COMMAND_SUCCESS) {
                    resolved = true;
                    cleanup();
                    resolve();
                  } else if (
                    event === WebSocketEvent.COMMAND_FAILED ||
                    event === WebSocketEvent.COMMAND_REJECTED
                  ) {
                    resolved = true;
                    cleanup();
                    reject(new Error(`Command ended with ${event}`));
                  }
                }
              });

              timer = setTimeout(() => {
                if (!resolved) {
                  resolved = true;
                  cleanup();
                  if (cmdId) {
                    const rec = commandService.getCommand(cmdId);
                    if (rec?.status === CommandStatus.SUCCESS) {
                      resolve();
                      return;
                    }
                  }
                  reject(new Error(`Timeout waiting for command ${cmdId || 'unknown'}`));
                }
              }, timeoutMs);
            });

            const cmd = await commandService.executeCommand({
              tenantId,
              vehicleId,
              deviceNo,
              productKey,
              commandCode,
              idempotencyKey,
              operatorId: 'BENCH_OPERATOR',
              customTimeoutMs: timeoutMs,
            });
            cmdId = cmd.id;

            if (cmd.status === CommandStatus.SUCCESS) {
              ok = true;
            } else {
              await completionPromise;
              ok = true;
            }
          } catch {
            ok = false;
          }

          const latency = performance.now() - start;
          return { ok, latency };
        });

        tierStart = performance.now();
        taskResults = await runConcurrencyPool(tasks, concurrency);
        tierEnd = performance.now();
      } finally {
        await Promise.all(simulators.map((s) => s.stop()));
        if (isInternalTransport) {
          await simTransport.disconnect();
        }
      }
    }

    let successRequests = 0;
    let failedRequests = 0;
    const latencies: number[] = [];

    for (const r of taskResults) {
      latencies.push(r.latency);
      if (r.ok) {
        successRequests++;
      } else {
        failedRequests++;
      }
    }

    const durationMs = Math.max(1, tierEnd - tierStart);
    const tps = durationMs > 0 ? (tierCount / (durationMs / 1000)) : 0;
    const successRate = tierCount > 0 ? (successRequests / tierCount) * 100 : 0;

    const sorted = [...latencies].sort((a, b) => a - b);
    const p50Ms = calculatePercentile(sorted, 50);
    const p90Ms = calculatePercentile(sorted, 90);
    const p95Ms = calculatePercentile(sorted, 95);
    const p99Ms = calculatePercentile(sorted, 99);

    return {
      tierName,
      totalRequests: tierCount,
      successRequests,
      failedRequests,
      successRate,
      durationMs,
      tps,
      p50Ms,
      p90Ms,
      p95Ms,
      p99Ms,
      latencies,
    };
  }

  generateMarkdownReport(results: Record<string, BenchmarkResult>): string {
    return generateMarkdownReport(results);
  }

  verifySla(
    result: BenchmarkResult,
    thresholds?: Partial<SlaThresholds>
  ): SlaVerificationResult {
    return verifySla(result, thresholds);
  }
}
