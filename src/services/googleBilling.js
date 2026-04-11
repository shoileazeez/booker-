import { Platform } from 'react-native';
import {
  endConnection,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  requestPurchase,
} from 'react-native-iap';

let connectionPromise = null;

export function isAvailable() {
  return Platform.OS === 'android';
}

async function ensureConnection() {
  if (!isAvailable()) {
    throw new Error('Google Play Billing is only available on Android.');
  }

  if (!connectionPromise) {
    connectionPromise = initConnection().catch((error) => {
      connectionPromise = null;
      throw error;
    });
  }

  await connectionPromise;
}

function unwrapPurchase(result) {
  if (Array.isArray(result)) {
    return result[0] || null;
  }

  if (Array.isArray(result?.purchases)) {
    return result.purchases[0] || null;
  }

  if (result?.purchase) {
    return result.purchase;
  }

  return result || null;
}

export async function getSkuDetails(productIds = []) {
  await ensureConnection();

  if (!productIds.length) {
    return [];
  }

  const response = await fetchProducts({
    skus: productIds,
    type: 'subs',
  });

  return Array.isArray(response) ? response : response?.products || [];
}

export async function purchaseSubscription(productId) {
  await ensureConnection();

  const result = await requestPurchase({
    request: {
      google: { skus: [productId] },
    },
    type: 'subs',
  });

  const purchase = unwrapPurchase(result);
  if (!purchase) {
    throw new Error('Google Play did not return a purchase record.');
  }

  return purchase;
}

export async function restorePurchases() {
  await ensureConnection();
  const purchases = await getAvailablePurchases();
  return Array.isArray(purchases) ? purchases : [];
}

export async function acknowledgePurchase(purchase) {
  await ensureConnection();
  return finishTransaction({
    purchase,
    isConsumable: false,
  });
}

export async function disconnect() {
  if (connectionPromise) {
    await connectionPromise.catch(() => null);
    connectionPromise = null;
  }

  if (isAvailable()) {
    endConnection();
  }
}

export default {
  acknowledgePurchase,
  disconnect,
  getSkuDetails,
  isAvailable,
  purchaseSubscription,
  restorePurchases,
};
