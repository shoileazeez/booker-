import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  Put,
  Delete,
  Query,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('workspaces/:workspaceId/inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @Post()
  async create(
    @Param('workspaceId') workspaceId: string,
    @Body() createItemDto: CreateInventoryItemDto,
    @Request() req,
  ) {
    return this.inventoryService.createItem(
      createItemDto,
      workspaceId,
      req.user.sub,
    );
  }

  @Get()
  async findAll(
    @Param('workspaceId') workspaceId: string,
    @Query('skip') skip = 0,
    @Query('take') take = 20,
  ) {
    return this.inventoryService.getItems(workspaceId, skip, take);
  }

  @Get('search')
  async search(
    @Param('workspaceId') workspaceId: string,
    @Query('q') searchTerm: string,
  ) {
    return this.inventoryService.searchItems(workspaceId, searchTerm);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.inventoryService.getItem(id);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateItemDto: UpdateInventoryItemDto,
  ) {
    return this.inventoryService.updateItem(id, updateItemDto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.inventoryService.deleteItem(id);
  }
}
