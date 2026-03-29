import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { Workspace } from './entities/workspace.entity';
import { WorkspaceMembership } from './entities/workspace-membership.entity';
import { Branch } from './entities/branch.entity';
import { BranchMembership } from './entities/branch-membership.entity';
import {
  BranchPermissionKey,
  BRANCH_PERMISSION_KEYS,
} from './dto/update-branch-member.dto';

type BranchRole = 'manager' | 'staff';

const DEFAULT_BRANCH_ROLE_PERMISSIONS: Record<BranchRole, BranchPermissionKey[]> = {
  manager: [
    'inventory.view',
    'inventory.manage',
    'sales.view',
    'sales.create',
    'debts.view',
    'debts.manage',
    'customers.view',
    'customers.manage',
    'reports.view',
  ],
  staff: [
    'inventory.view',
    'sales.view',
    'sales.create',
    'customers.view',
    'customers.manage',
  ],
};

@Injectable()
export class BranchAccessService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Workspace)
    private workspacesRepository: Repository<Workspace>,
    @InjectRepository(WorkspaceMembership)
    private workspaceMembershipsRepository: Repository<WorkspaceMembership>,
    @InjectRepository(Branch)
    private branchesRepository: Repository<Branch>,
    @InjectRepository(BranchMembership)
    private branchMembershipsRepository: Repository<BranchMembership>,
  ) {}

  normalizeWorkspaceRole(role?: string): 'owner' | 'manager' | 'staff' {
    if (role === 'owner') return 'owner';
    if (role === 'manager') return 'manager';
    return 'staff';
  }

  normalizeBranchRole(role?: string): BranchRole {
    return role === 'manager' ? 'manager' : 'staff';
  }

  normalizePermissions(
    role: BranchRole,
    permissions?: string[] | null,
  ): BranchPermissionKey[] {
    const requested = Array.isArray(permissions)
      ? permissions.filter((item): item is BranchPermissionKey =>
          BRANCH_PERMISSION_KEYS.includes(item as BranchPermissionKey),
        )
      : [];

    const merged = new Set<BranchPermissionKey>([
      ...DEFAULT_BRANCH_ROLE_PERMISSIONS[role],
      ...requested,
    ]);
    return [...merged];
  }

  async getUserOrFail(userId: string) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async getWorkspaceOrFail(workspaceId: string) {
    const workspace = await this.workspacesRepository.findOne({
      where: { id: workspaceId },
      relations: ['createdBy'],
    });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    return workspace;
  }

  async getWorkspaceMembership(workspaceId: string, userId: string) {
    return this.workspaceMembershipsRepository.findOne({
      where: { workspaceId, userId, isActive: true },
      relations: ['user', 'workspace'],
    });
  }

  async isWorkspaceOwnerLike(workspaceId: string, userId: string) {
    const user = await this.getUserOrFail(userId);
    if (['admin', 'super_admin'].includes(user.role)) {
      return true;
    }
    const membership = await this.getWorkspaceMembership(workspaceId, userId);
    return this.normalizeWorkspaceRole(membership?.role) === 'owner';
  }

  async assertWorkspaceOwnerLike(workspaceId: string, userId: string) {
    const workspace = await this.getWorkspaceOrFail(workspaceId);
    const user = await this.getUserOrFail(userId);
    const membership = await this.getWorkspaceMembership(workspaceId, userId);
    const allowed =
      ['admin', 'super_admin'].includes(user.role) ||
      this.normalizeWorkspaceRole(membership?.role) === 'owner';

    if (!allowed) {
      throw new ForbiddenException(
        'Only workspace owners can access this resource',
      );
    }

    return { workspace, user, membership };
  }

  async getAccessibleBranches(workspaceId: string, userId: string) {
    await this.getWorkspaceOrFail(workspaceId);
    const isOwnerLike = await this.isWorkspaceOwnerLike(workspaceId, userId);

    if (isOwnerLike) {
      return this.branchesRepository.find({
        where: { workspaceId },
        relations: ['managerUser'],
        order: { createdAt: 'DESC' },
      });
    }

    const memberships = await this.branchMembershipsRepository.find({
      where: { userId, isActive: true },
      relations: ['branch', 'branch.managerUser'],
      order: { updatedAt: 'DESC' },
    });

    return memberships
      .map((membership) => membership.branch)
      .filter((branch) => branch?.workspaceId === workspaceId);
  }

  async getBranchMembership(branchId: string, userId: string) {
    return this.branchMembershipsRepository.findOne({
      where: { branchId, userId, isActive: true },
      relations: ['user', 'branch'],
    });
  }

  async createOrUpdateBranchMembership(
    branchId: string,
    userId: string,
    role: BranchRole,
    permissions?: BranchPermissionKey[],
  ) {
    const existing = await this.branchMembershipsRepository.findOne({
      where: { branchId, userId },
    });

    const membership =
      existing || this.branchMembershipsRepository.create({ branchId, userId });
    membership.role = role;
    membership.permissions = this.normalizePermissions(role, permissions);
    membership.isActive = true;
    return this.branchMembershipsRepository.save(membership);
  }

  getEffectivePermissions(
    branchMembership?: BranchMembership | null,
  ): BranchPermissionKey[] {
    const role = this.normalizeBranchRole(branchMembership?.role);
    return this.normalizePermissions(role, branchMembership?.permissions);
  }

  hasPermission(
    branchMembership: BranchMembership | null | undefined,
    permission: BranchPermissionKey,
  ) {
    return this.getEffectivePermissions(branchMembership).includes(permission);
  }

  async deactivateBranchMemberships(branchId: string, exceptUserIds: string[] = []) {
    const memberships = await this.branchMembershipsRepository.find({
      where: { branchId, isActive: true },
    });

    for (const membership of memberships) {
      if (exceptUserIds.includes(membership.userId)) continue;
      membership.isActive = false;
      await this.branchMembershipsRepository.save(membership);
    }
  }

  async assertBranchAccess(
    workspaceId: string,
    branchId: string,
    userId: string,
    options?: { minimumRole?: BranchRole; allowOwnerLike?: boolean },
  ) {
    const branch = await this.branchesRepository.findOne({
      where: { id: branchId, workspaceId },
      relations: ['workspace', 'managerUser', 'createdBy'],
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const user = await this.getUserOrFail(userId);
    const ownerLike =
      (options?.allowOwnerLike ?? true) &&
      (await this.isWorkspaceOwnerLike(workspaceId, userId));
    const branchMembership = await this.getBranchMembership(branchId, userId);
    const branchRole = this.normalizeBranchRole(branchMembership?.role);

    if (ownerLike) {
      return {
        branch,
        user,
        branchMembership,
        branchRole,
        permissions: BRANCH_PERMISSION_KEYS,
        ownerLike: true,
      };
    }

    if (!branchMembership?.isActive) {
      throw new ForbiddenException(
        'You are not assigned to this branch',
      );
    }

    if (options?.minimumRole === 'manager' && branchRole !== 'manager') {
      throw new ForbiddenException(
        'Manager access is required for this branch action',
      );
    }

    return { branch, user, branchMembership, branchRole, ownerLike: false };
  }

  async assertBranchPermission(
    workspaceId: string,
    branchId: string,
    userId: string,
    permission: BranchPermissionKey,
  ) {
    const access = await this.assertBranchAccess(workspaceId, branchId, userId, {
      minimumRole: 'staff',
    });

    if (access.ownerLike) {
      return access;
    }

    if (!this.hasPermission(access.branchMembership, permission)) {
      throw new ForbiddenException(
        `Missing required branch permission: ${permission}`,
      );
    }

    return {
      ...access,
      permissions: this.getEffectivePermissions(access.branchMembership),
    };
  }
}
