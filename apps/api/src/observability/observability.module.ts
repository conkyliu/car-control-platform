import { Module, Global } from '@nestjs/common';
import { MetricsService } from './metrics/metrics.service.js';
import { MetricsController } from './metrics/metrics.controller.js';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class ObservabilityModule {}
