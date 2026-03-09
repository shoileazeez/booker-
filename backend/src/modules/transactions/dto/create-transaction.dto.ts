import { IsString, IsNumber, IsOptional, IsEnum, IsISO8601 } from 'class-validator';

export class CreateTransactionDto {
  @IsEnum(['sale', 'expense', 'purchase', 'return', 'adjustment', 'debt'])
  type: 'sale' | 'expense' | 'purchase' | 'return' | 'adjustment' | 'debt';

  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  itemId?: string;

  @IsNumber()
  quantity: number;

  @IsNumber()
  unitPrice: number;

  @IsNumber()
  totalAmount: number;

  @IsOptional()
  @IsString()
  category?: string;

  @IsEnum(['cash', 'card', 'bank', 'check', 'credit'])
  paymentMethod: 'cash' | 'card' | 'bank' | 'check' | 'credit';

  @IsOptional()
  @IsEnum(['pending', 'completed', 'cancelled'])
  status?: 'pending' | 'completed' | 'cancelled';

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;
}
