import { createNavigationContainerRef } from '@react-navigation/native';
import { reportError } from '@/lib/safeDiagnostics';

export const navigationRef = createNavigationContainerRef<Record<string, any>>();

export function navigate(name: string, params?: any) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(name, params);
  } else {
    reportError('navigation.not_ready');
  }
}

export function goBack() {
  if (navigationRef.isReady()) {
    navigationRef.goBack();
  }
}

export function reset(state: any) {
  if (navigationRef.isReady()) {
    navigationRef.reset(state);
  }
}

