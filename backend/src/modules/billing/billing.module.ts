import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { RevenueCatWebhookService } from './revenuecat.service';
import { User } from '../auth/entities/user.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { Subscription } from './entities/subscription.entity';
import { Payment } from './entities/payment.entity';
import { WorkspaceMembership } from '../workspace/entities/workspace-membership.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Workspace,
      Subscription,
      Payment,
      WorkspaceMembership,
    ]),
    NotificationsModule,
  ],
  controllers: [BillingController],
  providers: [BillingService, RevenueCatWebhookService],
  exports: [BillingService, RevenueCatWebhookService],
})
export class BillingModule {}
