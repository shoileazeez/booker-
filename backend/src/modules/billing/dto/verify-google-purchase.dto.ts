import { IsOptional, IsString, IsIn } from 'class-validator';

export class VerifyGooglePurchaseDto {
  @IsString()
  packageName!: string;

  @IsString()
  productId!: string;

  @IsString()
  purchaseToken!: string;

  @IsOptional()
  @IsIn(['subscription', 'product'])
  purchaseType?: 'subscription' | 'product';

  @IsOptional()
  @IsString()
  // If provided, the purchase will be applied to this workspace (owner only)
  workspaceId?: string;
}
