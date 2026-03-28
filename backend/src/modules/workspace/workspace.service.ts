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
    @InjectRepository(Transaction)
    private transactionsRepository: Repository<Transaction>,
    @InjectRepository(InventoryItem)
    private inventoryRepository: Repository<InventoryItem>,
    private billingService: BillingService,
    private readonly emailQueueService: EmailQueueService,
    private readonly emailService: EmailService,
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

  private getInviteExpiryDate() {
    return new Date(Date.now() + this.inviteExpiryDays * 24 * 60 * 60 * 1000);
  }

  private isInviteExpired(invite?: WorkspaceInvite | null) {
    return !!invite?.expiresAt && invite.expiresAt.getTime() <= Date.now();
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

    let managerUser: User | null = null;

    if (createWorkspaceDto.parentWorkspaceId) {
      const parentWorkspace = await this.workspacesRepository.findOne({
        where: { id: createWorkspaceDto.parentWorkspaceId },
      });

      if (!parentWorkspace) {
        throw new NotFoundException('Parent workspace not found');
      }

      const parentMembership = await this.getMembership(
        createWorkspaceDto.parentWorkspaceId,
        userId,
      );
      const canManageParent =
        this.getEffectiveWorkspaceRole(parentMembership) === 'owner' ||
        ['admin', 'super_admin'].includes(user.role);

      if (!canManageParent) {
        throw new BadRequestException(
          'You are not allowed to create a branch for this workspace',
        );
      }

      if (createWorkspaceDto.managerUserId) {
        managerUser = await this.usersRepository.findOne({
          where: { id: createWorkspaceDto.managerUserId },
        });
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
    });

    const saved = await this.workspacesRepository.save(workspace);
    await this.createOrUpdateMembership(saved.id, user.id, 'owner');
    if (managerUser && managerUser.id !== user.id) {
      await this.createOrUpdateMembership(saved.id, managerUser.id, 'manager');
    }

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

    return memberships.map((membership) => ({
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

  async getBranches(workspaceId: string, userId: string) {
    await this.assertWorkspaceManagerAccess(workspaceId, userId);

    const branches = await this.workspacesRepository.find({
      where: { parentWorkspaceId: workspaceId },
      relations: ['createdBy', 'managerUser'],
      order: { createdAt: 'DESC' },
    });

    const branchIds = branches.map((branch) => branch.id);
    const branchMemberships =
      branchIds.length > 0
        ? await this.membershipsRepository.find({
            where: branchIds.map((branchId) => ({
              workspaceId: branchId,
              isActive: true,
            })),
            relations: ['user'],
          })
        : [];

    return branches.map((branch) => ({
      ...branch,
      users: branchMemberships
        .filter((membership) => membership.workspaceId === branch.id)
        .map((membership) => ({
          id: membership.user.id,
          name: membership.user.name,
          email: membership.user.email,
          role: membership.role,
        })),
    }));
  }

  async getManagementOverview(workspaceId: string, requesterId: string) {
    const { workspace } = await this.assertWorkspaceManagerAccess(
      workspaceId,
      requesterId,
    );

    const branchEntities = await this.workspacesRepository.find({
      where: [{ id: workspaceId }, { parentWorkspaceId: workspaceId }],
      relations: ['createdBy', 'managerUser'],
      order: { createdAt: 'DESC' },
    });

    const allMemberships = await this.membershipsRepository.find({
      where: branchEntities.map((item) => ({
        workspaceId: item.id,
        isActive: true,
      })),
      relations: ['user'],
    });

    const workspaceIds = branchEntities.map((item) => item.id);
    const inventoryCounts = await this.inventoryRepository
      .createQueryBuilder('item')
      .select('item.workspace_id', 'workspaceId')
      .addSelect('COUNT(*)', 'inventoryCount')
      .where('item.workspace_id IN (:...workspaceIds)', { workspaceIds })
      .groupBy('item.workspace_id')
      .getRawMany();

    const transactionStats = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .select('transaction.workspace_id', 'workspaceId')
      .addSelect(
        "SUM(CASE WHEN transaction.type = 'sale' THEN transaction.totalAmount ELSE 0 END)",
        'salesAmount',
      )
      .addSelect(
        "SUM(CASE WHEN transaction.type = 'sale' THEN 1 ELSE 0 END)",
        'salesCount',
      )
      .addSelect(
        "SUM(CASE WHEN transaction.type = 'debt' AND transaction.status = 'pending' THEN transaction.totalAmount ELSE 0 END)",
        'pendingDebtAmount',
      )
      .where('transaction.workspace_id IN (:...workspaceIds)', { workspaceIds })
      .groupBy('transaction.workspace_id')
      .getRawMany();

    const staffPerformance = await this.transactionsRepository
      .createQueryBuilder('transaction')
      .leftJoin('transaction.createdBy', 'createdBy')
      .leftJoin('transaction.workspace', 'workspace')
      .select('createdBy.id', 'userId')
      .addSelect('createdBy.name', 'name')
      .addSelect('createdBy.email', 'email')
      .addSelect('workspace.id', 'workspaceId')
      .addSelect('workspace.name', 'workspaceName')
      .addSelect(
        "SUM(CASE WHEN transaction.type = 'sale' THEN transaction.totalAmount ELSE 0 END)",
        'salesAmount',
      )
      .addSelect(
        "SUM(CASE WHEN transaction.type = 'sale' THEN 1 ELSE 0 END)",
        'salesCount',
      )
      .where('transaction.workspace_id IN (:...workspaceIds)', { workspaceIds })
      .groupBy('createdBy.id')
      .addGroupBy('createdBy.name')
      .addGroupBy('createdBy.email')
      .addGroupBy('workspace.id')
      .addGroupBy('workspace.name')
      .orderBy(
        "SUM(CASE WHEN transaction.type = 'sale' THEN transaction.totalAmount ELSE 0 END)",
        'DESC',
      )
      .getRawMany();

    const pendingInvites = await this.invitesRepository.find({
      where: { workspaceId, status: 'pending' },
      order: { createdAt: 'DESC' },
    });

    const inventoryMap = new Map(
      inventoryCounts.map((row) => [
        row.workspaceId,
        Number(row.inventoryCount || 0),
      ]),
    );
    const transactionMap = new Map(
      transactionStats.map((row) => [
        row.workspaceId,
        {
          salesAmount: Number(row.salesAmount || 0),
          salesCount: Number(row.salesCount || 0),
          pendingDebtAmount: Number(row.pendingDebtAmount || 0),
        },
      ]),
    );

    const rootWorkspace =
      branchEntities.find((item) => item.id === workspaceId) || workspace;
    const branchSummaries = branchEntities
      .filter((item) => item.id !== workspaceId)
      .map((branch) => ({
        id: branch.id,
        name: branch.name,
        status: branch.status,
        createdAt: branch.createdAt,
        managerUser: branch.managerUser
          ? {
              id: branch.managerUser.id,
              name: branch.managerUser.name,
              email: branch.managerUser.email,
            }
          : null,
        staffCount: allMemberships.filter(
          (membership) => membership.workspaceId === branch.id,
        ).length,
        inventoryCount: inventoryMap.get(branch.id) || 0,
        salesAmount: transactionMap.get(branch.id)?.salesAmount || 0,
        salesCount: transactionMap.get(branch.id)?.salesCount || 0,
        pendingDebtAmount:
          transactionMap.get(branch.id)?.pendingDebtAmount || 0,
      }));

    const workspaceMemberships = allMemberships.filter(
      (membership) => membership.workspaceId === rootWorkspace.id,
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

    const totals = branchEntities.reduce(
      (acc, item) => {
        acc.staffCount += allMemberships.filter(
          (membership) => membership.workspaceId === item.id,
        ).length;
        acc.inventoryCount += inventoryMap.get(item.id) || 0;
        acc.salesAmount += transactionMap.get(item.id)?.salesAmount || 0;
        acc.salesCount += transactionMap.get(item.id)?.salesCount || 0;
        acc.pendingDebtAmount +=
          transactionMap.get(item.id)?.pendingDebtAmount || 0;
        return acc;
      },
      {
        branchCount: Math.max(0, branchEntities.length - 1),
        staffCount: 0,
        inventoryCount: 0,
        salesAmount: 0,
        salesCount: 0,
        pendingDebtAmount: 0,
      },
    );

    return {
      workspace: {
        id: rootWorkspace.id,
        name: rootWorkspace.name,
        status: rootWorkspace.status,
        managerUser: rootWorkspace.managerUser
          ? {
              id: rootWorkspace.managerUser.id,
              name: rootWorkspace.managerUser.name,
              email: rootWorkspace.managerUser.email,
            }
          : null,
      },
      totals,
      members: memberSummaries,
      pendingInvites: pendingInvites.map((invite) => ({
        id: invite.id,
        email: invite.email,
        role: this.normalizeWorkspaceRole(invite.role),
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
          workspaceId: row.workspaceId,
          workspaceName: row.workspaceName,
          salesAmount: Number(row.salesAmount || 0),
          salesCount: Number(row.salesCount || 0),
        })),
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
      relations: ['workspace'],
      order: { createdAt: 'DESC' },
    });

    const results: Array<{
      id: string;
      workspaceId: string;
      workspaceName: string;
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
      invite.status = 'accepted';
      invite.userId = userId;
      invite.acceptedAt = new Date();
      await this.invitesRepository.save(invite);
      return {
        accepted: true,
        alreadyMember: true,
        workspace: await this.getWorkspace(invite.workspaceId, userId),
      };
    }

    await this.createOrUpdateMembership(
      invite.workspaceId,
      userId,
      this.normalizeWorkspaceRole(invite.role),
    );

    invite.status = 'accepted';
    invite.userId = userId;
    invite.acceptedAt = new Date();
    await this.invitesRepository.save(invite);

    return {
      accepted: true,
      alreadyMember: false,
      workspace: await this.getWorkspace(invite.workspaceId, userId),
    };
  }

  async inviteUser(
    workspaceId: string,
    requesterId: string,
    inviteDto: { email: string; role?: string },
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
    const existingPendingInvite = await this.invitesRepository.findOne({
      where: { workspaceId, email: normalizedEmail, status: 'pending' },
      order: { createdAt: 'DESC' },
    });
    if (existingPendingInvite && !this.isInviteExpired(existingPendingInvite)) {
      throw new BadRequestException(
        'A pending invite already exists for this email',
      );
    }
    if (existingPendingInvite && this.isInviteExpired(existingPendingInvite)) {
      existingPendingInvite.status = 'expired';
      await this.invitesRepository.save(existingPendingInvite);
    }

    // Check if user exists
    const user = await this.usersRepository.findOne({
      where: { email: normalizedEmail },
    });
    let alreadyMember = false;
    if (user) {
      const membership = await this.membershipsRepository.findOne({
        where: { workspaceId, userId: user.id, isActive: true },
      });
      alreadyMember = !!membership;
    }
    if (alreadyMember) {
      throw new BadRequestException('User already belongs to this workspace');
    }
    // Create invite record
    const inviteCode = this.generateInviteCode();
    const expiresAt = this.getInviteExpiryDate();
    const invite = this.invitesRepository.create({
      email: normalizedEmail,
      userId: user?.id || null,
      workspaceId,
      status: 'pending',
      role: inviteRole,
      inviteCode,
      expiresAt,
      acceptedAt: null,
    });
    await this.invitesRepository.save(invite);
    // Send invite email
    const emailReadiness = this.emailService.getDeliveryReadiness();
    let delivery: 'queued' | 'manual_code_required' = 'queued';

    if (emailReadiness.canSend) {
      this.emailQueueService.enqueue({
        to: normalizedEmail,
        subject: `Invitation to join workspace '${workspace.name}'`,
        text: `You have been invited to join workspace '${workspace.name}' as ${inviteRole}. Your invite code is ${inviteCode}. This code expires in ${this.inviteExpiryDays} days. Sign in to BizRecord and enter the code to accept.`,
        html: `<p>You have been invited to join workspace '<b>${workspace.name}</b>' as <b>${inviteRole}</b>.</p><p>Your invite code is <b>${inviteCode}</b>.</p><p>This code expires on <b>${expiresAt.toDateString()}</b>.</p><p>Sign in to BizRecord and enter the code to accept the invite.</p>`,
      });
    } else {
      delivery = 'manual_code_required';
    }

    return {
      invited: true,
      email: normalizedEmail,
      workspaceId,
      inviteId: invite.id,
      expiresAt,
      delivery,
      inviteCode: delivery === 'manual_code_required' ? inviteCode : undefined,
      deliveryWarning:
        delivery === 'manual_code_required' ? emailReadiness.reason : undefined,
    };
  }
}
