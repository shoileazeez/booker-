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
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import {
  UpdateBranchMemberDto,
  BranchPermissionKey,
} from './dto/update-branch-member.dto';

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

  @Post(':id/branches')
  async createBranch(
    @Param('id') id: string,
    @Body() dto: CreateBranchDto,
    @Request() req,
  ) {
    return this.workspaceService.createBranch(id, dto, req.user.sub);
  }

  @Get(':id/branches/:branchId')
  async getBranch(
    @Param('id') id: string,
    @Param('branchId') branchId: string,
    @Request() req,
  ) {
    return this.workspaceService.getBranch(id, branchId, req.user.sub);
  }

  @Put(':id/branches/:branchId')
  async updateBranch(
    @Param('id') id: string,
    @Param('branchId') branchId: string,
    @Body() dto: UpdateBranchDto,
    @Request() req,
  ) {
    return this.workspaceService.updateBranch(id, branchId, dto, req.user.sub);
  }

  @Get(':id/branches/:branchId/details')
  async getBranchDetails(
    @Param('id') id: string,
    @Param('branchId') branchId: string,
    @Request() req,
  ) {
    return this.workspaceService.getBranchDetails(id, branchId, req.user.sub);
  }

  @Post(':id/branches/:branchId/users/:userId')
  async assignUserToBranch(
    @Param('id') id: string,
    @Param('branchId') branchId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateBranchMemberDto,
    @Request() req,
  ) {
    return this.workspaceService.assignUserToBranch(
      id,
      branchId,
      userId,
      req.user.sub,
      dto,
    );
  }

  @Put(':id/branches/:branchId/users/:userId')
  async updateBranchMember(
    @Param('id') id: string,
    @Param('branchId') branchId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateBranchMemberDto,
    @Request() req,
  ) {
    return this.workspaceService.updateBranchMember(
      id,
      branchId,
      userId,
      req.user.sub,
      dto,
    );
  }

  @Delete(':id/branches/:branchId/users/:userId')
  async removeUserFromBranch(
    @Param('id') id: string,
    @Param('branchId') branchId: string,
    @Param('userId') userId: string,
    @Request() req,
  ) {
    return this.workspaceService.removeUserFromBranch(
      id,
      branchId,
      userId,
      req.user.sub,
    );
  }

  @Get(':id/audit-logs')
  async getAuditLogs(
    @Param('id') id: string,
    @Request() req,
    @Query('branchId') branchId?: string,
  ) {
    return this.workspaceService.getAuditLogs(id, req.user.sub, { branchId });
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
    @Body()
    inviteDto: {
      email: string;
      role?: string;
      branchId?: string;
      branchRole?: 'manager' | 'staff';
      permissions?: BranchPermissionKey[];
    },
    @Request() req,
  ) {
    return this.workspaceService.inviteUser(id, req.user.sub, inviteDto);
  }

  @Post(':id/team/invite')
  async inviteUserFromTeamRoute(
    @Param('id') id: string,
    @Body()
    inviteDto: {
      email: string;
      role?: string;
      branchId?: string;
      branchRole?: 'manager' | 'staff';
      permissions?: BranchPermissionKey[];
    },
    @Request() req,
  ) {
    return this.workspaceService.inviteUser(id, req.user.sub, inviteDto);
  }
}
