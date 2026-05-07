import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', unique: true })
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ default: 'pro' })
  plan: 'basic' | 'pro';

  @Column({ default: 'trialing' })
  status: 'trialing' | 'active' | 'expired' | 'cancelled';

  @Column({ default: 'monthly', name: 'billing_cycle' })
  billingCycle: 'monthly' | 'yearly';

  @Column({ type: 'timestamp', nullable: true, name: 'trial_ends_at' })
  trialEndsAt: Date | null;

  @Column({
    type: 'timestamp',
    nullable: true,
    name: 'current_period_start_at',
  })
  currentPeriodStartAt: Date | null;

  @Column({ type: 'timestamp', nullable: true, name: 'current_period_ends_at' })
  currentPeriodEndsAt: Date | null;

  @Column({ default: 0, name: 'addon_workspace_slots' })
  addonWorkspaceSlots: number;

  @Column({ default: 0, name: 'addon_staff_seats' })
  addonStaffSeats: number;

  @Column({ default: 0, name: 'addon_whatsapp_bundles' })
  addonWhatsappBundles: number;

  @Column({ default: 0, name: 'whatsapp_messages_used_this_month' })
  whatsappMessagesUsedThisMonth: number;

  @Column({
    type: 'timestamp',
    nullable: true,
    name: 'whatsapp_usage_reset_at',
  })
  whatsappUsageResetAt: Date | null;

  @Column({ type: 'varchar', nullable: true, name: 'paystack_customer_code' })
  paystackCustomerCode: string | null;

  @Column({
    type: 'varchar',
    nullable: true,
    name: 'paystack_subscription_code',
  })
  paystackSubscriptionCode: string | null;

  @Column({ type: 'varchar', nullable: true, name: 'last_payment_reference' })
  lastPaymentReference: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
