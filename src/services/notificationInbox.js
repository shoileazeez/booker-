import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

const INBOX_KEY = '@booker:notificationInbox';
const INBOX_LIMIT = 100;

const safeParse = (raw) => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const extractNotificationData = (input) => {
  const notification = input?.notification || input;
  const request = notification?.request || {};
  const content = request?.content || {};
  const identifier =
    request?.identifier ||
    notification?.date?.toString() ||
    `${Date.now()}_${Math.random().toString(16).slice(2)}`;

  return {
    id: String(identifier),
    title: String(content?.title || 'Notification'),
    body: String(content?.body || ''),
    data: content?.data || {},
    receivedAt: new Date().toISOString(),
    read: false,
  };
};

export const getNotificationInbox = async () => {
  const raw = await AsyncStorage.getItem(INBOX_KEY);
  const items = safeParse(raw);
  return items.sort(
    (left, right) =>
      new Date(right?.receivedAt || 0).getTime() -
      new Date(left?.receivedAt || 0).getTime(),
  );
};

export const clearNotificationInbox = async () => {
  await AsyncStorage.setItem(INBOX_KEY, JSON.stringify([]));
};

export const addNotificationToInbox = async (notification) => {
  const item = extractNotificationData(notification);
  const current = await getNotificationInbox();
  const next = [item, ...current.filter((entry) => entry.id !== item.id)].slice(
    0,
    INBOX_LIMIT,
  );
  await AsyncStorage.setItem(INBOX_KEY, JSON.stringify(next));
};

export const markNotificationInboxRead = async () => {
  const current = await getNotificationInbox();
  if (current.length === 0) return;
  const next = current.map((entry) => ({ ...entry, read: true }));
  await AsyncStorage.setItem(INBOX_KEY, JSON.stringify(next));
};

export const initializeNotificationInbox = async () => {
  const lastResponse = await Notifications.getLastNotificationResponseAsync();
  if (lastResponse?.notification) {
    await addNotificationToInbox(lastResponse.notification);
  }

  const receivedSubscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      addNotificationToInbox(notification).catch(() => null);
    },
  );
  const responseSubscription =
    Notifications.addNotificationResponseReceivedListener((response) => {
      addNotificationToInbox(response?.notification).catch(() => null);
    });

  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
  };
};

