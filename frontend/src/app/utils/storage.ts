// Utility functions for localStorage with client-side checks
export const isClient = () => typeof window !== 'undefined';

export const getFromStorage = (key: string): string | null => {
  if (!isClient()) return null;
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.error(`Error getting ${key} from localStorage:`, error);
    return null;
  }
};

export const setToStorage = (key: string, value: string): void => {
  if (!isClient()) return;
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.error(`Error setting ${key} to localStorage:`, error);
  }
};

export const removeFromStorage = (key: string): void => {
  if (!isClient()) return;
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error(`Error removing ${key} from localStorage:`, error);
  }
};
