import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type PushNotificationInput = {
  to: string; // device token or user id
  title: string;
  body: string;
  data?: Record<string, any>;
};

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private configService: ConfigService) {}

  async sendPush(input: PushNotificationInput): Promise<void> {
    // Example: Integrate with Firebase Cloud Messaging (FCM) or other provider
    const enabled =
      (this.configService.get<string>('PUSH_ENABLED') || 'true') === 'true';
    if (!enabled) {
      this.logger.log(
        `PUSH_ENABLED=false. Skipping push notification to ${input.to}`,
      );
      return;
    }
    // TODO: Integrate with actual push provider (e.g., FCM, OneSignal)
    this.logger.log(
      `Push notification sent to ${input.to}: ${input.title} - ${input.body}`,
    );
    // Simulate async send
    return;
  }
}
