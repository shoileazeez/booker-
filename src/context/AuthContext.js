import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, setAuthToken } from '../api/client';

const AuthContext = createContext();
const STORAGE_KEY = '@booker:auth';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  const saveAuth = async (newToken, userData) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ token: newToken, user: userData }));
    } catch (error) {
      // ignore
    }

    setAuthToken(newToken);
    setToken(newToken);
    setUser(userData);
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

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

export default AuthContext;
