import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  configureRevenueCat,
  setRevenueCatUserId,
  resetRevenueCatUser,
  getOfferings,
  getCustomerInfo,
  purchasePackage,
  purchaseProduct,
  restorePurchases,
  addCustomerInfoUpdateListener,
  isPro,
  isBasic,
  hasAddon,
  checkEntitlement,
  setUserAttributes,
  setUserEmail,
  showPaywall,
  showPaywallIfNeeded,
  showCustomerCenter,
  syncPurchases,
  getActiveEntitlements,
  getAllPurchasedProductIds,
  ENTITLEMENTS,
} from '../services/revenuecat';

const RevenueCatContext = createContext(null);

export function RevenueCatProvider({ children }) {
  const [customerInfo, setCustomerInfo] = useState(null);
  const [offerings, setOfferings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const listenerRef = useRef(null);

  const refreshCustomerInfo = useCallback(async () => {
    try {
      const info = await getCustomerInfo();
      setCustomerInfo(info);
      return info;
    } catch (err) {
      return null;
    }
  }, []);

  const refreshOfferings = useCallback(async () => {
    try {
      const result = await getOfferings();
      setOfferings(result);
      return result;
    } catch (err) {
      return null;
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([refreshCustomerInfo(), refreshOfferings()]);
    } catch (err) {
      setError(err?.message || 'Failed to load purchases');
    } finally {
      setLoading(false);
    }
  }, [refreshCustomerInfo, refreshOfferings]);

  const configure = useCallback(async (userId) => {
    try {
      await configureRevenueCat(userId);
      if (userId) {
        await setRevenueCatUserId(userId);
      }
      await refreshAll();
    } catch (err) {
      setError(err?.message || 'Failed to configure RevenueCat');
      setLoading(false);
    }
  }, [refreshAll]);

  const login = useCallback(async (userId) => {
    try {
      await setRevenueCatUserId(userId);
      await refreshAll();
    } catch (err) {
      setError(err?.message || 'Failed to set user');
    }
  }, [refreshAll]);

  const logout = useCallback(async () => {
    try {
      await resetRevenueCatUser();
      setCustomerInfo(null);
      setOfferings(null);
    } catch (err) {
      // ignore
    }
  }, []);

  const handlePurchasePackage = useCallback(async (pkg) => {
    const result = await purchasePackage(pkg);
    if (result.success) {
      setCustomerInfo(result.customerInfo);
    }
    return result;
  }, []);

  const handlePurchaseProduct = useCallback(async (productId, upgradeInfo) => {
    const result = await purchaseProduct(productId, upgradeInfo);
    if (result.success) {
      setCustomerInfo(result.customerInfo);
    }
    return result;
  }, []);

  const handleRestorePurchases = useCallback(async () => {
    const result = await restorePurchases();
    if (result.success) {
      setCustomerInfo(result.customerInfo);
    }
    return result;
  }, []);

  const handleSyncPurchases = useCallback(async () => {
    const result = await syncPurchases();
    if (result.success) {
      setCustomerInfo(result.customerInfo);
    }
    return result;
  }, []);

  const checkPro = useCallback(() => isPro(customerInfo), [customerInfo]);
  const checkBasic = useCallback(() => isBasic(customerInfo), [customerInfo]);
  const checkAddon = useCallback((addonType) => hasAddon(customerInfo, addonType), [customerInfo]);
  const checkEntitlementActive = useCallback((id) => checkEntitlement(customerInfo, id), [customerInfo]);

  useEffect(() => {
    const sub = addCustomerInfoUpdateListener((info) => {
      setCustomerInfo(info);
    });
    listenerRef.current = sub;
    return () => {
      if (sub) {
        if (typeof sub === 'function') {
          sub();
        }
      }
    };
  }, []);

  const contextValue = {
    customerInfo,
    offerings,
    loading,
    error,
    isPro: checkPro(),
    isBasic: checkBasic(),
    activeEntitlements: customerInfo ? getActiveEntitlements(customerInfo) : [],
    purchasedProductIds: customerInfo ? getAllPurchasedProductIds(customerInfo) : [],
    configure,
    login,
    logout,
    refresh: refreshAll,
    refreshCustomerInfo,
    refreshOfferings,
    purchasePackage: handlePurchasePackage,
    purchaseProduct: handlePurchaseProduct,
    restorePurchases: handleRestorePurchases,
    syncPurchases: handleSyncPurchases,
    checkPro: checkPro,
    checkBasic: checkBasic,
    checkAddon,
    checkEntitlement: checkEntitlementActive,
    showPaywall,
    showPaywallIfNeeded: (entitlementId) => showPaywallIfNeeded(entitlementId || ENTITLEMENTS.PRO),
    showCustomerCenter,
    setUserAttributes,
    setUserEmail,
  };

  return (
    <RevenueCatContext.Provider value={contextValue}>
      {children}
    </RevenueCatContext.Provider>
  );
}

export function useRevenueCat() {
  const context = useContext(RevenueCatContext);
  if (!context) {
    throw new Error('useRevenueCat must be used within a RevenueCatProvider');
  }
  return context;
}

export default RevenueCatContext;
