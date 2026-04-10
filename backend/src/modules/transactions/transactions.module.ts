import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionsService } from './transactions.service';
import {
  TransactionsController,
  WorkspaceTransactionsController,
} from './transactions.controller';
import { Transaction } from './entities/transaction.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { User } from '../auth/entities/user.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { ReceiptService } from './receipt.service';
import { WorkspaceModule } from '../workspace/workspace.module';
import { Branch } from '../workspace/entities/branch.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, Workspace, User, InventoryItem, Branch]),
    WorkspaceModule,
    NotificationsModule,
  ],
  providers: [TransactionsService, ReceiptService],
  controllers: [TransactionsController, WorkspaceTransactionsController],
  exports: [TransactionsService],
})
export class TransactionsModule {}
