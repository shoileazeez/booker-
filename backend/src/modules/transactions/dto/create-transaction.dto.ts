import {
  IsString,
  IsNumber,
  IsOptional,
  IsEnum,
  IsISO8601,
} from 'class-validator';

export class CreateTransactionDto {
  @IsEnum(['sale', 'expense', 'purchase', 'return', 'adjustment', 'debt'])
  type: 'sale' | 'expense' | 'purchase' | 'return' | 'adjustment' | 'debt';

  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  itemId?: string;

  @IsOptional()
  lineItems?: Array<{
    itemId: string;
    quantity: number;
    unitPrice?: number;
    discountAmount?: number;
  }>;

  @IsNumber()
  quantity: number;

  @IsOptional()
  @IsNumber()
  unitPrice?: number;

  @IsOptional()
  @IsNumber()
  totalAmount?: number;

  @IsOptional()
  @IsNumber()
  discountAmount?: number;

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
  @IsString()
  customerEmail?: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;
}
