import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';

const DB_NAME = 'booker.db';

export const db = Platform.OS === 'web' ? null : SQLite.openDatabase(DB_NAME);

export function initDb() {
  if (!db) return;

  db.transaction((tx) => {
    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS inventory (
        id TEXT PRIMARY KEY,
        workspaceId TEXT,
        data TEXT,
        updatedAt INTEGER
      );`,
    );
    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS debts (
        id TEXT PRIMARY KEY,
        workspaceId TEXT,
        data TEXT,
        updatedAt INTEGER
      );`,
    );
    tx.executeSql(
      `CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        workspaceId TEXT,
        type TEXT,
        data TEXT,
        updatedAt INTEGER
      );`,
    );
  });
}

export function executeSql(sql, params = []) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('SQLite not available')); 
      return;
    }

    db.transaction((tx) => {
      tx.executeSql(
        sql,
        params,
        (_, result) => resolve(result),
        (_, err) => {
          reject(err);
          return false;
        },
      );
    });
  });
}
