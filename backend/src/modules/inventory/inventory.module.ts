import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { StockTransferController } from './stock-transfer.controller';
import { InventoryItem } from './entities/inventory-item.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { User } from '../auth/entities/user.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { WorkspaceModule } from '../workspace/workspace.module';
import { Branch } from '../workspace/entities/branch.entity';
import { StockTransfer } from './entities/stock-transfer.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([InventoryItem, Workspace, User, Transaction, Branch, StockTransfer]),
    NotificationsModule,
    WorkspaceModule,
  ],
  providers: [InventoryService],
  controllers: [InventoryController, StockTransferController],
  exports: [InventoryService],
})
export class InventoryModule {}
