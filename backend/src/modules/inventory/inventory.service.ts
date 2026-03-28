import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InventoryItem } from './entities/inventory-item.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { User } from '../auth/entities/user.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { EmailQueueService } from '../notifications/email-queue.service';
import { PushService } from '../notifications/push.service';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryItem)
    private itemsRepository: Repository<InventoryItem>,
    @InjectRepository(Workspace)
    private workspacesRepository: Repository<Workspace>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(Transaction)
    private transactionsRepository: Repository<Transaction>,
    private readonly emailQueueService: EmailQueueService,
    private readonly pushService: PushService,
  ) {}

  // Create a new inventory item
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
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const item = this.itemsRepository.create({
      ...createItemDto,
      workspace: workspace,
      createdBy: user,
    });

    const savedItem = await this.itemsRepository.save(item);

    // Notification triggers: Email and Push
    // Email notification for item creation
    this.emailQueueService.enqueue({
      to: user.email,
      subject: 'Inventory Item Created',
      text: `Item '${savedItem.name}' was created in workspace '${workspace.name}'.`,
      html: `<p>Item '<b>${savedItem.name}</b>' was created in workspace '<b>${workspace.name}</b>'.</p>`,
    });

    // Push notification for item creation
    this.pushService.sendPush({
      to: user.id,
      title: 'Inventory Item Created',
      body: `Item '${savedItem.name}' was created in workspace '${workspace.name}'.`,
      data: { itemId: savedItem.id, workspaceId: workspace.id },
    });

    return savedItem;
  }

  // Get paginated inventory items for a workspace
  async getItems(workspaceId: string, skip = 0, take = 20) {
    return this.itemsRepository.find({
      where: { workspace: { id: workspaceId } },
      skip,
      take,
      relations: ['workspace', 'createdBy'],
    });
  }

  // Get a single inventory item by ID
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

  // Update an inventory item
  async updateItem(itemId: string, updateItemDto: UpdateInventoryItemDto) {
    const item = await this.getItem(itemId);
    Object.assign(item, updateItemDto);
    const updatedItem = await this.itemsRepository.save(item);

    // Notification triggers: Email and Push
    const user = updatedItem.createdBy;
    const workspace = updatedItem.workspace;
    this.emailQueueService.enqueue({
      to: user.email,
      subject: 'Inventory Item Updated',
      text: `Item '${updatedItem.name}' was updated in workspace '${workspace.name}'.`,
      html: `<p>Item '<b>${updatedItem.name}</b>' was updated in workspace '<b>${workspace.name}</b>'.</p>`,
    });
    this.pushService.sendPush({
      to: user.id,
      title: 'Inventory Item Updated',
      body: `Item '${updatedItem.name}' was updated in workspace '${workspace.name}'.`,
      data: { itemId: updatedItem.id, workspaceId: workspace.id },
    });

    return updatedItem;
  }

  // Delete an inventory item
  async deleteItem(itemId: string) {
    const item = await this.getItem(itemId);

    // Preserve transaction history while allowing item deletion.
    await this.transactionsRepository.query(
      'UPDATE transactions SET item_id = NULL WHERE item_id = $1',
      [itemId],
    );

    await this.itemsRepository.remove(item);

    // Notification triggers: Email and Push
    const user = item.createdBy;
    const workspace = item.workspace;
    this.emailQueueService.enqueue({
      to: user.email,
      subject: 'Inventory Item Deleted',
      text: `Item '${item.name}' was deleted from workspace '${workspace.name}'.`,
      html: `<p>Item '<b>${item.name}</b>' was deleted from workspace '<b>${workspace.name}</b>'.</p>`,
    });
    this.pushService.sendPush({
      to: user.id,
      title: 'Inventory Item Deleted',
      body: `Item '${item.name}' was deleted from workspace '${workspace.name}'.`,
      data: { itemId: item.id, workspaceId: workspace.id },
    });

    return { message: 'Item deleted successfully' };
  }

  // Search items in a workspace by name or SKU
  async searchItems(workspaceId: string, searchTerm: string) {
    return this.itemsRepository
      .createQueryBuilder('item')
      .where('item.workspace_id = :workspaceId', { workspaceId })
      .andWhere('(item.name ILIKE :searchTerm OR item.sku ILIKE :searchTerm)', {
        searchTerm: `%${searchTerm}%`,
      })
      .getMany();
  }
}
