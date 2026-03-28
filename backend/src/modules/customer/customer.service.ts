import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from './customer.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomerService {
  constructor(
    @InjectRepository(Customer)
    private customerRepository: Repository<Customer>,
    @InjectRepository(Workspace)
    private workspaceRepository: Repository<Workspace>,
  ) {}

  async create(workspaceId: string, dto: CreateCustomerDto) {
    const workspace = await this.workspaceRepository.findOne({
      where: { id: workspaceId },
    });
    if (!workspace) throw new NotFoundException('Workspace not found');
    const customer = this.customerRepository.create({ ...dto, workspace });
    return this.customerRepository.save(customer);
  }

  async findAll(workspaceId: string, search?: string) {
    const qb = this.customerRepository
      .createQueryBuilder('customer')
      .where('customer.workspaceId = :workspaceId', { workspaceId });
    if (search) {
      qb.andWhere(
        '(customer.name ILIKE :search OR customer.email ILIKE :search OR customer.phone ILIKE :search)',
        { search: `%${search}%` },
      );
    }
    return qb.getMany();
  }

  async findOne(workspaceId: string, id: string) {
    return this.customerRepository.findOne({
      where: { id, workspace: { id: workspaceId } },
    });
  }

  async update(workspaceId: string, id: string, dto: UpdateCustomerDto) {
    const customer = await this.findOne(workspaceId, id);
    if (!customer) throw new NotFoundException('Customer not found');
    Object.assign(customer, dto);
    return this.customerRepository.save(customer);
  }

  async remove(workspaceId: string, id: string) {
    const customer = await this.findOne(workspaceId, id);
    if (!customer) throw new NotFoundException('Customer not found');
    await this.customerRepository.remove(customer);
    return { deleted: true };
  }
}
