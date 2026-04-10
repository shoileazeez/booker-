import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { google } from 'googleapis';
import { User } from '../auth/entities/user.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { Subscription } from './entities/subscription.entity';
import { Payment } from './entities/payment.entity';
import { WorkspaceMembership } from '../workspace/entities/workspace-membership.entity';
import { InitiateCheckoutDto } from './dto/initiate-checkout.dto';
import { EmailQueueService } from '../notifications/email-queue.service';
import { EmailTemplateService } from '../notifications/email-template.service';
import { PushService } from '../notifications/push.service';

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

  private normalizeAddons(addons?: Partial<Addons>): Addons {
    return {
      workspaceSlots: Math.max(0, Number(addons?.workspaceSlots || 0)),
      staffSeats: Math.max(0, Number(addons?.staffSeats || 0)),
      whatsappBundles: Math.max(0, Number(addons?.whatsappBundles || 0)),
    };
  }

  private calculateAddonsAmount(addons: Addons) {
    const unit = this.getAddonsUnitPrice();
    return (
      addons.workspaceSlots * unit.workspaceSlot +
      addons.staffSeats * unit.staffSeat +
      addons.whatsappBundles * unit.whatsappBundle100
    );
  }

  private toCycleAmount(monthlyAmount: number, billingCycle: BillingCycle) {
    if (billingCycle === 'yearly') {
      // 12 months with 20% discount.
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

  // Public API used by controller
  getPlans() {
    return {
      plans: [
        { key: 'basic', name: 'Basic', monthly: PLAN_PRICES_NGN.basic, yearly: this.toCycleAmount(PLAN_PRICES_NGN.basic, 'yearly') },
        { key: 'pro', name: 'Pro', monthly: PLAN_PRICES_NGN.pro, yearly: this.toCycleAmount(PLAN_PRICES_NGN.pro, 'yearly') },
      ],
    };
  }

  async getCurrentSubscription(userId: string) {
    const subscription = await this.subscriptionsRepository.findOne({ where: { userId } });
    return subscription || null;
  }

  async getUsage(userId: string) {
    const subscription = await this.subscriptionsRepository.findOne({ where: { userId } });
    if (!subscription) return { whatsappMessagesUsedThisMonth: 0 };
    return {
      whatsappMessagesUsedThisMonth: subscription.whatsappMessagesUsedThisMonth || 0,
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

  

  /**
   * Verify a Google Play purchase (in-app product or subscription) using
   * Google Play Developer API. Requires service account JSON in
   * GOOGLE_SERVICE_ACCOUNT_JSON env var and Android package name.
   */
  async verifyGooglePurchase(userId: string, dto: { packageName: string; productId: string; purchaseToken: string; purchaseType?: 'subscription' | 'product' }) {
    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      throw new BadRequestException('Google service account not configured');
    }

    let credentials: any;
    try {
      credentials = typeof serviceAccountJson === 'string' ? JSON.parse(serviceAccountJson) : serviceAccountJson;
    } catch (e) {
      throw new BadRequestException('Invalid GOOGLE_SERVICE_ACCOUNT_JSON');
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
    const client = await auth.getClient();
    const androidpublisher = google.androidpublisher({ version: 'v3', auth: client });

    const pkg = dto.packageName;
    const productId = dto.productId;
    const token = dto.purchaseToken;
    const type = dto.purchaseType === 'subscription' ? 'subscription' : 'product';

    // For subscription purchases we require a target `workspaceId` so
    // subscription upgrades are applied to a specific workspace and can
    // be authorized against workspace ownership.
    if (type === 'subscription') {
      const workspaceId = (dto as any).workspaceId as string | undefined;
      if (!workspaceId) {
        throw new BadRequestException('workspaceId is required for subscription purchases');
      }
      const requester = await this.usersRepository.findOne({ where: { id: userId } });
      if (!requester) {
        throw new BadRequestException('Workspace-scoped purchases require an authenticated requester');
      }
      const membership = await this.workspaceMembershipsRepository.findOne({
        where: { workspaceId, userId: requester.id, isActive: true },
      });
      if (!membership || membership.role !== 'owner') {
        throw new ForbiddenException('Only workspace owners can apply purchases to a workspace');
      }
    }

    try {
      if (type === 'subscription') {
        const res = await androidpublisher.purchases.subscriptions.get({
          packageName: pkg,
          subscriptionId: productId,
          token,
        } as any);
        // Update our subscription record if verification succeeded
        const verifiedData = res.data || {};

        try {
          const user = await this.usersRepository.findOne({ where: { id: userId } });
          if (user) {
            const subscription = await this.findOrCreateSubscription(user!);
            // map productId to plan if possible
            const targetPlan = /pro/i.test(productId) ? 'pro' : /basic/i.test(productId) ? 'basic' : subscription.plan;
            subscription.plan = targetPlan as any;
            subscription.status = 'active';
            subscription.currentPeriodStartAt = new Date();
            if (verifiedData?.expiryTimeMillis) {
              subscription.currentPeriodEndsAt = new Date(Number(verifiedData.expiryTimeMillis));
            } else {
              // fallback to 30 days
              subscription.currentPeriodEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            }
            subscription.lastPaymentReference = token;
            subscription.metadata = { ...(subscription.metadata || {}), google: verifiedData };
            await this.subscriptionsRepository.save(subscription);

            // update user plan + trial state
            user.plan = subscription.plan;
            user.trialStatus = 'converted';
            await this.usersRepository.save(user);

            // enqueue email + push
            const amountText = 'Google Play';
            const html = this.emailTemplateService.paymentSuccess(
              user.plan,
              amountText,
              token,
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
              data: { productId, purchaseToken: token },
            });
          }
        } catch (e) {
          // non-fatal: we verified with Google but failed to update local records
        }

        return { verified: true, data: verifiedData };
      }

      const res = await androidpublisher.purchases.products.get({
        packageName: pkg,
        productId,
        token,
      } as any);

      // For one-time products, create a minimal payment record and ack
      const productData = res.data || {};
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
      } catch (e) {
        // ignore
      }

      return { verified: true, data: productData };
    } catch (err: any) {
      return { verified: false, error: err?.message || err };
    }
  }

  /** Handle Google Play RTDN push payload (Pub/Sub delivery). */
  async handleGoogleWebhook(payload: Record<string, any>) {
    // The incoming push from Pub/Sub will have a base64 message
    // In many setups, Google will POST { message: { data: 'base64...' } }
    try {
      const msg = payload?.message || payload;
      const dataB64 = msg?.data;
      const decoded = dataB64 ? Buffer.from(dataB64, 'base64').toString('utf8') : JSON.stringify(payload);
      const parsed = JSON.parse(decoded);

      // If this is a subscriptionNotification, attempt to refresh verification
      if (parsed?.subscriptionNotification) {
        const note = parsed.subscriptionNotification;
        const subscriptionId = note?.subscriptionId;
        const purchaseToken = note?.purchaseToken;
        const notificationType = note?.notificationType;

        // Attempt a verification pass if package and ids available
        const pkg = parsed?.packageName || process.env.ANDROID_PACKAGE_NAME || '';
        if (pkg && subscriptionId && purchaseToken) {
          await this.verifyGooglePurchase('', { packageName: pkg, productId: subscriptionId, purchaseToken, purchaseType: 'subscription' });
        }

        // Best-effort: update local subscription state by matching purchase token
        try {
          const subscription = await this.subscriptionsRepository.findOne({ where: { lastPaymentReference: purchaseToken } });
          if (subscription) {
            // Map common notification types to internal statuses
            // Google Play notificationType codes: 2=RENEWED,3=CANCELED,4=PURCHASED,12=REVOKED,13=EXPIRED,5=ON_HOLD,6=IN_GRACE_PERIOD
            if ([2, 4].includes(notificationType)) {
              subscription.status = 'active';
            } else if ([3, 12, 13].includes(notificationType)) {
              subscription.status = notificationType === 13 ? 'expired' : 'cancelled';
            } else if ([5, 6].includes(notificationType)) {
              // Map grace/on-hold to active (no separate 'past_due' state in our enum)
              subscription.status = 'active';
            }

            await this.subscriptionsRepository.save(subscription);

            // notify user if available
            try {
              const user = await this.usersRepository.findOne({ where: { id: subscription.userId } });
              if (user) {
                this.pushService.sendPush({
                  to: user.id,
                  title: 'Subscription updated',
                  body: `Your subscription status is now ${subscription.status}.`,
                  data: { subscriptionId: subscription.id, status: subscription.status },
                });
              }
            } catch (e) {
              // ignore user notification failures
            }
          }
        } catch (e) {
          // swallow best-effort errors
        }
      }

      return { received: true, parsed };
    } catch (err: any) {
      return { received: true, error: err?.message || err };
    }
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

    // Add-ons are applied only for paid subscriptions; never during active trial.
    const { isTrialing } = this.resolveTrialState(user);
    if (!isTrialing) {
      subscription.addonWorkspaceSlots = payment.addonWorkspaceSlots || 0;
      subscription.addonStaffSeats = payment.addonStaffSeats || 0;
      subscription.addonWhatsappBundles = payment.addonWhatsappBundles || 0;
    }

    await this.subscriptionsRepository.save(subscription);

    // Notification triggers: Email and Push
    // Email notification for payment success
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

    // Push notification for payment success
    this.pushService.sendPush({
      to: user.id,
      title: 'Payment Successful',
      body: `Your payment for plan ${user.plan} was successful.`,
      data: { reference: payment.reference, plan: user.plan },
    });
  }
}
