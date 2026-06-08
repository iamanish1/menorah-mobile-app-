import NetInfo from '@react-native-community/netinfo';
import { api } from './api';

export interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: string;
  isWifi: boolean;
  isCellular: boolean;
}

export class NetworkManager {
  private static instance: NetworkManager;
  private listeners: ((status: NetworkStatus) => void)[] = [];

  private constructor() {
    this.initializeNetworkListener();
  }

  static getInstance(): NetworkManager {
    if (!NetworkManager.instance) {
      NetworkManager.instance = new NetworkManager();
    }
    return NetworkManager.instance;
  }

  private initializeNetworkListener() {
    NetInfo.addEventListener((state) => {
      const networkStatus: NetworkStatus = {
        isConnected: state.isConnected ?? false,
        isInternetReachable: state.isInternetReachable,
        type: state.type,
        isWifi: state.type === 'wifi',
        isCellular: state.type === 'cellular',
      };

      this.notifyListeners(networkStatus);
    });
  }

  addListener(callback: (status: NetworkStatus) => void) {
    this.listeners.push(callback);
  }

  removeListener(callback: (status: NetworkStatus) => void) {
    this.listeners = this.listeners.filter(listener => listener !== callback);
  }

  private notifyListeners(status: NetworkStatus) {
    this.listeners.forEach(listener => listener(status));
  }

  async getCurrentStatus(): Promise<NetworkStatus> {
    const state = await NetInfo.fetch();
    return {
      isConnected: state.isConnected ?? false,
      isInternetReachable: state.isInternetReachable,
      type: state.type,
      isWifi: state.type === 'wifi',
      isCellular: state.type === 'cellular',
    };
  }

  async checkApiConnectivity(): Promise<{ isReachable: boolean; error?: string }> {
    try {
      const response = await api.healthCheck();
      return { isReachable: response.success };
    } catch (error: any) {
      return { 
        isReachable: false, 
        error: error.message || 'API connectivity check failed' 
      };
    }
  }

  async getNetworkDiagnostics(): Promise<{
    networkStatus: NetworkStatus;
    apiConnectivity: { isReachable: boolean; error?: string };
    recommendations: string[];
  }> {
    const networkStatus = await this.getCurrentStatus();
    const apiConnectivity = await this.checkApiConnectivity();
    const recommendations: string[] = [];

    if (!networkStatus.isConnected) {
      recommendations.push('No internet connection detected. Please check your network settings.');
    } else if (!networkStatus.isInternetReachable) {
      recommendations.push('Internet connection is available but may be unstable.');
    }

    if (!apiConnectivity.isReachable) {
      if (networkStatus.isConnected) {
        recommendations.push('API server is not reachable. Please check if the server is running.');
      } else {
        recommendations.push('Cannot reach API server due to network connectivity issues.');
      }
    }

    return {
      networkStatus,
      apiConnectivity,
      recommendations,
    };
  }
}

export const networkManager = NetworkManager.getInstance();
