import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from './customer.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { CustomerService } from './customer.service';
import { CustomerController } from './customer.controller';
import { Branch } from '../workspace/entities/branch.entity';
import { WorkspaceModule } from '../workspace/workspace.module';

@Module({
  imports: [TypeOrmModule.forFeature([Customer, Workspace, Branch]), WorkspaceModule],
  providers: [CustomerService],
  controllers: [CustomerController],
  exports: [CustomerService],
})
export class CustomerModule {}
