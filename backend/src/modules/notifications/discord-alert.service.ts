import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type DiscordAlertPayload = {
  title: string;
  message: string;
  details?: string;
  eventId?: string;
};

@Injectable()
export class DiscordAlertService {
  constructor(private readonly configService: ConfigService) {}

  private getWebhookUrl() {
    return (
      this.configService.get<string>('DISCORD_ALERT_WEBHOOK_URL') || ''
    ).trim();
  }

  isEnabled() {
    const alertsEnabled =
      String(this.configService.get('ALERTS_ENABLED') ?? 'true').toLowerCase() !==
      'false';
    return alertsEnabled && Boolean(this.getWebhookUrl());
  }

  async sendAlert(payload: DiscordAlertPayload): Promise<void> {
    if (!this.isEnabled()) return;

    const webhookUrl = this.getWebhookUrl();
    const header = `**${payload.title}**`;
    const eventLine = payload.eventId ? `\nEvent ID: \`${payload.eventId}\`` : '';
    const details = payload.details ? `\n\n${payload.details}` : '';
    const content = `${header}\n${payload.message}${eventLine}${details}`;
    const trimmed = content.length > 1900 ? `${content.slice(0, 1900)}…` : content;

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: trimmed }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Discord webhook failed (${response.status}): ${body}`,
      );
    }
  }
}
