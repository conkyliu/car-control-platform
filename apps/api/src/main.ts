import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadEnvironmentConfig } from '@car-control/config';

async function bootstrap() {
  const config = loadEnvironmentConfig();
  const app = await NestFactory.create(AppModule);

  app.enableCors();

  app.use((req: any, res: any, next: any) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      const status = res.statusCode;
      console.log(`[HTTP] ${req.method} ${req.originalUrl || req.url} -> ${status} (${duration}ms)`);
    });
    next();
  });

  await app.listen(config.PORT);
  console.log(`[CarControl API] Server listening on port ${config.PORT}`);
}

bootstrap().catch((err) => {
  console.error('[CarControl API] Bootstrap failed:', err);
  process.exit(1);
});
