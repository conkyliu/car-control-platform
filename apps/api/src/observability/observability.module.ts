import { Module, Global } from '@nestjs/common';
import { MetricsService } from './metrics/metrics.service.js';
import { MetricsController } from './metrics/metrics.controller.js';
import { TracerService } from './tracing/tracer.service.js';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService, TracerService],
  exports: [MetricsService, TracerService],
})
export class ObservabilityModule {}
