// Legacy compatibility layer: keep old import path working while using the
// single source of truth in storage/offlineStore.
export {
  cacheInventory,
  getCachedInventory,
  cacheDebts,
  getCachedDebts,
  cacheTransactions,
  getCachedTransactions,
} from '../storage/offlineStore';
