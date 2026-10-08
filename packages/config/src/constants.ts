export const SYSTEM_CONSTANTS = {
  DEFAULT_HTTP_PORT: 3000,
  DEFAULT_WS_PORT: 3001,
  DEFAULT_MQTT_PORT: 1883,
  DEFAULT_COMMAND_TIMEOUT_MS: 10000,
  IDEMPOTENCY_WINDOW_SECONDS: 300,
  REDIS_KEYS: {
    DEVICE_ONLINE_PREFIX: 'car:device:online:',
    DEVICE_LOCATION_PREFIX: 'car:device:loc:',
    COMMAND_IDEMPOTENCY_PREFIX: 'car:cmd:idemp:',
    RATE_LIMIT_PREFIX: 'car:ratelimit:',
  },
  BULLMQ_QUEUES: {
    COMMAND_TIMEOUT: 'car:command:timeout',
    ALARM_NOTIFICATION: 'car:alarm:notification',
  },
} as const;
