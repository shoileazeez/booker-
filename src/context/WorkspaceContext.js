// --- Sync Coordinator Worker ---
let syncWorkerActive = false;
const BACKOFF_BASE_MS = 1500;
const MAX_RETRIES = 5;
const isLocalEntityId = (value) => typeof value === 'string' && value.startsWith('local_');

async function syncCoordinatorWorker({ token, currentWorkspaceId, currentBranchId }) {
  if (syncWorkerActive) return;
  syncWorkerActive = true;
  try {
    const outboxRes = await offlineStore.getSyncOutboxActions();
    const rows = outboxRes?.rows || { length: 0 };
    for (let i = 0; i < rows.length; i++) {
      const action = rows.item(i);
      // Skip if not due for retry yet
      if (action.next_retry_at && Date.now() < action.next_retry_at) continue;
      // Dependency check: skip if parent action still exists
      if (action.depends_on_action_id) {
        let parentExists = false;
        for (let j = 0; j < rows.length; j++) {
          if (rows.item(j).action_id === action.depends_on_action_id) {
            parentExists = true;
            break;
          }
        }
        if (parentExists) continue;
      }
      // Map branch ref if needed
      let branchId = action.workspace_ref;
      if (branchId && branchId.startsWith('local_')) {
        const mapped = await offlineStore.getServerId('workspace', branchId);
        if (!mapped) {
          continue;
        }
        branchId = mapped;
      }
      try {
        const payload = action.payload ? JSON.parse(action.payload) : undefined;
        let apiRes = null;
        let syncPayload = payload;
        // --- Conflict detection for update/delete ---
        let entityType = null;
        let serverId = null;
        let localRow = null;
        let remoteRow = null;
        let localUpdated = null;
        let remoteUpdated = null;
        let conflict = false;
        if (action.action_type.startsWith('update_') || action.action_type.startsWith('delete_')) {
          if (action.action_type.includes('inventory')) entityType = 'inventory';
          if (action.action_type.includes('transaction')) entityType = 'transaction';
          if (action.action_type.includes('debt')) entityType = 'debt';
          if (action.action_type.includes('customer')) entityType = 'customer';
          serverId = await offlineStore.getServerId(entityType, action.entity_local_id);
          if (!serverId) throw new Error('No serverId for ' + entityType);
          // Get local row
          localRow = await offlineStore.getLocalRow(entityType, action.entity_local_id);
          localUpdated = localRow?.updated_at_local || localRow?.updatedAt || 0;
          // Fetch remote row (if online)
          try {
            if (entityType === 'inventory') {
              remoteRow = await api.get(`/workspaces/${currentWorkspaceId}/branches/${branchId}/inventory/${serverId}`);
            } else if (entityType === 'transaction' || entityType === 'debt') {
              remoteRow = await api.get(`/workspaces/${currentWorkspaceId}/branches/${branchId}/transactions/${serverId}`);
            } else if (entityType === 'customer') {
              remoteRow = await api.get(`/workspaces/${currentWorkspaceId}/branches/${branchId}/customers/${serverId}`);
            }
            remoteUpdated = new Date(remoteRow?.updatedAt || remoteRow?.updated_at || 0).getTime();
            // If both changed since last sync, mark conflict
            if (remoteUpdated && localUpdated && Math.abs(remoteUpdated - localUpdated) > 1000) {
              conflict = true;
            }
          } catch (e) {
            // If offline or fetch fails, skip conflict check (best effort)
          }
        }
        if (conflict) {
          // Mark as conflict in outbox and local row
          await offlineStore.markConflict(entityType, action.entity_local_id, action.action_id);
          continue; // Skip this action until resolved
        }
        // --- Normal sync logic ---
        if (action.action_type === 'create_workspace') {
          apiRes = await api.post('/workspaces', syncPayload);
          if (apiRes?.id) {
            await offlineStore.setIdMapping('workspace', action.entity_local_id, apiRes.id);
          }
        } else if (action.action_type === 'create_inventory') {
          apiRes = await api.post(`/workspaces/${currentWorkspaceId}/branches/${branchId}/inventory`, syncPayload);
          if (apiRes?.id) {
            await offlineStore.setIdMapping('inventory', action.entity_local_id, apiRes.id);
          }
        } else if (action.action_type === 'update_inventory') {
          apiRes = await api.put(`/workspaces/${currentWorkspaceId}/branches/${branchId}/inventory/${serverId}`, syncPayload);
        } else if (action.action_type === 'delete_inventory') {
          apiRes = await api.delete(`/workspaces/${currentWorkspaceId}/branches/${branchId}/inventory/${serverId}`);
        } else if (action.action_type === 'create_transaction') {
          if (isLocalEntityId(syncPayload?.itemId)) {
            const mappedItemId = await offlineStore.getServerId('inventory', syncPayload.itemId);
            if (!mappedItemId) {
              throw new Error('Selected inventory item has not synced yet');
            }
            syncPayload = { ...syncPayload, itemId: mappedItemId };
          }
          apiRes = await api.post(`/workspaces/${currentWorkspaceId}/branches/${branchId}/transactions`, syncPayload);
          if (apiRes?.id) {
            await offlineStore.setIdMapping('transaction', action.entity_local_id, apiRes.id);
          }
        } else if (action.action_type === 'update_transaction') {
          apiRes = await api.put(`/workspaces/${currentWorkspaceId}/branches/${branchId}/transactions/${serverId}`, syncPayload);
        } else if (action.action_type === 'delete_transaction') {
          apiRes = await api.delete(`/workspaces/${currentWorkspaceId}/branches/${branchId}/transactions/${serverId}`);
        } else if (action.action_type === 'create_debt') {
          apiRes = await api.post(`/workspaces/${currentWorkspaceId}/branches/${branchId}/transactions`, syncPayload);
          if (apiRes?.id) {
            await offlineStore.setIdMapping('debt', action.entity_local_id, apiRes.id);
          }
        } else if (action.action_type === 'update_debt') {
          apiRes = await api.put(`/workspaces/${currentWorkspaceId}/branches/${branchId}/transactions/${serverId}`, syncPayload);
        } else if (action.action_type === 'delete_debt') {
          apiRes = await api.delete(`/workspaces/${currentWorkspaceId}/branches/${branchId}/transactions/${serverId}`);
        } else if (action.action_type === 'create_customer') {
          apiRes = await api.post(`/workspaces/${currentWorkspaceId}/branches/${branchId}/customers`, syncPayload);
          if (apiRes?.id) {
            await offlineStore.setIdMapping('customer', action.entity_local_id, apiRes.id);
          }
        } else if (action.action_type === 'update_customer') {
          apiRes = await api.put(`/workspaces/${currentWorkspaceId}/branches/${branchId}/customers/${serverId}`, syncPayload);
        } else if (action.action_type === 'delete_customer') {
          apiRes = await api.delete(`/workspaces/${currentWorkspaceId}/branches/${branchId}/customers/${serverId}`);
        }

        if (action.action_type.startsWith('create_')) {
          if (apiRes?.id) {
            const entityTypeForCreate =
              action.entity_type === 'debt' ? 'debt' : action.entity_type;
            const localRow = await offlineStore.getLocalRow(entityTypeForCreate, action.entity_local_id);
            const currentData = localRow?.data ? JSON.parse(localRow.data) : syncPayload || {};
            const upsertByType = {
              inventory: offlineStore.upsertLocalInventory,
              transaction: offlineStore.upsertLocalTransaction,
              debt: offlineStore.upsertLocalDebt,
              customer: offlineStore.upsertLocalCustomer,
            }[entityTypeForCreate];
            if (upsertByType) {
              await upsertByType({
                local_id: action.entity_local_id,
                server_id: String(apiRes.id),
                workspace_server_id: branchId,
                data: { ...currentData, ...syncPayload, ...apiRes, id: apiRes.id, local_id: action.entity_local_id },
                sync_status: 'synced',
                updated_at_local: Date.now(),
              }, branchId);
            }
          }
        } else if (action.action_type.startsWith('update_')) {
          await offlineStore.markLocalEntityStatus(action.entity_type, action.entity_local_id, 'synced', null);
        } else if (action.action_type.startsWith('delete_')) {
          const deleteByType = {
            inventory: offlineStore.deleteLocalInventory,
            transaction: offlineStore.deleteLocalTransaction,
            debt: offlineStore.deleteLocalDebt,
            customer: offlineStore.deleteLocalCustomer,
          }[action.entity_type];
          if (deleteByType) {
            await deleteByType(action.entity_local_id, branchId);
          }
        }

        // On success: remove from outbox
        await offlineStore.executeSql('DELETE FROM sync_outbox WHERE action_id = ?', [action.action_id]);
        // TODO: update local row status to synced if needed
      } catch (err) {
        await offlineStore.markLocalEntityStatus(action.entity_type, action.entity_local_id, 'failed', err.message);
        // On failure: increment retry_count, set next_retry_at (exponential backoff), update last_error
        const retryCount = (action.retry_count || 0) + 1;
        const backoff = Math.min(BACKOFF_BASE_MS * Math.pow(2, retryCount - 1), 60000);
        const nextRetry = Date.now() + backoff;
        if (retryCount > MAX_RETRIES) {
          // Give up: leave in outbox with error
          await offlineStore.executeSql(
            'UPDATE sync_outbox SET last_error = ?, retry_count = ?, next_retry_at = ? WHERE action_id = ?',
            [err.message, retryCount, null, action.action_id]
          );
        } else {
          await offlineStore.executeSql(
            'UPDATE sync_outbox SET last_error = ?, retry_count = ?, next_retry_at = ? WHERE action_id = ?',
            [err.message, retryCount, nextRetry, action.action_id]
          );
        }
      }
    }
  } finally {
    syncWorkerActive = false;
  }
}
import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { api } from '../api/client';
import * as offlineStore from '../storage/offlineStore';

const WorkspaceContext = createContext();
const WORKSPACE_STORAGE_KEY = '@booker:currentWorkspace';
const BRANCH_STORAGE_KEY = '@booker:currentBranch';
const OFFLINE_QUEUE_KEY = '@booker:queuedActions';
const LAST_SYNC_STORAGE_KEY = '@booker:lastSyncAt';

const generateId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const generateLocalId = (prefix) => `local_${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
const stampLocalEntityDates = (payload = {}, now = Date.now()) => {
  const isoNow = new Date(now).toISOString();
  return {
    ...payload,
    createdAt: payload?.createdAt || isoNow,
    updatedAt: isoNow,
  };
};

const parseActionRoute = (path = '') => {
  const inventory = path.match(/^\/workspaces\/([^/]+)\/branches\/([^/]+)\/inventory(?:\/([^/]+))?$/);
  if (inventory) {
    return {
      workspaceId: inventory[1],
      branchId: inventory[2],
      domain: 'inventory',
      targetId: inventory[3] || null,
    };
  }

  const transactions = path.match(/^\/workspaces\/([^/]+)\/branches\/([^/]+)\/transactions(?:\/([^/]+))?$/);
  if (transactions) {
    return {
      workspaceId: transactions[1],
      branchId: transactions[2],
      domain: 'transactions',
      targetId: transactions[3] || null,
    };
  }

  const customers = path.match(/^\/workspaces\/([^/]+)\/branches\/([^/]+)\/customers(?:\/([^/]+))?$/);
  if (customers) {
    return {
      workspaceId: customers[1],
      branchId: customers[2],
      domain: 'customers',
      targetId: customers[3] || null,
    };
  }

  return null;
};

export const WorkspaceProvider = function({ children }) {
  const { token } = useAuth();

  const [workspaces, setWorkspaces] = useState([]);
  const [branches, setBranches] = useState([]);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState(null);
  const [currentBranchId, setCurrentBranchId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingActions, setPendingActions] = useState([]);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const persistWorkspaceId = async (id) => {
    try {
      await AsyncStorage.setItem(WORKSPACE_STORAGE_KEY, id || '');
    } catch (err) {
      // ignore
    }
  };

  const loadStoredWorkspaceId = async () => {
    try {
      const stored = await AsyncStorage.getItem(WORKSPACE_STORAGE_KEY);
      if (stored) {
        setCurrentWorkspaceId(stored);
      }
    } catch (err) {
      // ignore
    }
  };

  const persistBranchId = async (id) => {
    try {
      await AsyncStorage.setItem(BRANCH_STORAGE_KEY, id || '');
    } catch (err) {
      // ignore
    }
  };

  const loadStoredBranchId = async () => {
    try {
      const stored = await AsyncStorage.getItem(BRANCH_STORAGE_KEY);
      if (stored) {
        setCurrentBranchId(stored);
      }
    } catch (err) {
      // ignore
    }
  };

  const persistPendingActions = async (actions) => {
    try {
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(actions || []));
    } catch (err) {
      // ignore
    }
  };

  const loadPendingActions = async () => {
    try {
      const stored = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      if (stored) {
        setPendingActions(JSON.parse(stored));
      }
    } catch (err) {
      // ignore
    }
  };

  const persistLastSyncedAt = async (date) => {
    try {
      await AsyncStorage.setItem(LAST_SYNC_STORAGE_KEY, String(date?.getTime() ?? ''));
    } catch (err) {
      // ignore
    }
  };

  const loadLastSyncedAt = async () => {
    try {
      const lastSync = await AsyncStorage.getItem(LAST_SYNC_STORAGE_KEY);
      if (lastSync) {
        setLastSyncedAt(new Date(parseInt(lastSync, 10)));
      }
    } catch (err) {
      // ignore
    }
  };

  const enqueueOfflineAction = async (action) => {
    const queued = { id: generateId(), createdAt: Date.now(), ...action };
    setPendingActions((prev) => {
      const next = [...prev, queued];
      persistPendingActions(next);
      return next;
    });
  };

  const processPendingActions = useCallback(async () => {
    if (!token || !currentWorkspaceId || pendingActions.length === 0) {
      return;
    }

    setIsSyncing(true);

    const remaining = [];

    for (const action of pendingActions) {
      try {
        if (action.method === 'post') {
          await api.post(action.path, action.body);
        } else if (action.method === 'put') {
          await api.put(action.path, action.body);
        } else if (action.method === 'delete') {
          await api.delete(action.path);
        }
      } catch (err) {
        remaining.push(action);
      }
    }

    const now = new Date();
    setLastSyncedAt(now);
    persistLastSyncedAt(now);

    setPendingActions(remaining);
    persistPendingActions(remaining);
    setIsSyncing(false);
  }, [currentWorkspaceId, pendingActions, token]);

  const queueStructuredAction = useCallback(async (action) => {
    const route = parseActionRoute(action?.path);
    if (!route || !route.workspaceId || !route.branchId) {
      await enqueueOfflineAction(action);
      return;
    }

    const workspaceRef = String(route.branchId);
    const now = Date.now();

    if (route.domain === 'inventory') {
      if (action.method === 'post') {
        const localId = generateLocalId('inventory');
        await offlineStore.upsertLocalInventory({
          local_id: localId,
          server_id: null,
          workspace_server_id: workspaceRef,
          data: { ...(action.body || {}), local_id: localId, id: localId },
          sync_status: 'pending_create',
          updated_at_local: now,
        }, workspaceRef);
        await offlineStore.addSyncOutboxAction({
          action_id: localId,
          action_type: 'create_inventory',
          entity_type: 'inventory',
          entity_local_id: localId,
          workspace_ref: workspaceRef,
          payload: action.body || {},
          created_at: now,
          updated_at: now,
        });
        return;
      }

      if (action.method === 'put' && route.targetId) {
        const localId = await offlineStore.getLocalIdByServerId('inventory', route.targetId, workspaceRef) || String(route.targetId);
        const existing = await offlineStore.getLocalRow('inventory', localId);
        const merged = { ...(existing?.data ? JSON.parse(existing.data) : {}), ...(action.body || {}), id: route.targetId, local_id: localId };
        await offlineStore.upsertLocalInventory({
          local_id: localId,
          server_id: String(route.targetId),
          workspace_server_id: workspaceRef,
          data: merged,
          sync_status: 'pending_update',
          updated_at_local: now,
        }, workspaceRef);
        await offlineStore.addSyncOutboxAction({
          action_id: generateLocalId('inventory_update'),
          action_type: 'update_inventory',
          entity_type: 'inventory',
          entity_local_id: localId,
          workspace_ref: workspaceRef,
          payload: action.body || {},
          created_at: now,
          updated_at: now,
        });
        return;
      }

      if (action.method === 'delete' && route.targetId) {
        const localId = await offlineStore.getLocalIdByServerId('inventory', route.targetId, workspaceRef) || String(route.targetId);
        await offlineStore.markLocalEntityStatus('inventory', localId, 'pending_delete');
        await offlineStore.addSyncOutboxAction({
          action_id: generateLocalId('inventory_delete'),
          action_type: 'delete_inventory',
          entity_type: 'inventory',
          entity_local_id: localId,
          workspace_ref: workspaceRef,
          payload: { id: route.targetId },
          created_at: now,
          updated_at: now,
        });
        return;
      }
    }

    if (route.domain === 'transactions') {
      const txType = String(action?.body?.type || '').toLowerCase();
      const entityType = txType === 'debt' ? 'debt' : 'transaction';
      const actionPrefix = txType === 'debt' ? 'debt' : 'transaction';

      if (action.method === 'post') {
        const localId = generateLocalId(actionPrefix);
        const dependsOnActionId = entityType === 'transaction' && isLocalEntityId(action?.body?.itemId)
          ? action.body.itemId
          : null;
        const upsert = entityType === 'debt' ? offlineStore.upsertLocalDebt : offlineStore.upsertLocalTransaction;
        const stampedBody = stampLocalEntityDates(action.body || {}, now);
        await upsert({
          local_id: localId,
          server_id: null,
          workspace_server_id: workspaceRef,
          data: { ...stampedBody, local_id: localId, id: localId },
          sync_status: 'pending_create',
          updated_at_local: now,
        }, workspaceRef);
        await offlineStore.addSyncOutboxAction({
          action_id: localId,
          action_type: `create_${actionPrefix}`,
          entity_type: entityType,
          entity_local_id: localId,
          workspace_ref: workspaceRef,
          payload: stampedBody,
          depends_on_action_id: dependsOnActionId,
          created_at: now,
          updated_at: now,
        });
        return;
      }
    }

    if (route.domain === 'customers') {
      if (action.method === 'post') {
        const localId = generateLocalId('customer');
        await offlineStore.upsertLocalCustomer({
          local_id: localId,
          server_id: null,
          workspace_server_id: workspaceRef,
          data: { ...(action.body || {}), local_id: localId, id: localId },
          sync_status: 'pending_create',
          updated_at_local: now,
        }, workspaceRef);
        await offlineStore.addSyncOutboxAction({
          action_id: localId,
          action_type: 'create_customer',
          entity_type: 'customer',
          entity_local_id: localId,
          workspace_ref: workspaceRef,
          payload: action.body || {},
          created_at: now,
          updated_at: now,
        });
        return;
      }

      if (action.method === 'put' && route.targetId) {
        const localId = await offlineStore.getLocalIdByServerId('customer', route.targetId, workspaceRef) || String(route.targetId);
        const existing = await offlineStore.getLocalRow('customer', localId);
        const merged = { ...(existing?.data ? JSON.parse(existing.data) : {}), ...(action.body || {}), id: route.targetId, local_id: localId };
        await offlineStore.upsertLocalCustomer({
          local_id: localId,
          server_id: String(route.targetId),
          workspace_server_id: workspaceRef,
          data: merged,
          sync_status: 'pending_update',
          updated_at_local: now,
        }, workspaceRef);
        await offlineStore.addSyncOutboxAction({
          action_id: generateLocalId('customer_update'),
          action_type: 'update_customer',
          entity_type: 'customer',
          entity_local_id: localId,
          workspace_ref: workspaceRef,
          payload: action.body || {},
          created_at: now,
          updated_at: now,
        });
        return;
      }

      if (action.method === 'delete' && route.targetId) {
        const localId = await offlineStore.getLocalIdByServerId('customer', route.targetId, workspaceRef) || String(route.targetId);
        await offlineStore.markLocalEntityStatus('customer', localId, 'pending_delete');
        await offlineStore.addSyncOutboxAction({
          action_id: generateLocalId('customer_delete'),
          action_type: 'delete_customer',
          entity_type: 'customer',
          entity_local_id: localId,
          workspace_ref: workspaceRef,
          payload: { id: route.targetId },
          created_at: now,
          updated_at: now,
        });
        return;
      }
    }

    await enqueueOfflineAction(action);
  }, []);

  const queueAction = useCallback(async (action) => {
    await queueStructuredAction(action);
    syncCoordinatorWorker({
      token,
      currentWorkspaceId: action?.workspaceId || currentWorkspaceId,
      currentBranchId: action?.branchId || currentBranchId,
    });
  }, [currentBranchId, currentWorkspaceId, queueStructuredAction, token]);

  const syncInfo = useMemo(
    () => ({
      pendingCount: pendingActions.length,
      isSyncing,
      lastSyncedAt,
      status: isSyncing ? 'syncing' : pendingActions.length > 0 ? 'pending' : 'synced',
    }),
    [pendingActions.length, isSyncing, lastSyncedAt],
  );

  const currentWorkspace = useMemo(() => {
    if (!Array.isArray(workspaces) || workspaces.length === 0) return null;
    return workspaces.find((item) => String(item.id) === String(currentWorkspaceId)) || workspaces[0] || null;
  }, [currentWorkspaceId, workspaces]);

  const currentBranch = useMemo(() => {
    if (!Array.isArray(branches) || branches.length === 0) return null;
    return branches.find((item) => String(item.id) === String(currentBranchId)) || branches[0] || null;
  }, [branches, currentBranchId]);

  const workspaceAccessBlocked = !!currentWorkspace && String(currentWorkspace?.status || 'active').toLowerCase() !== 'active';

  // Applies the offline workspace list from SQLite.  If the table is empty
  // (e.g. first launch after an old code version that never populated it),
  // synthesises a minimal workspace entry from the persisted workspace ID so
  // App.js navigates to MainTabs instead of WorkspaceSetupScreen.
  const applyOfflineWorkspacesFallback = useCallback(async () => {
    const localWorkspaces = await offlineStore.getOfflineWorkspacesForUi();
    if (localWorkspaces.length > 0) {
      setWorkspaces(localWorkspaces);
      setCurrentWorkspaceId((prev) => {
        if (prev && localWorkspaces.some((w) => String(w.id) === String(prev))) {
          return prev;
        }
        return localWorkspaces[0]?.id || prev || null;
      });
    } else {
      // local_workspaces table is empty — fall back to the stored workspace ID
      // so the user can still navigate to MainTabs and see any cached screen data.
      const storedId = await AsyncStorage.getItem(WORKSPACE_STORAGE_KEY);
      if (storedId) {
        setWorkspaces([{ id: storedId, name: 'My Workspace' }]);
        setCurrentWorkspaceId(storedId);
      }
      // If no stored ID, workspaces stays empty → WorkspaceSetupScreen is correct
    }
  }, []); // useState setters are stable; no reactive deps needed

  const loadWorkspaces = useCallback(async () => {
    if (!token) {
      setWorkspaces([]);
      setCurrentWorkspaceId(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await api.get('/workspaces');
      const list = Array.isArray(data) ? data : [];

      if (list.length > 0) {
        setWorkspaces(list);
        await offlineStore.cacheWorkspaces(list);
        setCurrentWorkspaceId((prev) => {
          if (prev && list.some((w) => String(w.id) === String(prev))) {
            return prev;
          }
          return list[0].id;
        });
        return;
      }

      await applyOfflineWorkspacesFallback();
    } catch (err) {
      await applyOfflineWorkspacesFallback();
    } finally {
      setLoading(false);
    }
  }, [token, applyOfflineWorkspacesFallback]);

  const loadBranches = useCallback(async (workspaceId) => {
    if (!token || !workspaceId) {
      setBranches([]);
      setCurrentBranchId(null);
      return;
    }

    try {
      const data = await api.get(`/workspaces/${workspaceId}/branches`);
      const list = Array.isArray(data) ? data : [];
      setBranches(list);
      setCurrentBranchId((prev) => {
        if (prev && list.some((branch) => String(branch.id) === String(prev))) {
          return prev;
        }
        return list[0]?.id || null;
      });
    } catch (err) {
      setBranches([]);
      setCurrentBranchId(null);
    }
  }, [token]);

  const hydrateWorkspaceSnapshot = useCallback(async (workspaceId, branchId) => {
    if (!token || !workspaceId || !branchId) return;

    try {
      const [inventory, transactions, customers] = await Promise.all([
        api.get(`/workspaces/${workspaceId}/branches/${branchId}/inventory`).catch(() => null),
        api.get(`/workspaces/${workspaceId}/branches/${branchId}/transactions`, { skip: 0, take: 500 }).catch(() => null),
        api.get(`/workspaces/${workspaceId}/branches/${branchId}/customers`).catch(() => null),
      ]);

      if (Array.isArray(inventory)) {
        await offlineStore.cacheInventory(branchId, inventory);
      }
      if (Array.isArray(transactions)) {
        await offlineStore.cacheTransactions(branchId, null, transactions);
        await offlineStore.cacheDebts(
          branchId,
          transactions.filter((item) => String(item?.type || '').toLowerCase() === 'debt')
        );
      }
      if (Array.isArray(customers)) {
        await offlineStore.cacheCustomers(branchId, customers);
      }
    } catch (err) {
      // Best-effort hydration only.
    }
  }, [token]);

  useEffect(() => {
    loadStoredWorkspaceId();
    loadStoredBranchId();
    loadPendingActions();
    loadLastSyncedAt();
  }, []);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  useEffect(() => {
    if (currentWorkspaceId) {
      loadBranches(currentWorkspaceId);
    } else {
      setBranches([]);
      setCurrentBranchId(null);
    }
  }, [currentWorkspaceId, loadBranches]);

  useEffect(() => {
    if (token && currentWorkspaceId && currentBranchId) {
      syncCoordinatorWorker({ token, currentWorkspaceId, currentBranchId });
      hydrateWorkspaceSnapshot(currentWorkspaceId, currentBranchId);
    }
  }, [token, currentWorkspaceId, currentBranchId, hydrateWorkspaceSnapshot]);

  useEffect(() => {
    if (token && currentWorkspaceId && currentBranchId && pendingActions.length > 0) {
      processPendingActions();
    }
  }, [token, currentWorkspaceId, currentBranchId, pendingActions.length, processPendingActions]);

  useEffect(() => {
    persistWorkspaceId(currentWorkspaceId);
  }, [currentWorkspaceId]);

  useEffect(() => {
    persistBranchId(currentBranchId);
  }, [currentBranchId]);

  // --- Workspace-scoped repository abstraction ---
  // All local entity access must use currentWorkspaceId (local)
  const repo = useMemo(() => ({
    getInventory: () => offlineStore.getLocalInventory(currentBranchId),
    getTransactions: () => offlineStore.getLocalTransactions(currentBranchId),
    getDebts: () => offlineStore.getLocalDebts(currentBranchId),
    getCustomers: () => offlineStore.getLocalCustomers(currentBranchId),
    upsertInventory: (item) => offlineStore.upsertLocalInventory(item, currentBranchId),
    upsertTransaction: (item) => offlineStore.upsertLocalTransaction(item, currentBranchId),
    upsertDebt: (item) => offlineStore.upsertLocalDebt(item, currentBranchId),
    upsertCustomer: (item) => offlineStore.upsertLocalCustomer(item, currentBranchId),
    deleteInventory: (localId) => offlineStore.deleteLocalInventory(localId, currentBranchId),
    deleteTransaction: (localId) => offlineStore.deleteLocalTransaction(localId, currentBranchId),
    deleteDebt: (localId) => offlineStore.deleteLocalDebt(localId, currentBranchId),
    deleteCustomer: (localId) => offlineStore.deleteLocalCustomer(localId, currentBranchId),
    queueAction,
  }), [currentBranchId, queueAction]);

  const value = useMemo(
    () => ({
      workspaces,
      branches,
      currentWorkspace,
      currentBranch,
      setWorkspaces,
      setBranches,
      currentWorkspaceId,
      setCurrentWorkspaceId,
      currentBranchId,
      setCurrentBranchId,
      activeBranchId: currentBranchId,
      workspaceAccessBlocked,
      loading,
      syncInfo,
      queueAction,
      processPendingActions,
      refreshWorkspaces: loadWorkspaces,
      repo, // workspace-scoped repository
    }),
    [
      workspaces,
      branches,
      currentWorkspace,
      currentBranch,
      currentWorkspaceId,
      currentBranchId,
      workspaceAccessBlocked,
      loading,
      syncInfo,
      queueAction,
      processPendingActions,
      loadWorkspaces,
      repo,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

export const useWorkspace = function() {
  return useContext(WorkspaceContext);
};

export default WorkspaceContext;
