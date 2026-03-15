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

    let managerUser: User | null = null;

    if (createWorkspaceDto.parentWorkspaceId) {
      const parentWorkspace = await this.workspacesRepository.findOne({
        where: { id: createWorkspaceDto.parentWorkspaceId },
        relations: ['users', 'createdBy'],
      });

      if (!parentWorkspace) {
        throw new NotFoundException('Parent workspace not found');
      }

      const canManageParent =
        parentWorkspace.createdBy?.id === userId ||
        user.role === 'admin' ||
        user.role === 'super_admin';

      if (!canManageParent) {
        throw new BadRequestException('You are not allowed to create a branch for this workspace');
      }

      if (createWorkspaceDto.managerUserId) {
        managerUser = await this.usersRepository.findOne({ where: { id: createWorkspaceDto.managerUserId } });
        if (!managerUser) {
          throw new NotFoundException('Selected manager user not found');
        }
      }
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
      parentWorkspaceId: createWorkspaceDto.parentWorkspaceId || null,
      managerUserId: managerUser?.id || null,
      managerUser: managerUser || null,
      createdBy: user,
      users: managerUser && managerUser.id !== user.id ? [user, managerUser] : [user],
    });

    const saved = await this.workspacesRepository.save(workspace);

    // Promote user to admin when they create their first workspace
    if (user.role === 'user') {
      user.role = 'admin';
      await this.usersRepository.save(user);
    }

    return saved;
  }

  async getWorkspaces(userId: string) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: ['workspaces'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user.workspaces || [];
  }

  async getWorkspace(workspaceId: string) {
    const workspace = await this.workspacesRepository.findOne({
      where: { id: workspaceId },
      relations: ['users', 'createdBy', 'parentWorkspace'],
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

  async getBranches(workspaceId: string, userId: string) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      relations: ['workspaces'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const hasAccess = user.workspaces?.some((workspace) => workspace.id === workspaceId);
    if (!hasAccess) {
      throw new NotFoundException('Workspace not found');
    }

    return this.workspacesRepository.find({
      where: { parentWorkspaceId: workspaceId },
      relations: ['createdBy', 'users', 'managerUser'],
      order: { createdAt: 'DESC' },
    });
  }

  async findWorkspaceUserByEmail(workspaceId: string, requesterId: string, email: string) {
    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new BadRequestException('Email is required');
    }

    const workspace = await this.workspacesRepository.findOne({
      where: { id: workspaceId },
      relations: ['users', 'createdBy'],
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const requester = await this.usersRepository.findOne({ where: { id: requesterId } });
    if (!requester) {
      throw new NotFoundException('Requester not found');
    }

    const canManageWorkspace =
      workspace.createdBy?.id === requesterId ||
      requester.role === 'admin' ||
      requester.role === 'super_admin';

    if (!canManageWorkspace) {
      throw new BadRequestException('You are not allowed to manage this workspace');
    }

    const foundUser = await this.usersRepository.findOne({
      where: { email: normalizedEmail },
    });
    if (!foundUser) {
      throw new NotFoundException('User not found');
    }

    const alreadyMember = workspace.users?.some((member) => member.id === foundUser.id) || false;

    return {
      id: foundUser.id,
      name: foundUser.name,
      email: foundUser.email,
      role: foundUser.role,
      alreadyMember,
    };
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
