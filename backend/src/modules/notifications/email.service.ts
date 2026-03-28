import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private configService: ConfigService) {}

  getDeliveryReadiness() {
    const enabled =
      (this.configService.get<string>('MAILGUN_ENABLED') || 'true') === 'true';
    const apiKey = this.configService.get<string>('MAILGUN_API_KEY');
    const domain = this.configService.get<string>('MAILGUN_DOMAIN');

    if (!enabled) {
      return {
        enabled: false,
        configured: false,
        canSend: false,
        reason: 'MAILGUN_ENABLED=false',
      };
    }

    if (!apiKey || !domain) {
      return {
        enabled: true,
        configured: false,
        canSend: false,
        reason: 'MAILGUN_API_KEY or MAILGUN_DOMAIN is missing',
      };
    }

    return {
      enabled: true,
      configured: true,
      canSend: true,
      reason: null,
    };
  }

  async sendEmail(input: SendEmailInput): Promise<void> {
    const readiness = this.getDeliveryReadiness();
    if (!readiness.enabled) {
      this.logger.log(
        `MAILGUN_ENABLED=false. Skipping email send to ${input.to}`,
      );
      return;
    }

    const apiKey = this.configService.get<string>('MAILGUN_API_KEY');
    const domain = this.configService.get<string>('MAILGUN_DOMAIN');
    const baseUrl =
      this.configService.get<string>('MAILGUN_BASE_URL') ||
      'https://api.mailgun.net';
    const fromEmail =
      this.configService.get<string>('MAILGUN_FROM_EMAIL') ||
      'no-reply@bizrecord.tech';
    const fromName =
      this.configService.get<string>('MAILGUN_FROM_NAME') || 'BizRecord';

    if (!readiness.configured || !apiKey || !domain) {
      this.logger.error(
        'Missing Mailgun credentials/config. Required: MAILGUN_API_KEY, MAILGUN_DOMAIN',
      );
      return;
    }

    const url = `${baseUrl}/v3/${domain}/messages`;
    const auth = Buffer.from(`api:${apiKey}`).toString('base64');

    const params = new URLSearchParams();
    params.append('from', `${fromName} <${fromEmail}>`);
    params.append('to', input.to);
    params.append('subject', input.subject);
    params.append('text', input.text);
    if (input.html) params.append('html', input.html);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Mailgun send failed (${response.status}): ${body}`);
    }
  }
}
