import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateStockTransferDto {
  @IsUUID()
  sourceBranchId: string;

  @IsUUID()
  destinationBranchId: string;

  @IsUUID()
  sourceItemId: string;

  @IsNumber()
  @Min(0.01)
  quantity: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
