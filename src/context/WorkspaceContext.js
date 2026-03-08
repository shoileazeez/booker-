import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { api } from '../api/client';

const WorkspaceContext = createContext();
const WORKSPACE_STORAGE_KEY = '@booker:currentWorkspace';
const OFFLINE_QUEUE_KEY = '@booker:queuedActions';
const LAST_SYNC_STORAGE_KEY = '@booker:lastSyncAt';

const generateId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const WorkspaceProvider = function({ children }) {
  const { token } = useAuth();

  const [workspaces, setWorkspaces] = useState([]);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState(null);
  const [loading, setLoading] = useState(false);
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

  const persistPendingActions = async (actions) => {
    try {
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(actions || []));
    } catch (err) {
      // ignore
    }
  };

  const persistLastSyncedAt = async (date) => {
    try {
      await AsyncStorage.setItem(LAST_SYNC_STORAGE_KEY, String(date?.getTime() ?? ''));
    } catch (err) {
        setPendingActions(JSON.parse(stored));
      }

      const lastSync = await AsyncStorage.getItem(LAST_SYNC_STORAGE_KEY);
      if (lastSync) {
        setLastSyncedAt(new Date(parseInt(lastSync, 10)
    try {
      const stored = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      if (stored) {
      const lastSync = await AsyncStorage.getItem(LAST_SYNC_STORAGE_KEY);
      if (lastSync) {
        setLastSyncedAt(new Date(parseInt(lastSync, 10)));
      }
        setPendingActions(JSON.parse(stored));
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

    const now = new Date();
    setLastSyncedAt(now);
    persistLastSyncedAt(now);

          await api.delete(action.path);
    const now = new Date();
    setLastSyncedAt(now);
    persistLastSyncedAt(now);
        }
      } catch (err) {
        remaining.push(action);
      }
    }

    setPendingActions(remaining);
    persistPendingActions(remaining);
    setIsSyncing(false);
  }, [currentWorkspaceId, pendingActions, token]);

  const queueAction = async (action) => {
    await enqueueOfflineAction(action);
    processPendingActions();
  };

  conslastSyncedAt,
      queueAction,
      processPendingActions,
    }),
    [pendingActions.length, isSyncing, syncStatus, lastSyncedAt
  }, [lastSyncedAt,
      queueAction,
      processPendingActions,
    }),
    [pendingActions.length, isSyncing, syncStatus, lastSyncedAt
      pendingCount: pendingActions.length,
      isSyncing,
      status: syncStatus,
      queueAction,
      processPendingActions,
    }),
    [pendingActions.length, isSyncing, syncStatus, processPendingActions],
  );

  const loadWorkspaces = useCallback(async () => {
    if (!token) {
      setWorkspaces([]);
      setCurrentWorkspaceId(null);
      return;
    }

    setLoading(true);
    try {
      const data = await api.get('/workspaces');
      const list = Array.isArray(data) ? data : [];
      setWorkspaces(list);

      if (list.length === 0) {
        setCurrentWorkspaceId(null);
        return;
      }

      setCurrentWorkspaceId((prev) => {
        if (prev && list.some((w) => w.id === prev)) {
          return prev;
        }
        return list[0].id;
      });
    } catch (err) {
      setWorkspaces([]);
      setCurrentWorkspaceId(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadStoredWorkspaceId();
    loadPendingActions();
  }, []);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  useEffect(() => {
    // Attempt to sync queued work whenever the auth token or workspace changes
    if (token && currentWorkspaceId) {
      processPendingActions();
    }
  }, [token, currentWorkspaceId, processPendingActions]);

  useEffect(() => {
    persistWorkspaceId(currentWorkspaceId);
  }, [currentWorkspaceId]);

  const value = useMemo(
    () => ({
      workspaces,
      setWorkspaces,
      currentWorkspaceId,
      setCurrentWorkspaceId,
      loading,
      syncInfo,
    }),
    [workspaces, currentWorkspaceId, loading, syncInfo],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

export const useWorkspace = function() {
  return useContext(WorkspaceContext);
};

export default WorkspaceContext;
