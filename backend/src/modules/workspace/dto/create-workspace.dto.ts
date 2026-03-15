import { IsString, IsOptional } from 'class-validator';

export class CreateWorkspaceDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  logo?: string;

  @IsOptional()
  @IsString()
  parentWorkspaceId?: string;

  @IsOptional()
  @IsString()
  managerUserId?: string;
}
