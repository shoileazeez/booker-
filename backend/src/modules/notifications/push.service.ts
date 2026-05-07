import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RegisterPushTokenDto } from './dto/register-push-token.dto';
import { UserPushToken } from './entities/user-push-token.entity';

export type PushNotificationInput = {
  to: string; // device token or user id
  title: string;
  body: string;
  data?: Record<string, any>;
};

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private configService: ConfigService,
    @InjectRepository(UserPushToken)
    private readonly pushTokenRepository: Repository<UserPushToken>,
  ) {}

  private isExpoPushToken(value: string) {
    const normalized = String(value || '').trim();
    // Expo token format examples:
    // - ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]
    // - ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx] (legacy)
    return /^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/.test(normalized);
  }

  async registerToken(userId: string, dto: RegisterPushTokenDto) {
    if (!this.isExpoPushToken(dto.token)) {
      return { registered: false, reason: 'invalid_token_format' };
    }

    const existing = await this.pushTokenRepository.findOne({
      where: { userId, token: dto.token },
    });

    const record =
      existing || this.pushTokenRepository.create({ userId, token: dto.token });
    record.platform = dto.platform || null;
    record.deviceId = dto.deviceId || null;
    record.isActive = true;
    record.lastSeenAt = new Date();

    await this.pushTokenRepository.save(record);
    return { registered: true };
  }

  async unregisterToken(userId: string, token?: string) {
    if (token) {
      await this.pushTokenRepository.update(
        { userId, token },
        { isActive: false, lastSeenAt: new Date() },
      );
      return { unregistered: true, mode: 'single' };
    }

    await this.pushTokenRepository.update(
      { userId, isActive: true },
      { isActive: false, lastSeenAt: new Date() },
    );
    return { unregistered: true, mode: 'all' };
  }

  private async resolveTargetTokens(target: string): Promise<string[]> {
    if (this.isExpoPushToken(target)) {
      return [target];
    }

    const rows = await this.pushTokenRepository.find({
      where: { userId: target, isActive: true },
    });
    return rows
      .map((row) => row.token)
      .filter((token) => this.isExpoPushToken(token));
  }

  private async sendWithExpo(messages: Array<Record<string, any>>) {
    const endpoint =
      this.configService.get<string>('EXPO_PUSH_API_URL') ||
      'https://exp.host/--/api/v2/push/send';

    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(batch),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          `Expo push request failed (${response.status}): ${JSON.stringify(payload)}`,
        );
      }

      const results = Array.isArray(payload?.data) ? payload.data : [];
      for (let idx = 0; idx < results.length; idx += 1) {
        const result = results[idx];
        const token = batch[idx]?.to;
        if (
          result?.status === 'error' &&
          result?.details?.error === 'DeviceNotRegistered' &&
          token
        ) {
          await this.pushTokenRepository.update(
            { token },
            { isActive: false, lastSeenAt: new Date() },
          );
        }
      }
    }
  }

  async sendPush(input: PushNotificationInput): Promise<void> {
    const enabled =
      (this.configService.get<string>('PUSH_ENABLED') || 'true') === 'true';
    if (!enabled) {
      this.logger.log(
        `PUSH_ENABLED=false. Skipping push notification to ${input.to}`,
      );
      return;
    }

    const tokens = await this.resolveTargetTokens(input.to);
    if (tokens.length === 0) {
      this.logger.log(`No active push tokens found for target ${input.to}`);
      return;
    }

    const provider = (
      this.configService.get<string>('PUSH_PROVIDER') || 'expo'
    ).toLowerCase();
    const messages = tokens.map((token) => ({
      to: token,
      title: input.title,
      body: input.body,
      data: input.data || {},
      channelId: 'default',
      sound: 'default',
      priority: 'high',
      ttl: 60 * 60,
    }));

    if (provider !== 'expo') {
      this.logger.warn(
        `Unsupported PUSH_PROVIDER=${provider}; currently only 'expo' is implemented.`,
      );
      return;
    }

    await this.sendWithExpo(messages);
    this.logger.log(
      `Push notification dispatched to ${tokens.length} device(s)`,
    );
  }
}
