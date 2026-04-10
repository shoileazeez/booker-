import {
  Controller,
  Get,
  UseGuards,
  Request,
  Post,
  Body,
  Headers,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BillingService } from './billing.service';
import { InitiateCheckoutDto } from './dto/initiate-checkout.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { VerifyGooglePurchaseDto } from './dto/verify-google-purchase.dto';

@Controller('billing')
export class BillingController {
  constructor(private billingService: BillingService) {}

  @UseGuards(JwtAuthGuard)
  @Get('plans')
  getPlans() {
    return this.billingService.getPlans();
  }

  @UseGuards(JwtAuthGuard)
  @Get('subscription')
  async getCurrentSubscription(@Request() req) {
    return this.billingService.getCurrentSubscription(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('usage')
  async getUsage(@Request() req) {
    return this.billingService.getUsage(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('checkout')
  async checkout(@Request() req, @Body() dto: InitiateCheckoutDto) {
    // Paystack checkout deprecated — migrate to Google Play Billing.
    return {
      error: 'Paystack checkout deprecated. Use Google Play Billing on Android to purchase subscriptions.',
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('verify')
  async verify(@Request() req, @Body() dto: VerifyPaymentDto) {
    // Paystack verification deprecated.
    return { error: 'Paystack payment verification is deprecated. Please migrate to Google Play Billing.' };
  }

  @Post('webhook/paystack')
  async paystackWebhook(
    @Body() payload: Record<string, any>,
    @Headers('x-paystack-signature') signature?: string,
  ) {
    // Paystack webhook endpoint removed — Paystack deprecated in favor of
    // Google Play Billing. Keep endpoint around to avoid breaking integrators,
    // but return a deprecation response.
    return { received: true, message: 'Paystack webhook handling deprecated. Please migrate to Google Play Billing.' };
  }

  @UseGuards(JwtAuthGuard)
  @Post('verify/google')
  async verifyGooglePurchase(@Request() req, @Body() dto: VerifyGooglePurchaseDto) {
    return this.billingService.verifyGooglePurchase(req.user.sub, dto);
  }

  // Google Play RTDN (Pub/Sub push) endpoint — Google will POST notifications here.
  @Post('webhook/google')
  async googleWebhook(@Body() payload: Record<string, any>) {
    return this.billingService.handleGoogleWebhook(payload);
  }
}
