import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

const PUSH_TOKEN_STORAGE_KEY = '@booker:pushToken';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function getProjectId() {
  return (
    Constants?.expoConfig?.extra?.eas?.projectId ||
    Constants?.easConfig?.projectId ||
    null
  );
}

export async function ensurePushChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#031f38',
  });
}

export async function registerPushTokenWithBackend(api) {
  if (!Device.isDevice) {
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  await ensurePushChannel();

  const projectId = getProjectId();
  if (!projectId) {
    throw new Error('Missing Expo projectId for push token registration');
  }
  const tokenResponse = await Notifications.getExpoPushTokenAsync(
    { projectId },
  );
  const token = tokenResponse?.data;
  if (!token) return null;

  await api.post('/notifications/push/register', {
    token,
    platform: Platform.OS,
    deviceId:
      String(Device.osBuildId || '') ||
      String(Device.modelId || '') ||
      String(Device.modelName || ''),
  });

  await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, token);
  return token;
}

export async function unregisterPushTokenWithBackend(api) {
  const token = await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);
  await api.post('/notifications/push/unregister', token ? { token } : {});
  await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
}
