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
import { Branch } from './entities/branch.entity';
import { BranchMembership } from './entities/branch-membership.entity';
import { BranchAccessService } from './branch-access.service';
import { Customer } from '../customer/customer.entity';
import { AuditLog } from './entities/audit-log.entity';
import { AuditLogService } from './audit-log.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Workspace,
      User,
      WorkspaceInvite,
      WorkspaceMembership,
      Branch,
      BranchMembership,
      AuditLog,
      Transaction,
      InventoryItem,
      Customer,
    ]),
    BillingModule,
    NotificationsModule,
  ],
  providers: [WorkspaceService, BranchAccessService, AuditLogService],
  controllers: [WorkspaceController],
  exports: [WorkspaceService, BranchAccessService, AuditLogService],
})
export class WorkspaceModule {}
