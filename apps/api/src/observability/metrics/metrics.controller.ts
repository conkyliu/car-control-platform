import { Controller, Get, Header, Query } from '@nestjs/common';
import {
  ClusterNodeHealth,
  SystemMetricsSnapshotDto,
} from '@car-control/contracts';
import { MetricsService } from './metrics.service.js';

@Controller(['api/v1/metrics', 'metrics'])
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('cluster-nodes')
  getClusterNodes(): ClusterNodeHealth[] {
    return this.metricsService.getClusterNodes();
  }

  @Get('snapshot')
  getSnapshot(@Query('tenantId') tenantId?: string): SystemMetricsSnapshotDto {
    return this.metricsService.getMetricsSnapshot(tenantId);
  }

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  getMetrics(): string {
    return this.metricsService.exportPrometheusMetrics();
  }
}
