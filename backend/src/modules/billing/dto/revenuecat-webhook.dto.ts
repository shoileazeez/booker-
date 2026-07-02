import { IsOptional, IsString, IsArray, IsNumber, IsBoolean, IsObject } from 'class-validator';

export class RevenueCatWebhookEventDto {
  @IsOptional()
  @IsString()
  event?: string;

  @IsOptional()
  @IsString()
  event_timestamp_ms?: string;

  @IsOptional()
  @IsString()
  product_id?: string;

  @IsOptional()
  @IsString()
  entitlement_id?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  entitlement_ids?: string[];

  @IsOptional()
  @IsString()
  store?: string;

  @IsOptional()
  @IsString()
  app_user_id?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsNumber()
  price_in_purchased_currency?: number;

  @IsOptional()
  @IsString()
  period_type?: string;

  @IsOptional()
  @IsString()
  purchased_at_ms?: string;

  @IsOptional()
  @IsString()
  expiration_at_ms?: string;

  @IsOptional()
  @IsString()
  environment?: string;

  @IsOptional()
  @IsBoolean()
  is_trial_conversion?: boolean;

  @IsOptional()
  @IsBoolean()
  is_renewal?: boolean;

  @IsOptional()
  @IsString()
  original_transaction_id?: string;

  @IsOptional()
  @IsString()
  transaction_id?: string;

  @IsOptional()
  @IsString()
  cancellation_reason?: string;

  @IsOptional()
  @IsObject()
  subscriber_attributes?: Record<string, unknown>;
}

export class RevenueCatWebhookPayloadDto {
  @IsOptional()
  @IsObject({ each: true })
  event?: RevenueCatWebhookEventDto;

  @IsOptional()
  @IsObject()
  api_version?: string;
}
