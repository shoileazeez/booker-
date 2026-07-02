import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { User } from '../auth/entities/user.entity';
import { Subscription } from './entities/subscription.entity';
import { Payment } from './entities/payment.entity';
import { EmailQueueService } from '../notifications/email-queue.service';
import { EmailTemplateService } from '../notifications/email-template.service';
import { PushService } from '../notifications/push.service';

type PlanKey = 'basic' | 'pro';
type BillingCycle = 'monthly' | 'yearly';

const ENTITLEMENT_TO_PLAN: Record<string, PlanKey> = {
  bizrecord_pro: 'pro',
  bizrecord_basic: 'basic',
};

function inferPlanFromProductId(productId: string, fallback: PlanKey = 'basic'): PlanKey {
  if (/pro/i.test(productId)) return 'pro';
  if (/basic/i.test(productId)) return 'basic';
  return fallback;
}

function inferBillingCycle(productId: string, fallback: BillingCycle = 'monthly'): BillingCycle {
  if (/year|annual/i.test(productId)) return 'yearly';
  if (/month/i.test(productId)) return 'monthly';
  return fallback;
}

function inferPurchaseKindFromProductId(productId: string): 'plan' | 'addon_workspace_slot' | 'addon_staff_seat' | 'addon_whatsapp_bundle_100' {
  if (/addon[_\-]?workspace/i.test(productId)) return 'addon_workspace_slot';
  if (/addon[_\-]?staff/i.test(productId)) return 'addon_staff_seat';
  if (/addon[_\-]?whatsapp/i.test(productId)) return 'addon_whatsapp_bundle_100';
  return 'plan';
}

function inferAddonType(productId: string): 'workspaceSlots' | 'staffSeats' | 'whatsappBundles' | null {
  if (/addon[_\-]?workspace/i.test(productId)) return 'workspaceSlots';
  if (/addon[_\-]?staff/i.test(productId)) return 'staffSeats';
  if (/addon[_\-]?whatsapp/i.test(productId)) return 'whatsappBundles';
  return null;
}

@Injectable()
export class RevenueCatWebhookService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Subscription)
    private subscriptionsRepository: Repository<Subscription>,
    @InjectRepository(Payment)
    private paymentsRepository: Repository<Payment>,
    private readonly emailQueueService: EmailQueueService,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly pushService: PushService,
  ) {}

  private verifyWebhookSignature(
    payload: string,
    signature: string | undefined,
  ): boolean {
    const sharedSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
    if (!sharedSecret) {
      return true;
    }
    if (!signature) {
      return false;
    }
    const expected = crypto
      .createHmac('sha256', sharedSecret)
      .update(payload)
      .digest('base64');
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    );
  }

  private async findOrCreateSubscription(user: User) {
    let subscription = await this.subscriptionsRepository.findOne({
      where: { userId: user.id },
    });

    if (!subscription) {
      subscription = this.subscriptionsRepository.create({
        userId: user.id,
        plan: (user.plan as PlanKey) === 'pro' ? 'pro' : 'basic',
        status: 'expired',
        trialEndsAt: null,
        currentPeriodStartAt: null,
        currentPeriodEndsAt: null,
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

  async handleWebhook(
    rawBody: string,
    signature?: string,
    authorization?: string,
  ) {
    const authEnabled = process.env.REVENUECAT_WEBHOOK_AUTH_DISABLED !== 'true';
    if (authEnabled) {
      const authHeader = authorization || '';
      const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
      if (bearerToken) {
        const configuredSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
        if (configuredSecret && bearerToken !== configuredSecret) {
          throw new UnauthorizedException('Invalid RevenueCat webhook secret');
        }
      } else if (!this.verifyWebhookSignature(rawBody, signature)) {
        throw new UnauthorizedException('Invalid RevenueCat webhook signature');
      }
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      throw new BadRequestException('Invalid JSON payload');
    }

    const event = payload?.event;
    if (!event) {
      return { received: true };
    }

    const eventType = event.event;
    const appUserId = event.app_user_id;
    const productId = event.product_id;
    const entitlementIds: string[] = event.entitlement_ids || [];
    const expirationMs = event.expiration_at_ms
      ? parseInt(event.expiration_at_ms, 10)
      : null;
    const purchasedAtMs = event.purchased_at_ms
      ? parseInt(event.purchased_at_ms, 10)
      : null;
    const isRenewal = event.is_renewal === true;
    const isTrialConversion = event.is_trial_conversion === true;
    const periodType = event.period_type;
    const store = event.store;
    const environment = event.environment;
    const cancellationReason = event.cancellation_reason || null;

    if (!appUserId) {
      return { received: true, event: eventType };
    }

    const user = await this.usersRepository.findOne({
      where: { id: appUserId },
    });
    if (!user) {
      return { received: true, event: eventType, ignored: 'user_not_found' };
    }

    const subscription = await this.findOrCreateSubscription(user);
    const purchaseKind = inferPurchaseKindFromProductId(productId || '');
    const billingCycle = inferBillingCycle(productId || '', subscription.billingCycle || 'monthly');

    switch (eventType) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'TRIAL_STARTED':
      case 'TRIAL_CONVERSION':
      case 'UNCANCELLATION': {
        if (purchaseKind === 'plan') {
          const plan = ENTITLEMENT_TO_PLAN[entitlementIds[0]]
            || inferPlanFromProductId(productId || '', subscription.plan || 'basic');

          subscription.plan = plan;
          subscription.billingCycle = billingCycle;
          subscription.status = 'active';
          subscription.currentPeriodStartAt = purchasedAtMs
            ? new Date(purchasedAtMs)
            : subscription.currentPeriodStartAt || new Date();
          subscription.currentPeriodEndsAt = expirationMs
            ? new Date(expirationMs)
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          subscription.lastPaymentReference = event.transaction_id || productId;

          if (periodType === 'TRIAL' || isTrialConversion) {
            subscription.status = 'trialing';
            subscription.trialEndsAt = expirationMs
              ? new Date(expirationMs)
              : null;
          } else {
            subscription.trialEndsAt = null;
          }

          subscription.metadata = {
            ...(subscription.metadata || {}),
            revenuecat: {
              ...((subscription.metadata as any)?.revenuecat || {}),
              lastEvent: eventType,
              productId,
              entitlementIds,
              store,
              environment,
              transactionId: event.transaction_id,
              originalTransactionId: event.original_transaction_id,
              updatedAt: new Date().toISOString(),
            },
          };

          await this.subscriptionsRepository.save(subscription);

          user.plan = subscription.plan;
          if (periodType !== 'TRIAL' && !isTrialConversion) {
            user.trialStatus = 'converted';
          }
          await this.usersRepository.save(user);

          const payment = this.paymentsRepository.create({
            userId: user.id,
            reference: event.transaction_id || productId || `rc-${Date.now()}`,
            status: 'success',
            amount: event.price_in_purchased_currency
              ? Math.round(event.price_in_purchased_currency * 100)
              : 0,
            currency: event.currency || 'USD',
            purchaseType: 'plan_upgrade',
            billingCycle: subscription.billingCycle,
            targetPlan: subscription.plan,
            metadata: {
              revenuecat: {
                eventType,
                productId,
                entitlementIds,
                store,
                environment,
                transactionId: event.transaction_id,
                period_type: periodType,
                is_renewal: isRenewal,
              },
            },
            rawResponse: event,
          });
          await this.paymentsRepository.save(payment);

          if (eventType === 'INITIAL_PURCHASE' || (eventType === 'RENEWAL' && isRenewal)) {
            const amountText = event.price_in_purchased_currency
              ? `${event.currency || 'USD'} ${(event.price_in_purchased_currency).toFixed(2)}`
              : store || 'RevenueCat';
            const html = this.emailTemplateService.paymentSuccess(
              subscription.plan,
              amountText,
              payment.reference,
              subscription.currentPeriodEndsAt || undefined,
            );
            this.emailQueueService.enqueue({
              to: user.email,
              subject: `Subscription ${eventType === 'RENEWAL' ? 'renewed' : 'activated'} - BizRecord`,
              text: `Your ${subscription.plan} subscription was ${eventType === 'RENEWAL' ? 'renewed' : 'activated'} via ${store || 'RevenueCat'}.`,
              html,
            });
            this.pushService.sendPush({
              to: user.id,
              title: `Subscription ${eventType === 'RENEWAL' ? 'renewed' : 'active'}`,
              body: `Your ${subscription.plan} subscription is ${eventType === 'RENEWAL' ? 'renewed' : 'active'}.`,
              data: { productId, reference: payment.reference },
            });
          }
        } else {
          const addonType = inferAddonType(productId || '');
          if (addonType === 'workspaceSlots') {
            subscription.addonWorkspaceSlots = (subscription.addonWorkspaceSlots || 0) + 1;
          } else if (addonType === 'staffSeats') {
            subscription.addonStaffSeats = (subscription.addonStaffSeats || 0) + 1;
          } else if (addonType === 'whatsappBundles') {
            subscription.addonWhatsappBundles = (subscription.addonWhatsappBundles || 0) + 1;
          }

          subscription.billingCycle = billingCycle;
          subscription.lastPaymentReference = event.transaction_id || productId;
          subscription.status = 'active';
          subscription.metadata = {
            ...(subscription.metadata || {}),
            revenuecat: {
              ...((subscription.metadata as any)?.revenuecat || {}),
              lastEvent: eventType,
              productId,
              entitlementIds,
              store,
              environment,
              transactionId: event.transaction_id,
              updatedAt: new Date().toISOString(),
            },
          };
          await this.subscriptionsRepository.save(subscription);

          const payment = this.paymentsRepository.create({
            userId: user.id,
            reference: event.transaction_id || productId || `rc-addon-${Date.now()}`,
            status: 'success',
            amount: event.price_in_purchased_currency
              ? Math.round(event.price_in_purchased_currency * 100)
              : 0,
            currency: event.currency || 'USD',
            purchaseType: 'addon_purchase',
            billingCycle: subscription.billingCycle,
            targetPlan: subscription.plan,
            addonWorkspaceSlots: addonType === 'workspaceSlots' ? 1 : 0,
            addonStaffSeats: addonType === 'staffSeats' ? 1 : 0,
            addonWhatsappBundles: addonType === 'whatsappBundles' ? 1 : 0,
            metadata: {
              revenuecat: {
                eventType,
                productId,
                addonType,
                store,
                environment,
                transactionId: event.transaction_id,
              },
            },
            rawResponse: event,
          });
          await this.paymentsRepository.save(payment);

          this.pushService.sendPush({
            to: user.id,
            title: 'Add-on activated',
            body: `Your ${addonType} add-on is now active.`,
            data: { productId, addonType, reference: payment.reference },
          });
        }
        break;
      }

      case 'CANCELLATION': {
        subscription.status = 'cancelled';
        subscription.currentPeriodEndsAt = expirationMs
          ? new Date(expirationMs)
          : subscription.currentPeriodEndsAt;
        subscription.metadata = {
          ...(subscription.metadata || {}),
          revenuecat: {
            ...((subscription.metadata as any)?.revenuecat || {}),
            lastEvent: eventType,
            cancellationReason,
            productId,
            updatedAt: new Date().toISOString(),
          },
        };
        await this.subscriptionsRepository.save(subscription);

        this.pushService.sendPush({
          to: user.id,
          title: 'Subscription cancelled',
          body: 'Your subscription has been cancelled. It will remain active until the end of the billing period.',
          data: { cancellationReason, currentPeriodEndsAt: subscription.currentPeriodEndsAt },
        });
        break;
      }

      case 'EXPIRATION': {
        subscription.status = 'expired';
        subscription.metadata = {
          ...(subscription.metadata || {}),
          revenuecat: {
            ...((subscription.metadata as any)?.revenuecat || {}),
            lastEvent: eventType,
            productId,
            updatedAt: new Date().toISOString(),
          },
        };
        await this.subscriptionsRepository.save(subscription);

        this.pushService.sendPush({
          to: user.id,
          title: 'Subscription expired',
          body: 'Your subscription has expired. Renew to continue using BizRecord features.',
          data: { productId },
        });
        break;
      }

      case 'BILLING_ISSUE': {
        subscription.metadata = {
          ...(subscription.metadata || {}),
          revenuecat: {
            ...((subscription.metadata as any)?.revenuecat || {}),
            lastEvent: eventType,
            productId,
            updatedAt: new Date().toISOString(),
          },
        };
        await this.subscriptionsRepository.save(subscription);

        this.emailQueueService.enqueue({
          to: user.email,
          subject: 'Billing issue with your BizRecord subscription',
          text: 'There was a billing issue with your subscription. Please update your payment method to avoid interruption.',
          html: this.emailTemplateService.genericNotification(
            'Billing issue',
            'There was a billing issue with your BizRecord subscription.',
            'Please update your payment method in the app to avoid service interruption.',
          ),
        });
        break;
      }

      case 'NON_RENEWING_PURCHASE': {
        if (purchaseKind !== 'plan') {
          const addonType = inferAddonType(productId || '');
          if (addonType === 'workspaceSlots') {
            subscription.addonWorkspaceSlots = (subscription.addonWorkspaceSlots || 0) + 1;
          } else if (addonType === 'staffSeats') {
            subscription.addonStaffSeats = (subscription.addonStaffSeats || 0) + 1;
          } else if (addonType === 'whatsappBundles') {
            subscription.addonWhatsappBundles = (subscription.addonWhatsappBundles || 0) + 1;
          }
          await this.subscriptionsRepository.save(subscription);

          this.pushService.sendPush({
            to: user.id,
            title: 'Add-on activated',
            body: `Your ${addonType} add-on is now active.`,
            data: { productId, addonType },
          });
        }
        break;
      }

      default:
        break;
    }

    return { received: true, event: eventType };
  }
}
