import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailService } from './email.service';
import { EmailQueueService } from './email-queue.service';
import { EmailTemplateService } from './email-template.service';
import { PushService } from './push.service';
import { UserPushToken } from './entities/user-push-token.entity';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([UserPushToken])],
  controllers: [NotificationsController],
  providers: [
    EmailService,
    EmailQueueService,
    EmailTemplateService,
    PushService,
  ],
  exports: [EmailService, EmailQueueService, EmailTemplateService, PushService],
})
export class NotificationsModule {}
