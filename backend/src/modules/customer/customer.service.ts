import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Customer } from './customer.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { Branch } from '../workspace/entities/branch.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { BranchAccessService } from '../workspace/branch-access.service';
import { AuditLogService } from '../workspace/audit-log.service';

@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(Customer)
    private customerRepository: Repository<Customer>,
    @InjectRepository(Workspace)
    private workspaceRepository: Repository<Workspace>,
    @InjectRepository(Branch)
    private branchRepository: Repository<Branch>,
    private readonly branchAccessService: BranchAccessService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private async assertCustomerScope(
    workspaceId: string,
    branchId: string | null,
    userId: string,
    permission: 'customers.view' | 'customers.manage',
  ) {
    if (branchId) {
      const access = await this.branchAccessService.assertBranchPermission(
        workspaceId,
        branchId,
        userId,
        permission,
      );
      return {
        workspace: access.branch.workspace,
        branch: access.branch,
      };
    }

    const { workspace } =
      await this.branchAccessService.assertWorkspaceOwnerLike(
        workspaceId,
        userId,
      );
    return {
      workspace,
      branch: null,
    };
  }

  async create(
    workspaceId: string,
    branchId: string | null,
    userId: string,
    dto: CreateCustomerDto,
  ) {
    const { workspace, branch } = await this.assertCustomerScope(
      workspaceId,
      branchId,
      userId,
      'customers.manage',
    );
    const customer = this.customerRepository.create({
      ...dto,
      workspace,
      workspaceId,
      branch: branch || null,
      branchId: branch?.id || null,
    });
    const saved = await this.customerRepository.save(customer);
    await this.auditLogService.log({
      workspaceId,
      branchId: branchId || undefined,
      actorUserId: userId,
      action: 'customer.create',
      entityType: 'customer',
      entityId: saved.id,
      metadata: { name: saved.name },
    });
    return saved;
  }

  async findAll(
    workspaceId: string,
    branchId: string | null,
    userId: string,
    search?: string,
  ) {
    await this.assertCustomerScope(
      workspaceId,
      branchId,
      userId,
      'customers.view',
    );
    const qb = this.customerRepository
      .createQueryBuilder('customer')
      .where('customer.workspace_id = :workspaceId', { workspaceId });
    if (branchId) {
      qb.andWhere('customer.branch_id = :branchId', { branchId });
    } else {
      qb.andWhere('customer.branch_id IS NULL');
    }
    if (search) {
      qb.andWhere(
        '(customer.name ILIKE :search OR customer.email ILIKE :search OR customer.phone ILIKE :search)',
        { search: `%${search}%` },
      );
    }
    return qb.getMany();
  }

  async findOne(
    workspaceId: string,
    branchId: string | null,
    id: string,
    userId: string,
  ) {
    await this.assertCustomerScope(
      workspaceId,
      branchId,
      userId,
      'customers.view',
    );
    return this.customerRepository.findOne({
      where: branchId
        ? { id, workspaceId, branchId }
        : { id, workspaceId, branchId: IsNull() },
    });
  }

  async update(
    workspaceId: string,
    branchId: string | null,
    id: string,
    userId: string,
    dto: UpdateCustomerDto,
  ) {
    const customer = await this.findOne(workspaceId, branchId, id, userId);
    if (!customer) throw new NotFoundException('Customer not found');
    Object.assign(customer, dto);
    const saved = await this.customerRepository.save(customer);
    await this.auditLogService.log({
      workspaceId,
      branchId: branchId || undefined,
      actorUserId: userId,
      action: 'customer.update',
      entityType: 'customer',
      entityId: saved.id,
      metadata: dto,
    });
    return saved;
  }

  async remove(
    workspaceId: string,
    branchId: string | null,
    id: string,
    userId: string,
  ) {
    const customer = await this.findOne(workspaceId, branchId, id, userId);
    if (!customer) throw new NotFoundException('Customer not found');
    await this.customerRepository.remove(customer);
    await this.auditLogService.log({
      workspaceId,
      branchId: branchId || undefined,
      actorUserId: userId,
      action: 'customer.delete',
      entityType: 'customer',
      entityId: id,
      metadata: { name: customer.name },
    });
    return { deleted: true };
  }
}
