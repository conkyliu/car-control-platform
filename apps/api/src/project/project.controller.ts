import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  Permission,
  ProjectDto,
  CreateProjectInput,
  UpdateProjectInput,
  AllocateDevicesInput,
  ProjectStatus,
} from '@car-control/contracts';
import { ProjectService } from './project.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { RequirePermissions } from '../auth/decorators/permissions.decorator.js';

@Controller('api/v1/projects')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Get()
  @RequirePermissions(Permission.DEVICE_READ)
  async listProjects(): Promise<ProjectDto[]> {
    return this.projectService.listProjects();
  }

  @Get(':id')
  @RequirePermissions(Permission.DEVICE_READ)
  async getProject(@Param('id') id: string): Promise<ProjectDto> {
    return this.projectService.getProject(id);
  }

  @Post()
  @RequirePermissions(Permission.DEVICE_WRITE)
  async createProject(@Body() input: CreateProjectInput): Promise<ProjectDto> {
    return this.projectService.createProject(input);
  }

  @Patch(':id')
  @RequirePermissions(Permission.DEVICE_WRITE)
  async updateProject(
    @Param('id') id: string,
    @Body() input: UpdateProjectInput
  ): Promise<ProjectDto> {
    return this.projectService.updateProject(id, input);
  }

  @Put(':id')
  @RequirePermissions(Permission.DEVICE_WRITE)
  async replaceProject(
    @Param('id') id: string,
    @Body() input: UpdateProjectInput
  ): Promise<ProjectDto> {
    return this.projectService.updateProject(id, input);
  }

  @Patch(':id/status')
  @RequirePermissions(Permission.DEVICE_WRITE)
  async updateProjectStatus(
    @Param('id') id: string,
    @Body() body: { status?: ProjectStatus } | any,
    @Body('status') rawStatus?: ProjectStatus
  ): Promise<ProjectDto> {
    const status = (body?.status || rawStatus) as ProjectStatus;
    return this.projectService.updateProjectStatus(id, status);
  }

  @Post(':id/allocate-devices')
  @RequirePermissions(Permission.DEVICE_WRITE)
  async allocateDevices(
    @Param('id') id: string,
    @Body() body: AllocateDevicesInput
  ): Promise<{ success: boolean }> {
    return this.projectService.allocateDevices(id, body?.deviceIds || []);
  }

  @Delete(':id')
  @RequirePermissions(Permission.DEVICE_WRITE)
  async deleteProject(@Param('id') id: string): Promise<{ success: boolean }> {
    return this.projectService.deleteProject(id);
  }
}
