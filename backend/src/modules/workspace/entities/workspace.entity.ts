import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { InventoryItem } from '../../inventory/entities/inventory-item.entity';
import { Transaction } from '../../transactions/entities/transaction.entity';
import { WorkspaceMembership } from './workspace-membership.entity';
import { Branch } from './branch.entity';

@Entity('workspaces')
export class Workspace {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  logo: string;

  @Column({ default: 'active' })
  status: 'active' | 'inactive' | 'archived';

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @Column({ name: 'manager_user_id', nullable: true })
  managerUserId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'manager_user_id' })
  managerUser: User | null;

  @Column({ unique: true })
  slug: string;

  @Column({ name: 'parent_workspace_id', nullable: true })
  parentWorkspaceId: string | null;

  @ManyToOne(() => Workspace, (workspace) => workspace.branches, {
    nullable: true,
  })
  @JoinColumn({ name: 'parent_workspace_id' })
  parentWorkspace: Workspace | null;

  @OneToMany(() => Workspace, (workspace) => workspace.parentWorkspace)
  branches: Workspace[];

  @OneToMany(() => Branch, (branch) => branch.workspace)
  branchRecords: Branch[];

  @OneToMany(() => WorkspaceMembership, (membership) => membership.workspace)
  memberships: WorkspaceMembership[];

  @OneToMany(() => InventoryItem, (item) => item.workspace)
  items: InventoryItem[];

  @OneToMany(() => Transaction, (transaction) => transaction.workspace)
  transactions: Transaction[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
