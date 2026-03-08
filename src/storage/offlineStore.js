import { executeSql } from './sqlite';

export async function cacheInventory(workspaceId, items) {
  try {
    const now = Date.now();
    const deleteSql = `DELETE FROM inventory WHERE workspaceId = ?`;
    await executeSql(deleteSql, [workspaceId]);

    const insertSql = `INSERT OR REPLACE INTO inventory (id, workspaceId, data, updatedAt) VALUES (?, ?, ?, ?)`;
    const promises = items.map((item) => {
      return executeSql(insertSql, [item.id, workspaceId, JSON.stringify(item), now]);
    });
    await Promise.all(promises);
  } catch {
    // SQLite may not be available (e.g., web) or errors may occur; ignore
  }
}

export async function getCachedInventory(workspaceId) {
  try {
    const rows = await executeSql(`SELECT data FROM inventory WHERE workspaceId = ?`, [workspaceId]);
    const results = [];
    for (let i = 0; i < rows.rows.length; i += 1) {
      const row = rows.rows.item(i);
      try {
        results.push(JSON.parse(row.data));
      } catch {
        // ignore parse errors
      }
    }
    return results;
  } catch {
    return [];
  }
}

export async function cacheDebts(workspaceId, debts) {
  try {
    const now = Date.now();
    const deleteSql = `DELETE FROM debts WHERE workspaceId = ?`;
    await executeSql(deleteSql, [workspaceId]);

    const insertSql = `INSERT OR REPLACE INTO debts (id, workspaceId, data, updatedAt) VALUES (?, ?, ?, ?)`;
    const promises = debts.map((item) => {
      return executeSql(insertSql, [item.id, workspaceId, JSON.stringify(item), now]);
    });
    await Promise.all(promises);
  } catch {
    // ignore
  }
}

export async function getCachedDebts(workspaceId) {
  try {
    const rows = await executeSql(`SELECT data FROM debts WHERE workspaceId = ?`, [workspaceId]);
    const results = [];
    for (let i = 0; i < rows.rows.length; i += 1) {
      const row = rows.rows.item(i);
      try {
        results.push(JSON.parse(row.data));
      } catch {
        // ignore parse errors
      }
    }
    return results;
  } catch {
    return [];
  }
}

export async function cacheTransactions(workspaceId, type, transactions) {
  try {
    const now = Date.now();
    const deleteSql = `DELETE FROM transactions WHERE workspaceId = ? AND type = ?`;
    await executeSql(deleteSql, [workspaceId, type]);

    const insertSql = `INSERT OR REPLACE INTO transactions (id, workspaceId, type, data, updatedAt) VALUES (?, ?, ?, ?, ?)`;
    const promises = transactions.map((item) => {
      return executeSql(insertSql, [item.id, workspaceId, type, JSON.stringify(item), now]);
    });
    await Promise.all(promises);
  } catch {
    // ignore
  }
}

export async function getCachedTransactions(workspaceId, type) {
  try {
    const rows = await executeSql(`SELECT data FROM transactions WHERE workspaceId = ? AND type = ?`, [workspaceId, type]);
    const results = [];
    for (let i = 0; i < rows.rows.length; i += 1) {
      const row = rows.rows.item(i);
      try {
        results.push(JSON.parse(row.data));
      } catch {
        // ignore parse errors
      }
    }
    return results;
  } catch {
    return [];
  }
}
