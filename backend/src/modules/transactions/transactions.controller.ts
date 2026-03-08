import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  Put,
  Query,
} from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('workspaces/:workspaceId/transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private transactionsService: TransactionsService) {}

  @Post()
  async create(
    @Param('workspaceId') workspaceId: string,
    @Body() createTransactionDto: CreateTransactionDto,
    @Request() req,
  ) {
    return this.transactionsService.createTransaction(
      createTransactionDto,
      workspaceId,
      req.user.sub,
    );
  }

  @Get()
  async findAll(
    @Param('workspaceId') workspaceId: string,
    @Query('skip') skip = 0,
    @Query('take') take = 20,
    @Query('type') type?: string,
  ) {
    return this.transactionsService.getTransactions(
      workspaceId,
      skip,
      take,
      type,
    );
  }

  @Get('summary')
  async getSummary(
    @Param('workspaceId') workspaceId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.transactionsService.getSummary(
      workspaceId,
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.transactionsService.getTransaction(id);
  }

  @Put(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: 'pending' | 'completed' | 'cancelled' },
  ) {
    return this.transactionsService.updateTransactionStatus(id, body.status);
  }
}
