import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InventoryItem } from './entities/inventory-item.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { User } from '../auth/entities/user.entity';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryItem)
    private itemsRepository: Repository<InventoryItem>,
    @InjectRepository(Workspace)
    private workspacesRepository: Repository<Workspace>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async createItem(
    createItemDto: CreateInventoryItemDto,
    workspaceId: string,
    userId: string,
  ) {
    const workspace = await this.workspacesRepository.findOne({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const user = await this.usersRepository.findOne({ where: { id: userId } });

    const item = this.itemsRepository.create({
      ...createItemDto,
      workspace,
      createdBy: user,
    });

    return await this.itemsRepository.save(item);
  }

  async getItems(workspaceId: string, skip = 0, take = 20) {
    return await this.itemsRepository.find({
      where: { workspace: { id: workspaceId } },
      skip,
      take,
      relations: ['workspace', 'createdBy'],
    });
  }

  async getItem(itemId: string) {
    const item = await this.itemsRepository.findOne({
      where: { id: itemId },
      relations: ['workspace', 'createdBy'],
    });

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    return item;
  }

  async updateItem(itemId: string, updateItemDto: UpdateInventoryItemDto) {
    const item = await this.getItem(itemId);
    Object.assign(item, updateItemDto);
    return await this.itemsRepository.save(item);
  }

  async deleteItem(itemId: string) {
    const item = await this.getItem(itemId);
    await this.itemsRepository.remove(item);
    return { message: 'Item deleted successfully' };
  }

  async searchItems(workspaceId: string, searchTerm: string) {
    return await this.itemsRepository
      .createQueryBuilder('item')
      .where('item.workspace_id = :workspaceId', { workspaceId })
      .andWhere('(item.name ILIKE :searchTerm OR item.sku ILIKE :searchTerm)', {
        searchTerm: `%${searchTerm}%`,
      })
      .getMany();
  }
}
