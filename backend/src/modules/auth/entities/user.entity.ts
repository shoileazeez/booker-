import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Workspace } from '../../workspace/entities/workspace.entity';
import { WorkspaceMembership } from '../../workspace/entities/workspace-membership.entity';
import { UserPushToken } from '../../notifications/entities/user-push-token.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ default: 'user' })
  role: 'super_admin' | 'admin' | 'owner' | 'manager' | 'staff' | 'user';

  @Column({ default: 'pro' })
  plan: 'basic' | 'pro';

  @Column({ type: 'timestamp', nullable: true, name: 'trial_start_at' })
  trialStartAt: Date | null;

  @Column({ type: 'timestamp', nullable: true, name: 'trial_ends_at' })
  trialEndsAt: Date | null;

  @Column({ default: 'active', name: 'trial_status' })
  trialStatus: 'active' | 'expired' | 'converted';

  @Column({ default: true, name: 'isActive' })
  isActive: boolean;

  @Column({ default: false, name: 'email_verified' })
  emailVerified: boolean;

  @Column({ type: 'varchar', nullable: true, name: 'email_verification_code' })
  emailVerificationCode: string | null;

  @Column({
    type: 'timestamp',
    nullable: true,
    name: 'email_verification_expires_at',
  })
  emailVerificationExpiresAt: Date | null;

  @Column({
    type: 'timestamp',
    nullable: true,
    name: 'email_verification_last_sent_at',
  })
  emailVerificationLastSentAt: Date | null;

  @Column({ type: 'varchar', nullable: true, name: 'password_reset_code' })
  passwordResetCode: string | null;

  @Column({
    type: 'timestamp',
    nullable: true,
    name: 'password_reset_expires_at',
  })
  passwordResetExpiresAt: Date | null;

  @Column({
    type: 'timestamp',
    nullable: true,
    name: 'password_reset_last_sent_at',
  })
  passwordResetLastSentAt: Date | null;

  @OneToMany(() => WorkspaceMembership, (membership) => membership.user)
  memberships: WorkspaceMembership[];

  @OneToMany(() => UserPushToken, (pushToken) => pushToken.user)
  pushTokens: UserPushToken[];

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;
}
