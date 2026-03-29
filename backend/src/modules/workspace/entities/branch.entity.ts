import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Workspace } from './workspace.entity';
import { User } from '../../auth/entities/user.entity';
import { BranchMembership } from './branch-membership.entity';
import { InventoryItem } from '../../inventory/entities/inventory-item.entity';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { Customer } from '../../customer/customer.entity';

@Entity('branches')
export class Branch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', nullable: true })
  location: string | null;

  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ default: 'active' })
  status: 'active' | 'inactive' | 'archived';

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, (workspace) => workspace.branches, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Column({ name: 'manager_user_id', nullable: true })
  managerUserId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'manager_user_id' })
  managerUser: User | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @OneToMany(() => BranchMembership, (membership) => membership.branch)
  memberships: BranchMembership[];

  @OneToMany(() => InventoryItem, (item) => item.branch)
  items: InventoryItem[];

  @OneToMany(() => Transaction, (transaction) => transaction.branch)
  transactions: Transaction[];

  @OneToMany(() => Customer, (customer) => customer.branch)
  customers: Customer[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
