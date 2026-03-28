import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';

type EmailJob = {
  id: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  attempts: number;
};

@Injectable()
export class EmailQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailQueueService.name);
  private readonly queue: EmailJob[] = [];
  private processing = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private configService: ConfigService,
    private emailService: EmailService,
  ) {}

  onModuleInit() {
    const intervalMs = Number(
      this.configService.get<string>('EMAIL_QUEUE_POLL_INTERVAL_MS') || 1000,
    );
    this.timer = setInterval(() => {
      this.processNext().catch((err) => {
        this.logger.error(`Queue processor error: ${err?.message || err}`);
      });
    }, intervalMs);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  enqueue(input: Omit<EmailJob, 'id' | 'attempts'>) {
    const job: EmailJob = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      attempts: 0,
      ...input,
    };

    this.queue.push(job);
  }

  private async processNext() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    const maxAttempts = Number(
      this.configService.get<string>('EMAIL_QUEUE_MAX_ATTEMPTS') || 5,
    );
    const job = this.queue.shift();
    if (!job) {
      this.processing = false;
      return;
    }

    try {
      await this.emailService.sendEmail(job);
    } catch (err) {
      job.attempts += 1;
      if (job.attempts < maxAttempts) {
        this.queue.push(job);
      } else {
        this.logger.error(
          `Email job ${job.id} failed after ${job.attempts} attempts: ${err?.message || err}`,
        );
      }
    } finally {
      this.processing = false;
    }
  }
}
