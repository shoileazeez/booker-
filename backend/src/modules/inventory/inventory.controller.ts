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

@Controller('workspaces/:workspaceId/branches/:branchId/inventory')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @Post()
  async create(
    @Param('workspaceId') workspaceId: string,
    @Param('branchId') branchId: string,
    @Body() createItemDto: CreateInventoryItemDto,
    @Request() req,
  ) {
    return this.inventoryService.createItem(
      createItemDto,
      workspaceId,
      branchId || null,
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
  ) {
    return this.inventoryService.getItems(
      workspaceId,
      branchId || null,
      req.user.sub,
      skip,
      take,
    );
  }

  @Get('search')
  async search(
    @Param('workspaceId') workspaceId: string,
    @Param('branchId') branchId: string,
    @Query('q') searchTerm: string,
    @Request() req,
  ) {
    return this.inventoryService.searchItems(
      workspaceId,
      branchId || null,
      req.user.sub,
      searchTerm,
    );
  }

  @Get(':id')
  async findOne(
    @Param('workspaceId') workspaceId: string,
    @Param('branchId') branchId: string,
    @Param('id') id: string,
    @Request() req,
  ) {
    return this.inventoryService.getItem(
      workspaceId,
      branchId || null,
      id,
      req.user.sub,
    );
  }

  @Put(':id')
  async update(
    @Param('workspaceId') workspaceId: string,
    @Param('branchId') branchId: string,
    @Param('id') id: string,
    @Body() updateItemDto: UpdateInventoryItemDto,
    @Request() req,
  ) {
    return this.inventoryService.updateItem(
      workspaceId,
      branchId || null,
      id,
      updateItemDto,
      req.user.sub,
    );
  }

  @Delete(':id')
  async delete(
    @Param('workspaceId') workspaceId: string,
    @Param('branchId') branchId: string,
    @Param('id') id: string,
    @Request() req,
  ) {
    return this.inventoryService.deleteItem(
      workspaceId,
      branchId || null,
      id,
      req.user.sub,
    );
  }
}

@Controller('workspaces/:workspaceId/inventory')
@UseGuards(JwtAuthGuard)
export class WorkspaceInventoryController {
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
      null,
      req.user.sub,
    );
  }

  @Get()
  async findAll(
    @Param('workspaceId') workspaceId: string,
    @Query('skip') skip = 0,
    @Query('take') take = 20,
    @Request() req,
  ) {
    return this.inventoryService.getItems(
      workspaceId,
      null,
      req.user.sub,
      skip,
      take,
    );
  }

  @Get('search')
  async search(
    @Param('workspaceId') workspaceId: string,
    @Query('q') searchTerm: string,
    @Request() req,
  ) {
    return this.inventoryService.searchItems(
      workspaceId,
      null,
      req.user.sub,
      searchTerm,
    );
  }

  @Get(':id')
  async findOne(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Request() req,
  ) {
    return this.inventoryService.getItem(workspaceId, null, id, req.user.sub);
  }

  @Put(':id')
  async update(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body() updateItemDto: UpdateInventoryItemDto,
    @Request() req,
  ) {
    return this.inventoryService.updateItem(
      workspaceId,
      null,
      id,
      updateItemDto,
      req.user.sub,
    );
  }

  @Delete(':id')
  async delete(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Request() req,
  ) {
    return this.inventoryService.deleteItem(
      workspaceId,
      null,
      id,
      req.user.sub,
    );
  }
}
