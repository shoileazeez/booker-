import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Workspace } from '../../workspace/entities/workspace.entity';
import { Branch } from '../../workspace/entities/branch.entity';
import { InventoryItem } from './inventory-item.entity';
import { User } from '../../auth/entities/user.entity';

@Entity('stock_transfers')
export class StockTransfer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId: string;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Column({ name: 'source_branch_id', type: 'uuid' })
  sourceBranchId: string;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'source_branch_id' })
  sourceBranch: Branch;

  @Column({ name: 'destination_branch_id', type: 'uuid' })
  destinationBranchId: string;

  @ManyToOne(() => Branch, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'destination_branch_id' })
  destinationBranch: Branch;

  @Column({ name: 'source_item_id', type: 'uuid' })
  sourceItemId: string;

  @ManyToOne(() => InventoryItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'source_item_id' })
  sourceItem: InventoryItem;

  @Column({ name: 'destination_item_id', type: 'uuid', nullable: true })
  destinationItemId: string | null;

  @ManyToOne(() => InventoryItem, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'destination_item_id' })
  destinationItem: InventoryItem | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantity: number;

  @Column({ type: 'varchar', default: 'completed' })
  status: 'completed';

  @Column({ type: 'varchar', nullable: true })
  reason: string | null;

  @Column({ type: 'varchar', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdById: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
