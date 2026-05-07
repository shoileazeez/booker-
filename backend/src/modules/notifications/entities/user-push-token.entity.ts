import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

@Entity('user_push_tokens')
@Unique('UQ_user_push_tokens_user_token', ['userId', 'token'])
@Index('IDX_user_push_tokens_user_active', ['userId', 'isActive'])
export class UserPushToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 255 })
  token: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  platform: string | null;

  @Column({ name: 'device_id', type: 'varchar', length: 255, nullable: true })
  deviceId: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({
    name: 'last_seen_at',
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
  })
  lastSeenAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
