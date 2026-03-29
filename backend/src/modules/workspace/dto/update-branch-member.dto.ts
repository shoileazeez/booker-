import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
} from 'class-validator';

export const BRANCH_PERMISSION_KEYS = [
  'inventory.view',
  'inventory.manage',
  'sales.view',
  'sales.create',
  'debts.view',
  'debts.manage',
  'customers.view',
  'customers.manage',
  'reports.view',
] as const;

export type BranchPermissionKey = (typeof BRANCH_PERMISSION_KEYS)[number];

export class UpdateBranchMemberDto {
  @IsOptional()
  @IsString()
  @IsIn(['manager', 'staff'])
  role?: 'manager' | 'staff';

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(BRANCH_PERMISSION_KEYS, { each: true })
  permissions?: BranchPermissionKey[];
}
