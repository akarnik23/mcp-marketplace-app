import { useState, useEffect } from 'react';
import { getFromStorage, setToStorage, removeFromStorage, STORAGE_KEYS } from '../utils/storage';

export const useRenderApiKey = () => {
  const [apiKey, setApiKey] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedApiKey = getFromStorage(STORAGE_KEYS.RENDER_API_KEY);
    if (storedApiKey) {
      setApiKey(storedApiKey);
    }
    setLoading(false);
  }, []);

  const updateApiKey = (newApiKey: string) => {
    if (newApiKey.trim()) {
      setToStorage(STORAGE_KEYS.RENDER_API_KEY, newApiKey.trim());
      setApiKey(newApiKey.trim());
    }
  };

  const clearApiKey = () => {
    removeFromStorage(STORAGE_KEYS.RENDER_API_KEY);
    setApiKey('');
  };

  return {
    apiKey,
    loading,
    updateApiKey,
    clearApiKey
  };
};
