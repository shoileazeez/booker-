import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ReturnDebtDto {
  @IsNumber()
  @Min(0.01)
  quantity: number;

  @IsOptional()
  @IsString()
  itemId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
