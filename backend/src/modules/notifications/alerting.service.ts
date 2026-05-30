import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';
import { EmailService } from './email.service';
import { EmailTemplateService } from './email-template.service';
import { DiscordAlertService } from './discord-alert.service';
import { isSentryEnabled } from '../../observability/sentry';

type AlertRequestContext = {
  method?: string;
  url?: string;
  ip?: string;
  userAgent?: string;
  userId?: string;
  userEmail?: string;
};

type ExceptionAlertInput = {
  exception: unknown;
  status?: number;
  eventId?: string;
  request?: AlertRequestContext;
};

@Injectable()
export class AlertingService {
  private readonly logger = new Logger(AlertingService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly discordAlertService: DiscordAlertService,
  ) {}

  private isEnabled() {
    return (
      String(this.configService.get('ALERTS_ENABLED') ?? 'true').toLowerCase() !==
      'false'
    );
  }

  private getRecipients(): string[] {
    const raw = this.configService.get<string>('ALERT_EMAILS') || '';
    return raw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  private buildRequestDetails(request?: AlertRequestContext) {
    if (!request) return '';
    const lines: string[] = [];
    if (request.method && request.url) {
      lines.push(`<strong>Request:</strong> ${request.method} ${request.url}`);
    }
    if (request.userId || request.userEmail) {
      lines.push(
        `<strong>User:</strong> ${request.userId || 'unknown'}${
          request.userEmail ? ` (${request.userEmail})` : ''
        }`,
      );
    }
    if (request.ip) lines.push(`<strong>IP:</strong> ${request.ip}`);
    if (request.userAgent)
      lines.push(`<strong>User Agent:</strong> ${request.userAgent}`);
    return lines.join('<br/>');
  }

  private buildRequestDetailsText(request?: AlertRequestContext) {
    if (!request) return '';
    const lines: string[] = [];
    if (request.method && request.url) {
      lines.push(`Request: ${request.method} ${request.url}`);
    }
    if (request.userId || request.userEmail) {
      lines.push(
        `User: ${request.userId || 'unknown'}${
          request.userEmail ? ` (${request.userEmail})` : ''
        }`,
      );
    }
    if (request.ip) lines.push(`IP: ${request.ip}`);
    if (request.userAgent) lines.push(`User Agent: ${request.userAgent}`);
    return lines.join('\n');
  }

  private normalizeError(exception: unknown) {
    if (exception instanceof Error) {
      return {
        name: exception.name,
        message: exception.message,
        stack: exception.stack,
      };
    }

    if (typeof exception === 'string') {
      return { name: 'Error', message: exception, stack: undefined };
    }

    try {
      return {
        name: 'Error',
        message: JSON.stringify(exception),
        stack: undefined,
      };
    } catch {
      return { name: 'Error', message: 'Unknown error', stack: undefined };
    }
  }

  private async sendEmailAlert(subject: string, html: string) {
    const recipients = this.getRecipients();
    if (recipients.length === 0) return;

    const text = this.emailTemplateService.plainText(html);

    for (const to of recipients) {
      await this.emailService.sendEmail({
        to,
        subject,
        text,
        html,
      });
    }
  }

  async notifyException(input: ExceptionAlertInput): Promise<void> {
    if (!this.isEnabled()) return;
    if (input.status && input.status < 500) return;

    const error = this.normalizeError(input.exception);
    const environment =
      this.configService.get<string>('SENTRY_ENVIRONMENT') ||
      this.configService.get<string>('NODE_ENV') ||
      'unknown';

    const title = `Backend error (${input.status || 500})`;
    const message = `${error.name}: ${error.message}`;
    const requestDetailsHtml = this.buildRequestDetails(input.request);
    const requestDetailsText = this.buildRequestDetailsText(input.request);
    const detailsHtmlParts = [
      `<strong>Environment:</strong> ${environment}`,
      requestDetailsHtml,
      input.eventId ? `<strong>Sentry Event:</strong> ${input.eventId}` : '',
      error.stack ? `<pre>${error.stack}</pre>` : '',
    ].filter(Boolean);
    const detailsTextParts = [
      `Environment: ${environment}`,
      requestDetailsText,
      input.eventId ? `Sentry Event: ${input.eventId}` : '',
      error.stack || '',
    ].filter(Boolean);

    const html = this.emailTemplateService.genericNotification(
      title,
      message,
      detailsHtmlParts.join('<br/>'),
    );

    await this.dispatchAlerts({
      title,
      message,
      details: detailsTextParts.join('\n'),
      eventId: input.eventId,
      html,
    });
  }

  async notifyError(title: string, message: string, details?: string) {
    if (!this.isEnabled()) return;

    if (isSentryEnabled()) {
      Sentry.withScope((scope) => {
        scope.setTag('alert.title', title);
        if (details) scope.setExtra('details', details);
        return Sentry.captureMessage(`${title}: ${message}`, 'error');
      });
    }

    const htmlDetails = details ? details.replace(/\n/g, '<br/>') : undefined;
    const html = this.emailTemplateService.genericNotification(
      title,
      message,
      htmlDetails,
    );

    await this.dispatchAlerts({
      title,
      message,
      details,
      html,
    });
  }

  private async dispatchAlerts(input: {
    title: string;
    message: string;
    details?: string;
    eventId?: string;
    html: string;
  }) {
    try {
      await this.discordAlertService.sendAlert({
        title: input.title,
        message: input.message,
        details: input.details,
        eventId: input.eventId,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? 'Error');
      this.logger.error(`Discord alert failed: ${message}`);
    }

    try {
      await this.sendEmailAlert(
        `[${this.configService.get<string>('NODE_ENV') || 'app'}] ${
          input.title
        }`,
        input.html,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? 'Error');
      this.logger.error(`Email alert failed: ${message}`);
    }
  }
}
