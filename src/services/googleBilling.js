// Lightweight wrapper for Google Play Billing native module.
// This file provides a simple abstraction that the app can call.
// In Expo-managed apps you'll need a custom dev client / EAS build
// with a native billing module installed. For now these methods
// will throw if the native bridge isn't available.
import { NativeModules, Platform } from 'react-native';

const NativeBilling = NativeModules?.GooglePlayBilling || null;

export function isAvailable() {
  return Platform.OS === 'android' && !!NativeBilling;
}

export async function getSkuDetails(productIds = []) {
  if (!isAvailable()) throw new Error('Google Play Billing native module not available');
  return await NativeBilling.getSkuDetails(productIds);
}

export async function purchaseSubscription(productId) {
  if (!isAvailable()) throw new Error('Google Play Billing native module not available');
  // returns { purchaseToken, orderId, productId }
  return await NativeBilling.purchaseSubscription(productId);
}

export async function acknowledgePurchase(purchaseToken) {
  if (!isAvailable()) throw new Error('Google Play Billing native module not available');
  return await NativeBilling.acknowledgePurchase(purchaseToken);
}

export default { isAvailable, getSkuDetails, purchaseSubscription, acknowledgePurchase };
