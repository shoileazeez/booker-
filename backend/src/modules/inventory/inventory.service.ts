import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { InventoryItem } from './entities/inventory-item.entity';
import { Workspace } from '../workspace/entities/workspace.entity';
import { User } from '../auth/entities/user.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import { EmailQueueService } from '../notifications/email-queue.service';
import { EmailTemplateService } from '../notifications/email-template.service';
import { PushService } from '../notifications/push.service';
import { Branch } from '../workspace/entities/branch.entity';
import { BranchAccessService } from '../workspace/branch-access.service';
import { StockTransfer } from './entities/stock-transfer.entity';
import { CreateStockTransferDto } from './dto/create-stock-transfer.dto';
import { AuditLogService } from '../workspace/audit-log.service';

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
    @InjectRepository(Branch)
    private branchesRepository: Repository<Branch>,
    @InjectRepository(StockTransfer)
    private stockTransfersRepository: Repository<StockTransfer>,
    private readonly emailQueueService: EmailQueueService,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly pushService: PushService,
    private readonly branchAccessService: BranchAccessService,
    private readonly auditLogService: AuditLogService,
  ) {}

  private async assertInventoryScope(
    workspaceId: string,
    branchId: string | null,
    userId: string,
    permission: 'inventory.view' | 'inventory.manage',
  ) {
    if (branchId) {
      const access = await this.branchAccessService.assertBranchPermission(
        workspaceId,
        branchId,
        userId,
        permission,
      );
      return {
        branch: access.branch,
        workspace: access.branch.workspace,
        user: access.user,
        ownerLike: access.ownerLike,
      };
    }

    const { workspace, user } =
      await this.branchAccessService.assertWorkspaceOwnerLike(
        workspaceId,
        userId,
      );

    return {
      branch: null,
      workspace,
      user,
      ownerLike: true,
    };
  }

  // Create a new inventory item
  async createItem(
    createItemDto: CreateInventoryItemDto,
    workspaceId: string,
    branchId: string | null,
    userId: string,
  ) {
    const { branch, user, workspace } = await this.assertInventoryScope(
      workspaceId,
      branchId,
      userId,
      'inventory.manage',
    );

    const item = this.itemsRepository.create({
      ...createItemDto,
      workspace,
      workspaceId,
      branch: branch || null,
      branchId: branch?.id || null,
      createdBy: user,
    });

    const savedItem = await this.itemsRepository.save(item);
    await this.auditLogService.log({
      workspaceId,
      branchId: branchId || undefined,
      actorUserId: userId,
      action: 'inventory.create',
      entityType: 'inventory',
      entityId: savedItem.id,
      metadata: {
        name: savedItem.name,
        quantity: savedItem.quantity,
      },
    });

    // Notification triggers: Email and Push
    // Email notification for item creation
    const createHtml = this.emailTemplateService.inventoryAlert(
      savedItem.name,
      workspace.name,
      'created',
      {
        SKU: savedItem.sku || '-',
        Category: savedItem.category || '-',
        'Opening Stock': `${Number(savedItem.quantity || 0)}`,
      },
    );

    this.emailQueueService.enqueue({
      to: user.email,
      subject: 'Inventory Item Created - BizRecord',
      text: `Inventory item created: ${savedItem.name} in workspace ${workspace.name}. Current stock: ${Number(savedItem.quantity || 0)}.`,
      html: createHtml,
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
  async getItems(
    workspaceId: string,
    branchId: string | null,
    userId: string,
    skip = 0,
    take = 20,
  ) {
    await this.assertInventoryScope(
      workspaceId,
      branchId,
      userId,
      'inventory.view',
    );
    return this.itemsRepository.find({
      where: branchId
        ? { workspaceId, branchId }
        : { workspaceId, branchId: IsNull() },
      skip,
      take,
      relations: ['workspace', 'branch', 'createdBy'],
    });
  }

  // Get a single inventory item by ID
  async getItem(
    workspaceId: string,
    branchId: string | null,
    itemId: string,
    userId: string,
  ) {
    await this.assertInventoryScope(
      workspaceId,
      branchId,
      userId,
      'inventory.view',
    );
    const item = await this.itemsRepository.findOne({
      where: branchId
        ? { id: itemId, workspaceId, branchId }
        : { id: itemId, workspaceId, branchId: IsNull() },
      relations: ['workspace', 'branch', 'createdBy'],
    });

    if (!item) {
      throw new NotFoundException('Item not found');
    }

    return item;
  }

  // Update an inventory item
  async updateItem(
    workspaceId: string,
    branchId: string | null,
    itemId: string,
    updateItemDto: UpdateInventoryItemDto,
    userId: string,
  ) {
    await this.assertInventoryScope(
      workspaceId,
      branchId,
      userId,
      'inventory.manage',
    );
    const item = await this.getItem(workspaceId, branchId, itemId, userId);
    Object.assign(item, updateItemDto);
    const updatedItem = await this.itemsRepository.save(item);
    await this.auditLogService.log({
      workspaceId,
      branchId: branchId || undefined,
      actorUserId: userId,
      action: 'inventory.update',
      entityType: 'inventory',
      entityId: updatedItem.id,
      metadata: updateItemDto,
    });

    // Notification triggers: Email and Push
    const user = updatedItem.createdBy;
    const workspace = updatedItem.workspace;
    const updateHtml = this.emailTemplateService.genericNotification(
      'Inventory Item Updated',
      `Your item ${updatedItem.name} was successfully updated in ${workspace.name}.`,
      `Latest quantity: <strong>${Number(updatedItem.quantity || 0)}</strong><br/>SKU: <strong>${updatedItem.sku || '-'}</strong><br/>Category: <strong>${updatedItem.category || '-'}</strong>`,
      {
        text: 'Open Inventory',
        url: 'https://bizrecord.tech/app/inventory',
      },
    );

    this.emailQueueService.enqueue({
      to: user.email,
      subject: 'Inventory Item Updated - BizRecord',
      text: `Inventory item updated: ${updatedItem.name} in workspace ${workspace.name}.`,
      html: updateHtml,
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
  async deleteItem(
    workspaceId: string,
    branchId: string | null,
    itemId: string,
    userId: string,
  ) {
    await this.assertInventoryScope(
      workspaceId,
      branchId,
      userId,
      'inventory.manage',
    );
    const item = await this.getItem(workspaceId, branchId, itemId, userId);

    // Preserve transaction history while allowing item deletion.
    await this.transactionsRepository.query(
      'UPDATE transactions SET item_id = NULL WHERE item_id = $1',
      [itemId],
    );

    await this.itemsRepository.remove(item);
    await this.auditLogService.log({
      workspaceId,
      branchId: branchId || undefined,
      actorUserId: userId,
      action: 'inventory.delete',
      entityType: 'inventory',
      entityId: item.id,
      metadata: { name: item.name },
    });

    // Notification triggers: Email and Push
    const user = item.createdBy;
    const workspace = item.workspace;
    const deleteHtml = this.emailTemplateService.genericNotification(
      'Inventory Item Deleted',
      `The item ${item.name} was removed from ${workspace.name}.`,
      'This action preserves related transaction history while removing the product from active inventory lists.',
      {
        text: 'Review Inventory',
        url: 'https://bizrecord.tech/app/inventory',
      },
    );

    this.emailQueueService.enqueue({
      to: user.email,
      subject: 'Inventory Item Deleted - BizRecord',
      text: `Inventory item deleted: ${item.name} from workspace ${workspace.name}.`,
      html: deleteHtml,
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
  async searchItems(
    workspaceId: string,
    branchId: string | null,
    userId: string,
    searchTerm: string,
  ) {
    await this.assertInventoryScope(
      workspaceId,
      branchId,
      userId,
      'inventory.view',
    );

    const query = this.itemsRepository
      .createQueryBuilder('item')
      .where('item.workspace_id = :workspaceId', { workspaceId })
      .andWhere('(item.name ILIKE :searchTerm OR item.sku ILIKE :searchTerm)', {
        searchTerm: `%${searchTerm}%`,
      });

    if (branchId) {
      query.andWhere('item.branch_id = :branchId', { branchId });
    } else {
      query.andWhere('item.branch_id IS NULL');
    }

    return query.getMany();
  }

  async transferStock(
    workspaceId: string,
    userId: string,
    dto: CreateStockTransferDto,
  ) {
    await this.branchAccessService.assertWorkspaceOwnerLike(
      workspaceId,
      userId,
    );

    if (dto.sourceBranchId === dto.destinationBranchId) {
      throw new NotFoundException(
        'Source and destination branches must differ',
      );
    }

    const sourceItem = await this.itemsRepository.findOne({
      where: {
        id: dto.sourceItemId,
        workspaceId,
        branchId: dto.sourceBranchId,
      },
    });
    if (!sourceItem) {
      throw new NotFoundException('Source inventory item not found');
    }

    const quantity = Number(dto.quantity || 0);
    if (!quantity || quantity <= 0) {
      throw new NotFoundException(
        'Transfer quantity must be greater than zero',
      );
    }

    const currentSourceQuantity = Number(sourceItem.quantity || 0);
    if (quantity > currentSourceQuantity) {
      throw new NotFoundException(
        `Insufficient stock to transfer. Available: ${currentSourceQuantity}`,
      );
    }

    let destinationItem = await this.itemsRepository.findOne({
      where: [
        {
          workspaceId,
          branchId: dto.destinationBranchId,
          sku: sourceItem.sku,
        },
        {
          workspaceId,
          branchId: dto.destinationBranchId,
          name: sourceItem.name,
        },
      ],
    });

    sourceItem.quantity = Number((currentSourceQuantity - quantity).toFixed(2));
    await this.itemsRepository.save(sourceItem);

    if (destinationItem) {
      destinationItem.quantity = Number(
        (Number(destinationItem.quantity || 0) + quantity).toFixed(2),
      );
      await this.itemsRepository.save(destinationItem);
    } else {
      destinationItem = await this.itemsRepository.save(
        this.itemsRepository.create({
          name: sourceItem.name,
          sku: sourceItem.sku,
          description: sourceItem.description,
          quantity,
          costPrice: sourceItem.costPrice,
          sellingPrice: sourceItem.sellingPrice,
          reorderLevel: sourceItem.reorderLevel,
          category: sourceItem.category,
          location: sourceItem.location,
          supplier: sourceItem.supplier,
          status: sourceItem.status,
          workspace: sourceItem.workspace,
          workspaceId,
          branchId: dto.destinationBranchId,
          createdBy: sourceItem.createdBy,
        }),
      );
    }

    const transfer = await this.stockTransfersRepository.save(
      this.stockTransfersRepository.create({
        workspaceId,
        sourceBranchId: dto.sourceBranchId,
        destinationBranchId: dto.destinationBranchId,
        sourceItemId: sourceItem.id,
        destinationItemId: destinationItem.id,
        quantity,
        status: 'completed',
        reason: dto.reason || null,
        notes: dto.notes || null,
        createdById: userId,
      }),
    );

    await this.auditLogService.log({
      workspaceId,
      branchId: dto.sourceBranchId,
      actorUserId: userId,
      action: 'inventory.transfer',
      entityType: 'stock_transfer',
      entityId: transfer.id,
      metadata: {
        sourceBranchId: dto.sourceBranchId,
        destinationBranchId: dto.destinationBranchId,
        sourceItemId: sourceItem.id,
        destinationItemId: destinationItem.id,
        quantity,
      },
    });

    return transfer;
  }

  async getStockTransfers(workspaceId: string, userId: string) {
    await this.branchAccessService.assertWorkspaceOwnerLike(
      workspaceId,
      userId,
    );
    return this.stockTransfersRepository.find({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
      relations: [
        'sourceBranch',
        'destinationBranch',
        'sourceItem',
        'destinationItem',
        'createdBy',
      ],
      take: 200,
    });
  }
}
