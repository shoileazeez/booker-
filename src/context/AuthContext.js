import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, setAuthToken } from '../api/client';

const AuthContext = createContext();
const STORAGE_KEY = '@booker:auth';

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

  const saveAuth = async (newToken, userData) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ token: newToken, user: userData }));
    } catch (error) {
      // ignore
    }

    setAuthToken(newToken);
    setToken(newToken);
    setUser(userData);
    setRequiresReAuth(false);
  };

  const clearAuth = async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
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
    // If backend doesn't log in automatically, attempt login right away
    if (response && response.id) {
      await login(registerDto.email, registerDto.password);
    }
    return response;
  };

  const login = async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    const { access_token, user: userData } = response;
    await saveAuth(access_token, userData);
    return userData;
  };

  // Re-authenticate using the stored user's email + a new password entry
  const unlockSession = async (password) => {
    if (!userRef.current?.email) throw new Error('No user session found');
    return login(userRef.current.email, password);
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
          // Any restored session must re-authenticate before accessing app data.
          setRequiresReAuth(true);
        }
      }
    } catch (error) {
      // ignore
    }
    setLoading(false);
  };

  useEffect(() => {
    restoreAuth();
  }, []);

  // Lock the session whenever the app is resumed from background
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;
      const wasBackgrounded = typeof prev === 'string' && /(inactive|background)/.test(prev);
      if (wasBackgrounded && nextState === 'active' && userRef.current) {
        setRequiresReAuth(true);
      }
    });
    return () => subscription.remove();
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, requiresReAuth, login, logout, register, unlockSession }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

export default AuthContext;
