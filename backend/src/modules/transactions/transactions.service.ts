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
import { EmailQueueService } from '../notifications/email-queue.service';
import { EmailTemplateService } from '../notifications/email-template.service';

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
    private readonly emailQueueService: EmailQueueService,
    private readonly emailTemplateService: EmailTemplateService,
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
    let lineItems = createTransactionDto.lineItems || [];
    const isInventoryReducingTransaction =
      normalizedType === 'sale' || normalizedType === 'debt';

    if (isInventoryReducingTransaction) {
      // Support either single-item flows (legacy) or multi-item `lineItems`.
      if (lineItems && lineItems.length > 0) {
        // multi-item sale: validate each line
        let sumQuantity = 0;
        let sumGross = 0;
        let sumDiscount = 0;
        let sumTotal = 0;

        const savedLineItems: any[] = [];

        for (const li of lineItems) {
          if (!li.itemId || !isUUID(li.itemId)) {
            throw new BadRequestException('Each line item must include a valid itemId');
          }

          const it = await this.itemsRepository.findOne({
            where: branchId
              ? { id: li.itemId, workspaceId, branchId }
              : { id: li.itemId, workspaceId, branchId: IsNull() },
          });
          if (!it) throw new NotFoundException('One of the line items was not found in this workspace');

          const liQty = Number(li.quantity || 0);
          if (!liQty || liQty <= 0) throw new BadRequestException('Each line item quantity must be > 0');

          const currentStock = Number(it.quantity || 0);
          if (liQty > currentStock) throw new BadRequestException(`Insufficient stock for item ${it.name}. Available: ${currentStock}`);

          const liUnit = Number(li.unitPrice || it.sellingPrice || 0);
          const liGross = liUnit * liQty;
          const liDiscount = Number(li.discountAmount || 0);
          if (liDiscount < 0) throw new BadRequestException('discountAmount cannot be negative');
          if (liDiscount > liGross) throw new BadRequestException('discountAmount cannot exceed gross for a line item');

          const liTotal = liGross - liDiscount;

          // persist updated stock
          it.quantity = Number((currentStock - liQty).toFixed(2));
          await this.itemsRepository.save(it);

          savedLineItems.push({
            itemId: it.id,
            name: it.name,
            sku: it.sku,
            quantity: liQty,
            unitPrice: liUnit,
            gross: liGross,
            discountAmount: liDiscount,
            total: liTotal,
          });

          sumQuantity += liQty;
          sumGross += liGross;
          sumDiscount += liDiscount;
          sumTotal += liTotal;
        }

        quantity = sumQuantity;
        unitPrice = 0;
        discountAmount = sumDiscount;
        totalAmount = sumTotal;
        // store line items for receipt generation
        lineItems = savedLineItems;
        // keep `item` null for multi-item transaction
        item = null;
      } else {
        // legacy single-item flow (unchanged)
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

        // Prefer explicit totalAmount from client when provided (defensive),
        // otherwise compute from gross and discount. This avoids double-discount
        // when clients pre-adjust unitPrice and still send discountAmount.
        const providedTotal = Number(createTransactionDto.totalAmount || 0);
        totalAmount =
          providedTotal > 0
            ? providedTotal
            : discountAmount > 0
              ? grossAmount - discountAmount
              : grossAmount;

        if (totalAmount < 0) {
          throw new BadRequestException('totalAmount cannot be negative');
        }

        item.quantity = Number((currentStock - quantity).toFixed(2));
        await this.itemsRepository.save(item);
      }
    }

    let transaction: Transaction = this.transactionsRepository.create({
      type: createTransactionDto.type,
      referenceNumber: createTransactionDto.referenceNumber,
      item: item || undefined,
      quantity,
      unitPrice,
      totalAmount,
      discountAmount,
      lineItems: lineItems && lineItems.length ? lineItems : undefined,
      customerEmail: createTransactionDto.customerEmail || null,
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
        // enqueue receipt email to customer if email provided
        try {
          const toEmail = (transaction.customerEmail || '').trim();
          if (toEmail && toEmail.includes('@')) {
            const html = this.emailTemplateService.invoiceEmail(
              transaction,
              receiptUrl,
            );
            this.emailQueueService.enqueue({
              to: toEmail,
              subject: `Your receipt - ${transaction.referenceNumber || transaction.id}`,
              text: `View your receipt: ${receiptUrl}`,
              html,
            });
          }
        } catch (e) {
          // non-fatal
        }
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
      // Special-case: when requesting `sale` transactions, include
      // debts that have been completed — these should appear as paid
      // sales in the UI. Keep the original `debt` filter behavior.
      if (type === 'sale') {
        query.andWhere("(transaction.type = 'sale' OR (transaction.type = 'debt' AND transaction.status = 'completed'))");
      } else {
        query.andWhere('transaction.type = :type', { type });
      }
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
    if (!isUUID(String(transactionId || ''))) {
      throw new BadRequestException('Invalid transaction id');
    }
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
    // If a debt has been paid (completed), generate a receipt and ensure
    // it's visible in sales lists via the completed status mapping.
    try {
      if (transaction.type === 'debt' && status === 'completed') {
        const receiptUrl = await this.receiptService.generateAndUploadReceipt(transaction);
        transaction.receiptUrl = receiptUrl;
        await this.transactionsRepository.save(transaction);
      }
    } catch (e) {
      // non-fatal
    }
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
