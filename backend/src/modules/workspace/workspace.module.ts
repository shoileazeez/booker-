import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkspaceService } from './workspace.service';
import { WorkspaceController } from './workspace.controller';
import { Workspace } from './entities/workspace.entity';
import { User } from '../auth/entities/user.entity';
import { WorkspaceInvite } from './entities/invite.entity';
import { BillingModule } from '../billing/billing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Transaction } from '../transactions/entities/transaction.entity';
import { InventoryItem } from '../inventory/entities/inventory-item.entity';
import { WorkspaceMembership } from './entities/workspace-membership.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Workspace,
      User,
      WorkspaceInvite,
      WorkspaceMembership,
      Transaction,
      InventoryItem,
    ]),
    BillingModule,
    NotificationsModule,
  ],
  providers: [WorkspaceService],
  controllers: [WorkspaceController],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}
