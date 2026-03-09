import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { User } from '../auth/entities/user.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
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
  ) {}

  async createTransaction(
    createTransactionDto: CreateTransactionDto,
    workspaceId: string,
    userId: string,
  ) {
    const workspace = await this.workspacesRepository.findOne({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const user = await this.usersRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const transaction = this.transactionsRepository.create({
      type: createTransactionDto.type,
      referenceNumber: createTransactionDto.referenceNumber,
      quantity: createTransactionDto.quantity,
      unitPrice: createTransactionDto.unitPrice,
      totalAmount: createTransactionDto.totalAmount,
      category: createTransactionDto.category,
      paymentMethod: createTransactionDto.paymentMethod,
      status: createTransactionDto.status || 'pending',
      customerName: createTransactionDto.customerName,
      phone: createTransactionDto.phone,
      notes: createTransactionDto.notes,
      ...(createTransactionDto.dueDate && { dueDate: new Date(createTransactionDto.dueDate) }),
      workspace,
      createdBy: user,
    });

    return await this.transactionsRepository.save(transaction);
  }

  async getTransactions(
    workspaceId: string,
    skip = 0,
    take = 20,
    type?: string,
  ) {
    const query = this.transactionsRepository
      .createQueryBuilder('transaction')
      .where('transaction.workspace_id = :workspaceId', { workspaceId });

    if (type) {
      query.andWhere('transaction.type = :type', { type });
    }

    return await query
      .orderBy('transaction.createdAt', 'DESC')
      .skip(skip)
      .take(take)
      .getMany();
  }

  async getTransaction(transactionId: string) {
    const transaction = await this.transactionsRepository.findOne({
      where: { id: transactionId },
      relations: ['workspace', 'createdBy', 'item'],
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return transaction;
  }

  async updateTransactionStatus(
    transactionId: string,
    status: 'pending' | 'completed' | 'cancelled',
  ) {
    const transaction = await this.getTransaction(transactionId);
    transaction.status = status;
    return await this.transactionsRepository.save(transaction);
  }

  async getSummary(workspaceId: string, startDate: Date, endDate: Date) {
    const transactions = await this.transactionsRepository.find({
      where: {
        workspace: { id: workspaceId },
      },
      relations: ['item'],
    });

    const filteredByDate = transactions.filter(
      (t) => new Date(t.createdAt) >= startDate && new Date(t.createdAt) <= endDate
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
