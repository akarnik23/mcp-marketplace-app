import { useState, useEffect } from 'react';
import { User } from '../types';
import { apiRequest } from '../utils/api';
import { getFromStorage, removeFromStorage, STORAGE_KEYS } from '../utils/storage';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = async () => {
    const token = getFromStorage(STORAGE_KEYS.ACCESS_TOKEN);
    
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const response = await apiRequest('/auth/me');
      
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else {
        // Token is invalid, clear it
        removeFromStorage(STORAGE_KEYS.ACCESS_TOKEN);
        setUser(null);
      }
    } catch (error) {
      console.error('Error checking auth:', error);
      removeFromStorage(STORAGE_KEYS.ACCESS_TOKEN);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    removeFromStorage(STORAGE_KEYS.ACCESS_TOKEN);
    setUser(null);
  };

  const startGitHubAuth = async () => {
    try {
      const response = await apiRequest('/auth/github');
      const data = await response.json();
      
      if (typeof window !== 'undefined') {
        window.location.href = data.auth_url;
      }
    } catch (error) {
      console.error('Error starting GitHub auth:', error);
      throw error;
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  return {
    user,
    loading,
    logout,
    startGitHubAuth,
    checkAuth
  };
};
