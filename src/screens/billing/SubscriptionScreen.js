import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useRevenueCat } from '../../context/RevenueCatContext';
import { useAuth } from '../../context/AuthContext';
import { Card, AppButton, Title } from '../../components/UI';
import { api } from '../../api/client';
import * as offlineStore from '../../storage/offlineStore';
import { ENTITLEMENTS, PRODUCT_IDS, getProductMeta, getPlanProductId } from '../../services/revenuecat';

const PLAN_ORDER = ['basic', 'pro'];
const DEFAULT_ADDONS = {
  workspaceSlot: { monthly: 1500, yearly: Math.round(1500 * 12 * 0.8) },
  staffSeat: { monthly: 500, yearly: Math.round(500 * 12 * 0.8) },
  whatsappBundle100: { monthly: 2000, yearly: Math.round(2000 * 12 * 0.8) },
};

function normalizePlansResponse(payload) {
  if (payload?.basic || payload?.pro) return payload;
  const normalized = {};
  for (const plan of payload?.plans || []) {
    normalized[plan.key] = {
      pricing: {
        monthly: Number(plan.monthly || 0),
        yearly: Number(plan.yearly || 0),
      },
      addons: DEFAULT_ADDONS,
    };
  }
  return {
    basic: normalized.basic || {
      pricing: { monthly: 2500, yearly: Math.round(2500 * 12 * 0.8) },
      addons: DEFAULT_ADDONS,
    },
    pro: normalized.pro || {
      pricing: { monthly: 7000, yearly: Math.round(7000 * 12 * 0.8) },
      addons: DEFAULT_ADDONS,
    },
  };
}

function getTrialDaysLeft(subscription) {
  if (!subscription?.trialEndsAt) return 0;
  const diffMs = new Date(subscription.trialEndsAt).getTime() - Date.now();
  return diffMs <= 0 ? 0 : Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}

const isLikelyOfflineError = (err) => !err?.response;

export default function SubscriptionScreen({ navigation }) {
  const { theme } = useTheme();
  const [plans, setPlans] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [usage, setUsage] = useState(null);
  const [workspaceBilling, setWorkspaceBilling] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('pro');
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [selectedAddons, setSelectedAddons] = useState({
    workspaceSlot: false,
    staffSeat: false,
    whatsappBundle: false,
  });
  const [onlineRequired, setOnlineRequired] = useState(false);
  const [showAddonModal, setShowAddonModal] = useState(false);
  const [processingAddon, setProcessingAddon] = useState(false);

  const workspace = useWorkspace();
  const { user, setPauseAutoLock } = useAuth();
  const revenuecat = useRevenueCat();

  const currentWorkspace =
    workspace.currentWorkspace ||
    workspace.workspaces.find((w) => w.id === workspace.currentWorkspaceId);
  const userRole = currentWorkspace?.role || user?.role || 'user';
  const isWorkspaceOwner = userRole === 'owner';
  const addonsAllowed = subscription?.trial?.addonsAllowed !== false;
  const addonsSelectable = addonsAllowed && selectedPlan === 'pro';
  const workspaceCount = workspace.workspaces?.length || 0;
  const trialDaysLeft = getTrialDaysLeft(subscription);

  const currentOffering = revenuecat.offerings?.current || null;
  const packages = currentOffering?.availablePackages || [];

  const selectedPackage = useMemo(() => {
    const targetId = getPlanProductId(selectedPlan, billingCycle);
    return packages.find((p) => p.product?.identifier === targetId)
      || packages.find((p) => {
        const meta = getProductMeta(p.product?.identifier);
        return meta?.plan === selectedPlan && meta?.billingCycle === billingCycle;
      })
      || null;
  }, [packages, selectedPlan, billingCycle]);

  const refreshBilling = async () => {
    let workspaceId = currentWorkspace?.id;
    try {
      const [plansResp, subRes] = await Promise.all([
        api.get('/billing/plans'),
        workspaceId
          ? api.get(`/billing/workspaces/${workspaceId}/context`)
          : api.get('/billing/subscription'),
      ]);
      const normalizedPlans = normalizePlansResponse(plansResp);
      setOnlineRequired(false);
      setPlans(normalizedPlans);

      const billingCtx = workspaceId ? subRes : (subRes ? { plan: subRes.plan, billingCycle: subRes.billingCycle || 'monthly', ...subRes } : {});
      setSubscription(billingCtx);
      setWorkspaceBilling(billingCtx);
      setUsage({
        whatsappMessagesUsedThisMonth: billingCtx?.usage?.whatsappMessagesUsedThisMonth ?? 0,
        limits: billingCtx?.limits || {},
      });
      setSelectedPlan(billingCtx?.plan || 'pro');
      setBillingCycle(billingCtx?.billingCycle || 'monthly');

      if (workspaceId) {
        try {
          await offlineStore.cacheBillingContext(workspaceId, billingCtx);
        } catch {
          // ignore cache errors
        }
      }
    } catch (err) {
      throw err;
    }
  };

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      setLoading(true);
      try {
        await refreshBilling();
      } catch (err) {
        if (!mounted) return;
        if (isLikelyOfflineError(err)) {
          setOnlineRequired(true);
        } else {
          Alert.alert('Billing', err?.message || 'Unable to load billing details.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    run();
    return () => { mounted = false; };
  }, [currentWorkspace?.id]);

  useEffect(() => {
    if (!navigation) return;
    const unsubscribe = navigation.addListener('focus', async () => {
      try {
        await refreshBilling();
      } catch (err) {
        console.error('Failed to refresh billing after focus:', err);
      }
    });
    return unsubscribe;
  }, [navigation, currentWorkspace?.id]);

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
    return planPrice;
  }, [plans, selectedPlan, billingCycle]);

  const startCheckout = async () => {
    if (!selectedPackage) {
      Alert.alert('Not available', 'Selected plan is not available for purchase right now.');
      return;
    }
    setProcessing(true);
    setPauseAutoLock(true);
    try {
      const result = await revenuecat.purchasePackage(selectedPackage);
      if (result.success) {
        await refreshBilling();
        Alert.alert('Success', 'Subscription activated!');
      } else if (!result.cancelled) {
        Alert.alert('Purchase failed', result.error || 'An error occurred.');
      }
    } finally {
      setProcessing(false);
      setPauseAutoLock(false);
    }
  };

  const startAddonCheckout = async () => {
    setProcessingAddon(true);
    setPauseAutoLock(true);
    try {
      const addonTypes = Object.entries(selectedAddons)
        .filter(([, selected]) => selected)
        .map(([key]) => key);

      for (const addonType of addonTypes) {
        const addonProductId = addonType === 'workspaceSlot'
          ? (billingCycle === 'yearly' ? PRODUCT_IDS.ADDON_WORKSPACE_YEARLY : PRODUCT_IDS.ADDON_WORKSPACE_MONTHLY)
          : addonType === 'staffSeat'
            ? (billingCycle === 'yearly' ? PRODUCT_IDS.ADDON_STAFF_YEARLY : PRODUCT_IDS.ADDON_STAFF_MONTHLY)
            : (billingCycle === 'yearly' ? PRODUCT_IDS.ADDON_WHATSAPP100_YEARLY : PRODUCT_IDS.ADDON_WHATSAPP100_MONTHLY);

        const pkg = packages.find((p) => p.product?.identifier === addonProductId);
        if (!pkg) {
          Alert.alert('Not available', `Add-on ${addonType} is not available right now.`);
          continue;
        }

        const result = await revenuecat.purchasePackage(pkg);
        if (!result.success && !result.cancelled) {
          Alert.alert('Purchase failed', `Failed to purchase ${addonType}: ${result.error}`);
          break;
        }
      }

      await refreshBilling();
      setSelectedAddons({ workspaceSlot: false, staffSeat: false, whatsappBundle: false });
      setShowAddonModal(false);
      Alert.alert('Add-ons processed', 'Your add-on purchases have been processed.');
    } finally {
      setProcessingAddon(false);
      setPauseAutoLock(false);
    }
  };

  const handleRestore = async () => {
    setProcessing(true);
    setPauseAutoLock(true);
    try {
      const result = await revenuecat.restorePurchases();
      if (result.success) {
        await refreshBilling();
        Alert.alert('Restored', 'Your purchases have been restored.');
      } else {
        Alert.alert('Restore failed', result.error || 'No purchases found to restore.');
      }
    } finally {
      setProcessing(false);
      setPauseAutoLock(false);
    }
  };

  const handleShowCustomerCenter = () => {
    navigation?.navigate('CustomerCenter');
  };

  const toggleAddon = (key) => {
    setSelectedAddons((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const notifyOwner = async () => {
    if (!currentWorkspace?.id) return;
    if (onlineRequired) {
      Alert.alert('Internet required', 'Connect to the internet to send a renewal reminder.');
      return;
    }
    try {
      setProcessing(true);
      await api.post(`/billing/workspaces/${currentWorkspace.id}/remind-owner`, {});
      Alert.alert('Reminder sent', 'We emailed the workspace owner to renew this subscription.');
    } catch (err) {
      Alert.alert('Unable to send reminder', err?.message || 'Please try again later.');
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
          <AppButton
            title="Try Again"
            onPress={async () => {
              setLoading(true);
              try {
                await refreshBilling();
              } catch {
                setOnlineRequired(true);
              }
              setLoading(false);
            }}
            style={{ marginTop: 12 }}
          />
          <AppButton
            title="Back"
            variant="secondary"
            onPress={() => navigation.goBack()}
            style={{ marginTop: 10 }}
          />
        </Card>
      </View>
    );
  }

  const selectedPrice = selectedPackage?.product?.priceString
    || (totalAmount ? `NGN ${totalAmount.toLocaleString()}` : '');

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{ padding: 16 }}
    >
      <View style={styles.headerRow}>
        <Title>Subscription & Billing</Title>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="close" size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>
      </View>

      <Card>
        <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Current status</Text>
        {revenuecat.isPro ? (
          <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>
            BizRecord Pro is active. {subscription?.currentPeriodEndsAt ? `Renews ${new Date(subscription.currentPeriodEndsAt).toLocaleDateString()}` : ''}
          </Text>
        ) : revenuecat.isBasic ? (
          <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>
            Basic plan is active.
          </Text>
        ) : (
          <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>
            No active subscription. Select a plan below to get started.
          </Text>
        )}
        {subscription?.currentPeriodEndsAt && (
          <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>
            Renews / ends: {new Date(subscription.currentPeriodEndsAt).toLocaleDateString()}
          </Text>
        )}
        <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>
          Workspace usage: {workspaceCount}/{usage?.limits?.workspaceLimit ?? 0}
        </Text>
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
          const basePrice = billingCycle === 'yearly'
            ? planKey === 'pro'
              ? plans?.pro?.pricing?.yearly || Math.round(7000 * 12 * 0.8)
              : plans?.basic?.pricing?.yearly || Math.round(2500 * 12 * 0.8)
            : planKey === 'pro'
              ? plans?.pro?.pricing?.monthly || 7000
              : plans?.basic?.pricing?.monthly || 2500;

          const targetId = getPlanProductId(planKey, billingCycle);
          const pkg = packages.find((p) => p.product?.identifier === targetId);
          const displayPrice = pkg?.product?.priceString || `NGN ${basePrice.toLocaleString()}`;

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
                <Text style={[styles.planTitle, { color: theme.colors.textPrimary }]}>
                  {planKey.toUpperCase()}
                </Text>
                <Text style={[styles.planPrice, { color: theme.colors.textSecondary }]}>
                  {displayPrice}/{billingCycle === 'yearly' ? 'year' : 'month'}
                </Text>
              </View>
              {active ? (
                <MaterialIcons name="check-circle" size={20} color={theme.colors.primary} />
              ) : null}
            </TouchableOpacity>
          );
        })}
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Pro add-ons</Text>
        {selectedPlan !== 'pro' ? (
          <Text style={[styles.meta, { color: theme.colors.textSecondary, marginBottom: 8 }]}>
            Upgrade to Pro plan to enable add-ons.
          </Text>
        ) : subscription?.status === 'trialing' && trialDaysLeft > 0 ? (
          <>
            <Text style={[styles.meta, { color: theme.colors.textSecondary, marginBottom: 12 }]}>
              Add extra capacity to your Pro subscription. Each add-on is a separate purchase.
            </Text>
            <AppButton
              title="Browse Add-ons"
              variant="secondary"
              onPress={() => setShowAddonModal(true)}
              disabled={processing}
            />
          </>
        ) : (
          <Text style={[styles.meta, { color: theme.colors.textSecondary, marginBottom: 8 }]}>
            Add-ons are available after purchasing a plan.
          </Text>
        )}
      </Card>

      <Card>
        <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Usage dashboard</Text>
        <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>
          Workspace: {workspaceCount}/{usage?.limits?.workspaceLimit ?? 0}
        </Text>
        <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>
          Staff seats limit: {usage?.limits?.staffSeatLimit ?? 0}
        </Text>
        <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>
          WhatsApp: {usage?.whatsappMessagesUsedThisMonth ?? 0}/{usage?.limits?.whatsappMonthlyQuota ?? 0}
        </Text>
        {usage?.automationPaused ? (
          <Text style={[styles.meta, { color: theme.colors.warning }]}>Automation paused: {usage?.reason}</Text>
        ) : null}
      </Card>

      <Card>
        <Text style={[styles.total, { color: theme.colors.textPrimary }]}>
          Total: {selectedPrice} / {billingCycle === 'yearly' ? 'year' : 'month'}
        </Text>
        <AppButton
          title={processing ? 'Processing...' : (selectedPackage ? 'Subscribe' : 'Not available')}
          icon="payments"
          onPress={startCheckout}
          loading={processing}
          disabled={processing || !isWorkspaceOwner || !selectedPackage}
        />
        {!selectedPackage && (
          <Text style={[styles.meta, { color: theme.colors.warning, marginTop: 4 }]}>
            This plan is not currently available as an in-app purchase.
          </Text>
        )}
        <AppButton
          title="Restore purchases"
          variant="secondary"
          onPress={handleRestore}
          disabled={processing}
          style={{ marginTop: 10 }}
        />
        <AppButton
          title="Manage subscription"
          variant="ghost"
          onPress={handleShowCustomerCenter}
          disabled={processing}
          style={{ marginTop: 6 }}
        />
      </Card>

      <Card>
        <AppButton
          title="Refresh"
          variant="secondary"
          onPress={async () => {
            setLoading(true);
            try {
              await refreshBilling();
            } catch {
              // ignore
            }
            setLoading(false);
          }}
        />
        {!isWorkspaceOwner && (
          <AppButton
            title="Notify workspace owner"
            variant="secondary"
            onPress={notifyOwner}
            disabled={processing}
            style={{ marginTop: 8 }}
          />
        )}
      </Card>

      {showAddonModal && (
        <View style={[styles.modal, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
          <View style={[styles.modalContent, { backgroundColor: theme.colors.background }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Add-ons for your Pro plan</Text>
              <TouchableOpacity onPress={() => setShowAddonModal(false)}>
                <MaterialIcons name="close" size={24} color={theme.colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16 }}>
              <Text style={[styles.meta, { color: theme.colors.textSecondary, marginBottom: 16 }]}>
                Select the add-ons you'd like to purchase. Each add-on is a separate charge.
              </Text>

              {[
                { key: 'workspaceSlot', label: 'Extra workspace slot', unit: 1500 },
                { key: 'staffSeat', label: 'Extra staff seat', unit: 500 },
                { key: 'whatsappBundle', label: 'WhatsApp bundle (100 msgs)', unit: 2000 },
              ].map((addon) => {
                const price = billingCycle === 'yearly' ? Math.round(addon.unit * 12 * 0.8) : addon.unit;
                const isSelected = selectedAddons[addon.key];
                return (
                  <TouchableOpacity
                    key={addon.key}
                    style={[
                      styles.addonCheckbox,
                      {
                        borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                        backgroundColor: isSelected ? `${theme.colors.primary}15` : 'transparent',
                      },
                    ]}
                    onPress={() => toggleAddon(addon.key)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.meta, { color: theme.colors.textPrimary, fontWeight: '600' }]}>{addon.label}</Text>
                      <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>
                        NGN {price.toLocaleString()} / {billingCycle === 'yearly' ? 'year' : 'month'}
                      </Text>
                    </View>
                    <MaterialIcons
                      name={isSelected ? 'check-circle' : 'radio-button-unchecked'}
                      size={24}
                      color={isSelected ? theme.colors.primary : theme.colors.border}
                    />
                  </TouchableOpacity>
                );
              })}

              <View style={{ marginTop: 20, gap: 10 }}>
                <AppButton
                  title={processingAddon ? 'Purchasing...' : 'Continue with selected'}
                  onPress={startAddonCheckout}
                  loading={processingAddon}
                  disabled={processingAddon || !Object.values(selectedAddons).some((v) => v)}
                />
                <AppButton
                  title="Skip add-ons"
                  variant="secondary"
                  onPress={() => setShowAddonModal(false)}
                  disabled={processingAddon}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      )}
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
  cycleSwitcher: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  cycleChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  total: { fontSize: 18, fontWeight: '800', marginBottom: 10 },
  modal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
  },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  addonCheckbox: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center' },
});
