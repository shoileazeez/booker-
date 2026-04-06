import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { isUUID } from 'class-validator';
import { Transaction } from './entities/transaction.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { User } from '../auth/entities/user.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { Branch } from '../workspace/entities/branch.entity';
import { BranchAccessService } from '../workspace/branch-access.service';
import { AuditLogService } from '../workspace/audit-log.service';

import { ReceiptService } from './receipt.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private transactionsRepository: Repository<Transaction>,
    @InjectRepository(Workspace)
    private workspacesRepository: Repository<Workspace>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(InventoryItem)
    private itemsRepository: Repository<InventoryItem>,
    @InjectRepository(Branch)
    private branchesRepository: Repository<Branch>,
    private receiptService: ReceiptService,
    private readonly branchAccessService: BranchAccessService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private async assertTransactionScope(
    workspaceId: string,
    branchId: string | null,
    userId: string,
    permission:
      | 'sales.view'
      | 'sales.create'
      | 'debts.view'
      | 'debts.manage'
      | 'inventory.manage'
      | 'reports.view',
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
        user: access.user,
      };
    }

    const ownerAccess = await this.branchAccessService.assertWorkspaceOwnerLike(
      workspaceId,
      userId,
    );
    return {
      workspace: ownerAccess.workspace,
      branch: null,
      user: ownerAccess.user,
    };
  }

  async createTransaction(
    createTransactionDto: CreateTransactionDto,
    workspaceId: string,
    branchId: string | null,
    userId: string,
  ) {
    const normalizedType = String(createTransactionDto.type || '').toLowerCase();
    const minimumRole =
      normalizedType === 'sale' ? 'staff' : 'manager';
    const permission =
      normalizedType === 'sale'
        ? 'sales.create'
        : normalizedType === 'debt'
          ? 'debts.manage'
          : 'inventory.manage';
    const { branch, user, workspace } = await this.assertTransactionScope(
      workspaceId,
      branchId,
      userId,
      permission,
    );

    let item: InventoryItem | null = null;
    let quantity = Number(createTransactionDto.quantity || 0);
    let unitPrice = Number(createTransactionDto.unitPrice || 0);
    let totalAmount = Number(createTransactionDto.totalAmount || 0);
    let discountAmount = Number(createTransactionDto.discountAmount || 0);
    const isInventoryReducingTransaction =
      normalizedType === 'sale' || normalizedType === 'debt';

    if (isInventoryReducingTransaction) {
      if (!createTransactionDto.itemId) {
        throw new BadRequestException(
          'itemId is required for stock-based sale and debt transactions',
        );
      }
      if (!isUUID(createTransactionDto.itemId)) {
        throw new BadRequestException(
          'itemId must be a valid inventory item id',
        );
      }

      item = await this.itemsRepository.findOne({
        where: branchId
          ? {
              id: createTransactionDto.itemId,
              workspaceId,
              branchId,
            }
          : {
              id: createTransactionDto.itemId,
              workspaceId,
              branchId: IsNull(),
            },
        relations: ['workspace', 'branch'],
      });

      if (!item) {
        throw new NotFoundException(
          'Selected item not found in this workspace',
        );
      }

      quantity = Number(createTransactionDto.quantity || 0);
      if (!quantity || quantity <= 0) {
        throw new BadRequestException('quantity must be greater than zero');
      }

      const currentStock = Number(item.quantity || 0);
      if (quantity > currentStock) {
        throw new BadRequestException(
          `Insufficient stock. Available: ${currentStock}`,
        );
      }

      unitPrice = Number(
        createTransactionDto.unitPrice || item.sellingPrice || 0,
      );
      const grossAmount = unitPrice * quantity;

      if (discountAmount < 0) {
        throw new BadRequestException('discountAmount cannot be negative');
      }
      if (discountAmount > grossAmount) {
        throw new BadRequestException(
          `discountAmount cannot exceed gross amount (${grossAmount})`,
        );
      }

      totalAmount =
        discountAmount > 0
          ? grossAmount - discountAmount
          : Number(createTransactionDto.totalAmount || 0) > 0
            ? Number(createTransactionDto.totalAmount)
            : grossAmount;

      if (totalAmount < 0) {
        throw new BadRequestException('totalAmount cannot be negative');
      }

      item.quantity = Number((currentStock - quantity).toFixed(2));
      await this.itemsRepository.save(item);
    }

    let transaction: Transaction = this.transactionsRepository.create({
      type: createTransactionDto.type,
      referenceNumber: createTransactionDto.referenceNumber,
      item: item || undefined,
      quantity,
      unitPrice,
      totalAmount,
      discountAmount,
      category: createTransactionDto.category,
      paymentMethod: createTransactionDto.paymentMethod,
      status: createTransactionDto.status || 'pending',
      customerName: createTransactionDto.customerName,
      phone: createTransactionDto.phone,
      notes: createTransactionDto.notes,
      ...(createTransactionDto.dueDate && {
        dueDate: new Date(createTransactionDto.dueDate),
      }),
      workspace,
      workspaceId,
      branch: branch || undefined,
      branchId: branch?.id || null,
      createdBy: user,
    });

    transaction = await this.transactionsRepository.save(transaction);

    // Generate and upload receipt for sales
    if (transaction && (transaction.type === 'sale' || transaction.type === 'debt')) {
      try {
        const receiptUrl =
          await this.receiptService.generateAndUploadReceipt(transaction);
        transaction.receiptUrl = receiptUrl;
        await this.transactionsRepository.save(transaction);
      } catch {
        // Optionally log error, but don't block transaction creation
      }
    }
    await this.auditLogService.log({
      workspaceId,
      branchId: branchId || undefined,
      actorUserId: userId,
      action: `transaction.create.${transaction.type}`,
      entityType: 'transaction',
      entityId: transaction.id,
      metadata: {
        type: transaction.type,
        totalAmount: transaction.totalAmount,
        status: transaction.status,
      },
    });
    return transaction;
  }

  async getTransactions(
    workspaceId: string,
    branchId: string | null,
    userId: string,
    skip = 0,
    take = 20,
    type?: string,
  ) {
    await this.assertTransactionScope(
      workspaceId,
      branchId,
      userId,
      type === 'debt' ? 'debts.view' : 'sales.view',
    );
    const query = this.transactionsRepository
      .createQueryBuilder('transaction')
      .where('transaction.workspace_id = :workspaceId', { workspaceId });

    if (branchId) {
      query.andWhere('transaction.branch_id = :branchId', { branchId });
    } else {
      query.andWhere('transaction.branch_id IS NULL');
    }

    if (type) {
      query.andWhere('transaction.type = :type', { type });
    }

    return await query
      .orderBy('transaction.createdAt', 'DESC')
      .skip(skip)
      .take(take)
      .getMany();
  }

  async getTransaction(
    workspaceId: string,
    branchId: string | null,
    transactionId: string,
    userId: string,
  ) {
    await this.assertTransactionScope(workspaceId, branchId, userId, 'sales.view');
    const transaction = await this.transactionsRepository.findOne({
      where: branchId
        ? { id: transactionId, workspaceId, branchId }
        : { id: transactionId, workspaceId, branchId: IsNull() },
      relations: ['workspace', 'branch', 'createdBy', 'item'],
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return transaction;
  }

  async updateTransactionStatus(
    workspaceId: string,
    branchId: string | null,
    transactionId: string,
    status: 'pending' | 'completed' | 'cancelled',
    userId: string,
  ) {
    await this.assertTransactionScope(
      workspaceId,
      branchId,
      userId,
      'debts.manage',
    );
    const transaction = await this.getTransaction(
      workspaceId,
      branchId,
      transactionId,
      userId,
    );
    transaction.status = status;
    const saved = await this.transactionsRepository.save(transaction);
    await this.auditLogService.log({
      workspaceId,
      branchId: branchId || undefined,
      actorUserId: userId,
      action: 'transaction.status.update',
      entityType: 'transaction',
      entityId: transactionId,
      metadata: { status },
    });
    return saved;
  }

  async getSummary(
    workspaceId: string,
    branchId: string | null,
    userId: string,
    startDate: Date,
    endDate: Date,
  ) {
    await this.assertTransactionScope(workspaceId, branchId, userId, 'reports.view');
    const transactions = await this.transactionsRepository.find({
      where: branchId
        ? {
            workspaceId,
            branchId,
          }
        : {
            workspaceId,
            branchId: IsNull(),
          },
      relations: ['item'],
    });

    const filteredByDate = transactions.filter(
      (t) =>
        new Date(t.createdAt) >= startDate && new Date(t.createdAt) <= endDate,
    );

    const sales = filteredByDate
      .filter((t) => t.type === 'sale')
      .reduce((sum, t) => sum + parseFloat(t.totalAmount.toString()), 0);

    const expenses = filteredByDate
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + parseFloat(t.totalAmount.toString()), 0);

    const purchases = filteredByDate
      .filter((t) => t.type === 'purchase')
      .reduce((sum, t) => sum + parseFloat(t.totalAmount.toString()), 0);

    return {
      totalSales: sales,
      totalExpenses: expenses,
      totalPurchases: purchases,
      profit: sales - expenses - purchases,
      transactionCount: filteredByDate.length,
    };
  }
}
