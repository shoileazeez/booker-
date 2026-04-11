import Constants from 'expo-constants';

function readExpoConfig(path) {
  let current = Constants?.expoConfig || Constants?.manifest2?.extra?.expoClient;
  for (const key of path) {
    if (!current || typeof current !== 'object') return null;
    current = current[key];
  }
  return current ?? null;
}

function readEnv(name, fallback = '') {
  const value = process.env?.[name];
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return fallback;
}

export function getAndroidPackageName() {
  return (
    readEnv('EXPO_PUBLIC_ANDROID_PACKAGE') ||
    readExpoConfig(['android', 'package']) ||
    ''
  );
}

export function getBillingSkuMap() {
  return {
    pro_monthly: readEnv(
      'EXPO_PUBLIC_BILLING_SKU_PRO_MONTHLY',
      'bizrecord_pro_monthly',
    ),
    pro_yearly: readEnv(
      'EXPO_PUBLIC_BILLING_SKU_PRO_YEARLY',
      'bizrecord_pro_yearly',
    ),
    basic_monthly: readEnv(
      'EXPO_PUBLIC_BILLING_SKU_BASIC_MONTHLY',
      'bizrecord_basic_monthly',
    ),
    basic_yearly: readEnv(
      'EXPO_PUBLIC_BILLING_SKU_BASIC_YEARLY',
      'bizrecord_basic_yearly',
    ),
  };
}

export function resolveSubscriptionSku(plan, billingCycle) {
  const skuMap = getBillingSkuMap();
  const preferredKey = `${plan}_${billingCycle}`;
  return skuMap[preferredKey] || skuMap.pro_monthly;
}
