import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { setHapticEnabled } from '../utils/haptics';
import { useUser } from './UserContext';

const DEFAULT_SETTINGS = {
  // Display
  showCoordinates: true,
  highlightMoves: true,
  boardTheme: 'green',
  pieceSet: 'default',
  
  // Gameplay
  autoQueen: true,
  confirmMoves: false,
  showHints: true,
  
  // Sound
  soundEnabled: true,
  soundVolume: 80,

  // Haptics
  hapticEnabled: true,
  
  // Debug
  debugMode: false,
};

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const { user, isOnline } = useUser();
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings from database for logged-in users
  useEffect(() => {
    let isMounted = true;

    const loadSettings = async () => {
      setIsLoaded(false);
      if (!user || !isOnline) {
        if (isMounted) {
          setSettings(DEFAULT_SETTINGS);
          setIsLoaded(true);
        }
        return;
      }

      try {
        const response = await api.getUserSettings(user.username);
        if (isMounted) {
          const merged = { ...DEFAULT_SETTINGS, ...(response?.settings || {}) };
          setSettings(merged);
        }
      } catch (e) {
        console.error('[SettingsContext] Failed to load settings:', e);
        if (isMounted) {
          setSettings(DEFAULT_SETTINGS);
        }
      } finally {
        if (isMounted) {
          setIsLoaded(true);
        }
      }
    };

    loadSettings();

    return () => {
      isMounted = false;
    };
  }, [user, isOnline]);

  // Save settings to database whenever they change
  useEffect(() => {
    if (!isLoaded) return;

    setHapticEnabled(settings.hapticEnabled);

    if (!user || !isOnline) {
      return;
    }

    const saveSettings = async () => {
      try {
        await api.updateUserSettings(user.username, settings);
      } catch (e) {
        console.error('[SettingsContext] Failed to save settings:', e);
      }
    };

    saveSettings();
  }, [settings, isLoaded, user, isOnline]);

  const updateSettings = useCallback((updates) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  const value = {
    settings,
    updateSettings,
    resetSettings,
    isLoaded,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

export default SettingsContext;
