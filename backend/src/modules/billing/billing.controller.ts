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
    return this.billingService.initiateCheckout(req.user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('verify')
  async verify(@Request() req, @Body() dto: VerifyPaymentDto) {
    return this.billingService.verifyPayment(dto.reference, req.user.sub);
  }

  @Post('webhook/paystack')
  async paystackWebhook(
    @Body() payload: Record<string, any>,
    @Headers('x-paystack-signature') signature?: string,
  ) {
    return this.billingService.handleWebhook(payload, signature);
  }
}
