import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';

const DB_NAME = 'booker.db';

let dbInstance = null;
let dbOpenPromise = null;

export const db = Platform.OS === 'web' ? null : SQLite.openDatabaseAsync(DB_NAME);

function createRowsResult(rowsArray) {
  return {
    rows: {
      _array: rowsArray,
      length: rowsArray.length,
      item: (index) => rowsArray[index],
    },
  };
}

async function getDb() {
  if (Platform.OS === 'web') {
    return null;
  }

  if (dbInstance) {
    return dbInstance;
  }

  if (!dbOpenPromise) {
    dbOpenPromise = SQLite.openDatabaseAsync(DB_NAME).then((database) => {
      dbInstance = database;
      return database;
    });
  }

  return dbOpenPromise;
}

export async function initDb() {
  const database = await getDb();
  if (!database) return;

  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    -- Workspace-isolated local tables
    CREATE TABLE IF NOT EXISTS local_workspaces (
      local_id TEXT PRIMARY KEY,
      server_id TEXT,
      name TEXT,
      description TEXT,
      parent_workspace_id TEXT,
      role TEXT,
      manager_user_name TEXT,
      manager_user_email TEXT,
      status TEXT,
      sync_status TEXT,
      last_error TEXT,
      updated_at_local INTEGER
    );

    CREATE TABLE IF NOT EXISTS local_inventory (
      local_id TEXT PRIMARY KEY,
      server_id TEXT,
      workspace_local_id TEXT,
      workspace_server_id TEXT,
      data TEXT,
      sync_status TEXT,
      last_error TEXT,
      updated_at_local INTEGER
    );

    CREATE TABLE IF NOT EXISTS local_transactions (
      local_id TEXT PRIMARY KEY,
      server_id TEXT,
      workspace_local_id TEXT,
      workspace_server_id TEXT,
      data TEXT,
      sync_status TEXT,
      last_error TEXT,
      updated_at_local INTEGER
    );

    CREATE TABLE IF NOT EXISTS local_debts (
      local_id TEXT PRIMARY KEY,
      server_id TEXT,
      workspace_local_id TEXT,
      workspace_server_id TEXT,
      data TEXT,
      sync_status TEXT,
      last_error TEXT,
      updated_at_local INTEGER
    );

    CREATE TABLE IF NOT EXISTS local_customers (
      local_id TEXT PRIMARY KEY,
      server_id TEXT,
      workspace_local_id TEXT,
      workspace_server_id TEXT,
      data TEXT,
      sync_status TEXT,
      last_error TEXT,
      updated_at_local INTEGER
    );

    -- Structured outbox for sync actions
    CREATE TABLE IF NOT EXISTS sync_outbox (
      action_id TEXT PRIMARY KEY,
      action_type TEXT,
      entity_type TEXT,
      entity_local_id TEXT,
      workspace_ref TEXT,
      payload TEXT,
      depends_on_action_id TEXT,
      retry_count INTEGER,
      next_retry_at INTEGER,
      last_error TEXT,
      created_at INTEGER,
      updated_at INTEGER
    );

    -- Local <-> server ID mapping
    CREATE TABLE IF NOT EXISTS id_mapping (
      entity_type TEXT,
      local_id TEXT,
      server_id TEXT,
      PRIMARY KEY (entity_type, local_id)
    );

    CREATE TABLE IF NOT EXISTS local_billing_context (
      workspace_id TEXT PRIMARY KEY,
      data TEXT,
      updated_at_local INTEGER
    );

    -- Indexes for workspace isolation and sync performance
    CREATE INDEX IF NOT EXISTS idx_local_inventory_workspace ON local_inventory(workspace_local_id);
    CREATE INDEX IF NOT EXISTS idx_local_transactions_workspace ON local_transactions(workspace_local_id);
    CREATE INDEX IF NOT EXISTS idx_local_debts_workspace ON local_debts(workspace_local_id);
    CREATE INDEX IF NOT EXISTS idx_local_customers_workspace ON local_customers(workspace_local_id);
    CREATE INDEX IF NOT EXISTS idx_sync_outbox_status_next_retry ON sync_outbox(depends_on_action_id, next_retry_at);
    CREATE INDEX IF NOT EXISTS idx_id_mapping_entity_local ON id_mapping(entity_type, local_id);
  `);

  const safeAlter = async (sql) => {
    try {
      await database.execAsync(sql);
    } catch {
      // ignore duplicate-column errors on existing installs
    }
  };

  await safeAlter('ALTER TABLE local_workspaces ADD COLUMN parent_workspace_id TEXT;');
  await safeAlter('ALTER TABLE local_workspaces ADD COLUMN role TEXT;');
  await safeAlter('ALTER TABLE local_workspaces ADD COLUMN manager_user_name TEXT;');
  await safeAlter('ALTER TABLE local_workspaces ADD COLUMN manager_user_email TEXT;');
}

export async function executeSql(sql, params = []) {
  const database = await getDb();
  if (!database) {
    throw new Error('SQLite not available');
  }

  const normalized = sql.trim().toLowerCase();
  const isReadQuery = normalized.startsWith('select') || normalized.startsWith('pragma');

  if (isReadQuery) {
    const rows = await database.getAllAsync(sql, params);
    return createRowsResult(rows);
  }

  const result = await database.runAsync(sql, params);
  return {
    insertId: result.lastInsertRowId,
    rowsAffected: result.changes,
    ...createRowsResult([]),
  };
}
