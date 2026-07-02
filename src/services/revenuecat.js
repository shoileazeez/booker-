import Purchases from 'react-native-purchases';
import { Platform } from 'react-native';

const REVENUECAT_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY || 'test_LuUpiFNVXyzVsmFKYPTDQnTrmBj';

export const ENTITLEMENTS = {
  PRO: 'bizrecord_pro',
  BASIC: 'bizrecord_basic',
  LIFETIME: 'lifetime',
  YEARLY: 'yearly',
  MONTHLY: 'monthly',
  ADDON_WORKSPACE: 'bizrecord_addon_workspace',
  ADDON_STAFF: 'bizrecord_addon_staff',
  ADDON_WHATSAPP: 'bizrecord_addon_whatsapp',
};

export const PRODUCT_IDS = {
  PRO_YEARLY: 'bizrecord_pro_yearly',
  PRO_MONTHLY: 'bizrecord_pro_monthly',
  BASIC_YEARLY: 'bizrecord_basic_yearly',
  BASIC_MONTHLY: 'bizrecord_basic_monthly',
  ADDON_WORKSPACE_YEARLY: 'bizrecord_addon_workspace_yearly',
  ADDON_WORKSPACE_MONTHLY: 'bizrecord_addon_workspace_monthly',
  ADDON_WHATSAPP100_YEARLY: 'bizrecord_addon_whatsapp100_yearly',
  ADDON_WHATSAPP100_MONTHLY: 'bizrecord_addon_whatsapp100_monthly',
  ADDON_STAFF_YEARLY: 'bizrecord_addon_staff_yearly',
  ADDON_STAFF_MONTHLY: 'bizrecord_addon_staff_monthly',
  LIFETIME: 'lifetime',
  YEARLY: 'yearly',
  MONTHLY: 'monthly',
};

export const PRODUCT_META = {
  [PRODUCT_IDS.PRO_YEARLY]: { entitlement: ENTITLEMENTS.PRO, type: 'subscription', billingCycle: 'yearly', plan: 'pro' },
  [PRODUCT_IDS.PRO_MONTHLY]: { entitlement: ENTITLEMENTS.PRO, type: 'subscription', billingCycle: 'monthly', plan: 'pro' },
  [PRODUCT_IDS.BASIC_YEARLY]: { entitlement: ENTITLEMENTS.BASIC, type: 'subscription', billingCycle: 'yearly', plan: 'basic' },
  [PRODUCT_IDS.BASIC_MONTHLY]: { entitlement: ENTITLEMENTS.BASIC, type: 'subscription', billingCycle: 'monthly', plan: 'basic' },
  [PRODUCT_IDS.LIFETIME]: { entitlement: ENTITLEMENTS.LIFETIME, type: 'lifetime', billingCycle: null, plan: 'pro' },
  [PRODUCT_IDS.YEARLY]: { entitlement: ENTITLEMENTS.YEARLY, type: 'subscription', billingCycle: 'yearly', plan: 'pro' },
  [PRODUCT_IDS.MONTHLY]: { entitlement: ENTITLEMENTS.MONTHLY, type: 'subscription', billingCycle: 'monthly', plan: 'pro' },
  [PRODUCT_IDS.ADDON_WORKSPACE_YEARLY]: { entitlement: ENTITLEMENTS.ADDON_WORKSPACE, type: 'addon', billingCycle: 'yearly', addonType: 'workspaceSlot' },
  [PRODUCT_IDS.ADDON_WORKSPACE_MONTHLY]: { entitlement: ENTITLEMENTS.ADDON_WORKSPACE, type: 'addon', billingCycle: 'monthly', addonType: 'workspaceSlot' },
  [PRODUCT_IDS.ADDON_WHATSAPP100_YEARLY]: { entitlement: ENTITLEMENTS.ADDON_WHATSAPP, type: 'addon', billingCycle: 'yearly', addonType: 'whatsappBundles' },
  [PRODUCT_IDS.ADDON_WHATSAPP100_MONTHLY]: { entitlement: ENTITLEMENTS.ADDON_WHATSAPP, type: 'addon', billingCycle: 'monthly', addonType: 'whatsappBundles' },
  [PRODUCT_IDS.ADDON_STAFF_YEARLY]: { entitlement: ENTITLEMENTS.ADDON_STAFF, type: 'addon', billingCycle: 'yearly', addonType: 'staffSeats' },
  [PRODUCT_IDS.ADDON_STAFF_MONTHLY]: { entitlement: ENTITLEMENTS.ADDON_STAFF, type: 'addon', billingCycle: 'monthly', addonType: 'staffSeats' },
};

export function getProductMeta(productId) {
  return PRODUCT_META[productId] || null;
}

export function getPlanProductId(plan, billingCycle) {
  if (plan === 'pro' && billingCycle === 'yearly') return PRODUCT_IDS.PRO_YEARLY;
  if (plan === 'pro' && billingCycle === 'monthly') return PRODUCT_IDS.PRO_MONTHLY;
  if (plan === 'basic' && billingCycle === 'yearly') return PRODUCT_IDS.BASIC_YEARLY;
  if (plan === 'basic' && billingCycle === 'monthly') return PRODUCT_IDS.BASIC_MONTHLY;
  return PRODUCT_IDS.PRO_MONTHLY;
}

export function getAddonProductId(addonType, billingCycle) {
  if (addonType === 'workspaceSlot') {
    return billingCycle === 'yearly' ? PRODUCT_IDS.ADDON_WORKSPACE_YEARLY : PRODUCT_IDS.ADDON_WORKSPACE_MONTHLY;
  }
  if (addonType === 'staffSeats') {
    return billingCycle === 'yearly' ? PRODUCT_IDS.ADDON_STAFF_YEARLY : PRODUCT_IDS.ADDON_STAFF_MONTHLY;
  }
  if (addonType === 'whatsappBundles') {
    return billingCycle === 'yearly' ? PRODUCT_IDS.ADDON_WHATSAPP100_YEARLY : PRODUCT_IDS.ADDON_WHATSAPP100_MONTHLY;
  }
  return null;
}

export async function configureRevenueCat(userId) {
  try {
    await Purchases.configure({
      apiKey: REVENUECAT_API_KEY,
      appUserID: userId || undefined,
    });
  } catch (error) {
    console.error('RevenueCat configure error:', error);
  }
}

export async function setRevenueCatUserId(userId) {
  try {
    await Purchases.logIn(userId);
  } catch (error) {
    console.error('RevenueCat logIn error:', error);
  }
}

export async function resetRevenueCatUser() {
  try {
    await Purchases.logOut();
  } catch (error) {
    console.error('RevenueCat logOut error:', error);
  }
}

export async function getOfferings() {
  try {
    const offerings = await Purchases.getOfferings();
    return offerings;
  } catch (error) {
    console.error('RevenueCat getOfferings error:', error);
    return null;
  }
}

export async function getCurrentOffering() {
  try {
    const offerings = await Purchases.getOfferings();
    return offerings?.current || null;
  } catch (error) {
    console.error('RevenueCat getCurrentOffering error:', error);
    return null;
  }
}

export async function purchasePackage(purchasablePackage) {
  try {
    const { customerInfo } = await Purchases.purchasePackage(purchasablePackage);
    return { success: true, customerInfo };
  } catch (error) {
    if (error?.userCancelled) {
      return { success: false, cancelled: true, error: null };
    }
    return { success: false, cancelled: false, error: error?.message || 'Purchase failed' };
  }
}

export async function purchaseProduct(productId, upgradeInfo) {
  try {
    const { customerInfo } = await Purchases.purchaseProduct(productId, upgradeInfo);
    return { success: true, customerInfo };
  } catch (error) {
    if (error?.userCancelled) {
      return { success: false, cancelled: true, error: null };
    }
    return { success: false, cancelled: false, error: error?.message || 'Purchase failed' };
  }
}

export async function restorePurchases() {
  try {
    const customerInfo = await Purchases.restorePurchases();
    return { success: true, customerInfo };
  } catch (error) {
    return { success: false, error: error?.message || 'Restore failed' };
  }
}

export async function getCustomerInfo() {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    return customerInfo;
  } catch (error) {
    console.error('RevenueCat getCustomerInfo error:', error);
    return null;
  }
}

export function checkEntitlement(customerInfo, entitlementId) {
  if (!customerInfo?.entitlements?.active) {
    return false;
  }
  const entitlement = customerInfo.entitlements.active[entitlementId];
  return !!entitlement;
}

export function getActiveEntitlements(customerInfo) {
  if (!customerInfo?.entitlements?.active) {
    return [];
  }
  return Object.keys(customerInfo.entitlements.active);
}

export function getAllPurchasedProductIds(customerInfo) {
  if (!customerInfo?.entitlements?.active) {
    return [];
  }
  return Object.values(customerInfo.entitlements.active).map((e) => e.productIdentifier);
}

export function setUserAttributes(attributes) {
  try {
    Purchases.setAttributes(attributes);
  } catch (error) {
    console.error('RevenueCat setAttributes error:', error);
  }
}

export function setUserEmail(email) {
  try {
    Purchases.setEmail(email);
  } catch (error) {
    console.error('RevenueCat setEmail error:', error);
  }
}

export function addCustomerInfoUpdateListener(listener) {
  return Purchases.addCustomerInfoUpdateListener(listener);
}

export function removeCustomerInfoUpdateListener(listenerOrSubscription) {
  if (typeof listenerOrSubscription === 'function') {
    Purchases.removeCustomerInfoUpdateListener(listenerOrSubscription);
  }
}

export async function showPaywall() {
  try {
    await Purchases.presentPaywall();
  } catch (error) {
    console.error('RevenueCat showPaywall error:', error);
  }
}

export async function showPaywallIfNeeded(entitlementId) {
  try {
    await Purchases.presentPaywallIfNeeded(entitlementId);
  } catch (error) {
    if (!error?.userCancelled) {
      console.error('RevenueCat showPaywallIfNeeded error:', error);
    }
  }
}

export async function showCustomerCenter() {
  try {
    await Purchases.showCustomerCenter();
  } catch (error) {
    if (!error?.userCancelled) {
      console.error('RevenueCat showCustomerCenter error:', error);
    }
  }
}

export async function syncPurchases() {
  try {
    const customerInfo = await Purchases.syncPurchases();
    return { success: true, customerInfo };
  } catch (error) {
    return { success: false, error: error?.message || 'Sync failed' };
  }
}

export async function setPaywallProvider(provider) {
  try {
    await Purchases.setPaywallProvider(provider);
  } catch (error) {
    console.error('RevenueCat setPaywallProvider error:', error);
  }
}

export function isPro(customerInfo) {
  return checkEntitlement(customerInfo, ENTITLEMENTS.PRO);
}

export function isBasic(customerInfo) {
  return checkEntitlement(customerInfo, ENTITLEMENTS.BASIC);
}

export function hasAddon(customerInfo, addonType) {
  const entitlementMap = {
    workspaceSlot: ENTITLEMENTS.ADDON_WORKSPACE,
    staffSeats: ENTITLEMENTS.ADDON_STAFF,
    whatsappBundles: ENTITLEMENTS.ADDON_WHATSAPP,
  };
  const entitlementId = entitlementMap[addonType];
  if (!entitlementId) return false;
  return checkEntitlement(customerInfo, entitlementId);
}
