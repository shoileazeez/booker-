import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  async createTransaction(
    createTransactionDto: CreateTransactionDto,
    workspaceId: string,
    branchId: string,
    userId: string,
  ) {
    const normalizedType = String(createTransactionDto.type || '').toLowerCase();
    const minimumRole =
      normalizedType === 'sale' ? 'staff' : 'manager';
    if (normalizedType === 'sale') {
      await this.branchAccessService.assertBranchPermission(
        workspaceId,
        branchId,
        userId,
        'sales.create',
      );
    } else if (normalizedType === 'debt') {
      await this.branchAccessService.assertBranchPermission(
        workspaceId,
        branchId,
        userId,
        'debts.manage',
      );
    } else {
      await this.branchAccessService.assertBranchPermission(
        workspaceId,
        branchId,
        userId,
        'inventory.manage',
      );
    }
    const { branch, user } = await this.branchAccessService.assertBranchAccess(
      workspaceId,
      branchId,
      userId,
      { minimumRole },
    );
    const workspace = await this.workspacesRepository.findOne({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    let item: InventoryItem | null = null;
    let quantity = Number(createTransactionDto.quantity || 0);
    let unitPrice = Number(createTransactionDto.unitPrice || 0);
    let totalAmount = Number(createTransactionDto.totalAmount || 0);
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
        where: {
          id: createTransactionDto.itemId,
          workspaceId,
          branchId,
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
      totalAmount =
        Number(createTransactionDto.totalAmount || 0) > 0
          ? Number(createTransactionDto.totalAmount)
          : unitPrice * quantity;

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
      branch,
      branchId,
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
      branchId,
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
    branchId: string,
    userId: string,
    skip = 0,
    take = 20,
    type?: string,
  ) {
    if (type === 'debt') {
      await this.branchAccessService.assertBranchPermission(
        workspaceId,
        branchId,
        userId,
        'debts.view',
      );
    } else {
      await this.branchAccessService.assertBranchPermission(
        workspaceId,
        branchId,
        userId,
        'sales.view',
      );
    }
    const query = this.transactionsRepository
      .createQueryBuilder('transaction')
      .where('transaction.workspace_id = :workspaceId', { workspaceId })
      .andWhere('transaction.branch_id = :branchId', { branchId });

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
    branchId: string,
    transactionId: string,
    userId: string,
  ) {
    await this.branchAccessService.assertBranchPermission(
      workspaceId,
      branchId,
      userId,
      'sales.view',
    );
    const transaction = await this.transactionsRepository.findOne({
      where: { id: transactionId, workspaceId, branchId },
      relations: ['workspace', 'branch', 'createdBy', 'item'],
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return transaction;
  }

  async updateTransactionStatus(
    workspaceId: string,
    branchId: string,
    transactionId: string,
    status: 'pending' | 'completed' | 'cancelled',
    userId: string,
  ) {
    await this.branchAccessService.assertBranchPermission(
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
      branchId,
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
    branchId: string,
    userId: string,
    startDate: Date,
    endDate: Date,
  ) {
    await this.branchAccessService.assertBranchPermission(
      workspaceId,
      branchId,
      userId,
      'reports.view',
    );
    const transactions = await this.transactionsRepository.find({
      where: {
        workspaceId,
        branchId,
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
