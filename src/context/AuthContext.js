import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, setAuthToken } from '../api/client';
import * as Crypto from 'expo-crypto';
import {
  registerPushTokenWithBackend,
  unregisterPushTokenWithBackend,
} from '../services/pushNotifications';

import * as biometric from '../services/biometric';

const AuthContext = createContext();
const STORAGE_KEY = '@booker:auth';
const OFFLINE_PWHASH_KEY = '@booker:offlinePwHash';
const OFFLINE_PWHASH_META_KEY = '@booker:offlinePwMeta';
const OFFLINE_MAX_DAYS = 7;
const isLikelyOfflineError = (err) => !!err?.message && /network|offline|timeout|fetch/i.test(err.message);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requiresReAuth, setRequiresReAuth] = useState(false);
  const appStateRef = useRef(AppState.currentState);
  const userRef = useRef(null);

  // Keep userRef in sync so AppState listener can access it without stale closure
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const saveAuth = async (newToken, userData, password) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ token: newToken, user: userData }));
      // Store offline password hash and meta if password provided
      if (password) {
        const salt = userData?.email || '';
        const hash = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          password + ':' + salt
        );
        await AsyncStorage.setItem(OFFLINE_PWHASH_KEY, hash);
        await AsyncStorage.setItem(OFFLINE_PWHASH_META_KEY, JSON.stringify({
          updatedAt: Date.now(),
          email: userData?.email,
        }));
      }
    } catch (error) {
      // ignore
    }

    setAuthToken(newToken);
    setToken(newToken);
    setUser(userData);
    setRequiresReAuth(false);

    registerPushTokenWithBackend(api).catch(() => null);
  };

  const tryOfflinePasswordAuth = async (email, password) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const storedAuthRaw = await AsyncStorage.getItem(STORAGE_KEY);
    const storedHash = await AsyncStorage.getItem(OFFLINE_PWHASH_KEY);
    const metaRaw = await AsyncStorage.getItem(OFFLINE_PWHASH_META_KEY);

    if (!storedAuthRaw || !storedHash || !metaRaw) {
      throw new Error('Offline sign-in is not available yet for this account.');
    }

    const storedAuth = JSON.parse(storedAuthRaw);
    const meta = JSON.parse(metaRaw);
    const storedEmail = String(meta?.email || storedAuth?.user?.email || '').trim().toLowerCase();

    if (!storedEmail || storedEmail !== normalizedEmail) {
      throw new Error('Offline sign-in is only available for the last account used on this device.');
    }

    if (!meta?.updatedAt || Date.now() - meta.updatedAt >= OFFLINE_MAX_DAYS * 86400000) {
      throw new Error('Offline sign-in expired. Please connect to the internet.');
    }

    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      password + ':' + storedEmail
    );

    if (hash !== storedHash) {
      throw new Error('Incorrect password (offline).');
    }

    setAuthToken(storedAuth?.token || null);
    setToken(storedAuth?.token || null);
    setUser(storedAuth?.user || null);
    setRequiresReAuth(false);
    return storedAuth?.user || null;
  };

  const clearAuth = async () => {
    await unregisterPushTokenWithBackend(api).catch(() => null);
    try {
      await AsyncStorage.multiRemove([
        STORAGE_KEY,
        OFFLINE_PWHASH_KEY,
        OFFLINE_PWHASH_META_KEY,
      ]);
    } catch (error) {
      // ignore
    }
    setAuthToken(null);
    setToken(null);
    setUser(null);
    setRequiresReAuth(false);
  };

  const register = async (registerDto) => {
    const response = await api.post('/auth/register', registerDto);
    // Support both register response shapes:
    // 1) { access_token, user } -> save directly
    // 2) verification-first response -> stay signed out until OTP is confirmed
    // 3) user object only -> login immediately
    if (response?.access_token && response?.user) {
      await saveAuth(response.access_token, response.user);
      return response.user;
    }

    const requiresEmailVerification =
      response?.requiresEmailVerification === true ||
      response?.emailVerified === false;

    if (!requiresEmailVerification) {
      await login(registerDto.email, registerDto.password);
    }
    return {
      ...response,
      requiresEmailVerification,
      email: response?.email || registerDto.email,
    };
  };

  const login = async (email, password) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      const { access_token, user: userData } = response;
      await saveAuth(access_token, userData, password);
      return userData;
    } catch (err) {
      if (isLikelyOfflineError(err)) {
        return tryOfflinePasswordAuth(email, password);
      }
      throw err;
    }
  };

  // Re-authenticate using the stored user's email + a new password entry
  // Try online unlock, fallback to offline if offline
  const unlockSession = async (password) => {
    if (!userRef.current?.email) throw new Error('No user session found');
    try {
      // Try online unlock first
      return await login(userRef.current.email, password);
    } catch (err) {
      // If offline, try offline fallback
      if (isLikelyOfflineError(err)) {
        // Check offline hash
        const salt = userRef.current.email;
        const hash = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          password + ':' + salt
        );
        const storedHash = await AsyncStorage.getItem(OFFLINE_PWHASH_KEY);
        const metaRaw = await AsyncStorage.getItem(OFFLINE_PWHASH_META_KEY);
        if (storedHash && storedHash === hash && metaRaw) {
          const meta = JSON.parse(metaRaw);
          // Enforce max offline period
          if (meta.updatedAt && Date.now() - meta.updatedAt < OFFLINE_MAX_DAYS * 86400000) {
            setRequiresReAuth(false);
            return userRef.current;
          } else {
            throw new Error('Offline unlock expired. Please connect to the internet.');
          }
        }
        throw new Error('Incorrect password (offline).');
      }
      throw err;
    }
  };

  const logout = () => {
    clearAuth();
  };

  const restoreAuth = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const { token: storedToken, user: storedUser } = JSON.parse(stored);
        if (storedToken) {
          setAuthToken(storedToken);
          setToken(storedToken);
          setUser(storedUser);
          registerPushTokenWithBackend(api).catch(() => null);
          // Any restored session must re-authenticate before accessing app data.
          setRequiresReAuth(true);
        }
      }
    } catch (error) {
      // ignore
    }
    setLoading(false);
  };


  // On mount, restore auth and try biometric unlock if needed
  useEffect(() => {
    async function maybeBiometricUnlock() {
      await restoreAuth();
      // If Android, user is present, and requiresReAuth, try biometric
      if (
        Platform.OS === 'android' &&
        userRef.current &&
        (await biometric.getBiometricOptIn()) &&
        (await biometric.isBiometricAvailable())
      ) {
        const result = await biometric.biometricAuthenticate();
        if (result.success) {
          setRequiresReAuth(false);
        }
        // If not successful, fallback to password as normal
      }
    }
    maybeBiometricUnlock();
  }, []);

  // Lock the session whenever the app is resumed from background, and try biometric if opted in
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;
      const wasBackgrounded = typeof prev === 'string' && /(inactive|background)/.test(prev);
      if (wasBackgrounded && nextState === 'active' && userRef.current) {
        setRequiresReAuth(true);
        // Try biometric unlock if Android and opted in
        if (
          Platform.OS === 'android' &&
          (await biometric.getBiometricOptIn()) &&
          (await biometric.isBiometricAvailable())
        ) {
          const result = await biometric.biometricAuthenticate();
          if (result.success) {
            setRequiresReAuth(false);
            return;
          }
        }
        // If not, allow offline password fallback
      }
    });
    return () => subscription.remove();
  }, []);

  // Expose biometric opt-in helpers for UI
  return (
    <AuthContext.Provider value={{
      user, token, loading, requiresReAuth, login, logout, register, unlockSession,
      setBiometricOptIn: biometric.setBiometricOptIn,
      getBiometricOptIn: biometric.getBiometricOptIn,
      isBiometricAvailable: biometric.isBiometricAvailable,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

export default AuthContext;
