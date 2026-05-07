import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Workspace } from '../../workspace/entities/workspace.entity';
import { Branch } from '../../workspace/entities/branch.entity';
import { InventoryItem } from '../../inventory/entities/inventory-item.entity';
import { User } from '../../auth/entities/user.entity';

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: ['sale', 'expense', 'purchase', 'return', 'adjustment', 'debt'],
  })
  type: 'sale' | 'expense' | 'purchase' | 'return' | 'adjustment' | 'debt';

  @Column({ nullable: true, name: 'referenceNumber' })
  referenceNumber: string;

  @ManyToOne(() => InventoryItem, { nullable: true })
  @JoinColumn({ name: 'item_id' })
  item: InventoryItem | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'unitPrice' })
  unitPrice: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'totalAmount' })
  totalAmount: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    name: 'discountAmount',
  })
  discountAmount: number;

  @Column({ nullable: true })
  category: string;

  @Column({
    type: 'enum',
    enum: ['cash', 'card', 'bank', 'check', 'credit'],
    default: 'cash',
    name: 'paymentMethod',
  })
  paymentMethod: 'cash' | 'card' | 'bank' | 'check' | 'credit';

  @Column({ default: 'pending' })
  status: 'pending' | 'completed' | 'cancelled';

  @Column({ nullable: true, name: 'customerName' })
  customerName: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ type: 'timestamp', nullable: true, name: 'dueDate' })
  dueDate: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'due_reminder_sent_at' })
  dueReminderSentAt: Date | null;

  @Column({ nullable: true })
  notes: string;

  @Column({ nullable: true, name: 'receipt_url' })
  receiptUrl: string;

  @Column({ type: 'jsonb', nullable: true })
  lineItems: any[] | null;

  @Column({ name: 'customer_email', type: 'varchar', nullable: true })
  customerEmail: string | null;

  @ManyToOne(() => Workspace, (workspace) => workspace.transactions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @Column({ name: 'workspace_id', type: 'uuid', nullable: true })
  workspaceId: string | null;

  @ManyToOne(() => Branch, (branch) => branch.transactions, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch | null;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @CreateDateColumn({ name: 'createdAt' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updatedAt' })
  updatedAt: Date;
}
