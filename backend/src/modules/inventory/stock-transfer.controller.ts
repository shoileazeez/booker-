import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InventoryService } from './inventory.service';
import { CreateStockTransferDto } from './dto/create-stock-transfer.dto';

@Controller('workspaces/:workspaceId/stock-transfers')
@UseGuards(JwtAuthGuard)
export class StockTransferController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  async createTransfer(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateStockTransferDto,
    @Request() req,
  ) {
    return this.inventoryService.transferStock(workspaceId, req.user.sub, dto);
  }

  @Get()
  async getTransfers(@Param('workspaceId') workspaceId: string, @Request() req) {
    return this.inventoryService.getStockTransfers(workspaceId, req.user.sub);
  }
}
