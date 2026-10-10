import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LoadTestRunner,
  calculatePercentile,
  verifySla,
  generateMarkdownReport,
} from './load-test-runner.js';
import { BenchmarkResult, DEFAULT_SLA_THRESHOLDS } from './benchmark.types.js';

test('Gate 6 Task 5: Tiered Load Test Benchmark Runner Suite', async (t) => {
  await t.test('1. calculatePercentile: accurately calculates percentiles across controlled distributions', () => {
    // 1.1 Controlled 100-element distribution: [1, 2, 3, ..., 100]
    const latencies100 = Array.from({ length: 100 }, (_, i) => i + 1);
    assert.strictEqual(calculatePercentile(latencies100, 50), 51);
    assert.strictEqual(calculatePercentile(latencies100, 90), 91);
    assert.strictEqual(calculatePercentile(latencies100, 95), 96);
    assert.strictEqual(calculatePercentile(latencies100, 99), 100);

    // 1.2 Single element edge case
    const single = [42];
    assert.strictEqual(calculatePercentile(single, 50), 42);
    assert.strictEqual(calculatePercentile(single, 90), 42);
    assert.strictEqual(calculatePercentile(single, 95), 42);
    assert.strictEqual(calculatePercentile(single, 99), 42);

    // 1.3 Empty array edge case
    assert.strictEqual(calculatePercentile([], 50), 0);
    assert.strictEqual(calculatePercentile([], 99), 0);

    // 1.4 Uniform distribution
    const uniform = [50, 50, 50, 50, 50];
    assert.strictEqual(calculatePercentile(uniform, 50), 50);
    assert.strictEqual(calculatePercentile(uniform, 95), 50);
    assert.strictEqual(calculatePercentile(uniform, 99), 50);
  });

  await t.test('2. verifySla: enforces ADR-016 performance gates (pass & breach)', () => {
    const passingResult: BenchmarkResult = {
      tierName: 'Tier 1 (100)',
      totalRequests: 100,
      successRequests: 100,
      failedRequests: 0,
      successRate: 100.0,
      durationMs: 450,
      tps: 222.2,
      p50Ms: 25.0,
      p90Ms: 32.0,
      p95Ms: 40.0,
      p99Ms: 55.0,
      latencies: [25, 32, 40, 55],
    };

    // 2.1 Default thresholds pass
    const passCheck = verifySla(passingResult);
    assert.strictEqual(passCheck.passed, true);
    assert.strictEqual(passCheck.violations.length, 0);

    // 2.2 Success rate breach (< 99.9%)
    const failedSuccessRate: BenchmarkResult = {
      ...passingResult,
      successRequests: 98,
      failedRequests: 2,
      successRate: 98.0,
    };
    const breachSuccess = verifySla(failedSuccessRate);
    assert.strictEqual(breachSuccess.passed, false);
    assert.ok(
      breachSuccess.violations.some((v) => v.includes('Success rate') && v.includes('98.00%')),
      'Must record success rate breach'
    );

    // 2.3 Latency breaches (P50 > 1000ms, P95 > 2000ms, P99 > 5000ms)
    const latencyBreach: BenchmarkResult = {
      ...passingResult,
      p50Ms: 1200.0,
      p95Ms: 2500.0,
      p99Ms: 5500.0,
    };
    const breachLatency = verifySla(latencyBreach);
    assert.strictEqual(breachLatency.passed, false);
    assert.strictEqual(breachLatency.violations.length, 3);
    assert.ok(breachLatency.violations.some((v) => v.includes('P50')));
    assert.ok(breachLatency.violations.some((v) => v.includes('P95')));
    assert.ok(breachLatency.violations.some((v) => v.includes('P99')));

    // 2.4 Custom thresholds evaluation
    const customCheck = verifySla(passingResult, { maxP50Ms: 20.0 });
    assert.strictEqual(customCheck.passed, false);
    assert.ok(customCheck.violations.some((v) => v.includes('P50')));
  });

  await t.test('3. generateMarkdownReport: formats GitHub-flavored markdown table for benchmark results', () => {
    const sampleResults: Record<string, BenchmarkResult> = {
      'Tier 1 (100)': {
        tierName: 'Tier 1 (100)',
        totalRequests: 100,
        successRequests: 100,
        failedRequests: 0,
        successRate: 100.0,
        durationMs: 450,
        tps: 222.22,
        p50Ms: 24.1,
        p90Ms: 28.5,
        p95Ms: 30.2,
        p99Ms: 34.0,
        latencies: [],
      },
      'Tier 2 (500)': {
        tierName: 'Tier 2 (500)',
        totalRequests: 500,
        successRequests: 500,
        failedRequests: 0,
        successRate: 100.0,
        durationMs: 1200,
        tps: 416.67,
        p50Ms: 28.0,
        p90Ms: 35.0,
        p95Ms: 38.0,
        p99Ms: 45.0,
        latencies: [],
      },
      'Tier 3 (1000)': {
        tierName: 'Tier 3 (1000)',
        totalRequests: 1000,
        successRequests: 999,
        failedRequests: 1,
        successRate: 99.9,
        durationMs: 2100,
        tps: 476.19,
        p50Ms: 32.5,
        p90Ms: 42.0,
        p95Ms: 48.0,
        p99Ms: 58.0,
        latencies: [],
      },
    };

    const markdown = generateMarkdownReport(sampleResults);
    assert.ok(markdown.includes('| Scale / Tier | Requests | Success Rate | Duration (s) | TPS | P50 (ms) | P90 (ms) | P95 (ms) | P99 (ms) | SLA Gate |'));
    assert.ok(markdown.includes('| Tier 1 (100) | 100 | 100.00% | 0.45s | 222.22 | 24.10ms | 28.50ms | 30.20ms | 34.00ms | PASS |'));
    assert.ok(markdown.includes('| Tier 2 (500) | 500 | 100.00% | 1.20s | 416.67 | 28.00ms | 35.00ms | 38.00ms | 45.00ms | PASS |'));
    assert.ok(markdown.includes('| Tier 3 (1000) | 1000 | 99.90% | 2.10s | 476.19 | 32.50ms | 42.00ms | 48.00ms | 58.00ms | PASS |'));
  });

  await t.test('4. LoadTestRunner: worker pool concurrency enforcement with custom executor', async () => {
    const runner = new LoadTestRunner();
    let currentActiveWorkers = 0;
    let maxObservedActiveWorkers = 0;

    const targetConcurrency = 15;
    const totalRequests = 60;

    const result = await runner.runTier(totalRequests, {
      tierName: 'Worker Pool Concurrency Test',
      concurrency: targetConcurrency,
      requestExecutor: async () => {
        currentActiveWorkers++;
        if (currentActiveWorkers > maxObservedActiveWorkers) {
          maxObservedActiveWorkers = currentActiveWorkers;
        }
        // Small async pause to allow workers to overlap
        await new Promise((r) => setTimeout(r, 20));
        currentActiveWorkers--;
        return true;
      },
    });

    assert.strictEqual(result.totalRequests, totalRequests);
    assert.strictEqual(result.successRequests, totalRequests);
    assert.strictEqual(result.failedRequests, 0);
    assert.strictEqual(result.successRate, 100.0);
    assert.ok(result.durationMs > 0);
    assert.ok(result.tps > 0);
    assert.strictEqual(result.latencies.length, totalRequests);

    // Concurrency must never exceed targetConcurrency
    assert.ok(
      maxObservedActiveWorkers <= targetConcurrency,
      `Observed active workers (${maxObservedActiveWorkers}) exceeded limit (${targetConcurrency})`
    );
    // Concurrency pool must have actually paralleled up to targetConcurrency
    assert.ok(
      maxObservedActiveWorkers >= 10,
      `Observed active workers (${maxObservedActiveWorkers}) should reach near target concurrency (${targetConcurrency})`
    );

    const sla = runner.verifySla(result);
    assert.strictEqual(sla.passed, true);
  });

  await t.test('5. LoadTestRunner: real closed loop with CommandService & DeviceSimulator (100 requests)', async () => {
    const runner = new LoadTestRunner();

    // Run Tier 1: 100 requests, concurrency 20, simulated latency 10ms
    const result = await runner.runTier(100, {
      tierName: 'Tier 1 (100)',
      concurrency: 20,
      simulatedLatencyMs: 10,
    });

    assert.strictEqual(result.totalRequests, 100);
    assert.strictEqual(result.successRequests, 100);
    assert.strictEqual(result.failedRequests, 0);
    assert.strictEqual(result.successRate, 100.0);
    assert.strictEqual(result.latencies.length, 100);

    // Each request had ~10ms simulated latency
    assert.ok(result.p50Ms >= 10, `P50 latency must be >= 10ms, got ${result.p50Ms}ms`);
    assert.ok(result.p95Ms >= 10, `P95 latency must be >= 10ms, got ${result.p95Ms}ms`);
    assert.ok(result.p99Ms >= 10, `P99 latency must be >= 10ms, got ${result.p99Ms}ms`);

    // SLA verification
    const sla = runner.verifySla(result);
    assert.strictEqual(sla.passed, true, `SLA must pass. Violations: ${sla.violations.join(', ')}`);

    // Generate markdown report
    const report = runner.generateMarkdownReport({
      [result.tierName]: result,
    });
    assert.ok(report.includes('| Tier 1 (100) | 100 | 100.00%'));
    assert.ok(report.includes('| PASS |'));
  });
});
