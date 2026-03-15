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

  @Column({ nullable: true })
  referenceNumber: string;

  @ManyToOne(() => InventoryItem, { nullable: true })
  @JoinColumn({ name: 'item_id' })
  item: InventoryItem | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unitPrice: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalAmount: number;

  @Column({ nullable: true })
  category: string;

  @Column({
    type: 'enum',
    enum: ['cash', 'card', 'bank', 'check', 'credit'],
    default: 'cash',
  })
  paymentMethod: 'cash' | 'card' | 'bank' | 'check' | 'credit';

  @Column({ default: 'pending' })
  status: 'pending' | 'completed' | 'cancelled';

  @Column({ nullable: true })
  customerName: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ type: 'timestamp', nullable: true })
  dueDate: Date;

  @Column({ nullable: true })
  notes: string;

  @ManyToOne(() => Workspace, (workspace) => workspace.transactions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'workspace_id' })
  workspace: Workspace;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
