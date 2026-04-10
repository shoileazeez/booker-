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

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ unique: true })
  reference!: string;

  @Column({ default: 'pending' })
  status!: 'pending' | 'success' | 'failed';

  @Column({ type: 'int', default: 0 })
  amount!: number;

  @Column({ default: 'NGN' })
  currency!: string;

  @Column({ default: 'plan_upgrade' })
  purchaseType!: 'plan_upgrade' | 'addon_purchase' | 'one_time';

  @Column({ default: 'monthly' })
  billingCycle!: 'monthly' | 'yearly';

  @Column({ type: 'varchar', nullable: true })
  targetPlan!: 'basic' | 'pro' | null;

  @Column({ default: 0 })
  addonWorkspaceSlots!: number;

  @Column({ default: 0 })
  addonStaffSeats!: number;

  @Column({ default: 0 })
  addonWhatsappBundles!: number;

  @Column({ type: 'varchar', nullable: true })
  paystackTransactionId!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  rawResponse!: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
