import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workspace } from './entities/workspace.entity';
import { User } from '../auth/entities/user.entity';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { BillingService } from '../billing/billing.service';
import { WorkspaceInvite } from './entities/invite.entity';
import { EmailQueueService } from '../notifications/email-queue.service';
import { EmailService } from '../notifications/email.service';
import { Transaction } from '../transactions/entities/transaction.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { WorkspaceMembership } from './entities/workspace-membership.entity';
import { Branch } from './entities/branch.entity';
import { BranchMembership } from './entities/branch-membership.entity';
import { BranchAccessService } from './branch-access.service';
import { Customer } from '../customer/customer.entity';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import {
  UpdateBranchMemberDto,
  BranchPermissionKey,
} from './dto/update-branch-member.dto';
import { AuditLogService } from './audit-log.service';
import { AuditLog } from './entities/audit-log.entity';

@Injectable()
export class WorkspaceService {
  private readonly inviteExpiryDays = 7;

  constructor(
    @InjectRepository(Workspace)
    private workspacesRepository: Repository<Workspace>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(WorkspaceInvite)
    private invitesRepository: Repository<WorkspaceInvite>,
    @InjectRepository(WorkspaceMembership)
    private membershipsRepository: Repository<WorkspaceMembership>,
    @InjectRepository(Branch)
    private branchesRepository: Repository<Branch>,
    @InjectRepository(BranchMembership)
    private branchMembershipsRepository: Repository<BranchMembership>,
    @InjectRepository(Transaction)
    private transactionsRepository: Repository<Transaction>,
    @InjectRepository(InventoryItem)
    private inventoryRepository: Repository<InventoryItem>,
    @InjectRepository(Customer)
    private customersRepository: Repository<Customer>,
    @InjectRepository(AuditLog)
    private auditLogsRepository: Repository<AuditLog>,
    private billingService: BillingService,
    private readonly emailQueueService: EmailQueueService,
    private readonly emailService: EmailService,
    private readonly branchAccessService: BranchAccessService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private normalizeWorkspaceRole(role?: string): 'owner' | 'manager' | 'staff' {
    if (role === 'owner') return 'owner';
    if (role === 'manager') return 'manager';
    return 'staff';
  }

  private async getMembership(workspaceId: string, userId: string) {
    return this.membershipsRepository.findOne({
      where: { workspaceId, userId, isActive: true },
      relations: ['user', 'workspace'],
    });
  }

  private getEffectiveWorkspaceRole(membership?: WorkspaceMembership | null) {
    return this.normalizeWorkspaceRole(membership?.role);
  }

  private generateInviteCode() {
    return `${Math.floor(100000 + Math.random() * 900000)}`;
  }

  private normalizeBranchRole(role?: string): 'manager' | 'staff' {
    return role === 'manager' ? 'manager' : 'staff';
  }

  private getInviteExpiryDate() {
    return new Date(Date.now() + this.inviteExpiryDays * 24 * 60 * 60 * 1000);
  }

  private isInviteExpired(invite?: WorkspaceInvite | null) {
    return !!invite?.expiresAt && invite.expiresAt.getTime() <= Date.now();
  }

  private async getBranchForInvite(
    workspaceId: string,
    branchId?: string | null,
  ) {
    const normalizedBranchId = branchId?.trim();
    if (!normalizedBranchId) return null;

    const branch = await this.branchesRepository.findOne({
      where: { id: normalizedBranchId, workspaceId },
    });

    if (!branch) {
      throw new NotFoundException('Selected branch was not found');
    }

    return branch;
  }

  private async applyInviteBranchAssignment(
    invite: WorkspaceInvite,
    userId: string,
  ) {
    if (!invite.branchId) {
      return { assigned: false, branchId: null, reason: null };
    }

    const branch = await this.branchesRepository.findOne({
      where: { id: invite.branchId, workspaceId: invite.workspaceId },
    });

    if (!branch) {
      return {
        assigned: false,
        branchId: invite.branchId,
        reason: 'Branch no longer exists',
      };
    }

    const role = this.normalizeBranchRole(invite.branchRole || invite.role);
    await this.branchAccessService.createOrUpdateBranchMembership(
      branch.id,
      userId,
      role,
      (invite.branchPermissions as BranchPermissionKey[] | null) || undefined,
    );

    if (role === 'manager') {
      await this.branchesRepository.update(
        { id: branch.id, workspaceId: invite.workspaceId },
        { managerUserId: userId },
      );
    }

    return { assigned: true, branchId: branch.id, reason: null };
  }

  private assertRoleCanBeAssigned(
    requesterRole: 'owner' | 'manager' | 'staff',
    targetRole: 'owner' | 'manager' | 'staff',
  ) {
    if (targetRole === 'owner') {
      throw new ForbiddenException(
        'Owner role cannot be assigned from this flow',
      );
    }

    if (requesterRole === 'manager' && targetRole !== 'staff') {
      throw new ForbiddenException('Managers can only assign staff access');
    }
  }

  private async createOrUpdateMembership(
    workspaceId: string,
    userId: string,
    role: 'owner' | 'manager' | 'staff',
  ) {
    const existing = await this.membershipsRepository.findOne({
      where: { workspaceId, userId },
    });
    const membership =
      existing || this.membershipsRepository.create({ workspaceId, userId });
    membership.role = role;
    membership.isActive = true;
    return this.membershipsRepository.save(membership);
  }

  private async assertWorkspaceManagerAccess(
    workspaceId: string,
    requesterId: string,
    options?: { allowStaff?: boolean },
  ) {
    const workspace = await this.workspacesRepository.findOne({
      where: { id: workspaceId },
      relations: [
        'createdBy',
        'managerUser',
        'parentWorkspace',
        'parentWorkspace.createdBy',
      ],
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const requester = await this.usersRepository.findOne({
      where: { id: requesterId },
    });

    if (!requester) {
      throw new NotFoundException('Requester not found');
    }

    const isAdminLike = ['owner', 'admin', 'super_admin'].includes(
      requester.role,
    );
    const membership = await this.getMembership(workspaceId, requesterId);
    const parentMembership = workspace.parentWorkspaceId
      ? await this.getMembership(workspace.parentWorkspaceId, requesterId)
      : null;

    const membershipRole = this.getEffectiveWorkspaceRole(membership);
    const parentMembershipRole =
      this.getEffectiveWorkspaceRole(parentMembership);
    const canManageCurrent =
      membershipRole === 'owner' || membershipRole === 'manager';
    const canManageParent =
      parentMembershipRole === 'owner' || parentMembershipRole === 'manager';
    const canViewAsStaff = options?.allowStaff && membershipRole === 'staff';

    if (
      !canManageCurrent &&
      !canManageParent &&
      !canViewAsStaff &&
      !isAdminLike
    ) {
      throw new ForbiddenException(
        'You are not allowed to manage this workspace',
      );
    }

    return { workspace, requester, membership, parentMembership };
  }

  async createWorkspace(
    createWorkspaceDto: CreateWorkspaceDto,
    userId: string,
  ) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const subscription =
      await this.billingService.getCurrentSubscription(userId);
    const normalizedPlan: 'basic' | 'pro' =
      subscription.plan === 'pro' ? 'pro' : 'basic';
    const planLimit = subscription.limits.workspaceLimit;
    const currentWorkspaceCount = subscription.limits.workspaceUsed;

    if (subscription.upgradeRequired) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'SUBSCRIPTION_REQUIRED',
        message:
          'Your trial has ended. Please upgrade to a paid plan to continue.',
        meta: {
          plan: normalizedPlan,
          feature: 'workspace.create',
        },
      });
    }

    if (currentWorkspaceCount >= planLimit) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PLAN_LIMIT_REACHED',
        message:
          normalizedPlan === 'basic'
            ? 'Your Basic plan allows only 1 workspace. Upgrade your plan to add more.'
            : 'Your Pro plan allows up to 3 workspaces. Upgrade your plan to increase this limit.',
        meta: {
          plan: normalizedPlan,
          limit: planLimit,
          current: currentWorkspaceCount,
          feature: 'workspace.create',
        },
      });
    }

    if (createWorkspaceDto.parentWorkspaceId) {
      throw new BadRequestException(
        'Branches are no longer created as child workspaces. Use the branch endpoints instead.',
      );
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
      parentWorkspaceId: null,
      managerUserId: null,
      managerUser: null,
      createdBy: user,
    });

    const saved = await this.workspacesRepository.save(workspace);
    await this.createOrUpdateMembership(saved.id, user.id, 'owner');

    if (user.role === 'user') {
      user.role = 'owner';
      await this.usersRepository.save(user);
    }

    return this.getWorkspace(saved.id, user.id);
  }

  async getWorkspaces(userId: string) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const memberships = await this.membershipsRepository.find({
      where: { userId, isActive: true },
      relations: [
        'workspace',
        'workspace.managerUser',
        'workspace.createdBy',
        'workspace.parentWorkspace',
      ],
      order: { updatedAt: 'DESC' },
    });

    return memberships
      .filter((membership) => !membership.workspace.parentWorkspaceId)
      .map((membership) => ({
      id: membership.workspace.id,
      name: membership.workspace.name,
      description: membership.workspace.description,
      logo: membership.workspace.logo,
      status: membership.workspace.status,
      slug: membership.workspace.slug,
      parentWorkspaceId: membership.workspace.parentWorkspaceId,
      createdAt: membership.workspace.createdAt,
      updatedAt: membership.workspace.updatedAt,
      role: membership.role,
      managerUser: membership.workspace.managerUser
        ? {
            id: membership.workspace.managerUser.id,
            name: membership.workspace.managerUser.name,
            email: membership.workspace.managerUser.email,
          }
        : null,
    }));
  }

  async getWorkspace(workspaceId: string, requesterId?: string) {
    const workspace = await this.workspacesRepository.findOne({
      where: { id: workspaceId },
      relations: ['createdBy', 'parentWorkspace', 'managerUser'],
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const memberships = await this.membershipsRepository.find({
      where: { workspaceId, isActive: true },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });

    const requesterMembership = requesterId
      ? memberships.find((membership) => membership.userId === requesterId) ||
        null
      : null;

    return {
      ...workspace,
      role: requesterMembership?.role || null,
      users: memberships.map((membership) => ({
        id: membership.user.id,
        name: membership.user.name,
        email: membership.user.email,
        phone: membership.user.phone,
        role: membership.role,
        isActive: membership.user.isActive,
      })),
    };
  }

  async updateWorkspace(workspaceId: string, updateData: Partial<Workspace>) {
    const workspace = await this.workspacesRepository.findOne({
      where: { id: workspaceId },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    Object.assign(workspace, updateData);
    return await this.workspacesRepository.save(workspace);
  }

  async createBranch(
    workspaceId: string,
    dto: CreateBranchDto,
    requesterId: string,
  ) {
    const { workspace } = await this.branchAccessService.assertWorkspaceOwnerLike(
      workspaceId,
      requesterId,
    );

    let managerUser: User | null = null;
    if (dto.managerUserId) {
      const managerMembership = await this.membershipsRepository.findOne({
        where: {
          workspaceId,
          userId: dto.managerUserId,
          isActive: true,
        },
        relations: ['user'],
      });

      if (!managerMembership?.user) {
        throw new NotFoundException(
          'Selected branch manager must already belong to this workspace team',
        );
      }

      managerUser = managerMembership.user;
    }

    const branch = this.branchesRepository.create({
      name: dto.name,
      description: dto.description || null,
      location: dto.location || null,
      address: dto.address || null,
      phone: dto.phone || null,
      workspaceId,
      workspace,
      managerUserId: managerUser?.id || null,
      managerUser: managerUser || null,
      createdBy: workspace.createdBy,
    });

    const saved = await this.branchesRepository.save(branch);
    if (managerUser) {
      await this.branchAccessService.createOrUpdateBranchMembership(
        saved.id,
        managerUser.id,
        'manager',
      );
    }
    await this.auditLogService.log({
      workspaceId,
      branchId: saved.id,
      actorUserId: requesterId,
      action: 'branch.create',
      entityType: 'branch',
      entityId: saved.id,
      metadata: {
        name: saved.name,
        managerUserId: saved.managerUserId,
      },
    });

    return this.getBranch(workspaceId, saved.id, requesterId);
  }

  async getBranches(workspaceId: string, userId: string) {
    const branches = await this.branchAccessService.getAccessibleBranches(
      workspaceId,
      userId,
    );
    const branchIds = branches.map((branch) => branch.id);
    const branchMemberships =
      branchIds.length > 0
        ? await this.branchMembershipsRepository.find({
            where: branchIds.map((branchId) => ({
              branchId,
              isActive: true,
            })),
            relations: ['user'],
          })
        : [];

    return branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      description: branch.description,
      location: branch.location,
      address: branch.address,
      phone: branch.phone,
      status: branch.status,
      workspaceId: branch.workspaceId,
      createdAt: branch.createdAt,
      updatedAt: branch.updatedAt,
      managerUser: branch.managerUser
        ? {
            id: branch.managerUser.id,
            name: branch.managerUser.name,
            email: branch.managerUser.email,
          }
        : null,
      users: branchMemberships
        .filter((membership) => membership.branchId === branch.id)
        .map((membership) => ({
          id: membership.user.id,
          name: membership.user.name,
          email: membership.user.email,
          role: membership.role,
        })),
    }));
  }

  async getBranch(workspaceId: string, branchId: string, userId: string) {
    const { branch } = await this.branchAccessService.assertBranchAccess(
      workspaceId,
      branchId,
      userId,
      { minimumRole: 'staff' },
    );

    const memberships = await this.branchMembershipsRepository.find({
      where: { branchId, isActive: true },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });

    return {
      id: branch.id,
      name: branch.name,
      description: branch.description,
      location: branch.location,
      address: branch.address,
      phone: branch.phone,
      status: branch.status,
      workspaceId: branch.workspaceId,
      managerUser: branch.managerUser
        ? {
            id: branch.managerUser.id,
            name: branch.managerUser.name,
            email: branch.managerUser.email,
          }
        : null,
      users: memberships.map((membership) => ({
        id: membership.user.id,
        name: membership.user.name,
        email: membership.user.email,
        phone: membership.user.phone,
        role: membership.role,
        permissions:
          membership.permissions ||
          this.branchAccessService.getEffectivePermissions(membership),
        isActive: membership.user.isActive && membership.isActive,
      })),
      createdAt: branch.createdAt,
      updatedAt: branch.updatedAt,
    };
  }

  async updateBranch(
    workspaceId: string,
    branchId: string,
    dto: UpdateBranchDto,
    requesterId: string,
  ) {
    await this.branchAccessService.assertWorkspaceOwnerLike(
      workspaceId,
      requesterId,
    );

    const branch = await this.branchesRepository.findOne({
      where: { id: branchId, workspaceId },
      relations: ['managerUser'],
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    let managerUser: User | null | undefined = branch.managerUser;
    if (dto.managerUserId !== undefined) {
      if (!dto.managerUserId) {
        managerUser = null;
      } else {
        const managerMembership = await this.membershipsRepository.findOne({
          where: {
            workspaceId,
            userId: dto.managerUserId,
            isActive: true,
          },
          relations: ['user'],
        });
        if (!managerMembership?.user) {
          throw new NotFoundException(
            'Selected branch manager must already belong to this workspace team',
          );
        }
        managerUser = managerMembership.user;
      }
    }

    Object.assign(branch, {
      name: dto.name ?? branch.name,
      description:
        dto.description !== undefined ? dto.description || null : branch.description,
      location: dto.location !== undefined ? dto.location || null : branch.location,
      address: dto.address !== undefined ? dto.address || null : branch.address,
      phone: dto.phone !== undefined ? dto.phone || null : branch.phone,
      managerUserId: managerUser?.id || null,
      managerUser: managerUser || null,
    });

    const saved = await this.branchesRepository.save(branch);
    if (saved.managerUserId) {
      await this.branchAccessService.createOrUpdateBranchMembership(
        saved.id,
        saved.managerUserId,
        'manager',
      );
    }
    await this.auditLogService.log({
      workspaceId,
      branchId: saved.id,
      actorUserId: requesterId,
      action: 'branch.update',
      entityType: 'branch',
      entityId: saved.id,
      metadata: dto,
    });
    return this.getBranch(workspaceId, branchId, requesterId);
  }

  async assignUserToBranch(
    workspaceId: string,
    branchId: string,
    userId: string,
    requesterId: string,
    dto: UpdateBranchMemberDto,
  ) {
    await this.branchAccessService.assertWorkspaceOwnerLike(
      workspaceId,
      requesterId,
    );

    const branch = await this.branchesRepository.findOne({
      where: { id: branchId, workspaceId },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    const workspaceMembership = await this.membershipsRepository.findOne({
      where: { workspaceId, userId, isActive: true },
      relations: ['user'],
    });
    if (!workspaceMembership?.user) {
      throw new BadRequestException(
        'User must belong to the workspace before being assigned to a branch',
      );
    }

    const role = dto.role === 'manager' ? 'manager' : 'staff';
    await this.branchAccessService.createOrUpdateBranchMembership(
      branchId,
      userId,
      role,
      dto.permissions,
    );
    if (role === 'manager') {
      await this.branchesRepository.update(
        { id: branchId, workspaceId },
        { managerUserId: userId },
      );
    }
    await this.auditLogService.log({
      workspaceId,
      branchId,
      actorUserId: requesterId,
      action: 'branch.member.assign',
      entityType: 'branch_membership',
      entityId: `${branchId}:${userId}`,
      metadata: {
        assignedUserId: userId,
        role,
        permissions: dto.permissions || [],
      },
    });

    return this.getBranch(workspaceId, branchId, requesterId);
  }

  async updateBranchMember(
    workspaceId: string,
    branchId: string,
    userId: string,
    requesterId: string,
    dto: UpdateBranchMemberDto,
  ) {
    await this.branchAccessService.assertWorkspaceOwnerLike(
      workspaceId,
      requesterId,
    );

    const membership = await this.branchMembershipsRepository.findOne({
      where: { branchId, userId, isActive: true },
    });
    if (!membership) {
      throw new NotFoundException('Branch membership not found');
    }

    membership.role = dto.role === 'manager' ? 'manager' : membership.role;
    if (dto.role === 'staff') {
      membership.role = 'staff';
    }
    membership.permissions = dto.permissions
      ? this.branchAccessService.normalizePermissions(
          membership.role,
          dto.permissions,
        )
      : this.branchAccessService.normalizePermissions(
          membership.role,
          membership.permissions,
        );
    await this.branchMembershipsRepository.save(membership);

    if (membership.role === 'manager') {
      await this.branchesRepository.update(
        { id: branchId, workspaceId },
        { managerUserId: userId },
      );
    } else {
      await this.branchesRepository.update(
        { id: branchId, workspaceId, managerUserId: userId },
        { managerUserId: null },
      );
    }

    await this.auditLogService.log({
      workspaceId,
      branchId,
      actorUserId: requesterId,
      action: 'branch.member.update',
      entityType: 'branch_membership',
      entityId: `${branchId}:${userId}`,
      metadata: {
        role: membership.role,
        permissions: membership.permissions,
      },
    });

    return this.getBranch(workspaceId, branchId, requesterId);
  }

  async removeUserFromBranch(
    workspaceId: string,
    branchId: string,
    userId: string,
    requesterId: string,
  ) {
    await this.branchAccessService.assertWorkspaceOwnerLike(
      workspaceId,
      requesterId,
    );

    const membership = await this.branchMembershipsRepository.findOne({
      where: { branchId, userId, isActive: true },
    });
    if (!membership) {
      throw new NotFoundException('Branch membership not found');
    }
    membership.isActive = false;
    await this.branchMembershipsRepository.save(membership);
    await this.branchesRepository.update(
      { id: branchId, workspaceId, managerUserId: userId },
      { managerUserId: null },
    );
    await this.auditLogService.log({
      workspaceId,
      branchId,
      actorUserId: requesterId,
      action: 'branch.member.remove',
      entityType: 'branch_membership',
      entityId: `${branchId}:${userId}`,
      metadata: { removedUserId: userId },
    });
    return { removed: true, branchId, userId };
  }

  async getAuditLogs(
    workspaceId: string,
    requesterId: string,
    options?: { branchId?: string },
  ) {
    const branchId = options?.branchId?.trim();
    if (branchId) {
      await this.branchAccessService.assertBranchPermission(
        workspaceId,
        branchId,
        requesterId,
        'reports.view',
      );
    } else {
      await this.branchAccessService.assertWorkspaceOwnerLike(
        workspaceId,
        requesterId,
      );
    }

    const query = this.auditLogsRepository
      .createQueryBuilder('log')
      .where('log.workspace_id = :workspaceId', { workspaceId });

    if (branchId) {
      query.andWhere('log.branch_id = :branchId', { branchId });
    }

    return query.orderBy('log.created_at', 'DESC').take(200).getRawMany();
  }

  async getManagementOverview(workspaceId: string, requesterId: string) {
    const { workspace } = await this.branchAccessService.assertWorkspaceOwnerLike(
      workspaceId,
      requesterId,
    );

    const branches = await this.branchesRepository.find({
      where: { workspaceId },
      relations: ['managerUser', 'createdBy'],
      order: { createdAt: 'DESC' },
    });

    const allMemberships = await this.membershipsRepository.find({
      where: [{ workspaceId, isActive: true }],
      relations: ['user'],
    });
    const branchMemberships =
      branches.length > 0
        ? await this.branchMembershipsRepository.find({
            where: branches.map((item) => ({
              branchId: item.id,
              isActive: true,
            })),
            relations: ['user'],
          })
        : [];

    const inventoryCounts = await this.inventoryRepository
      .createQueryBuilder('item')
      .select('item.branch_id', 'branchId')
      .addSelect('COUNT(*)', 'inventoryCount')
      .where('item.workspace_id = :workspaceId', { workspaceId })
      .andWhere('item.branch_id IS NOT NULL')
      .groupBy('item.branch_id')
      .getRawMany();

    const transactionStats = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .select('transaction.branch_id', 'branchId')
      .addSelect(
        "SUM(CASE WHEN transaction.type = 'sale' THEN transaction.\"totalAmount\" ELSE 0 END)",
        'salesAmount',
      )
      .addSelect(
        "SUM(CASE WHEN transaction.type = 'sale' THEN 1 ELSE 0 END)",
        'salesCount',
      )
      .addSelect(
        "SUM(CASE WHEN transaction.type = 'debt' AND transaction.status = 'pending' THEN transaction.\"totalAmount\" ELSE 0 END)",
        'pendingDebtAmount',
      )
      .where('transaction.workspace_id = :workspaceId', { workspaceId })
      .andWhere('transaction.branch_id IS NOT NULL')
      .groupBy('transaction.branch_id')
      .getRawMany();

    const staffPerformance = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoin('transaction.createdBy', 'createdBy')
      .leftJoin('transaction.branch', 'branch')
      .select('createdBy.id', 'userId')
      .addSelect('createdBy.name', 'name')
      .addSelect('createdBy.email', 'email')
      .addSelect('branch.id', 'branchId')
      .addSelect('branch.name', 'branchName')
      .addSelect(
        "SUM(CASE WHEN transaction.type = 'sale' THEN transaction.\"totalAmount\" ELSE 0 END)",
        'salesAmount',
      )
      .addSelect(
        "SUM(CASE WHEN transaction.type = 'sale' THEN 1 ELSE 0 END)",
        'salesCount',
      )
      .where('transaction.workspace_id = :workspaceId', { workspaceId })
      .andWhere('transaction.branch_id IS NOT NULL')
      .groupBy('createdBy.id')
      .addGroupBy('createdBy.name')
      .addGroupBy('createdBy.email')
      .addGroupBy('branch.id')
      .addGroupBy('branch.name')
      .orderBy(
        "SUM(CASE WHEN transaction.type = 'sale' THEN transaction.\"totalAmount\" ELSE 0 END)",
        'DESC',
      )
      .getRawMany();

    const pendingInvites = await this.invitesRepository.find({
      where: { workspaceId, status: 'pending' },
      relations: ['branch'],
      order: { createdAt: 'DESC' },
    });

    const inventoryMap = new Map(
      inventoryCounts.map((row) => [
        row.branchId,
        Number(row.inventoryCount || 0),
      ]),
    );
    const transactionMap = new Map(
      transactionStats.map((row) => [
        row.branchId,
        {
          salesAmount: Number(row.salesAmount || 0),
          salesCount: Number(row.salesCount || 0),
          pendingDebtAmount: Number(row.pendingDebtAmount || 0),
        },
      ]),
    );

    const branchSummaries = branches.map((branch) => ({
        id: branch.id,
        name: branch.name,
        location: branch.location,
        status: branch.status,
        createdAt: branch.createdAt,
        managerUser: branch.managerUser
          ? {
              id: branch.managerUser.id,
              name: branch.managerUser.name,
              email: branch.managerUser.email,
            }
          : null,
        staffCount: branchMemberships.filter(
          (membership) => membership.branchId === branch.id,
        ).length,
        inventoryCount: inventoryMap.get(branch.id) || 0,
        salesAmount: transactionMap.get(branch.id)?.salesAmount || 0,
        salesCount: transactionMap.get(branch.id)?.salesCount || 0,
        pendingDebtAmount:
          transactionMap.get(branch.id)?.pendingDebtAmount || 0,
      }));

    const workspaceMemberships = allMemberships.filter(
      (membership) => membership.workspaceId === workspace.id,
    );
    const memberIds = new Set(
      workspaceMemberships.map((membership) => membership.userId),
    );
    const memberSummaries = workspaceMemberships.map((membership) => {
      const staffRows = staffPerformance.filter(
        (row) => row.userId === membership.userId,
      );
      const totalSalesAmount = staffRows.reduce(
        (sum, row) => sum + Number(row.salesAmount || 0),
        0,
      );
      const totalSalesCount = staffRows.reduce(
        (sum, row) => sum + Number(row.salesCount || 0),
        0,
      );
      return {
        id: membership.user.id,
        name: membership.user.name,
        email: membership.user.email,
        phone: membership.user.phone,
        isActive: membership.user.isActive && membership.isActive,
        role: this.getEffectiveWorkspaceRole(membership),
        salesAmount: totalSalesAmount,
        salesCount: totalSalesCount,
      };
    });

    const totals = branchSummaries.reduce(
      (acc, item) => {
        acc.staffCount += Number(item.staffCount || 0);
        acc.inventoryCount += Number(item.inventoryCount || 0);
        acc.salesAmount += Number(item.salesAmount || 0);
        acc.salesCount += Number(item.salesCount || 0);
        acc.pendingDebtAmount += Number(item.pendingDebtAmount || 0);
        return acc;
      },
      {
        branchCount: branchSummaries.length,
        staffCount: 0,
        inventoryCount: 0,
        salesAmount: 0,
        salesCount: 0,
        pendingDebtAmount: 0,
      },
    );

    return {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        status: workspace.status,
        managerUser: workspace.managerUser
          ? {
              id: workspace.managerUser.id,
              name: workspace.managerUser.name,
              email: workspace.managerUser.email,
            }
          : null,
      },
      totals,
      members: memberSummaries,
      pendingInvites: pendingInvites.map((invite) => ({
        id: invite.id,
        email: invite.email,
        role: this.normalizeWorkspaceRole(invite.role),
        branchId: invite.branchId || null,
        branchName: invite.branch?.name || null,
        branchRole: invite.branchRole
          ? this.normalizeBranchRole(invite.branchRole)
          : invite.branchId
            ? this.normalizeBranchRole(invite.role)
            : null,
        status: invite.status,
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt,
      })),
      branches: branchSummaries,
      staffPerformance: staffPerformance
        .filter((row) => memberIds.has(row.userId))
        .map((row) => ({
          userId: row.userId,
          name: row.name,
          email: row.email,
          branchId: row.branchId,
          branchName: row.branchName,
          salesAmount: Number(row.salesAmount || 0),
          salesCount: Number(row.salesCount || 0),
        })),
    };
  }

  async getBranchDetails(workspaceId: string, branchId: string, requesterId: string) {
    await this.branchAccessService.assertWorkspaceOwnerLike(workspaceId, requesterId);

    const branch = await this.getBranch(workspaceId, branchId, requesterId);
    const inventoryCount = await this.inventoryRepository.count({
      where: { workspaceId, branchId },
    });
    const customerCount = await this.customersRepository.count({
      where: { workspaceId, branchId },
    });
    const transactions = await this.transactionsRepository.find({
      where: { workspaceId, branchId },
      order: { createdAt: 'DESC' },
      take: 20,
    });

    const sales = transactions.filter((item) => item.type === 'sale');
    const debts = transactions.filter((item) => item.type === 'debt');

    return {
      branch,
      metrics: {
        inventoryCount,
        customerCount,
        salesCount: sales.length,
        salesAmount: sales.reduce(
          (sum, item) => sum + Number(item.totalAmount || 0),
          0,
        ),
        pendingDebtAmount: debts
          .filter((item) => item.status === 'pending')
          .reduce((sum, item) => sum + Number(item.totalAmount || 0), 0),
      },
      recentTransactions: transactions,
    };
  }

  async findWorkspaceUserByEmail(
    workspaceId: string,
    requesterId: string,
    email: string,
  ) {
    const normalizedEmail = email?.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new BadRequestException('Email is required');
    }
    await this.assertWorkspaceManagerAccess(workspaceId, requesterId);

    const foundUser = await this.usersRepository.findOne({
      where: { email: normalizedEmail },
    });
    if (!foundUser) {
      throw new NotFoundException('User not found');
    }

    const existingMembership = await this.membershipsRepository.findOne({
      where: { workspaceId, userId: foundUser.id, isActive: true },
    });
    const alreadyMember = !!existingMembership;

    return {
      id: foundUser.id,
      name: foundUser.name,
      email: foundUser.email,
      role: existingMembership?.role || 'staff',
      alreadyMember,
    };
  }

  async addUserToWorkspace(
    workspaceId: string,
    userId: string,
    requesterId: string,
  ) {
    const { workspace } = await this.assertWorkspaceManagerAccess(
      workspaceId,
      requesterId,
    );
    const user = await this.usersRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existingMembership = await this.membershipsRepository.findOne({
      where: { workspaceId, userId },
    });
    if (existingMembership?.isActive) {
      throw new BadRequestException('User already belongs to this workspace');
    }

    await this.createOrUpdateMembership(workspaceId, userId, 'staff');
    return this.getWorkspace(workspace.id, requesterId);
  }

  async removeUserFromWorkspace(
    workspaceId: string,
    userId: string,
    requesterId: string,
  ) {
    const { workspace } = await this.assertWorkspaceManagerAccess(
      workspaceId,
      requesterId,
    );
    if (workspace.createdBy?.id === userId) {
      throw new BadRequestException('You cannot revoke the workspace owner');
    }
    if (workspace.managerUserId === userId) {
      workspace.managerUserId = null;
      workspace.managerUser = null;
      await this.workspacesRepository.save(workspace);
    }
    const membership = await this.membershipsRepository.findOne({
      where: { workspaceId, userId },
    });
    if (!membership || !membership.isActive) {
      throw new BadRequestException('User does not belong to this workspace');
    }
    membership.isActive = false;
    await this.membershipsRepository.save(membership);
    return { removed: true, workspaceId, userId };
  }

  async updateWorkspaceUserRole(
    workspaceId: string,
    userId: string,
    requesterId: string,
    role: 'manager' | 'staff' | 'owner',
  ) {
    const {
      workspace,
      membership: requesterMembership,
      parentMembership,
      requester,
    } = await this.assertWorkspaceManagerAccess(workspaceId, requesterId);
    const targetMembership = await this.membershipsRepository.findOne({
      where: { workspaceId, userId, isActive: true },
      relations: ['user'],
    });
    if (!targetMembership) {
      throw new BadRequestException('User does not belong to this workspace');
    }

    if (workspace.createdBy?.id === userId) {
      throw new BadRequestException(
        'Workspace owner role cannot be changed here',
      );
    }

    const normalizedRole = this.normalizeWorkspaceRole(role);
    const requesterRole = ['admin', 'super_admin'].includes(requester.role)
      ? 'owner'
      : this.getEffectiveWorkspaceRole(requesterMembership || parentMembership);
    this.assertRoleCanBeAssigned(requesterRole, normalizedRole);

    targetMembership.role = normalizedRole;
    if (normalizedRole === 'manager') {
      workspace.managerUserId = targetMembership.user.id;
      workspace.managerUser = targetMembership.user;
    } else {
      if (workspace.managerUserId === targetMembership.user.id) {
        workspace.managerUserId = null;
        workspace.managerUser = null;
      }
    }

    await this.membershipsRepository.save(targetMembership);
    await this.workspacesRepository.save(workspace);

    return {
      updated: true,
      userId: targetMembership.user.id,
      role: normalizedRole,
      workspaceId: workspace.id,
    };
  }

  async getPendingInvitesForUser(userId: string) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const invites = await this.invitesRepository.find({
      where: { email: user.email.toLowerCase(), status: 'pending' },
      relations: ['workspace', 'branch'],
      order: { createdAt: 'DESC' },
    });

    const results: Array<{
      id: string;
      workspaceId: string;
      workspaceName: string;
      branchId: string | null;
      branchName: string | null;
      branchRole: 'manager' | 'staff' | null;
      role: 'owner' | 'manager' | 'staff';
      status: 'pending' | 'accepted' | 'declined' | 'expired';
      createdAt: Date;
      expiresAt: Date | null;
      alreadyMember: boolean;
    }> = [];

    for (const invite of invites) {
      if (this.isInviteExpired(invite)) {
        invite.status = 'expired';
        await this.invitesRepository.save(invite);
        continue;
      }

      const activeMembership = await this.membershipsRepository.findOne({
        where: { workspaceId: invite.workspaceId, userId, isActive: true },
      });

      results.push({
        id: invite.id,
        workspaceId: invite.workspaceId,
        workspaceName: invite.workspace?.name || 'Workspace',
        branchId: invite.branchId || null,
        branchName: invite.branch?.name || null,
        branchRole: invite.branchId
          ? this.normalizeBranchRole(invite.branchRole || invite.role)
          : null,
        role: this.normalizeWorkspaceRole(invite.role),
        status: invite.status,
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt,
        alreadyMember: !!activeMembership,
      });
    }

    return results;
  }

  async acceptInvite(
    userId: string,
    payload: { inviteId: string; code: string },
  ) {
    const inviteId = payload?.inviteId?.trim();
    const code = payload?.code?.trim();

    if (!inviteId || !code) {
      throw new BadRequestException('Invite ID and code are required');
    }

    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const invite = await this.invitesRepository.findOne({
      where: { id: inviteId },
      relations: ['workspace'],
    });

    if (!invite) {
      throw new NotFoundException('Invite not found');
    }

    if (invite.email?.toLowerCase() !== user.email?.toLowerCase()) {
      throw new ForbiddenException(
        'This invite does not belong to your account',
      );
    }

    if (invite.status !== 'pending') {
      throw new BadRequestException('This invite is no longer pending');
    }

    if (this.isInviteExpired(invite)) {
      invite.status = 'expired';
      await this.invitesRepository.save(invite);
      throw new BadRequestException('This invite has expired');
    }

    if (invite.inviteCode !== code) {
      throw new BadRequestException('Invalid invite code');
    }

    const existingMembership = await this.membershipsRepository.findOne({
      where: { workspaceId: invite.workspaceId, userId },
    });

    if (existingMembership?.isActive) {
      const branchAssignment = await this.applyInviteBranchAssignment(
        invite,
        userId,
      );
      invite.status = 'accepted';
      invite.userId = userId;
      invite.acceptedAt = new Date();
      await this.invitesRepository.save(invite);
      return {
        accepted: true,
        alreadyMember: true,
        branchAssignment,
        workspace: await this.getWorkspace(invite.workspaceId, userId),
      };
    }

    await this.createOrUpdateMembership(
      invite.workspaceId,
      userId,
      this.normalizeWorkspaceRole(invite.role),
    );

    const branchAssignment = await this.applyInviteBranchAssignment(
      invite,
      userId,
    );

    invite.status = 'accepted';
    invite.userId = userId;
    invite.acceptedAt = new Date();
    await this.invitesRepository.save(invite);

    return {
      accepted: true,
      alreadyMember: false,
      branchAssignment,
      workspace: await this.getWorkspace(invite.workspaceId, userId),
    };
  }

  async inviteUser(
    workspaceId: string,
    requesterId: string,
    inviteDto: {
      email: string;
      role?: string;
      branchId?: string;
      branchRole?: 'manager' | 'staff';
      permissions?: BranchPermissionKey[];
    },
  ) {
    const normalizedEmail = inviteDto.email?.trim().toLowerCase();
    if (!normalizedEmail) {
      throw new BadRequestException('Email is required');
    }
    const { workspace, membership, parentMembership, requester } =
      await this.assertWorkspaceManagerAccess(workspaceId, requesterId);
    const inviteRole = this.normalizeWorkspaceRole(inviteDto.role);
    const requesterRole = ['admin', 'super_admin'].includes(requester.role)
      ? 'owner'
      : this.getEffectiveWorkspaceRole(membership || parentMembership);
    this.assertRoleCanBeAssigned(requesterRole, inviteRole);
    const branch = await this.getBranchForInvite(workspaceId, inviteDto.branchId);
    const branchRole = branch
      ? this.normalizeBranchRole(inviteDto.branchRole || inviteRole)
      : null;
    const branchPermissions = branch
      ? this.branchAccessService.normalizePermissions(
          branchRole || 'staff',
          inviteDto.permissions,
        )
      : null;

    const user = await this.usersRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (user) {
      const existingMembership = await this.membershipsRepository.findOne({
        where: { workspaceId, userId: user.id, isActive: true },
      });

      if (existingMembership) {
        await this.createOrUpdateMembership(workspaceId, user.id, inviteRole);

        if (branch && branchRole) {
          await this.branchAccessService.createOrUpdateBranchMembership(
            branch.id,
            user.id,
            branchRole,
            branchPermissions || undefined,
          );

          if (branchRole === 'manager') {
            await this.branchesRepository.update(
              { id: branch.id, workspaceId },
              { managerUserId: user.id },
            );
          }
        }

        return {
          invited: false,
          email: normalizedEmail,
          workspaceId,
          alreadyMember: true,
          assignedToBranch: !!branch,
          branchId: branch?.id || null,
          branchRole,
        };
      }
    }

    const inviteCode = this.generateInviteCode();
    const expiresAt = this.getInviteExpiryDate();
    const existingPendingInvite = await this.invitesRepository.findOne({
      where: { workspaceId, email: normalizedEmail, status: 'pending' },
      order: { createdAt: 'DESC' },
    });

    const invite =
      existingPendingInvite || this.invitesRepository.create({ workspaceId });
    invite.email = normalizedEmail;
    invite.userId = user?.id || null;
    invite.workspaceId = workspaceId;
    invite.status = 'pending';
    invite.role = inviteRole;
    invite.branchId = branch?.id || null;
    invite.branchRole = branchRole;
    invite.branchPermissions = branchPermissions;
    invite.inviteCode = inviteCode;
    invite.expiresAt = expiresAt;
    invite.acceptedAt = null;
    await this.invitesRepository.save(invite);

    const emailReadiness = this.emailService.getDeliveryReadiness();
    let delivery: 'queued' | 'manual_code_required' = 'queued';

    if (emailReadiness.canSend) {
      this.emailQueueService.enqueue({
        to: normalizedEmail,
        subject: `Invitation to join workspace '${workspace.name}'`,
        text: `You have been invited to join workspace '${workspace.name}' as ${inviteRole}.${branch ? ` You will also be added to branch '${branch.name}' as ${branchRole}.` : ''} Your invite code is ${inviteCode}. This code expires in ${this.inviteExpiryDays} days. Sign in to BizRecord and enter the code to accept.`,
        html: `<p>You have been invited to join workspace '<b>${workspace.name}</b>' as <b>${inviteRole}</b>.</p>${branch ? `<p>Once accepted, you will also be added to branch '<b>${branch.name}</b>' as <b>${branchRole}</b>.</p>` : ''}<p>Your invite code is <b>${inviteCode}</b>.</p><p>This code expires on <b>${expiresAt.toDateString()}</b>.</p><p>Sign in to BizRecord and enter the code to accept the invite.</p>`,
      });
    } else {
      delivery = 'manual_code_required';
    }

    return {
      invited: true,
      email: normalizedEmail,
      workspaceId,
      inviteId: invite.id,
      branchId: branch?.id || null,
      branchRole,
      expiresAt,
      delivery,
      inviteCode: delivery === 'manual_code_required' ? inviteCode : undefined,
      deliveryWarning:
        delivery === 'manual_code_required' ? emailReadiness.reason : undefined,
    };
  }
}
