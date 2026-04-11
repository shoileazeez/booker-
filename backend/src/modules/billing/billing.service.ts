import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { Payment } from './entities/payment.entity';
import { Subscription } from './entities/subscription.entity';
import { EmailQueueService } from '../notifications/email-queue.service';
import { EmailTemplateService } from '../notifications/email-template.service';
import { PushService } from '../notifications/push.service';
import { WorkspaceMembership } from '../workspace/entities/workspace-membership.entity';
import { Workspace } from '../workspace/entities/workspace.entity';

type PlanKey = 'basic' | 'pro';
type BillingCycle = 'monthly' | 'yearly';
type Addons = {
  workspaceSlots: number;
  staffSeats: number;
  whatsappBundles: number;
};

const PLAN_PRICES_NGN: Record<PlanKey, number> = {
  basic: 2500,
  pro: 7000,
};
const YEARLY_DISCOUNT_RATE = 0.2;

@Injectable()
export class BillingService {
  private readonly googleWebhookAuthClient = new OAuth2Client();

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Workspace)
    private workspacesRepository: Repository<Workspace>,
    @InjectRepository(Subscription)
    private subscriptionsRepository: Repository<Subscription>,
    @InjectRepository(Payment)
    private paymentsRepository: Repository<Payment>,
    @InjectRepository(WorkspaceMembership)
    private workspaceMembershipsRepository: Repository<WorkspaceMembership>,
    private readonly emailQueueService: EmailQueueService,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly pushService: PushService,
  ) {}

  private getAddonsUnitPrice() {
    return {
      workspaceSlot: 1500,
      staffSeat: 500,
      whatsappBundle100: 2000,
    };
  }

  private toCycleAmount(monthlyAmount: number, billingCycle: BillingCycle) {
    if (billingCycle === 'yearly') {
      return Math.round(monthlyAmount * 12 * (1 - YEARLY_DISCOUNT_RATE));
    }
    return Math.round(monthlyAmount);
  }

  private computeLimits(plan: PlanKey, addOns: Addons) {
    if (plan === 'basic') {
      return {
        workspaceLimit: 1,
        staffSeatLimit: 1,
        whatsappMonthlyQuota: 0,
      };
    }

    return {
      workspaceLimit: 3 + addOns.workspaceSlots,
      staffSeatLimit: 5 + addOns.staffSeats,
      whatsappMonthlyQuota: 100 + addOns.whatsappBundles * 100,
    };
  }

  getPlans() {
    return {
      plans: [
        {
          key: 'basic',
          name: 'Basic',
          monthly: PLAN_PRICES_NGN.basic,
          yearly: this.toCycleAmount(PLAN_PRICES_NGN.basic, 'yearly'),
        },
        {
          key: 'pro',
          name: 'Pro',
          monthly: PLAN_PRICES_NGN.pro,
          yearly: this.toCycleAmount(PLAN_PRICES_NGN.pro, 'yearly'),
        },
      ],
    };
  }

  async getCurrentSubscription(userId: string) {
    const subscription = await this.subscriptionsRepository.findOne({
      where: { userId },
    });
    return subscription || null;
  }

  async getUsage(userId: string) {
    const subscription = await this.subscriptionsRepository.findOne({
      where: { userId },
    });
    if (!subscription) {
      return { whatsappMessagesUsedThisMonth: 0 };
    }

    return {
      whatsappMessagesUsedThisMonth:
        subscription.whatsappMessagesUsedThisMonth || 0,
      limits: this.computeLimits(subscription.plan as PlanKey, {
        workspaceSlots: subscription.addonWorkspaceSlots || 0,
        staffSeats: subscription.addonStaffSeats || 0,
        whatsappBundles: subscription.addonWhatsappBundles || 0,
      }),
    };
  }

  private async findOrCreateSubscription(user: User) {
    let subscription = await this.subscriptionsRepository.findOne({
      where: { userId: user.id },
    });

    if (!subscription) {
      subscription = this.subscriptionsRepository.create({
        userId: user.id,
        plan: user.plan === 'pro' ? 'pro' : 'basic',
        status:
          user.trialStatus === 'active'
            ? 'trialing'
            : user.trialStatus === 'expired'
              ? 'expired'
              : 'active',
        trialEndsAt: user.trialEndsAt || null,
        currentPeriodStartAt: user.trialStartAt || null,
        currentPeriodEndsAt: user.trialEndsAt || null,
        addonWorkspaceSlots: 0,
        addonStaffSeats: 0,
        addonWhatsappBundles: 0,
        whatsappMessagesUsedThisMonth: 0,
        whatsappUsageResetAt: new Date(),
      });
      subscription = await this.subscriptionsRepository.save(subscription);
    }

    return subscription;
  }

  private resolveTrialState(user: User) {
    const now = Date.now();
    const trialEndsAtMs = user.trialEndsAt
      ? new Date(user.trialEndsAt).getTime()
      : null;
    const isTrialing =
      user.trialStatus === 'active' && !!trialEndsAtMs && trialEndsAtMs > now;
    const isTrialExpired =
      user.trialStatus === 'expired' ||
      (user.trialStatus === 'active' &&
        !!trialEndsAtMs &&
        trialEndsAtMs <= now);

    return { isTrialing, isTrialExpired, trialEndsAtMs, now };
  }

  private getGoogleCredentials() {
    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      throw new BadRequestException('Google service account not configured');
    }

    try {
      return typeof serviceAccountJson === 'string'
        ? JSON.parse(serviceAccountJson)
        : serviceAccountJson;
    } catch {
      throw new BadRequestException('Invalid GOOGLE_SERVICE_ACCOUNT_JSON');
    }
  }

  private async getAndroidPublisherClient() {
    const auth = new google.auth.GoogleAuth({
      credentials: this.getGoogleCredentials(),
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
    const client = await auth.getClient();
    return google.androidpublisher({ version: 'v3', auth: client });
  }

  private inferPlanFromProductId(
    productId: string,
    fallback: PlanKey = 'basic',
  ): PlanKey {
    if (/pro/i.test(productId)) {
      return 'pro';
    }
    if (/basic/i.test(productId)) {
      return 'basic';
    }
    return fallback;
  }

  private inferBillingCycleFromProductId(
    productId: string,
    fallback: BillingCycle = 'monthly',
  ): BillingCycle {
    if (/year|annual/i.test(productId)) {
      return 'yearly';
    }
    if (/month/i.test(productId)) {
      return 'monthly';
    }
    return fallback;
  }

  private mapGoogleNotificationStatus(notificationType?: number) {
    if ([2, 4].includes(Number(notificationType))) {
      return 'active' as const;
    }
    if ([3, 12].includes(Number(notificationType))) {
      return 'cancelled' as const;
    }
    if (Number(notificationType) === 13) {
      return 'expired' as const;
    }
    if ([5, 6].includes(Number(notificationType))) {
      return 'active' as const;
    }
    return null;
  }

  private async fetchGoogleSubscriptionPurchase(
    packageName: string,
    productId: string,
    purchaseToken: string,
  ) {
    const androidpublisher = await this.getAndroidPublisherClient();
    const res = await androidpublisher.purchases.subscriptions.get({
      packageName,
      subscriptionId: productId,
      token: purchaseToken,
    } as any);

    return res.data || {};
  }

  private async fetchGoogleProductPurchase(
    packageName: string,
    productId: string,
    purchaseToken: string,
  ) {
    const androidpublisher = await this.getAndroidPublisherClient();
    const res = await androidpublisher.purchases.products.get({
      packageName,
      productId,
      token: purchaseToken,
    } as any);

    return res.data || {};
  }

  private async persistVerifiedGoogleSubscription(
    userId: string,
    productId: string,
    purchaseToken: string,
    verifiedData: Record<string, any>,
    options?: {
      notificationType?: number;
      sendNotifications?: boolean;
      linkedPurchaseToken?: string | null;
    },
  ) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      return null;
    }

    const subscription = await this.findOrCreateSubscription(user);
    subscription.plan = this.inferPlanFromProductId(productId, subscription.plan);
    subscription.billingCycle = this.inferBillingCycleFromProductId(
      productId,
      subscription.billingCycle || 'monthly',
    );
    subscription.status =
      this.mapGoogleNotificationStatus(options?.notificationType) || 'active';
    subscription.currentPeriodStartAt =
      subscription.currentPeriodStartAt || new Date();
    subscription.currentPeriodEndsAt = verifiedData?.expiryTimeMillis
      ? new Date(Number(verifiedData.expiryTimeMillis))
      : subscription.currentPeriodEndsAt ||
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    subscription.lastPaymentReference = purchaseToken;
    subscription.metadata = {
      ...(subscription.metadata || {}),
      google: {
        ...((subscription.metadata as any)?.google || {}),
        ...verifiedData,
        linkedPurchaseToken:
          options?.linkedPurchaseToken || verifiedData?.linkedPurchaseToken || null,
        notificationType: options?.notificationType ?? null,
        productId,
        purchaseToken,
        verifiedAt: new Date().toISOString(),
      },
    };
    await this.subscriptionsRepository.save(subscription);

    user.plan = subscription.plan;
    user.trialStatus = 'converted';
    await this.usersRepository.save(user);

    if (options?.sendNotifications !== false) {
      const amountText = 'Google Play';
      const html = this.emailTemplateService.paymentSuccess(
        user.plan,
        amountText,
        purchaseToken,
        subscription.currentPeriodEndsAt || undefined,
      );
      this.emailQueueService.enqueue({
        to: user.email,
        subject: 'Subscription activated - BizRecord',
        text: `Your subscription was activated via Google Play. Plan: ${user.plan}.`,
        html,
      });
      this.pushService.sendPush({
        to: user.id,
        title: 'Subscription active',
        body: `Your ${user.plan} subscription is active.`,
        data: { productId, purchaseToken },
      });
    }

    return subscription;
  }

  private async syncGoogleSubscriptionFromWebhook(
    packageName: string,
    productId: string,
    purchaseToken: string,
    notificationType?: number,
  ) {
    const verifiedData = await this.fetchGoogleSubscriptionPurchase(
      packageName,
      productId,
      purchaseToken,
    );
    const linkedPurchaseToken = verifiedData?.linkedPurchaseToken || null;
    const where: Array<Record<string, string>> = [
      { lastPaymentReference: purchaseToken },
    ];
    if (linkedPurchaseToken) {
      where.push({ lastPaymentReference: linkedPurchaseToken });
    }

    const existingSubscription = await this.subscriptionsRepository.findOne({
      where: where as any,
    });
    if (!existingSubscription) {
      return { updated: false, verifiedData };
    }

    await this.persistVerifiedGoogleSubscription(
      existingSubscription.userId,
      productId,
      purchaseToken,
      verifiedData,
      {
        linkedPurchaseToken,
        notificationType,
        sendNotifications: false,
      },
    );

    const updatedSubscription = await this.subscriptionsRepository.findOne({
      where: { userId: existingSubscription.userId },
    });
    if (updatedSubscription) {
      const user = await this.usersRepository.findOne({
        where: { id: updatedSubscription.userId },
      });
      if (user) {
        this.pushService.sendPush({
          to: user.id,
          title: 'Subscription updated',
          body: `Your subscription status is now ${updatedSubscription.status}.`,
          data: {
            subscriptionId: updatedSubscription.id,
            status: updatedSubscription.status,
          },
        });
      }
    }

    return { updated: true, verifiedData };
  }

  async authenticateGoogleWebhook(auth?: {
    authorization?: string;
    sharedSecret?: string;
  }) {
    if (process.env.GOOGLE_WEBHOOK_AUTH_DISABLED === 'true') {
      return { method: 'disabled' as const };
    }

    const configuredSecret = process.env.GOOGLE_WEBHOOK_SHARED_SECRET;
    if (configuredSecret) {
      if (auth?.sharedSecret !== configuredSecret) {
        throw new UnauthorizedException('Invalid Google webhook shared secret');
      }
      return { method: 'shared-secret' as const };
    }

    const bearerToken = auth?.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!bearerToken) {
      throw new UnauthorizedException(
        'Missing Google webhook authorization header',
      );
    }

    const audience =
      process.env.GOOGLE_PUBSUB_AUDIENCE || process.env.GOOGLE_WEBHOOK_AUDIENCE;
    if (!audience) {
      throw new UnauthorizedException(
        'GOOGLE_PUBSUB_AUDIENCE is required for Google webhook auth',
      );
    }

    const ticket = await this.googleWebhookAuthClient.verifyIdToken({
      idToken: bearerToken,
      audience,
    });
    const payload = ticket.getPayload();
    if (!payload) {
      throw new UnauthorizedException('Unable to verify Google webhook token');
    }

    const expectedEmail = process.env.GOOGLE_PUBSUB_SERVICE_ACCOUNT_EMAIL;
    if (expectedEmail && payload.email !== expectedEmail) {
      throw new UnauthorizedException(
        'Unexpected Google webhook service account',
      );
    }

    if (payload.email_verified === false) {
      throw new UnauthorizedException('Google webhook email is not verified');
    }

    return {
      method: 'oidc' as const,
      audience: payload.aud,
      email: payload.email || null,
      subject: payload.sub || null,
    };
  }

  async verifyGooglePurchase(
    userId: string,
    dto: {
      packageName: string;
      productId: string;
      purchaseToken: string;
      purchaseType?: 'subscription' | 'product';
      workspaceId?: string;
    },
  ) {
    const pkg = dto.packageName;
    const productId = dto.productId;
    const token = dto.purchaseToken;
    const type =
      dto.purchaseType === 'subscription' ? 'subscription' : 'product';

    if (type === 'subscription') {
      const workspaceId = dto.workspaceId;
      if (!workspaceId) {
        throw new BadRequestException(
          'workspaceId is required for subscription purchases',
        );
      }
      const requester = await this.usersRepository.findOne({
        where: { id: userId },
      });
      if (!requester) {
        throw new BadRequestException(
          'Workspace-scoped purchases require an authenticated requester',
        );
      }
      const membership = await this.workspaceMembershipsRepository.findOne({
        where: { workspaceId, userId: requester.id, isActive: true },
      });
      if (!membership || membership.role !== 'owner') {
        throw new ForbiddenException(
          'Only workspace owners can apply purchases to a workspace',
        );
      }
    }

    try {
      if (type === 'subscription') {
        const verifiedData = await this.fetchGoogleSubscriptionPurchase(
          pkg,
          productId,
          token,
        );
        await this.persistVerifiedGoogleSubscription(
          userId,
          productId,
          token,
          verifiedData,
          { sendNotifications: true },
        );
        return { verified: true, data: verifiedData };
      }

      const productData = await this.fetchGoogleProductPurchase(
        pkg,
        productId,
        token,
      );
      try {
        const user = await this.usersRepository.findOne({ where: { id: userId } });
        if (user) {
          const payment = this.paymentsRepository.create({
            userId: user.id,
            reference: token,
            status: 'success',
            amount: 0,
            currency: 'NGN',
            purchaseType: 'one_time',
            billingCycle: 'monthly',
            targetPlan: 'basic',
            metadata: { google: productData },
          });
          await this.paymentsRepository.save(payment);
        }
      } catch {
        // ignore non-fatal persistence errors for one-time Google products
      }

      return { verified: true, data: productData };
    } catch (err: any) {
      return { verified: false, error: err?.message || err };
    }
  }

  async handleGoogleWebhook(
    payload: Record<string, any>,
    auth?: { authorization?: string; sharedSecret?: string },
  ) {
    const authenticated = await this.authenticateGoogleWebhook(auth);
    const msg = payload?.message || payload;
    const dataB64 = msg?.data;
    const decoded = dataB64
      ? Buffer.from(dataB64, 'base64').toString('utf8')
      : JSON.stringify(payload);
    const parsed = JSON.parse(decoded);

    if (parsed?.testNotification) {
      return { received: true, authenticated, parsed };
    }

    if (parsed?.subscriptionNotification) {
      const note = parsed.subscriptionNotification;
      const subscriptionId = note?.subscriptionId;
      const purchaseToken = note?.purchaseToken;
      const notificationType = note?.notificationType;
      const packageName =
        parsed?.packageName || process.env.ANDROID_PACKAGE_NAME || '';

      if (!packageName || !subscriptionId || !purchaseToken) {
        throw new BadRequestException(
          'Incomplete Google subscription notification',
        );
      }

      const syncResult = await this.syncGoogleSubscriptionFromWebhook(
        packageName,
        subscriptionId,
        purchaseToken,
        notificationType,
      );

      return {
        received: true,
        authenticated,
        parsed,
        updated: syncResult.updated,
      };
    }

    return { received: true, authenticated, parsed };
  }

  private async applySuccessfulPayment(
    payment: Payment,
    verifiedPayload: Record<string, any>,
  ) {
    if (payment.status === 'success') {
      return;
    }

    const user = await this.usersRepository.findOne({
      where: { id: payment.userId },
    });
    if (!user) throw new NotFoundException('User not found');

    const subscription = await this.findOrCreateSubscription(user);

    payment.status = 'success';
    payment.paystackTransactionId = String(verifiedPayload?.data?.id || '');
    payment.rawResponse = verifiedPayload;
    await this.paymentsRepository.save(payment);

    user.plan = payment.targetPlan === 'basic' ? 'basic' : 'pro';
    user.trialStatus = 'converted';
    await this.usersRepository.save(user);

    subscription.plan = user.plan;
    subscription.status = 'active';
    subscription.billingCycle = payment.billingCycle || 'monthly';
    subscription.currentPeriodStartAt = new Date();
    subscription.currentPeriodEndsAt = new Date(
      Date.now() +
        (subscription.billingCycle === 'yearly' ? 365 : 30) *
          24 *
          60 *
          60 *
          1000,
    );
    subscription.lastPaymentReference = payment.reference;

    const { isTrialing } = this.resolveTrialState(user);
    if (!isTrialing) {
      subscription.addonWorkspaceSlots = payment.addonWorkspaceSlots || 0;
      subscription.addonStaffSeats = payment.addonStaffSeats || 0;
      subscription.addonWhatsappBundles = payment.addonWhatsappBundles || 0;
    }

    await this.subscriptionsRepository.save(subscription);

    const amountText = `NGN ${Number(payment.amount || 0).toLocaleString()}`;
    const html = this.emailTemplateService.paymentSuccess(
      user.plan,
      amountText,
      payment.reference,
      subscription.currentPeriodEndsAt || undefined,
    );

    this.emailQueueService.enqueue({
      to: user.email,
      subject: 'Payment Successful - BizRecord',
      text: `Your payment was successful. Plan: ${user.plan}. Amount: ${amountText}. Reference: ${payment.reference}.`,
      html,
    });

    this.pushService.sendPush({
      to: user.id,
      title: 'Payment Successful',
      body: `Your payment for plan ${user.plan} was successful.`,
      data: { reference: payment.reference, plan: user.plan },
    });
  }
}
