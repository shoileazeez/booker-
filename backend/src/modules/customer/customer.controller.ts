import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { CustomerService } from './customer.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('workspaces/:workspaceId/branches/:branchId/customers')
@UseGuards(JwtAuthGuard)
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Post()
  async create(
    @Param('workspaceId') workspaceId: string,
    @Param('branchId') branchId: string,
    @Body() dto: CreateCustomerDto,
    @Request() req,
  ) {
    return this.customerService.create(
      workspaceId,
      branchId || null,
      req.user.sub,
      dto,
    );
  }

  @Get()
  async findAll(
    @Param('workspaceId') workspaceId: string,
    @Param('branchId') branchId: string,
    @Request() req,
    @Query('search') search?: string,
  ) {
    return this.customerService.findAll(
      workspaceId,
      branchId || null,
      req.user.sub,
      search,
    );
  }

  @Get(':id')
  async findOne(
    @Param('workspaceId') workspaceId: string,
    @Param('branchId') branchId: string,
    @Param('id') id: string,
    @Request() req,
  ) {
    return this.customerService.findOne(
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
    @Body() dto: UpdateCustomerDto,
    @Request() req,
  ) {
    return this.customerService.update(
      workspaceId,
      branchId || null,
      id,
      req.user.sub,
      dto,
    );
  }

  @Delete(':id')
  async remove(
    @Param('workspaceId') workspaceId: string,
    @Param('branchId') branchId: string,
    @Param('id') id: string,
    @Request() req,
  ) {
    return this.customerService.remove(
      workspaceId,
      branchId || null,
      id,
      req.user.sub,
    );
  }
}

@Controller('workspaces/:workspaceId/customers')
@UseGuards(JwtAuthGuard)
export class WorkspaceCustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Post()
  async create(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: CreateCustomerDto,
    @Request() req,
  ) {
    return this.customerService.create(workspaceId, null, req.user.sub, dto);
  }

  @Get()
  async findAll(
    @Param('workspaceId') workspaceId: string,
    @Request() req,
    @Query('search') search?: string,
  ) {
    return this.customerService.findAll(
      workspaceId,
      null,
      req.user.sub,
      search,
    );
  }

  @Get(':id')
  async findOne(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Request() req,
  ) {
    return this.customerService.findOne(workspaceId, null, id, req.user.sub);
  }

  @Put(':id')
  async update(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @Request() req,
  ) {
    return this.customerService.update(
      workspaceId,
      null,
      id,
      req.user.sub,
      dto,
    );
  }

  @Delete(':id')
  async remove(
    @Param('workspaceId') workspaceId: string,
    @Param('id') id: string,
    @Request() req,
  ) {
    return this.customerService.remove(workspaceId, null, id, req.user.sub);
  }
}
