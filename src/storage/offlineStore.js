import { executeSql } from './sqlite';

export { executeSql };

const parseRowData = (row) => {
  if (!row?.data) return {};
  try {
    return JSON.parse(row.data);
  } catch {
    return {};
  }
};

const localWorkspaceId = (workspaceId) => (workspaceId == null ? '' : String(workspaceId));

const resolveWorkspaceIdFromRow = (row) => row.server_id || row.local_id;

const entityTableMap = {
  inventory: 'local_inventory',
  transaction: 'local_transactions',
  debt: 'local_debts',
  customer: 'local_customers',
};

const getEntityTable = (entityType) => entityTableMap[entityType] || null;
const branchScopedTables = [
  'local_inventory',
  'local_transactions',
  'local_debts',
  'local_customers',
];

// Mark a row and outbox action as conflict
export async function markConflict(entityType, localId, actionId) {
  const table = getEntityTable(entityType);
  if (!table) return;
  await executeSql(`UPDATE ${table} SET sync_status = 'conflict' WHERE local_id = ?`, [localId]);
  await executeSql('UPDATE sync_outbox SET last_error = ?, sync_status = ? WHERE action_id = ?', ['conflict', 'conflict', actionId]);
}

// Get a local row by entity type and localId
export async function getLocalRow(entityType, localId) {
  const table = getEntityTable(entityType);
  if (!table) return null;
  const res = await executeSql(`SELECT * FROM ${table} WHERE local_id = ?`, [localId]);
  if (res.rows.length > 0) return res.rows.item(0);
  return null;
}

export async function getLocalIdByServerId(entityType, serverId, workspaceId) {
  const table = getEntityTable(entityType);
  if (!table || !serverId) return null;
  const workspaceRef = localWorkspaceId(workspaceId);
  const res = workspaceRef
    ? await executeSql(
        `SELECT local_id FROM ${table} WHERE server_id = ? AND (workspace_local_id = ? OR workspace_server_id = ?) LIMIT 1`,
        [String(serverId), workspaceRef, workspaceRef]
      )
    : await executeSql(`SELECT local_id FROM ${table} WHERE server_id = ? LIMIT 1`, [String(serverId)]);
  return res.rows.length > 0 ? res.rows.item(0).local_id : null;
}

export async function markLocalEntityStatus(entityType, localId, syncStatus, lastError = null) {
  const table = getEntityTable(entityType);
  if (!table || !localId) return;
  await executeSql(
    `UPDATE ${table} SET sync_status = ?, last_error = ?, updated_at_local = ? WHERE local_id = ?`,
    [syncStatus, lastError, Date.now(), localId]
  );
}

// --- Workspace-isolated local tables ---
export async function getLocalWorkspaces() {
  return executeSql('SELECT * FROM local_workspaces ORDER BY updated_at_local DESC');
}

export async function cacheWorkspaces(workspaces) {
  try {
    const now = Date.now();
    const list = Array.isArray(workspaces) ? workspaces : [];
    await executeSql("DELETE FROM local_workspaces WHERE COALESCE(sync_status, 'synced') = 'synced'");
    for (const workspace of list) {
      const id = workspace?.id != null ? String(workspace.id) : null;
      if (!id) continue;
      await executeSql(
        `INSERT OR REPLACE INTO local_workspaces (local_id, server_id, name, description, parent_workspace_id, role, manager_user_name, manager_user_email, status, sync_status, last_error, updated_at_local)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          id,
          workspace?.name || 'Workspace',
          workspace?.description || '',
          workspace?.parentWorkspaceId || null,
          workspace?.role || null,
          workspace?.managerUser?.name || null,
          workspace?.managerUser?.email || null,
          workspace?.status || 'active',
          'synced',
          null,
          now,
        ]
      );
    }
  } catch {
    // ignore cache errors
  }
}

export async function clearWorkspaceCache() {
  await executeSql('DELETE FROM local_workspaces');
  await executeSql('DELETE FROM local_billing_context');
}

export async function clearBranchScopedOfflineData() {
  for (const table of branchScopedTables) {
    await executeSql(`DELETE FROM ${table}`);
  }
  await executeSql('DELETE FROM sync_outbox');
  await executeSql("DELETE FROM id_mapping WHERE entity_type IN ('inventory', 'transaction', 'debt', 'customer', 'workspace')");
}

export async function clearAllOfflineData() {
  await clearWorkspaceCache();
  await clearBranchScopedOfflineData();
}

export async function pruneBranchScopedData(allowedBranchIds = []) {
  const allowed = Array.isArray(allowedBranchIds)
    ? allowedBranchIds
        .filter((value) => value != null && value !== '')
        .map((value) => String(value))
    : [];

  if (allowed.length === 0) {
    await clearBranchScopedOfflineData();
    return;
  }

  const placeholders = allowed.map(() => '?').join(', ');
  const deleteParams = [...allowed, ...allowed];

  for (const table of branchScopedTables) {
    await executeSql(
      `DELETE FROM ${table}
       WHERE COALESCE(workspace_local_id, '') NOT IN (${placeholders})
         AND COALESCE(workspace_server_id, '') NOT IN (${placeholders})`,
      deleteParams,
    );
  }

  await executeSql(
    `DELETE FROM sync_outbox
     WHERE COALESCE(workspace_ref, '') NOT IN (${placeholders})`,
    allowed,
  );
}

export async function getLocalInventory(workspaceLocalId) {
  if (!workspaceLocalId) throw new Error('workspaceLocalId required');
  return executeSql(
    "SELECT * FROM local_inventory WHERE (workspace_local_id = ? OR workspace_server_id = ?) AND COALESCE(sync_status, '') != 'pending_delete'",
    [workspaceLocalId, workspaceLocalId]
  );
}

export async function getLocalTransactions(workspaceLocalId) {
  if (!workspaceLocalId) throw new Error('workspaceLocalId required');
  return executeSql(
    "SELECT * FROM local_transactions WHERE (workspace_local_id = ? OR workspace_server_id = ?) AND COALESCE(sync_status, '') != 'pending_delete'",
    [workspaceLocalId, workspaceLocalId]
  );
}

export async function getLocalDebts(workspaceLocalId) {
  if (!workspaceLocalId) throw new Error('workspaceLocalId required');
  return executeSql(
    "SELECT * FROM local_debts WHERE (workspace_local_id = ? OR workspace_server_id = ?) AND COALESCE(sync_status, '') != 'pending_delete'",
    [workspaceLocalId, workspaceLocalId]
  );
}

export async function getLocalCustomers(workspaceLocalId) {
  if (!workspaceLocalId) throw new Error('workspaceLocalId required');
  return executeSql(
    "SELECT * FROM local_customers WHERE (workspace_local_id = ? OR workspace_server_id = ?) AND COALESCE(sync_status, '') != 'pending_delete'",
    [workspaceLocalId, workspaceLocalId]
  );
}

// Insert/update/delete helpers for local entities (always workspace-scoped)
export async function upsertLocalInventory(item, workspaceLocalId) {
  if (!workspaceLocalId) throw new Error('workspaceLocalId required');
  return executeSql(
    `INSERT OR REPLACE INTO local_inventory (local_id, server_id, workspace_local_id, workspace_server_id, data, sync_status, last_error, updated_at_local)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.local_id,
      item.server_id || null,
      workspaceLocalId,
      item.workspace_server_id || workspaceLocalId,
      JSON.stringify(item.data),
      item.sync_status || 'pending_create',
      item.last_error || null,
      item.updated_at_local || Date.now(),
    ]
  );
}

export async function upsertLocalTransaction(item, workspaceLocalId) {
  if (!workspaceLocalId) throw new Error('workspaceLocalId required');
  return executeSql(
    `INSERT OR REPLACE INTO local_transactions (local_id, server_id, workspace_local_id, workspace_server_id, data, sync_status, last_error, updated_at_local)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.local_id,
      item.server_id || null,
      workspaceLocalId,
      item.workspace_server_id || workspaceLocalId,
      JSON.stringify(item.data),
      item.sync_status || 'pending_create',
      item.last_error || null,
      item.updated_at_local || Date.now(),
    ]
  );
}

export async function upsertLocalDebt(item, workspaceLocalId) {
  if (!workspaceLocalId) throw new Error('workspaceLocalId required');
  return executeSql(
    `INSERT OR REPLACE INTO local_debts (local_id, server_id, workspace_local_id, workspace_server_id, data, sync_status, last_error, updated_at_local)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.local_id,
      item.server_id || null,
      workspaceLocalId,
      item.workspace_server_id || workspaceLocalId,
      JSON.stringify(item.data),
      item.sync_status || 'pending_create',
      item.last_error || null,
      item.updated_at_local || Date.now(),
    ]
  );
}

export async function upsertLocalCustomer(item, workspaceLocalId) {
  if (!workspaceLocalId) throw new Error('workspaceLocalId required');
  return executeSql(
    `INSERT OR REPLACE INTO local_customers (local_id, server_id, workspace_local_id, workspace_server_id, data, sync_status, last_error, updated_at_local)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.local_id,
      item.server_id || null,
      workspaceLocalId,
      item.workspace_server_id || workspaceLocalId,
      JSON.stringify(item.data),
      item.sync_status || 'pending_create',
      item.last_error || null,
      item.updated_at_local || Date.now(),
    ]
  );
}

export async function deleteLocalInventory(localId, workspaceLocalId) {
  if (!workspaceLocalId) throw new Error('workspaceLocalId required');
  return executeSql('DELETE FROM local_inventory WHERE local_id = ? AND (workspace_local_id = ? OR workspace_server_id = ?)', [localId, workspaceLocalId, workspaceLocalId]);
}

export async function deleteLocalTransaction(localId, workspaceLocalId) {
  if (!workspaceLocalId) throw new Error('workspaceLocalId required');
  return executeSql('DELETE FROM local_transactions WHERE local_id = ? AND (workspace_local_id = ? OR workspace_server_id = ?)', [localId, workspaceLocalId, workspaceLocalId]);
}

export async function deleteLocalDebt(localId, workspaceLocalId) {
  if (!workspaceLocalId) throw new Error('workspaceLocalId required');
  return executeSql('DELETE FROM local_debts WHERE local_id = ? AND (workspace_local_id = ? OR workspace_server_id = ?)', [localId, workspaceLocalId, workspaceLocalId]);
}

export async function deleteLocalCustomer(localId, workspaceLocalId) {
  if (!workspaceLocalId) throw new Error('workspaceLocalId required');
  return executeSql('DELETE FROM local_customers WHERE local_id = ? AND (workspace_local_id = ? OR workspace_server_id = ?)', [localId, workspaceLocalId, workspaceLocalId]);
}

// --- Structured outbox ---
export async function addSyncOutboxAction(action) {
  return executeSql(
    `INSERT OR REPLACE INTO sync_outbox (action_id, action_type, entity_type, entity_local_id, workspace_ref, payload, depends_on_action_id, retry_count, next_retry_at, last_error, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      action.action_id,
      action.action_type,
      action.entity_type,
      action.entity_local_id,
      action.workspace_ref,
      JSON.stringify(action.payload),
      action.depends_on_action_id,
      action.retry_count || 0,
      action.next_retry_at || null,
      action.last_error || null,
      action.created_at || Date.now(),
      action.updated_at || Date.now(),
    ]
  );
}

export async function getSyncOutboxActions() {
  return executeSql('SELECT * FROM sync_outbox ORDER BY next_retry_at ASC, created_at ASC');
}

// --- ID mapping helpers ---
export async function setIdMapping(entityType, localId, serverId) {
  return executeSql(
    'INSERT OR REPLACE INTO id_mapping (entity_type, local_id, server_id) VALUES (?, ?, ?)',
    [entityType, localId, serverId]
  );
}

export async function getServerId(entityType, localId) {
  const res = await executeSql('SELECT server_id FROM id_mapping WHERE entity_type = ? AND local_id = ?', [entityType, localId]);
  if (res.rows.length > 0) {
    return res.rows.item(0).server_id;
  }
  return null;
}

export async function cacheInventory(workspaceId, items) {
  try {
    const now = Date.now();
    const workspaceRef = localWorkspaceId(workspaceId);
    const list = Array.isArray(items) ? items : [];

    await executeSql(
      "DELETE FROM local_inventory WHERE (workspace_local_id = ? OR workspace_server_id = ?) AND COALESCE(sync_status, 'synced') = 'synced'",
      [workspaceRef, workspaceRef]
    );

    for (const item of list) {
      const serverId = item?.id != null ? String(item.id) : null;
      const localId = item?.local_id || (serverId ? `inventory_${workspaceRef}_${serverId}` : `inventory_${workspaceRef}_${now}_${Math.random().toString(16).slice(2)}`);
      await executeSql(
        `INSERT OR REPLACE INTO local_inventory (local_id, server_id, workspace_local_id, workspace_server_id, data, sync_status, last_error, updated_at_local)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          localId,
          serverId,
          workspaceRef,
          workspaceRef,
          JSON.stringify(item),
          'synced',
          null,
          now,
        ]
      );
    }
  } catch {
    // ignore
  }
}

export async function getCachedInventory(workspaceId) {
  try {
    const workspaceRef = localWorkspaceId(workspaceId);
    const rows = await executeSql(
      'SELECT * FROM local_inventory WHERE workspace_local_id = ? OR workspace_server_id = ? ORDER BY updated_at_local DESC',
      [workspaceRef, workspaceRef]
    );
    const results = [];
    for (let i = 0; i < rows.rows.length; i += 1) {
      const row = rows.rows.item(i);
      if (row.sync_status === 'pending_delete') continue;
      const data = parseRowData(row);
      results.push({ ...data, id: data.id ?? row.server_id ?? row.local_id, local_id: row.local_id, sync_status: row.sync_status });
    }
    return results;
  } catch {
    return [];
  }
}

export async function cacheDebts(workspaceId, debts) {
  try {
    const now = Date.now();
    const workspaceRef = localWorkspaceId(workspaceId);
    const list = Array.isArray(debts) ? debts : [];

    await executeSql(
      "DELETE FROM local_debts WHERE (workspace_local_id = ? OR workspace_server_id = ?) AND COALESCE(sync_status, 'synced') = 'synced'",
      [workspaceRef, workspaceRef]
    );

    for (const item of list) {
      const serverId = item?.id != null ? String(item.id) : null;
      const localId = item?.local_id || (serverId ? `debt_${workspaceRef}_${serverId}` : `debt_${workspaceRef}_${now}_${Math.random().toString(16).slice(2)}`);
      await executeSql(
        `INSERT OR REPLACE INTO local_debts (local_id, server_id, workspace_local_id, workspace_server_id, data, sync_status, last_error, updated_at_local)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          localId,
          serverId,
          workspaceRef,
          workspaceRef,
          JSON.stringify(item),
          'synced',
          null,
          now,
        ]
      );
    }
  } catch {
    // ignore
  }
}

export async function getCachedDebts(workspaceId) {
  try {
    const workspaceRef = localWorkspaceId(workspaceId);
    const rows = await executeSql(
      'SELECT * FROM local_debts WHERE workspace_local_id = ? OR workspace_server_id = ? ORDER BY updated_at_local DESC',
      [workspaceRef, workspaceRef]
    );
    const results = [];
    for (let i = 0; i < rows.rows.length; i += 1) {
      const row = rows.rows.item(i);
      if (row.sync_status === 'pending_delete') continue;
      const data = parseRowData(row);
      results.push({ ...data, id: data.id ?? row.server_id ?? row.local_id, local_id: row.local_id, sync_status: row.sync_status });
    }
    return results;
  } catch {
    return [];
  }
}

export async function cacheTransactions(workspaceId, type, transactions, replaceExisting = false) {
  try {
    const now = Date.now();
    const workspaceRef = localWorkspaceId(workspaceId);
    const list = Array.isArray(transactions) ? transactions : [];

    if (replaceExisting) {
      await executeSql(
        "DELETE FROM local_transactions WHERE (workspace_local_id = ? OR workspace_server_id = ?) AND COALESCE(sync_status, 'synced') = 'synced'",
        [workspaceRef, workspaceRef]
      );
    }

    for (const item of list) {
      const transactionType = (item?.type || type || '').toLowerCase();
      const serverId = item?.id != null ? String(item.id) : null;
      const localId = item?.local_id || (serverId ? `transaction_${workspaceRef}_${transactionType || 'any'}_${serverId}` : `transaction_${workspaceRef}_${now}_${Math.random().toString(16).slice(2)}`);
      await executeSql(
        `INSERT OR REPLACE INTO local_transactions (local_id, server_id, workspace_local_id, workspace_server_id, data, sync_status, last_error, updated_at_local)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          localId,
          serverId,
          workspaceRef,
          workspaceRef,
          JSON.stringify(item),
          'synced',
          null,
          now,
        ]
      );
    }
  } catch {
    // ignore
  }
}

export async function cacheCustomers(workspaceId, customers) {
  try {
    const now = Date.now();
    const workspaceRef = localWorkspaceId(workspaceId);
    const list = Array.isArray(customers) ? customers : [];

    await executeSql(
      "DELETE FROM local_customers WHERE (workspace_local_id = ? OR workspace_server_id = ?) AND COALESCE(sync_status, 'synced') = 'synced'",
      [workspaceRef, workspaceRef]
    );

    for (const item of list) {
      const serverId = item?.id != null ? String(item.id) : null;
      const localId = item?.local_id || (serverId ? `customer_${workspaceRef}_${serverId}` : `customer_${workspaceRef}_${now}_${Math.random().toString(16).slice(2)}`);
      await executeSql(
        `INSERT OR REPLACE INTO local_customers (local_id, server_id, workspace_local_id, workspace_server_id, data, sync_status, last_error, updated_at_local)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          localId,
          serverId,
          workspaceRef,
          workspaceRef,
          JSON.stringify(item),
          'synced',
          null,
          now,
        ]
      );
    }
  } catch {
    // ignore
  }
}

export async function getCachedTransactions(workspaceId, type) {
  try {
    const workspaceRef = localWorkspaceId(workspaceId);
    const rows = await executeSql(
      'SELECT * FROM local_transactions WHERE workspace_local_id = ? OR workspace_server_id = ? ORDER BY updated_at_local DESC',
      [workspaceRef, workspaceRef]
    );

    const normalizedType = type ? String(type).toLowerCase() : null;
    const results = [];
    for (let i = 0; i < rows.rows.length; i += 1) {
      const row = rows.rows.item(i);
      if (row.sync_status === 'pending_delete') continue;
      const data = parseRowData(row);
      if (normalizedType && String(data?.type || '').toLowerCase() !== normalizedType) {
        continue;
      }
      results.push({ ...data, id: data.id ?? row.server_id ?? row.local_id, local_id: row.local_id, sync_status: row.sync_status });
    }
    return results;
  } catch {
    return [];
  }
}

export async function getCachedCustomers(workspaceId, search) {
  try {
    const workspaceRef = localWorkspaceId(workspaceId);
    const rows = await executeSql(
      'SELECT * FROM local_customers WHERE workspace_local_id = ? OR workspace_server_id = ? ORDER BY updated_at_local DESC',
      [workspaceRef, workspaceRef]
    );
    const normalizedSearch = search ? String(search).trim().toLowerCase() : '';
    const results = [];
    for (let i = 0; i < rows.rows.length; i += 1) {
      const row = rows.rows.item(i);
      if (row.sync_status === 'pending_delete') continue;
      const data = parseRowData(row);
      const customer = { ...data, id: data.id ?? row.server_id ?? row.local_id, local_id: row.local_id, sync_status: row.sync_status };
      if (!normalizedSearch) {
        results.push(customer);
        continue;
      }
      const haystack = [customer.name, customer.email, customer.phone, customer.address]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (haystack.includes(normalizedSearch)) {
        results.push(customer);
      }
    }
    return results;
  } catch {
    return [];
  }
}

export async function cacheBillingContext(workspaceId, context) {
  try {
    if (!workspaceId || !context) return;
    const workspaceRef = localWorkspaceId(workspaceId);
    await executeSql(
      `INSERT OR REPLACE INTO local_billing_context (workspace_id, data, updated_at_local)
       VALUES (?, ?, ?)`,
      [workspaceRef, JSON.stringify(context), Date.now()]
    );
  } catch {
    // ignore
  }
}

export async function getCachedBillingContext(workspaceId) {
  try {
    if (!workspaceId) return null;
    const workspaceRef = localWorkspaceId(workspaceId);
    const rows = await executeSql(
      'SELECT data, updated_at_local FROM local_billing_context WHERE workspace_id = ? LIMIT 1',
      [workspaceRef]
    );
    if (rows.rows.length === 0) return null;
    const row = rows.rows.item(0);
    return parseRowData(row);
  } catch {
    return null;
  }
}

export async function getOfflineWorkspacesForUi() {
  try {
    const rows = await getLocalWorkspaces();
    const result = [];
    for (let i = 0; i < rows.rows.length; i += 1) {
      const row = rows.rows.item(i);
      const id = resolveWorkspaceIdFromRow(row);
      if (!id) continue;
      result.push({
        id,
        local_id: row.local_id,
        server_id: row.server_id,
        name: row.name || 'Workspace',
        description: row.description || '',
        parentWorkspaceId: row.parent_workspace_id || null,
        role: row.role || null,
        managerUser: row.manager_user_name || row.manager_user_email
          ? {
              name: row.manager_user_name || null,
              email: row.manager_user_email || null,
            }
          : null,
        status: row.status || 'active',
      });
    }
    return result;
  } catch {
    return [];
  }
}
