import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class InitiateCheckoutDto {
  @IsIn(['basic', 'pro'])
  plan!: 'basic' | 'pro';

  @IsOptional()
  @IsIn(['monthly', 'yearly'])
  billingCycle?: 'monthly' | 'yearly';

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  addonWorkspaceSlots?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200)
  addonStaffSeats?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200)
  addonWhatsappBundles?: number;
}
