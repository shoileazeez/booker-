import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  Put,
  Delete,
} from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('workspaces')
@UseGuards(JwtAuthGuard)
export class WorkspaceController {
  constructor(private workspaceService: WorkspaceService) {}

  @Post()
  async create(@Body() createWorkspaceDto: CreateWorkspaceDto, @Request() req) {
    return this.workspaceService.createWorkspace(
      createWorkspaceDto,
      req.user.sub,
    );
  }

  @Get()
  async findAll(@Request() req) {
    return this.workspaceService.getWorkspaces(req.user.sub);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.workspaceService.getWorkspace(id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateData: Partial<CreateWorkspaceDto>,
  ) {
    return this.workspaceService.updateWorkspace(id, updateData);
  }

  @Post(':id/users/:userId')
  async addUser(@Param('id') id: string, @Param('userId') userId: string) {
    return this.workspaceService.addUserToWorkspace(id, userId);
  }

  @Delete(':id/users/:userId')
  async removeUser(@Param('id') id: string, @Param('userId') userId: string) {
    return this.workspaceService.removeUserFromWorkspace(id, userId);
  }
}
