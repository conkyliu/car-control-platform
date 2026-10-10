/**
 * 智能网联汽车远程控制平台 - 阶梯式并发压测与性能基准类型定义
 * 遵循 ADR-016 与 Gate 6 生产就绪度规范
 */

import { CommandCode } from '@car-control/contracts';

export interface BenchmarkResult {
  tierName: string;
  totalRequests: number;
  successRequests: number;
  failedRequests: number;
  successRate: number; // 百分比，例如 100.0 或 99.9
  durationMs: number;
  tps: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  latencies: number[];
}

export interface LoadTestOptions {
  tierName?: string;
  concurrency?: number; // 工作池并发度 (如 20 ~ 50)
  simulatedLatencyMs?: number; // 模拟设备总线时延 (如 20ms ~ 50ms)
  tenantId?: string;
  commandCode?: CommandCode | string;
  timeoutMs?: number;
  requestExecutor?: (index: number) => Promise<boolean | void>;
}

export interface SlaThresholds {
  minSuccessRate: number; // 最低成功率 (默认 99.9%)
  maxP50Ms: number;       // P50 延迟上限 (默认 1000ms / 1.0s)
  maxP95Ms: number;       // P95 延迟上限 (默认 2000ms / 2.0s)
  maxP99Ms: number;       // P99 延迟上限 (默认 5000ms / 5.0s)
}

export interface SlaVerificationResult {
  passed: boolean;
  violations: string[];
}

export const DEFAULT_SLA_THRESHOLDS: SlaThresholds = {
  minSuccessRate: 99.9,
  maxP50Ms: 1000,
  maxP95Ms: 2000,
  maxP99Ms: 5000,
};

export interface LoadTestRunnerInterface {
  runTier(tierCount: number, options?: LoadTestOptions): Promise<BenchmarkResult>;
  generateMarkdownReport(results: Record<string, BenchmarkResult>): string;
  verifySla(result: BenchmarkResult, thresholds?: Partial<SlaThresholds>): SlaVerificationResult;
}
