import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabase('booker.db');

const ensureTables = () => {
  db.transaction((tx) => {
    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS inventory_cache (
        workspaceId TEXT,
        itemId TEXT,
        payload TEXT,
        PRIMARY KEY (workspaceId, itemId)
      )`,
      [],
      () => {},
      () => true,
    );

    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS transactions_cache (
        workspaceId TEXT,
        txId TEXT,
        payload TEXT,
        PRIMARY KEY (workspaceId, txId)
      )`,
      [],
      () => {},
      () => true,
    );
  });
};

const serialize = (value) => JSON.stringify(value || {});
const deserialize = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export const cacheInventory = (workspaceId, items = []) => {
  ensureTables();
  db.transaction((tx) => {
    tx.executeSql(
      'DELETE FROM inventory_cache WHERE workspaceId = ?;',
      [workspaceId],
    );

    items.forEach((item) => {
      tx.executeSql(
        'INSERT OR REPLACE INTO inventory_cache (workspaceId, itemId, payload) VALUES (?, ?, ?);',
        [workspaceId, item.id, serialize(item)],
      );
    });
  });
};

export const getCachedInventory = (workspaceId) =>
  new Promise((resolve) => {
    ensureTables();
    db.transaction((tx) => {
      tx.executeSql(
        'SELECT payload FROM inventory_cache WHERE workspaceId = ?;',
        [workspaceId],
        (_, result) => {
          const items = [];
          for (let i = 0; i < result.rows.length; i += 1) {
            const row = result.rows.item(i);
            const item = deserialize(row.payload);
            if (item) items.push(item);
          }
          resolve(items);
        },
        () => {
          resolve([]);
          return true;
        },
      );
    });
  });

export const cacheTransactions = (workspaceId, transactions = []) => {
  ensureTables();
  db.transaction((tx) => {
    tx.executeSql(
      'DELETE FROM transactions_cache WHERE workspaceId = ?;',
      [workspaceId],
    );

    transactions.forEach((txItem) => {
      tx.executeSql(
        'INSERT OR REPLACE INTO transactions_cache (workspaceId, txId, payload) VALUES (?, ?, ?);',
        [workspaceId, txItem.id, serialize(txItem)],
      );
    });
  });
};

export const getCachedTransactions = (workspaceId) =>
  new Promise((resolve) => {
    ensureTables();
    db.transaction((tx) => {
      tx.executeSql(
        'SELECT payload FROM transactions_cache WHERE workspaceId = ?;',
        [workspaceId],
        (_, result) => {
          const items = [];
          for (let i = 0; i < result.rows.length; i += 1) {
            const row = result.rows.item(i);
            const item = deserialize(row.payload);
            if (item) items.push(item);
          }
          resolve(items);
        },
        () => {
          resolve([]);
          return true;
        },
      );
    });
  });
