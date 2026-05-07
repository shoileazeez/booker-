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
import { DataSource, Repository } from 'typeorm';
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

type PlanLimits = {
  workspaceLimit: number;
  staffSeatLimit: number;
  whatsappMonthlyQuota: number;
};

type WorkspaceBillingContext = {
  workspaceId: string;
  ownerId: string;
  plan: PlanKey;
  billingCycle: BillingCycle;
  status: string;
  isActive: boolean;
  currentPeriodEndsAt: Date | null;
  trial: {
    isTrialing: boolean;
    trialEndsAt: Date | null;
    addonsAllowed: boolean;
  };
  limits: PlanLimits;
  usage: {
    whatsappMessagesUsedThisMonth: number;
  };
};

const PLAN_PRICES_NGN: Record<PlanKey, number> = {
  basic: 2500,
  pro: 7000,
};
const YEARLY_DISCOUNT_RATE = 0.2;

@Injectable()
export class BillingService {
  private readonly googleWebhookAuthClient = new OAuth2Client();
  private static readonly ACTIVE_SUBSCRIPTION_STATES = new Set([
    'SUBSCRIPTION_STATE_ACTIVE',
    'SUBSCRIPTION_STATE_IN_GRACE_PERIOD',
    'SUBSCRIPTION_STATE_ON_HOLD',
    'SUBSCRIPTION_STATE_PAUSED',
  ]);

  constructor(
    private readonly dataSource: DataSource,
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

  private computeLimits(plan: PlanKey, addOns: Addons): PlanLimits {
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

    const plan: PlanKey =
      (subscription?.plan as PlanKey) === 'pro' ? 'pro' : 'basic';
    const limits = this.computeLimits(plan, {
      workspaceSlots: subscription?.addonWorkspaceSlots || 0,
      staffSeats: subscription?.addonStaffSeats || 0,
      whatsappBundles: subscription?.addonWhatsappBundles || 0,
    });

    return {
      whatsappMessagesUsedThisMonth:
        subscription?.whatsappMessagesUsedThisMonth || 0,
      limits,
    };
  }

  private async findOrCreateSubscriptionRecord(
    subscriptionsRepository: Repository<Subscription>,
    user: User,
  ) {
    let subscription = await subscriptionsRepository.findOne({
      where: { userId: user.id },
    });

    if (!subscription) {
      const plan: PlanKey = (user.plan as PlanKey) === 'pro' ? 'pro' : 'basic';
      subscription = subscriptionsRepository.create({
        userId: user.id,
        plan,
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
      subscription = await subscriptionsRepository.save(subscription);
    }

    return subscription;
  }

  private async findOrCreateSubscription(user: User) {
    return this.findOrCreateSubscriptionRecord(
      this.subscriptionsRepository,
      user,
    );
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

  private inferPurchaseKindFromProductId(
    productId: string,
  ):
    | 'plan'
    | 'addon_workspace_slot'
    | 'addon_staff_seat'
    | 'addon_whatsapp_bundle_100' {
    if (/addon[_\-]?workspace/i.test(productId)) {
      return 'addon_workspace_slot';
    }
    if (/addon[_\-]?staff/i.test(productId)) {
      return 'addon_staff_seat';
    }
    if (/addon[_\-]?whatsapp/i.test(productId)) {
      return 'addon_whatsapp_bundle_100';
    }
    return 'plan';
  }

  private buildGooglePaymentMetadata(
    verifiedData: Record<string, any>,
    extra: Record<string, unknown> = {},
  ) {
    return {
      google: verifiedData,
      ...extra,
    };
  }

  private async getPaymentByReference(reference: string) {
    return this.paymentsRepository.findOne({
      where: { reference },
    });
  }

  private async recordVerifiedGooglePayment(params: {
    userId: string;
    reference: string;
    billingCycle: BillingCycle;
    purchaseType: Payment['purchaseType'];
    targetPlan: Payment['targetPlan'];
    metadata: Record<string, unknown>;
    rawResponse?: Record<string, unknown> | null;
    addonWorkspaceSlots?: number;
    addonStaffSeats?: number;
    addonWhatsappBundles?: number;
  }) {
    let payment = await this.getPaymentByReference(params.reference);

    if (payment && payment.userId !== params.userId) {
      throw new ForbiddenException(
        'Purchase token already belongs to another user',
      );
    }

    const isFirstSuccess = !payment || payment.status !== 'success';

    if (!payment) {
      payment = this.paymentsRepository.create({
        userId: params.userId,
        reference: params.reference,
        status: 'success',
        amount: 0,
        currency: 'NGN',
        purchaseType: params.purchaseType,
        billingCycle: params.billingCycle,
        targetPlan: params.targetPlan,
        addonWorkspaceSlots: params.addonWorkspaceSlots || 0,
        addonStaffSeats: params.addonStaffSeats || 0,
        addonWhatsappBundles: params.addonWhatsappBundles || 0,
        metadata: params.metadata,
        rawResponse: params.rawResponse || null,
      });
    } else {
      payment.status = 'success';
      payment.billingCycle = params.billingCycle;
      payment.purchaseType = params.purchaseType;
      payment.targetPlan = params.targetPlan;
      payment.addonWorkspaceSlots = params.addonWorkspaceSlots || 0;
      payment.addonStaffSeats = params.addonStaffSeats || 0;
      payment.addonWhatsappBundles = params.addonWhatsappBundles || 0;
      payment.metadata = params.metadata;
      payment.rawResponse = params.rawResponse || payment.rawResponse || null;
    }

    payment = await this.paymentsRepository.save(payment);
    return { payment, isFirstSuccess };
  }

  private toPlanKey(plan?: string | null): PlanKey {
    return plan === 'pro' ? 'pro' : 'basic';
  }

  private toBillingCycle(cycle?: string | null): BillingCycle {
    return cycle === 'yearly' ? 'yearly' : 'monthly';
  }

  async getWorkspaceBillingContext(
    workspaceId: string,
  ): Promise<WorkspaceBillingContext> {
    const workspace = await this.workspacesRepository.findOne({
      where: { id: workspaceId },
      relations: ['createdBy'],
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const owner = workspace.createdBy;
    if (!owner) {
      throw new NotFoundException('Workspace owner not found');
    }

    const subscription = await this.subscriptionsRepository.findOne({
      where: { userId: owner.id },
    });

    const plan = this.toPlanKey(subscription?.plan || owner.plan);
    const billingCycle = this.toBillingCycle(
      subscription?.billingCycle || 'monthly',
    );
    const status = subscription?.status || 'inactive';
    const isActive = status === 'active' || status === 'trialing';

    const limits = this.computeLimits(plan, {
      workspaceSlots: subscription?.addonWorkspaceSlots || 0,
      staffSeats: subscription?.addonStaffSeats || 0,
      whatsappBundles: subscription?.addonWhatsappBundles || 0,
    });

    const trialEndsAt =
      subscription?.status === 'trialing'
        ? subscription.currentPeriodEndsAt || subscription.trialEndsAt || null
        : null;

    const whatsappMessagesUsedThisMonth =
      subscription?.whatsappMessagesUsedThisMonth || 0;

    return {
      workspaceId,
      ownerId: owner.id,
      plan,
      billingCycle,
      status,
      isActive,
      currentPeriodEndsAt: subscription?.currentPeriodEndsAt || null,
      trial: {
        isTrialing: subscription?.status === 'trialing',
        trialEndsAt,
        addonsAllowed: subscription?.status !== 'trialing',
      },
      limits,
      usage: {
        whatsappMessagesUsedThisMonth,
      },
    };
  }

  async getWorkspaceBillingContextForUser(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceBillingContext> {
    const membership = await this.workspaceMembershipsRepository.findOne({
      where: { workspaceId, userId, isActive: true },
    });

    if (!membership) {
      throw new ForbiddenException('You do not belong to this workspace');
    }

    return this.getWorkspaceBillingContext(workspaceId);
  }

  async assertWorkspaceActive(
    workspaceId: string,
    feature?: string,
  ): Promise<WorkspaceBillingContext> {
    const ctx = await this.getWorkspaceBillingContext(workspaceId);

    if (!ctx.isActive) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'SUBSCRIPTION_INACTIVE',
        message:
          'This workspace subscription is inactive or expired. Renew to continue using this feature.',
        meta: {
          workspaceId,
          plan: ctx.plan,
          status: ctx.status,
          feature: feature || null,
        },
      } as any);
    }

    return ctx;
  }

  async assertWorkspaceProFeature(
    workspaceId: string,
    feature: string,
  ): Promise<WorkspaceBillingContext> {
    const ctx = await this.assertWorkspaceActive(workspaceId, feature);

    if (ctx.plan !== 'pro') {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PRO_PLAN_REQUIRED',
        message: 'This feature is available on the Pro plan only.',
        meta: {
          workspaceId,
          plan: ctx.plan,
          feature,
        },
      } as any);
    }

    return ctx;
  }

  private async applyVerifiedAddonPurchase(params: {
    userId: string;
    productId: string;
    purchaseToken: string;
    purchaseKind:
      | 'addon_workspace_slot'
      | 'addon_staff_seat'
      | 'addon_whatsapp_bundle_100';
    billingCycle: BillingCycle;
    verifiedData: Record<string, any>;
  }) {
    return this.dataSource.transaction(async (manager) => {
      const usersRepository = manager.getRepository(User);
      const subscriptionsRepository = manager.getRepository(Subscription);
      const paymentsRepository = manager.getRepository(Payment);

      let payment = await paymentsRepository.findOne({
        where: { reference: params.purchaseToken },
      });

      if (payment?.userId && payment.userId !== params.userId) {
        throw new ForbiddenException(
          'Purchase token already belongs to another user',
        );
      }

      if (payment?.status === 'success') {
        const existingSubscription = await subscriptionsRepository.findOne({
          where: { userId: params.userId },
        });
        return existingSubscription;
      }

      const user = await usersRepository.findOne({
        where: { id: params.userId },
      });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      const subscription = await this.findOrCreateSubscriptionRecord(
        subscriptionsRepository,
        user,
      );
      if (subscription.status === 'trialing') {
        throw new BadRequestException(
          'Add-ons cannot be purchased during active trial',
        );
      }
      if (subscription.plan !== 'pro') {
        throw new BadRequestException(
          'Add-ons are available only for Pro subscription',
        );
      }

      if (!payment) {
        payment = paymentsRepository.create({
          userId: user.id,
          reference: params.purchaseToken,
          status: 'pending',
          amount: 0,
          currency: 'NGN',
          purchaseType: 'addon_purchase',
          billingCycle: params.billingCycle,
          targetPlan: subscription.plan,
          addonWorkspaceSlots:
            params.purchaseKind === 'addon_workspace_slot' ? 1 : 0,
          addonStaffSeats: params.purchaseKind === 'addon_staff_seat' ? 1 : 0,
          addonWhatsappBundles:
            params.purchaseKind === 'addon_whatsapp_bundle_100' ? 1 : 0,
          metadata: this.buildGooglePaymentMetadata(params.verifiedData, {
            purchaseKind: params.purchaseKind,
            productId: params.productId,
          }),
          rawResponse: params.verifiedData,
        });
        payment = await paymentsRepository.save(payment);
      }

      if (params.purchaseKind === 'addon_workspace_slot') {
        subscription.addonWorkspaceSlots =
          (subscription.addonWorkspaceSlots || 0) + 1;
      } else if (params.purchaseKind === 'addon_staff_seat') {
        subscription.addonStaffSeats = (subscription.addonStaffSeats || 0) + 1;
      } else if (params.purchaseKind === 'addon_whatsapp_bundle_100') {
        subscription.addonWhatsappBundles =
          (subscription.addonWhatsappBundles || 0) + 1;
      }

      subscription.billingCycle = params.billingCycle;
      subscription.lastPaymentReference = params.purchaseToken;
      subscription.status = 'active';
      subscription.metadata = {
        ...(subscription.metadata || {}),
        google: {
          ...((subscription.metadata as any)?.google || {}),
          lastAddonPurchase: {
            productId: params.productId,
            purchaseToken: params.purchaseToken,
            purchaseKind: params.purchaseKind,
            billingCycle: params.billingCycle,
            verifiedAt: new Date().toISOString(),
            verifiedData: params.verifiedData,
          },
        },
      };
      await subscriptionsRepository.save(subscription);

      payment.status = 'success';
      payment.billingCycle = params.billingCycle;
      payment.targetPlan = subscription.plan;
      payment.metadata = this.buildGooglePaymentMetadata(params.verifiedData, {
        purchaseKind: params.purchaseKind,
        productId: params.productId,
      });
      payment.rawResponse = params.verifiedData;
      await paymentsRepository.save(payment);

      return subscription;
    });
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
    purchaseToken: string,
  ) {
    const androidpublisher = await this.getAndroidPublisherClient();
    const res = await androidpublisher.purchases.subscriptionsv2.get({
      packageName,
      token: purchaseToken,
    } as any);

    return res.data || {};
  }

  private getGoogleSubscriptionLineItem(
    verifiedData: Record<string, any>,
    fallbackProductId?: string,
  ) {
    const lineItems = Array.isArray(verifiedData?.lineItems)
      ? verifiedData.lineItems
      : [];
    if (!lineItems.length) {
      return null;
    }

    if (fallbackProductId) {
      const matched = lineItems.find(
        (item: Record<string, any>) => item?.productId === fallbackProductId,
      );
      if (matched) {
        return matched;
      }
    }

    return lineItems[0];
  }

  private getGoogleSubscriptionExpiryDate(
    verifiedData: Record<string, any>,
    fallbackProductId?: string,
  ) {
    const lineItem = this.getGoogleSubscriptionLineItem(
      verifiedData,
      fallbackProductId,
    );
    const expiryTime = lineItem?.expiryTime;
    if (!expiryTime) {
      return null;
    }

    const expiryDate = new Date(expiryTime);
    return Number.isNaN(expiryDate.getTime()) ? null : expiryDate;
  }

  private isAcknowledgedGoogleSubscription(verifiedData: Record<string, any>) {
    return (
      verifiedData?.acknowledgementState ===
      'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'
    );
  }

  private isActiveGoogleSubscription(verifiedData: Record<string, any>) {
    return BillingService.ACTIVE_SUBSCRIPTION_STATES.has(
      String(verifiedData?.subscriptionState || ''),
    );
  }

  private isMatchingGoogleSubscriptionProduct(
    verifiedData: Record<string, any>,
    productId: string,
  ) {
    const lineItem = this.getGoogleSubscriptionLineItem(
      verifiedData,
      productId,
    );
    return !!lineItem && lineItem.productId === productId;
  }

  private async acknowledgeGoogleSubscriptionPurchase(
    packageName: string,
    productId: string,
    purchaseToken: string,
  ) {
    const androidpublisher = await this.getAndroidPublisherClient();
    await androidpublisher.purchases.subscriptions.acknowledge({
      packageName,
      subscriptionId: productId,
      token: purchaseToken,
      requestBody: {},
    } as any);
  }

  private async acknowledgeGoogleProductPurchase(
    packageName: string,
    productId: string,
    purchaseToken: string,
  ) {
    const androidpublisher = await this.getAndroidPublisherClient();
    await androidpublisher.purchases.products.acknowledge({
      packageName,
      productId,
      token: purchaseToken,
      requestBody: {},
    } as any);
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
    packageName: string,
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
    subscription.plan = this.inferPlanFromProductId(
      productId,
      subscription.plan,
    );
    subscription.billingCycle = this.inferBillingCycleFromProductId(
      productId,
      subscription.billingCycle || 'monthly',
    );
    const lineItem = this.getGoogleSubscriptionLineItem(
      verifiedData,
      productId,
    );
    const expiryDate =
      this.getGoogleSubscriptionExpiryDate(verifiedData, productId) ||
      subscription.currentPeriodEndsAt ||
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const hasPendingAcknowledgement =
      !this.isAcknowledgedGoogleSubscription(verifiedData);
    const activeStatusFromPlay = this.isActiveGoogleSubscription(verifiedData);
    const offerTags = Array.isArray(lineItem?.offerDetails?.offerTags)
      ? lineItem.offerDetails.offerTags
      : [];
    const isTrialOffer =
      !!lineItem?.offerDetails?.offerId &&
      offerTags.some((tag: string) => /trial/i.test(String(tag)));

    if (hasPendingAcknowledgement) {
      await this.acknowledgeGoogleSubscriptionPurchase(
        packageName,
        productId,
        purchaseToken,
      );
      verifiedData = {
        ...verifiedData,
        acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
      };
    }

    if (activeStatusFromPlay && isTrialOffer) {
      subscription.status = 'trialing';
      subscription.trialEndsAt = expiryDate;
    } else {
      subscription.status =
        this.mapGoogleNotificationStatus(options?.notificationType) ||
        (activeStatusFromPlay ? 'active' : 'expired');
      subscription.trialEndsAt = null;
    }

    subscription.currentPeriodStartAt =
      subscription.currentPeriodStartAt || new Date();
    subscription.currentPeriodEndsAt = expiryDate;
    subscription.lastPaymentReference = purchaseToken;
    subscription.metadata = {
      ...(subscription.metadata || {}),
      google: {
        ...((subscription.metadata as any)?.google || {}),
        ...verifiedData,
        linkedPurchaseToken:
          options?.linkedPurchaseToken ||
          verifiedData?.linkedPurchaseToken ||
          null,
        notificationType: options?.notificationType ?? null,
        productId,
        purchaseToken,
        verifiedAt: new Date().toISOString(),
      },
    };
    await this.subscriptionsRepository.save(subscription);

    const paymentRecord = await this.recordVerifiedGooglePayment({
      userId: user.id,
      reference: purchaseToken,
      billingCycle: subscription.billingCycle || 'monthly',
      purchaseType: 'plan_upgrade',
      targetPlan: subscription.plan,
      metadata: this.buildGooglePaymentMetadata(verifiedData, {
        productId,
        linkedPurchaseToken:
          options?.linkedPurchaseToken ||
          verifiedData?.linkedPurchaseToken ||
          null,
      }),
      rawResponse: verifiedData,
    });

    user.plan = subscription.plan;
    user.trialStatus = 'converted';
    await this.usersRepository.save(user);

    if (options?.sendNotifications !== false && paymentRecord.isFirstSuccess) {
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
      packageName,
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
      purchaseKind?:
        | 'plan'
        | 'addon_workspace_slot'
        | 'addon_staff_seat'
        | 'addon_whatsapp_bundle_100';
      billingCycle?: 'monthly' | 'yearly';
      workspaceId?: string;
    },
  ) {
    const pkg = dto.packageName;
    const productId = dto.productId;
    const token = dto.purchaseToken;
    const type =
      dto.purchaseType === 'subscription' ? 'subscription' : 'product';
    const purchaseKind =
      dto.purchaseKind || this.inferPurchaseKindFromProductId(productId);
    const requestedBillingCycle =
      dto.billingCycle ||
      this.inferBillingCycleFromProductId(productId, 'monthly');

    if (type === 'subscription' || purchaseKind !== 'plan') {
      const workspaceId = dto.workspaceId;
      if (!workspaceId) {
        throw new BadRequestException(
          'workspaceId is required for workspace-scoped purchases',
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
          token,
        );
        if (
          !this.isMatchingGoogleSubscriptionProduct(verifiedData, productId)
        ) {
          throw new BadRequestException(
            'Google Play subscription product does not match the requested productId',
          );
        }
        if (!this.isActiveGoogleSubscription(verifiedData)) {
          throw new BadRequestException(
            `Google Play subscription is not active: ${
              verifiedData?.subscriptionState || 'UNKNOWN'
            }`,
          );
        }
        if (purchaseKind === 'plan') {
          const subscription = await this.persistVerifiedGoogleSubscription(
            userId,
            pkg,
            productId,
            token,
            verifiedData,
            { sendNotifications: true },
          );
          return { verified: true, data: verifiedData, subscription };
        } else {
          await this.applyVerifiedAddonPurchase({
            userId,
            productId,
            purchaseToken: token,
            purchaseKind,
            billingCycle: requestedBillingCycle,
            verifiedData,
          });
        }
        return { verified: true, data: verifiedData };
      }

      const productData = await this.fetchGoogleProductPurchase(
        pkg,
        productId,
        token,
      );
      if (Number(productData?.purchaseState ?? 0) !== 0) {
        throw new BadRequestException(
          `Google Play product is not purchased: ${
            productData?.purchaseState ?? 'UNKNOWN'
          }`,
        );
      }
      if (productData?.acknowledgementState === 0) {
        await this.acknowledgeGoogleProductPurchase(pkg, productId, token);
        productData.acknowledgementState = 1;
      }
      if (purchaseKind === 'plan') {
        const user = await this.usersRepository.findOne({
          where: { id: userId },
        });
        if (user) {
          await this.recordVerifiedGooglePayment({
            userId: user.id,
            reference: token,
            billingCycle: 'monthly',
            purchaseType: 'one_time',
            targetPlan: 'basic',
            metadata: this.buildGooglePaymentMetadata(productData, {
              productId,
            }),
            rawResponse: productData,
          });
        }
      } else {
        await this.applyVerifiedAddonPurchase({
          userId,
          productId,
          purchaseToken: token,
          purchaseKind,
          billingCycle: requestedBillingCycle,
          verifiedData: productData,
        });
      }

      return { verified: true, data: productData };
    } catch (err: any) {
      return { verified: false, error: err?.message || err };
    }
  }

  async remindWorkspaceOwner(requesterId: string, workspaceId: string) {
    const workspace = await this.workspacesRepository.findOne({
      where: { id: workspaceId },
      relations: ['createdBy'],
    });

    if (!workspace || !workspace.createdBy) {
      throw new NotFoundException('Workspace not found');
    }

    const membership = await this.workspaceMembershipsRepository.findOne({
      where: { workspaceId, userId: requesterId, isActive: true },
      relations: ['user'],
    });

    if (!membership) {
      throw new ForbiddenException('You do not belong to this workspace');
    }

    const owner = workspace.createdBy;
    const requester = membership.user;
    const ctx = await this.getWorkspaceBillingContext(workspaceId);

    const html = this.emailTemplateService.genericNotification(
      'Subscription renewal requested',
      `${requester.name || requester.email} requested that you renew the BizRecord subscription for workspace "${workspace.name}".`,
      `Current status: <strong>${ctx.status}</strong><br/>Plan: <strong>${ctx.plan.toUpperCase()}</strong>`,
      undefined,
    );

    this.emailQueueService.enqueue({
      to: owner.email,
      subject: 'BizRecord workspace subscription renewal requested',
      text: `${requester.name || requester.email} requested that you renew the subscription for workspace "${workspace.name}". Current status: ${ctx.status}.`,
      html,
    });

    return { sent: true };
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

    let parsed;
    try {
      parsed = JSON.parse(decoded);
    } catch (err) {
      console.error(`Failed to parse webhook JSON: ${err.message}`, decoded);
      throw new BadRequestException('Invalid webhook payload: malformed JSON');
    }

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
