import { Alert, Platform, ToastAndroid } from 'react-native';

export const showSuccessToast = (message, title = 'Success') => {
  const text = String(message || '').trim();
  if (!text) return;

  if (Platform.OS === 'android') {
    ToastAndroid.show(text, ToastAndroid.SHORT);
    return;
  }

  if (Platform.OS === 'web') {
    window.alert(text);
    return;
  }

  Alert.alert(title, text);
};

