export interface AppEnvironmentConfig {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  DATABASE_URL: string;
  REDIS_URL: string;
  MQTT_BROKER_URL: string;
  JWT_SECRET: string;
}

export function loadEnvironmentConfig(): AppEnvironmentConfig {
  return {
    NODE_ENV: (process.env.NODE_ENV as AppEnvironmentConfig['NODE_ENV']) || 'development',
    PORT: Number(process.env.PORT) || 3000,
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/car_control',
    REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
    MQTT_BROKER_URL: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
    JWT_SECRET: process.env.JWT_SECRET || 'dev-super-secret-jwt-key-2026',
  };
}
