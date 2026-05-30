import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Transaction } from './entities/transaction.entity';
import { EmailQueueService } from '../notifications/email-queue.service';
import { EmailTemplateService } from '../notifications/email-template.service';
import { AlertingService } from '../notifications/alerting.service';

@Injectable()
export class DebtReminderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DebtReminderService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionsRepository: Repository<Transaction>,
    private readonly configService: ConfigService,
    private readonly emailQueueService: EmailQueueService,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly alertingService: AlertingService,
  ) {}

  onModuleInit() {
    const enabled =
      String(
        this.configService.get('ENABLE_DEBT_DUE_EMAILS') ?? 'true',
      ).toLowerCase() !== 'false';
    if (!enabled) return;

    const intervalMs = Number(
      this.configService.get('DEBT_DUE_EMAIL_POLL_INTERVAL_MS') ||
        60 * 60 * 1000,
    );
    this.timer = setInterval(() => {
      this.sendDueDebtEmails().catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Debt reminder run failed: ${message}`);
        void this.alertingService.notifyError(
          'Debt reminder run failed',
          message,
        );
      });
    }, intervalMs);

    this.sendDueDebtEmails().catch(() => null);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async sendDueDebtEmails() {
    if (this.running) return;
    this.running = true;

    try {
      const dueDebts = await this.transactionsRepository
        .createQueryBuilder('transaction')
        .where(`transaction.type = 'debt'`)
        .andWhere(`transaction.status = 'pending'`)
        .andWhere(`COALESCE(transaction.customer_email, '') <> ''`)
        .andWhere(`transaction."dueDate" IS NOT NULL`)
        .andWhere(`transaction.due_reminder_sent_at IS NULL`)
        .andWhere(`DATE(transaction."dueDate") <= CURRENT_DATE`)
        .getMany();

      for (const debt of dueDebts) {
        const to = String(debt.customerEmail || '').trim();
        if (!to || !to.includes('@')) continue;

        const html = this.emailTemplateService.debtDueReminder(debt);
        this.emailQueueService.enqueue({
          to,
          subject: `Debt due reminder - ${debt.customerName || 'Customer'}`,
          text: this.emailTemplateService.plainText(html),
          html,
        });

        debt.dueReminderSentAt = new Date();
        await this.transactionsRepository.save(debt);
      }
    } finally {
      this.running = false;
    }
  }
}
