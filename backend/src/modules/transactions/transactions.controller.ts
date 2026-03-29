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

@Controller('workspaces/:workspaceId/branches/:branchId/transactions')
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private transactionsService: TransactionsService) {}

  @Post()
  async create(
    @Param('workspaceId') workspaceId: string,
    @Param('branchId') branchId: string,
    @Body() createTransactionDto: CreateTransactionDto,
    @Request() req,
  ) {
    return this.transactionsService.createTransaction(
      createTransactionDto,
      workspaceId,
      branchId,
      req.user.sub,
    );
  }

  @Get()
  async findAll(
    @Param('workspaceId') workspaceId: string,
    @Param('branchId') branchId: string,
    @Query('skip') skip = 0,
    @Query('take') take = 20,
    @Request() req,
    @Query('type') type?: string,
  ) {
    return this.transactionsService.getTransactions(
      workspaceId,
      branchId,
      req.user.sub,
      skip,
      take,
      type,
    );
  }

  @Get('summary')
  async getSummary(
    @Param('workspaceId') workspaceId: string,
    @Param('branchId') branchId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Request() req,
  ) {
    return this.transactionsService.getSummary(
      workspaceId,
      branchId,
      req.user.sub,
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get(':id')
  async findOne(
    @Param('workspaceId') workspaceId: string,
    @Param('branchId') branchId: string,
    @Param('id') id: string,
    @Request() req,
  ) {
    return this.transactionsService.getTransaction(workspaceId, branchId, id, req.user.sub);
  }

  @Put(':id/status')
  async updateStatus(
    @Param('workspaceId') workspaceId: string,
    @Param('branchId') branchId: string,
    @Param('id') id: string,
    @Body() body: { status: 'pending' | 'completed' | 'cancelled' },
    @Request() req,
  ) {
    return this.transactionsService.updateTransactionStatus(
      workspaceId,
      branchId,
      id,
      body.status,
      req.user.sub,
    );
  }
}
