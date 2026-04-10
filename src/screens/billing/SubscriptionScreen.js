import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import * as GoogleBilling from '../../services/googleBilling';
import { useTheme } from '../../theme/ThemeContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAuth } from '../../context/AuthContext';
import { Card, AppButton, Title } from '../../components/UI';
import { api } from '../../api/client';

const PLAN_ORDER = ['basic', 'pro'];
const isLikelyOfflineError = (err) => !err?.response && /network|offline|timeout|fetch/i.test(String(err?.message || ''));

export default function SubscriptionScreen({ navigation }) {
  const { theme } = useTheme();
  const [plans, setPlans] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('pro');
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [addons, setAddons] = useState({ workspaceSlots: 0, staffSeats: 0, whatsappBundles: 0 });
  const [lastReference, setLastReference] = useState(null);
  const [onlineRequired, setOnlineRequired] = useState(false);

  const workspace = useWorkspace();
  const { user } = useAuth();
  const currentWorkspace = workspace.currentWorkspace || workspace.workspaces.find((w) => w.id === workspace.currentWorkspaceId);
  const userRole = currentWorkspace?.role || user?.role || 'user';
  const isWorkspaceOwner = userRole === 'owner';

  const addonsAllowed = subscription?.trial?.addonsAllowed !== false;

  const refreshBilling = async () => {
    const [plansResp, subResp, usageResp] = await Promise.all([
      api.get('/billing/plans'),
      api.get('/billing/subscription'),
      api.get('/billing/usage'),
    ]);
    setOnlineRequired(false);
    setPlans(plansResp);
    setSubscription(subResp);
    setUsage(usageResp);
    setSelectedPlan(subResp?.plan || 'pro');
    setBillingCycle(subResp?.billing?.billingCycle || 'monthly');
  };

  const retryBillingLoad = async () => {
    try {
      setLoading(true);
      await refreshBilling();
    } catch (err) {
      if (isLikelyOfflineError(err)) {
        setOnlineRequired(true);
        return;
      }
      Alert.alert('Billing', err?.message || 'Unable to load billing details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        await refreshBilling();
      } catch (err) {
        if (isLikelyOfflineError(err)) {
          setOnlineRequired(true);
        } else {
          Alert.alert('Billing', err?.message || 'Unable to load billing details.');
        }
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const totalAmount = useMemo(() => {
    if (!plans) return 0;
    const yearly = billingCycle === 'yearly';
    const planPrice = yearly
      ? selectedPlan === 'pro'
        ? plans?.pro?.pricing?.yearly || Math.round(7000 * 12 * 0.8)
        : plans?.basic?.pricing?.yearly || Math.round(2500 * 12 * 0.8)
      : selectedPlan === 'pro'
        ? plans?.pro?.pricing?.monthly || 7000
        : plans?.basic?.pricing?.monthly || 2500;

    const addonPrice =
      addons.workspaceSlots * (yearly ? plans.pro?.addons?.workspaceSlot?.yearly || Math.round(1500 * 12 * 0.8) : plans.pro?.addons?.workspaceSlot?.monthly || 1500) +
      addons.staffSeats * (yearly ? plans.pro?.addons?.staffSeat?.yearly || Math.round(500 * 12 * 0.8) : plans.pro?.addons?.staffSeat?.monthly || 500) +
      addons.whatsappBundles * (yearly ? plans.pro?.addons?.whatsappBundle100?.yearly || Math.round(2000 * 12 * 0.8) : plans.pro?.addons?.whatsappBundle100?.monthly || 2000);
    return planPrice + addonPrice;
  }, [plans, selectedPlan, addons, billingCycle]);

  const bump = (key, delta) => {
    setAddons((prev) => {
      const next = Math.max(0, (prev[key] || 0) + delta);
      return { ...prev, [key]: next };
    });
  };

  const startCheckout = async () => {
    if (!isWorkspaceOwner) {
      Alert.alert('Permission required', 'Only workspace owners can purchase or upgrade subscriptions for this workspace.');
      return;
    }
    if (onlineRequired) {
      Alert.alert('Internet required', 'Billing requires internet connection. Come online to upgrade or renew this workspace.');
      return;
    }
    // Prefer native Google Play Billing on Android when available.
    if (Platform.OS === 'android' && GoogleBilling.isAvailable()) {
      // Map product ids to your Play Console SKUs. Update these values to match your Play Console.
      const SKU_MAP = {
        pro_monthly: 'bizrecord_pro_monthly',
        pro_yearly: 'bizrecord_pro_yearly',
        basic_monthly: 'bizrecord_basic_monthly',
      };
      const key = `${selectedPlan}_${billingCycle}`;
      const sku = SKU_MAP[key] || SKU_MAP.pro_monthly;
      try {
        setProcessing(true);
        const purchase = await GoogleBilling.purchaseSubscription(sku);
        // purchase should include { purchaseToken, orderId, productId }
        const payload = {
          packageName: process.env.EXPO_PUBLIC_ANDROID_PACKAGE || 'com.bizrecord.app',
          productId: purchase.productId || sku,
          purchaseToken: purchase.purchaseToken || purchase.token,
          purchaseType: 'subscription',
          workspaceId: currentWorkspace?.id,
        };
        const result = await api.post('/billing/verify/google', payload);
        if (result?.verified) {
          Alert.alert('Subscription', 'Subscription verified and activated.');
          await refreshBilling();
        } else {
          Alert.alert('Subscription', 'Purchase verified but server reported an issue.');
        }
      } catch (err) {
        Alert.alert('Google Billing', err?.message || 'Purchase failed');
      } finally {
        setProcessing(false);
      }
      return;
    }

    // Fallback: non-Android clients should use the Play Store / contact support.
    Alert.alert(
      'Unsupported platform',
      'Direct web checkout is deprecated. Use the Google Play Store (Android) to purchase subscriptions, or contact support for alternative billing.',
    );
  };

  const verifyLastPayment = async () => {
    if (onlineRequired) {
      Alert.alert('Internet required', 'Billing requires internet connection. Come online to verify payment.');
      return;
    }
    if (!lastReference) {
      Alert.alert('Verification', 'No recent payment reference found yet. Start checkout first.');
      return;
    }

    try {
      setProcessing(true);
      await api.post('/billing/verify', { reference: lastReference });
      Alert.alert('Success', 'Payment verified and subscription updated.');
      await refreshBilling();
    } catch (err) {
      if (isLikelyOfflineError(err)) {
        setOnlineRequired(true);
      }
      Alert.alert('Verification failed', err?.message || 'Unable to verify payment now.');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (onlineRequired) {
    return (
      <View style={[styles.center, { backgroundColor: theme.colors.background, padding: 16 }]}>
        <Card style={{ width: '100%', maxWidth: 520 }}>
          <Title>Subscription & Billing</Title>
          <Text style={[styles.onlineRequiredText, { color: theme.colors.textSecondary }]}>
            Billing is online-only. Connect to the internet to renew, upgrade, verify payment, or view live usage for this workspace.
          </Text>
          <AppButton title="Try Again" onPress={retryBillingLoad} style={{ marginTop: 12 }} />
          <AppButton title="Back" variant="secondary" onPress={() => navigation.goBack()} style={{ marginTop: 10 }} />
        </Card>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.headerRow}>
        <Title>Subscription & Billing</Title>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="close" size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <Card>
        <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Current status</Text>
        <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>Plan: {(subscription?.plan || 'basic').toUpperCase()}</Text>
        <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>Status: {(subscription?.status || 'active').toUpperCase()}</Text>
        <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>Trial days left: {subscription?.trial?.daysLeft ?? 0}</Text>
        <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>Workspace usage: {subscription?.limits?.workspaceUsed ?? 0}/{subscription?.limits?.workspaceLimit ?? 0}</Text>
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Choose plan</Text>
        <View style={styles.cycleSwitcher}>
          {['monthly', 'yearly'].map((cycle) => {
            const active = billingCycle === cycle;
            return (
              <TouchableOpacity
                key={cycle}
                style={[
                  styles.cycleChip,
                  {
                    backgroundColor: active ? theme.colors.primary : 'transparent',
                    borderColor: active ? theme.colors.primary : theme.colors.border,
                  },
                ]}
                onPress={() => setBillingCycle(cycle)}
              >
                <Text style={{ color: active ? '#fff' : theme.colors.textPrimary, fontWeight: '700', fontSize: 12 }}>
                  {cycle === 'yearly' ? 'Yearly (20% off)' : 'Monthly'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {PLAN_ORDER.map((planKey) => {
          const active = selectedPlan === planKey;
          const price = billingCycle === 'yearly'
            ? planKey === 'pro'
              ? plans?.pro?.pricing?.yearly || Math.round(7000 * 12 * 0.8)
              : plans?.basic?.pricing?.yearly || Math.round(2500 * 12 * 0.8)
            : planKey === 'pro'
              ? plans?.pro?.pricing?.monthly || 7000
              : plans?.basic?.pricing?.monthly || 2500;
          return (
            <TouchableOpacity
              key={planKey}
              style={[
                styles.planItem,
                {
                  borderColor: active ? theme.colors.primary : theme.colors.border,
                  backgroundColor: active ? `${theme.colors.primary}15` : 'transparent',
                },
              ]}
              onPress={() => setSelectedPlan(planKey)}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.planTitle, { color: theme.colors.textPrimary }]}>{planKey.toUpperCase()}</Text>
                <Text style={[styles.planPrice, { color: theme.colors.textSecondary }]}>₦{price.toLocaleString()}/{billingCycle === 'yearly' ? 'year' : 'month'}</Text>
              </View>
              {active ? <MaterialIcons name="check-circle" size={20} color={theme.colors.primary} /> : null}
            </TouchableOpacity>
          );
        })}
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Pro add-ons</Text>
        {!addonsAllowed && (
          <Text style={[styles.meta, { color: theme.colors.warning, marginBottom: 8 }]}>Add-ons are disabled during active trial.</Text>
        )}

        {[
          { key: 'workspaceSlots', label: 'Extra workspace slot', unit: 1500 },
          { key: 'staffSeats', label: 'Extra staff seat', unit: 500 },
          { key: 'whatsappBundles', label: 'WhatsApp bundle (100 msgs)', unit: 2000 },
        ].map((row) => (
          <View key={row.key} style={styles.addonRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.meta, { color: theme.colors.textPrimary }]}>{row.label}</Text>
              <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>₦{(billingCycle === 'yearly' ? Math.round(row.unit * 12 * 0.8) : row.unit).toLocaleString()} / {billingCycle === 'yearly' ? 'year' : 'month'}</Text>
            </View>
            <View style={styles.counter}>
              <TouchableOpacity disabled={!addonsAllowed} onPress={() => bump(row.key, -1)}>
                <MaterialIcons name="remove-circle-outline" size={24} color={addonsAllowed ? theme.colors.textPrimary : theme.colors.border} />
              </TouchableOpacity>
              <Text style={[styles.counterValue, { color: theme.colors.textPrimary }]}>{addons[row.key]}</Text>
              <TouchableOpacity disabled={!addonsAllowed} onPress={() => bump(row.key, 1)}>
                <MaterialIcons name="add-circle-outline" size={24} color={addonsAllowed ? theme.colors.primary : theme.colors.border} />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Usage dashboard</Text>
        <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>Workspace: {usage?.workspace?.used ?? 0}/{usage?.workspace?.limit ?? 0}</Text>
        <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>Staff: {usage?.staff?.used ?? 0}/{usage?.staff?.limit ?? 0}</Text>
        <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>WhatsApp: {usage?.whatsapp?.used ?? 0}/{usage?.whatsapp?.limit ?? 0}</Text>
        {usage?.automationPaused ? (
          <Text style={[styles.meta, { color: theme.colors.warning }]}>Automation paused: {usage?.reason}</Text>
        ) : null}
      </Card>

      <Card>
        <Text style={[styles.total, { color: theme.colors.textPrimary }]}>Total: ₦{totalAmount.toLocaleString()} / {billingCycle === 'yearly' ? 'year' : 'month'}</Text>
        <AppButton
          title={processing ? 'Processing...' : 'Proceed to payment'}
          icon="payments"
          onPress={startCheckout}
          loading={processing}
          disabled={processing || !isWorkspaceOwner}
        />
        <AppButton
          title="Verify last payment"
          variant="secondary"
          onPress={verifyLastPayment}
          disabled={processing || !isWorkspaceOwner}
          style={{ marginTop: 10 }}
        />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  onlineRequiredText: { fontSize: 14, lineHeight: 22, marginTop: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  meta: { fontSize: 13, marginBottom: 4 },
  planItem: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  planTitle: { fontSize: 14, fontWeight: '700' },
  planPrice: { fontSize: 12 },
  cycleSwitcher: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  cycleChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  addonRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  counterValue: { minWidth: 24, textAlign: 'center', fontSize: 15, fontWeight: '700' },
  total: { fontSize: 18, fontWeight: '800', marginBottom: 10 },
});
