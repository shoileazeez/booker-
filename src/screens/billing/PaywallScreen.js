import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { useRevenueCat } from '../../context/RevenueCatContext';
import { Card, AppButton, Title, Subtle } from '../../components/UI';

const PLAN_ORDER = ['basic', 'pro'];

function findPackageForPlan(offering, plan) {
  if (!offering?.availablePackages) return null;
  if (plan === 'pro') {
    return offering.lifetime || offering.yearly || offering.monthly
      || offering.availablePackages.find((p) => /pro/i.test(p.identifier))
      || null;
  }
  return offering.availablePackages.find((p) => /basic/i.test(p.identifier))
    || null;
}

export default function PaywallScreen({ navigation }) {
  const { theme } = useTheme();
  const {
    offerings,
    loading,
    purchasePackage,
    restorePurchases,
    customerInfo,
    isPro,
    isBasic,
    refresh,
  } = useRevenueCat();
  const [processing, setProcessing] = useState(false);

  const currentOffering = offerings?.current || null;
  const packages = currentOffering?.availablePackages || [];

  const handlePurchase = async (pkg) => {
    setProcessing(true);
    try {
      const result = await purchasePackage(pkg);
      if (result.success) {
        Alert.alert('Success', 'Subscription activated!');
        navigation?.goBack();
      } else if (result.cancelled) {
        // user cancelled
      } else {
        Alert.alert('Purchase failed', result.error || 'An error occurred');
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleRestore = async () => {
    setProcessing(true);
    try {
      const result = await restorePurchases();
      if (result.success) {
        Alert.alert('Restored', 'Your purchases have been restored.');
      } else {
        Alert.alert('Restore failed', result.error || 'No purchases to restore');
      }
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <Subtle>Loading plans...</Subtle>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Card>
        <Title>Unlock BizRecord Pro</Title>
        <Subtle>Get access to features like multiple workspaces, staff management, WhatsApp integration, and more.</Subtle>
      </Card>

      {!isPro && !isBasic ? (
        <>
          {packages.map((pkg, index) => (
            <Card key={pkg.identifier || index}>
              <View style={styles.packageRow}>
                <View style={{ flex: 1 }}>
                  <Title>{pkg.product?.title || pkg.identifier}</Title>
                  <Subtle>{pkg.product?.description || ''}</Subtle>
                  <Subtle style={{ fontWeight: '700', marginTop: 4 }}>
                    {pkg.product?.priceString || ''}
                  </Subtle>
                </View>
              </View>
              <AppButton
                title={processing ? 'Processing...' : `Subscribe - ${pkg.product?.priceString || ''}`}
                onPress={() => handlePurchase(pkg)}
                loading={processing}
                disabled={processing}
                style={{ marginTop: 8 }}
              />
            </Card>
          ))}

          {packages.length === 0 && (
            <Card>
              <Subtle>No subscription plans are currently available. Check back later.</Subtle>
            </Card>
          )}

          <Card>
            <AppButton
              title="Restore purchases"
              variant="secondary"
              onPress={handleRestore}
              loading={processing}
              disabled={processing}
            />
          </Card>
        </>
      ) : (
        <Card>
          <View style={{ alignItems: 'center', paddingVertical: 12 }}>
            <Title>You're all set!</Title>
            <Subtle style={{ marginTop: 4 }}>
              {isPro ? 'BizRecord Pro is active.' : 'Your plan is active.'}
            </Subtle>
          </View>
        </Card>
      )}

      <Card>
        <AppButton
          title="Refresh"
          variant="secondary"
          onPress={refresh}
          style={{ marginBottom: 8 }}
        />
        <AppButton
          title="Close"
          variant="secondary"
          onPress={() => navigation?.goBack()}
        />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  packageRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
