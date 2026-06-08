import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Updates from 'expo-updates';

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'ready'   // downloaded, waiting for user to restart
  | 'error';

export function useAppUpdate() {
  const [state, setState] = useState<UpdateState>('idle');
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const isRunning = useRef(false);

  const checkAndDownload = async () => {
    // Skip in Expo Go / dev mode — Updates.isEnabled is false there
    if (__DEV__ || !Updates.isEnabled) return;
    // Prevent concurrent checks
    if (isRunning.current) return;
    isRunning.current = true;

    try {
      setState('checking');
      const result = await Updates.checkForUpdateAsync();

      if (!result.isAvailable) {
        setState('idle');
        return;
      }

      setState('downloading');
      await Updates.fetchUpdateAsync();
      setState('ready');
    } catch {
      // Never surface update errors to the user — silently fall back
      setState('idle');
    } finally {
      isRunning.current = false;
    }
  };

  // Reload the app to apply the downloaded update
  const applyUpdate = async () => {
    try {
      await Updates.reloadAsync();
    } catch {
      setState('idle');
    }
  };

  useEffect(() => {
    // Check on first launch
    checkAndDownload();

    // Re-check every time the app comes back to foreground
    const subscription = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        checkAndDownload();
      }
      appState.current = next;
    });

    return () => subscription.remove();
  }, []);

  return { updateState: state, applyUpdate };
}
