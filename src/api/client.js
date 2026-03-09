import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Base API URL configuration
// 1) Preferred: set in Expo/app config (app.json/app.config.js) via `extra.apiUrl` or via EAS secrets.
// 2) Fallback: use `process.env.EXPO_PUBLIC_API_URL` (Expo managed env) or `process.env.API_URL`.
// 3) Fallback: local emulator defaults for fast dev.
const getConfiguredApiUrl = () => {
  const expoUrl = Constants.manifest?.extra?.apiUrl || Constants.expoConfig?.extra?.apiUrl;
  if (expoUrl) return expoUrl;
  if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  if (typeof process !== 'undefined' && process.env?.API_URL) return process.env.API_URL;
  return null;
};

const getBaseUrl = () => {
  const configured = getConfiguredApiUrl();
  if (configured) return configured.replace(/\/$/, '');

  // Defaults for local development
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3000';
  }
  return 'http://localhost:3000';
};

let authToken = null;

export const setAuthToken = (token) => {
  authToken = token;
};

const buildUrl = (path, query) => {
  const base = getBaseUrl().replace(/\/$/, '');
  const trimmedPath = path.startsWith('/') ? path : `/${path}`;
  let url = `${base}${trimmedPath}`;

  if (query && typeof query === 'object') {
    const params = Object.entries(query)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&');
    if (params) {
      url += `?${params}`;
    }
  }

  return url;
};

const handleResponse = async (response) => {
  const contentType = response.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    const message = (data && data.message) || response.statusText || 'Request failed';
    const error = new Error(message);
    error.response = response;
    error.data = data;
    throw error;
  }

  return data;
};

export const api = {
  get: async (path, query) => {
    const url = buildUrl(path, query);
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
    });
    return handleResponse(response);
  },

  post: async (path, body) => {
    const url = buildUrl(path);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return handleResponse(response);
  },

  put: async (path, body) => {
    const url = buildUrl(path);
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return handleResponse(response);
  },

  delete: async (path) => {
    const url = buildUrl(path);
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
    });
    return handleResponse(response);
  },
};
