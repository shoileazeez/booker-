import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { InventoryItem } from '../../inventory/entities/inventory-item.entity';
import { Transaction } from '../../transactions/entities/transaction.entity';

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

  @Column({ unique: true })
  slug: string;

  @ManyToMany(() => User, (user) => user.workspaces)
  users: User[];

  @OneToMany(() => InventoryItem, (item) => item.workspace)
  items: InventoryItem[];

  @OneToMany(() => Transaction, (transaction) => transaction.workspace)
  transactions: Transaction[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
