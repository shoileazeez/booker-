import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { User } from '../auth/entities/user.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { Subscription } from './entities/subscription.entity';
import { Payment } from './entities/payment.entity';
import { InitiateCheckoutDto } from './dto/initiate-checkout.dto';
import { EmailQueueService } from '../notifications/email-queue.service';
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
    private readonly emailQueueService: EmailQueueService,
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

  private async paystackRequest(path: string, init?: RequestInit) {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      throw new BadRequestException('PAYSTACK_SECRET_KEY is not configured');
    }

    const res = await fetch(`https://api.paystack.co${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });

    const payload = (await res.json()) as Record<string, any>;
    if (!res.ok || payload?.status === false) {
      throw new BadRequestException(
        payload?.message || 'Paystack request failed',
      );
    }
    return payload;
  }

  getPlans() {
    return {
      currency: 'NGN',
      trialPolicy: {
        days: 14,
        planDuringTrial: 'pro',
        addonsAllowed: false,
      },
      yearlyDiscountPercent: 20,
      basic: {
        key: 'basic',
        pricing: {
          monthly: PLAN_PRICES_NGN.basic,
          yearly: this.toCycleAmount(PLAN_PRICES_NGN.basic, 'yearly'),
        },
        included: {
          workspaceLimit: 1,
          products: 'unlimited',
          transactions: 'unlimited',
          features: [
            'inventory_management',
            'debt_tracking',
            'expense_tracking',
            'basic_reports',
            'csv_excel_export',
            'receipt_generation',
            'customer_profiles',
            'low_stock_push_notifications',
          ],
        },
      },
      pro: {
        key: 'pro',
        pricing: {
          monthly: PLAN_PRICES_NGN.pro,
          yearly: this.toCycleAmount(PLAN_PRICES_NGN.pro, 'yearly'),
        },
        included: {
          workspaceLimit: 3,
          staffSeatLimit: 5,
          whatsappMonthlyQuota: 100,
          features: [
            'everything_in_basic',
            'advanced_reports_and_trends',
            'whatsapp_debt_reminders',
            'whatsapp_payment_receipts',
            'whatsapp_low_stock_alerts_owner',
            'whatsapp_monthly_business_summary',
            'priority_support',
          ],
        },
        addons: {
          workspaceSlot: {
            monthly: 1500,
            yearly: this.toCycleAmount(1500, 'yearly'),
            yearlyDiscountPercent: 20,
          },
          staffSeat: {
            monthly: 500,
            yearly: this.toCycleAmount(500, 'yearly'),
            yearlyDiscountPercent: 20,
          },
          whatsappBundle100: {
            monthly: 2000,
            yearly: this.toCycleAmount(2000, 'yearly'),
            yearlyDiscountPercent: 20,
            messages: 100,
          },
        },
      },
    };
  }

  async getCurrentSubscription(userId: string) {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { isTrialing, isTrialExpired, trialEndsAtMs, now } =
      this.resolveTrialState(user);
    const subscription = await this.findOrCreateSubscription(user);

    const normalizedPlan: PlanKey = user.plan === 'pro' ? 'pro' : 'basic';

    const addOns = {
      workspaceSlots: subscription.addonWorkspaceSlots || 0,
      staffSeats: subscription.addonStaffSeats || 0,
      whatsappBundles: subscription.addonWhatsappBundles || 0,
    };

    const effectiveAddOns = isTrialing
      ? { workspaceSlots: 0, staffSeats: 0, whatsappBundles: 0 }
      : addOns;
    const limits = this.computeLimits(normalizedPlan, effectiveAddOns);
    const ownedWorkspaceCount = await this.workspacesRepository.count({
      where: { createdBy: { id: userId } },
    });

    return {
      status: isTrialing ? 'trialing' : isTrialExpired ? 'expired' : 'active',
      upgradeRequired: isTrialExpired,
      plan: normalizedPlan,
      trial: {
        status: user.trialStatus,
        startAt: user.trialStartAt,
        endsAt: user.trialEndsAt,
        daysLeft:
          isTrialing && trialEndsAtMs
            ? Math.ceil((trialEndsAtMs - now) / (24 * 60 * 60 * 1000))
            : 0,
        addonsAllowed: !isTrialing,
      },
      addOns: effectiveAddOns,
      limits: {
        ...limits,
        workspaceUsed: ownedWorkspaceCount,
      },
      billing: {
        subscriptionId: subscription.id,
        lastPaymentReference: subscription.lastPaymentReference,
        billingCycle: subscription.billingCycle || 'monthly',
      },
    };
  }

  async getUsage(userId: string) {
    const subscription = await this.getCurrentSubscription(userId);
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const persistedSubscription = await this.findOrCreateSubscription(user);

    const whatsappUsed =
      persistedSubscription.whatsappMessagesUsedThisMonth || 0;
    const whatsappLimit = subscription.limits.whatsappMonthlyQuota;
    const automationPaused =
      whatsappLimit > 0 ? whatsappUsed >= whatsappLimit : true;

    return {
      workspace: {
        used: subscription.limits.workspaceUsed,
        limit: subscription.limits.workspaceLimit,
      },
      staff: {
        used: null,
        limit: subscription.limits.staffSeatLimit,
      },
      whatsapp: {
        used: whatsappUsed,
        limit: whatsappLimit,
      },
      automationPaused,
      reason: automationPaused
        ? whatsappLimit <= 0
          ? 'WhatsApp quota unavailable for current plan'
          : 'WhatsApp quota exhausted; buy add-on bundle to resume automation'
        : null,
    };
  }

  async initiateCheckout(userId: string, dto: InitiateCheckoutDto) {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const { isTrialing } = this.resolveTrialState(user);
    const targetPlan: PlanKey = dto.plan === 'pro' ? 'pro' : 'basic';
    const billingCycle: BillingCycle =
      dto.billingCycle === 'yearly' ? 'yearly' : 'monthly';
    const requestedAddons = this.normalizeAddons({
      workspaceSlots: dto.addonWorkspaceSlots,
      staffSeats: dto.addonStaffSeats,
      whatsappBundles: dto.addonWhatsappBundles,
    });

    if (
      isTrialing &&
      (requestedAddons.workspaceSlots > 0 ||
        requestedAddons.staffSeats > 0 ||
        requestedAddons.whatsappBundles > 0)
    ) {
      throw new ForbiddenException(
        'Add-ons are not allowed during active trial.',
      );
    }

    const planAmount = this.toCycleAmount(
      PLAN_PRICES_NGN[targetPlan],
      billingCycle,
    );
    const addonsAmount = this.toCycleAmount(
      this.calculateAddonsAmount(requestedAddons),
      billingCycle,
    );
    const amountNgn = planAmount + addonsAmount;
    if (amountNgn <= 0)
      throw new BadRequestException('Invalid checkout amount');

    const reference =
      `BRK_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
    const callbackUrl =
      process.env.PAYSTACK_CALLBACK_URL ||
      'https://example.com/paystack/callback';

    const payment = this.paymentsRepository.create({
      userId,
      reference,
      status: 'pending',
      amount: amountNgn,
      currency: 'NGN',
      purchaseType:
        requestedAddons.workspaceSlots > 0 ||
        requestedAddons.staffSeats > 0 ||
        requestedAddons.whatsappBundles > 0
          ? 'addon_purchase'
          : 'plan_upgrade',
      billingCycle,
      targetPlan,
      addonWorkspaceSlots: requestedAddons.workspaceSlots,
      addonStaffSeats: requestedAddons.staffSeats,
      addonWhatsappBundles: requestedAddons.whatsappBundles,
      metadata: {
        userId,
        targetPlan,
        billingCycle,
        addons: requestedAddons,
      },
    });
    await this.paymentsRepository.save(payment);

    const initialized = await this.paystackRequest('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email: user.email,
        amount: amountNgn * 100,
        currency: 'NGN',
        reference,
        callback_url: callbackUrl,
        metadata: {
          userId,
          plan: targetPlan,
          billingCycle,
          addons: requestedAddons,
          paymentId: payment.id,
        },
      }),
    });

    return {
      reference,
      amount: amountNgn,
      currency: 'NGN',
      billingCycle,
      authUrl: initialized.data?.authorization_url,
      accessCode: initialized.data?.access_code,
    };
  }

  async verifyPayment(reference: string, userId?: string) {
    const payment = await this.paymentsRepository.findOne({
      where: { reference },
    });
    if (!payment) throw new NotFoundException('Payment reference not found');
    if (userId && payment.userId !== userId)
      throw new ForbiddenException('Payment does not belong to user');

    const verified = await this.paystackRequest(
      `/transaction/verify/${encodeURIComponent(reference)}`,
    );
    const status = verified.data?.status;

    if (status !== 'success') {
      payment.status = 'failed';
      payment.rawResponse = verified;
      await this.paymentsRepository.save(payment);
      throw new BadRequestException('Payment is not successful');
    }

    await this.applySuccessfulPayment(payment, verified);
    return {
      message: 'Payment verified successfully',
      reference,
    };
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
    this.emailQueueService.enqueue({
      to: user.email,
      subject: 'Payment Successful',
      text: `Your payment for plan ${user.plan} was successful. Reference: ${payment.reference}`,
      html: `<p>Your payment for plan <b>${user.plan}</b> was successful.<br/>Reference: <b>${payment.reference}</b></p>`,
    });

    // Push notification for payment success
    this.pushService.sendPush({
      to: user.id,
      title: 'Payment Successful',
      body: `Your payment for plan ${user.plan} was successful.`,
      data: { reference: payment.reference, plan: user.plan },
    });
  }

  async handleWebhook(payload: Record<string, any>, signature?: string) {
    const secret =
      process.env.PAYSTACK_WEBHOOK_SECRET || process.env.PAYSTACK_SECRET_KEY;
    if (!secret)
      throw new BadRequestException('Paystack webhook secret not configured');

    const computed = crypto
      .createHmac('sha512', secret)
      .update(JSON.stringify(payload))
      .digest('hex');
    if (!signature || signature !== computed) {
      throw new ForbiddenException('Invalid webhook signature');
    }

    const event = payload?.event;
    const reference = payload?.data?.reference;
    if (!reference) {
      return { received: true, ignored: true };
    }

    if (event === 'charge.success') {
      const payment = await this.paymentsRepository.findOne({
        where: { reference },
      });
      if (!payment) return { received: true, ignored: true };
      await this.applySuccessfulPayment(payment, payload);
      return { received: true, processed: true };
    }

    if (event === 'charge.failed') {
      const payment = await this.paymentsRepository.findOne({
        where: { reference },
      });
      if (payment && payment.status !== 'success') {
        payment.status = 'failed';
        payment.rawResponse = payload;
        await this.paymentsRepository.save(payment);
      }
    }

    return { received: true, processed: false };
  }
}
