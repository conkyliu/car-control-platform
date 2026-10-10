export interface CommandTraceSpan {
  name: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  spanId?: string;
  parentSpanId?: string;
  attributes?: Record<string, any>;
}

export interface CommandTrace {
  traceId: string;
  commandId: string;
  vehicleId: string;
  tenantId?: string;
  startTime: number;
  endTime?: number;
  totalDurationMs: number;
  spans: CommandTraceSpan[];
  status?: string;
}

export interface ITracerService {
  startTrace(
    commandId: string,
    vehicleId: string,
    tenantId?: string,
    explicitTraceId?: string
  ): CommandTrace;
  recordSpan(
    traceId: string,
    spanName: string,
    durationMs: number,
    attributes?: Record<string, any>
  ): void;
  finishTrace(traceId: string, status?: string): CommandTrace | null;
  getTrace(traceId: string): CommandTrace | null;
  getTraceByCommandId(commandId: string): CommandTrace | null;
}

export const STANDARD_SPAN_NAMES = {
  HTTP_INBOUND_REQUEST: 'http.inbound_request',
  COMMAND_SECURITY_AND_DISPATCH: 'command.security_and_dispatch',
  DEVICE_EXECUTION_ACK: 'device.execution_ack',
  ACK_PROCESSING_AND_PERSISTENCE: 'ack.processing_and_persistence',
  WEBSOCKET_CLIENT_NOTIFICATION: 'websocket.client_notification',
} as const;

export type StandardSpanName =
  (typeof STANDARD_SPAN_NAMES)[keyof typeof STANDARD_SPAN_NAMES];

import { randomBytes } from 'node:crypto';

export function generateW3CTraceId(): string {
  return randomBytes(16).toString('hex');
}

export function parseOrGenerateTraceId(explicitTraceId?: string): string {
  if (!explicitTraceId || explicitTraceId.trim() === '') {
    return generateW3CTraceId();
  }
  const trimmed = explicitTraceId.trim();
  // W3C traceparent standard: 00-${traceId}-${spanId}-${traceFlags}
  const match = trimmed.match(
    /^00-([0-9a-fA-F]{32})-[0-9a-fA-F]{16}-[0-9a-fA-F]{2}$/
  );
  if (match) {
    return match[1].toLowerCase();
  }
  return trimmed;
}
