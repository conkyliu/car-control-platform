import { Injectable, Optional } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import {
  CommandTrace,
  CommandTraceSpan,
  ITracerService,
  parseOrGenerateTraceId,
} from './tracer.types.js';

export interface TracerServiceOptions {
  maxTraces?: number;
  ttlMs?: number;
}

@Injectable()
export class TracerService implements ITracerService {
  private readonly traces = new Map<string, CommandTrace>();
  private readonly commandIndex = new Map<string, string>(); // commandId -> traceId
  private readonly maxTraces: number;
  private readonly ttlMs: number;

  constructor(@Optional() options?: TracerServiceOptions) {
    this.maxTraces = options?.maxTraces ?? 10000;
    this.ttlMs = options?.ttlMs ?? 3600000; // 1 hour
  }

  startTrace(
    commandId: string,
    vehicleId: string,
    tenantId?: string,
    explicitTraceId?: string
  ): CommandTrace {
    const traceId = parseOrGenerateTraceId(explicitTraceId);
    const startTime = Date.now();

    const trace: CommandTrace = {
      traceId,
      commandId,
      vehicleId,
      tenantId,
      startTime,
      totalDurationMs: 0,
      spans: [],
      status: 'IN_PROGRESS',
    };

    this.saveTrace(trace);
    return trace;
  }

  recordSpan(
    traceId: string,
    spanName: string,
    durationMs: number,
    attributes?: Record<string, any>
  ): void {
    const trace = this.getTrace(traceId) || this.getTraceByCommandId(traceId);
    if (!trace) {
      return;
    }

    const lastSpan = trace.spans[trace.spans.length - 1];
    const startTime =
      attributes?.startTime ?? (lastSpan ? lastSpan.endTime : trace.startTime);
    const endTime = attributes?.endTime ?? startTime + durationMs;

    const span: CommandTraceSpan = {
      name: spanName,
      startTime,
      endTime,
      durationMs,
      spanId: randomBytes(8).toString('hex'),
      attributes: attributes ? { ...attributes } : undefined,
    };

    if (span.attributes) {
      delete span.attributes.startTime;
      delete span.attributes.endTime;
      if (Object.keys(span.attributes).length === 0) {
        delete span.attributes;
      }
    }

    trace.spans.push(span);
    trace.endTime = endTime;
    trace.totalDurationMs = trace.spans.reduce(
      (sum, s) => sum + s.durationMs,
      0
    );
  }

  finishTrace(traceId: string, status?: string): CommandTrace | null {
    const trace = this.getTrace(traceId) || this.getTraceByCommandId(traceId);
    if (!trace) {
      return null;
    }

    trace.status = status || 'SUCCESS';
    if (trace.spans.length > 0) {
      trace.endTime = trace.spans[trace.spans.length - 1].endTime;
    } else {
      trace.endTime = Date.now();
    }
    trace.totalDurationMs = trace.spans.reduce(
      (sum, s) => sum + s.durationMs,
      0
    );
    return trace;
  }

  getTrace(traceId: string): CommandTrace | null {
    return this.traces.get(traceId) ?? null;
  }

  getTraceByCommandId(commandId: string): CommandTrace | null {
    const traceId = this.commandIndex.get(commandId);
    if (!traceId) {
      return this.traces.get(commandId) ?? null;
    }
    return this.traces.get(traceId) ?? null;
  }

  cleanup(maxAgeMs: number = this.ttlMs): number {
    const now = Date.now();
    let count = 0;
    for (const [traceId, trace] of this.traces.entries()) {
      if (now - trace.startTime > maxAgeMs) {
        this.commandIndex.delete(trace.commandId);
        this.traces.delete(traceId);
        count++;
      }
    }
    return count;
  }

  clear(): void {
    this.traces.clear();
    this.commandIndex.clear();
  }

  private saveTrace(trace: CommandTrace): void {
    if (this.traces.size >= this.maxTraces) {
      this.evictOldest();
    }
    this.traces.set(trace.traceId, trace);
    this.commandIndex.set(trace.commandId, trace.traceId);
  }

  private evictOldest(): void {
    const firstKey = this.traces.keys().next().value;
    if (firstKey) {
      const trace = this.traces.get(firstKey);
      if (trace) {
        this.commandIndex.delete(trace.commandId);
      }
      this.traces.delete(firstKey);
    }
  }
}
