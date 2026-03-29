import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog)
    private auditLogsRepository: Repository<AuditLog>,
  ) {}

  async log(input: {
    workspaceId: string;
    actorUserId: string;
    action: string;
    entityType: string;
    entityId?: string | null;
    branchId?: string | null;
    metadata?: Record<string, any> | null;
  }) {
    const row = this.auditLogsRepository.create({
      workspaceId: input.workspaceId,
      branchId: input.branchId ?? null,
      actorUserId: input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: input.metadata ?? null,
    });
    return this.auditLogsRepository.save(row);
  }
}
