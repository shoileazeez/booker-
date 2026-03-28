import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
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

  @Get('invites/pending')
  async getPendingInvites(@Request() req) {
    return this.workspaceService.getPendingInvitesForUser(req.user.sub);
  }

  @Post('invites/accept')
  async acceptInvite(
    @Body() body: { inviteId: string; code: string },
    @Request() req,
  ) {
    return this.workspaceService.acceptInvite(req.user.sub, body);
  }

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
  async findOne(@Param('id') id: string, @Request() req) {
    return this.workspaceService.getWorkspace(id, req.user.sub);
  }

  @Get(':id/branches')
  async getBranches(@Param('id') id: string, @Request() req) {
    return this.workspaceService.getBranches(id, req.user.sub);
  }

  @Get(':id/management/overview')
  async getManagementOverview(@Param('id') id: string, @Request() req) {
    return this.workspaceService.getManagementOverview(id, req.user.sub);
  }

  @Get(':id/users/search')
  async findWorkspaceUserByEmail(
    @Param('id') id: string,
    @Request() req,
    @Query('email') email: string,
  ) {
    return this.workspaceService.findWorkspaceUserByEmail(
      id,
      req.user.sub,
      email,
    );
  }

  @Get(':id/users/email/:email')
  async findWorkspaceUserByEmailPath(
    @Param('id') id: string,
    @Request() req,
    @Param('email') email: string,
  ) {
    return this.workspaceService.findWorkspaceUserByEmail(
      id,
      req.user.sub,
      email,
    );
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateData: Partial<CreateWorkspaceDto>,
  ) {
    return this.workspaceService.updateWorkspace(id, updateData);
  }

  @Post(':id/users/:userId')
  async addUser(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Request() req,
  ) {
    return this.workspaceService.addUserToWorkspace(id, userId, req.user.sub);
  }

  @Delete(':id/users/:userId')
  async removeUser(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Request() req,
  ) {
    return this.workspaceService.removeUserFromWorkspace(
      id,
      userId,
      req.user.sub,
    );
  }

  @Put(':id/users/:userId/role')
  async updateUserRole(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() body: { role: 'manager' | 'staff' | 'owner' },
    @Request() req,
  ) {
    return this.workspaceService.updateWorkspaceUserRole(
      id,
      userId,
      req.user.sub,
      body.role,
    );
  }

  @Post(':id/invite')
  async inviteUser(
    @Param('id') id: string,
    @Body() inviteDto: { email: string; role?: string },
    @Request() req,
  ) {
    return this.workspaceService.inviteUser(id, req.user.sub, inviteDto);
  }

  @Post(':id/team/invite')
  async inviteUserFromTeamRoute(
    @Param('id') id: string,
    @Body() inviteDto: { email: string; role?: string },
    @Request() req,
  ) {
    return this.workspaceService.inviteUser(id, req.user.sub, inviteDto);
  }
}
