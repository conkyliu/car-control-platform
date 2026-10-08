import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadEnvironmentConfig } from '@car-control/config';

async function bootstrap() {
  const config = loadEnvironmentConfig();
  const app = await NestFactory.create(AppModule);

  app.enableCors();

  await app.listen(config.PORT);
  console.log(`[CarControl API] Server listening on port ${config.PORT}`);
}

bootstrap().catch((err) => {
  console.error('[CarControl API] Bootstrap failed:', err);
  process.exit(1);
});
