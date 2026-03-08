import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workspace } from './entities/workspace.entity';
import { User } from '../auth/entities/user.entity';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';

@Injectable()
export class WorkspaceService {
  constructor(
    @InjectRepository(Workspace)
    private workspacesRepository: Repository<Workspace>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async createWorkspace(createWorkspaceDto: CreateWorkspaceDto, userId: string) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const slug = createWorkspaceDto.name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]/g, '');

    const existingWorkspace = await this.workspacesRepository.findOne({
      where: { slug },
    });

    if (existingWorkspace) {
      throw new BadRequestException('Workspace with this name already exists');
    }

    const workspace = this.workspacesRepository.create({
      ...createWorkspaceDto,
      slug,
      createdBy: user,
      users: [user],
    });

    return await this.workspacesRepository.save(workspace);
  }

  async getWorkspaces(userId: string) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: ['workspaces'],
    });

    return user.workspaces;
  }

  async getWorkspace(workspaceId: string) {
    const workspace = await this.workspacesRepository.findOne({
      where: { id: workspaceId },
      relations: ['users', 'createdBy'],
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    return workspace;
  }

  async updateWorkspace(workspaceId: string, updateData: Partial<Workspace>) {
    const workspace = await this.getWorkspace(workspaceId);
    Object.assign(workspace, updateData);
    return await this.workspacesRepository.save(workspace);
  }

  async addUserToWorkspace(workspaceId: string, userId: string) {
    const workspace = await this.getWorkspace(workspaceId);
    const user = await this.usersRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!workspace.users) {
      workspace.users = [];
    }

    const userExists = workspace.users.some((u) => u.id === userId);
    if (userExists) {
      throw new BadRequestException('User already belongs to this workspace');
    }

    workspace.users.push(user);
    return await this.workspacesRepository.save(workspace);
  }

  async removeUserFromWorkspace(workspaceId: string, userId: string) {
    const workspace = await this.getWorkspace(workspaceId);
    workspace.users = workspace.users.filter((u) => u.id !== userId);
    return await this.workspacesRepository.save(workspace);
  }
}
