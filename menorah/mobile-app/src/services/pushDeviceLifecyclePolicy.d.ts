export interface StoredPushRegistration {
  expoPushToken: string;
  userId: string | null;
  projectId?: string | null;
}

export interface PendingPushDetachment extends StoredPushRegistration {
  authToken: string;
  logoutAfterDetach: boolean;
  claimBeforeDetach: boolean;
}

export interface PushLifecycleResponse {
  success: boolean;
  httpStatus?: number;
  isNetworkError?: boolean;
}

export interface PushDeviceLifecycleAdapter {
  getCurrentAuthToken(): Promise<string | null>;
  readRegistration(): Promise<StoredPushRegistration | null>;
  writeRegistration(registration: StoredPushRegistration): Promise<void>;
  deleteRegistrationIfMatches(registration: StoredPushRegistration): Promise<void>;
  readPendingDetachments(): Promise<PendingPushDetachment[]>;
  writePendingDetachments(detachments: PendingPushDetachment[]): Promise<void>;
  registerRemote(
    registration: StoredPushRegistration,
    authToken: string,
  ): Promise<PushLifecycleResponse>;
  unregisterRemote(
    registration: StoredPushRegistration,
    authToken: string,
  ): Promise<PushLifecycleResponse>;
  logoutRemote(authToken: string): Promise<PushLifecycleResponse>;
  queuePendingLogoutToken(authToken: string): Promise<void>;
  reportError: (diagnosticLabel: string, error?: unknown) => void;
}

export interface PushDeviceLifecycle {
  beginAccountTransition(): Promise<void>;
  endAccountTransition(): void;
  registerCurrent(
    registration: StoredPushRegistration,
    authToken: string,
  ): Promise<{ enabled: boolean; reason?: string }>;
  prepareAccountTransition(
    authToken: string,
    expectedUserId?: string,
  ): Promise<{ status: 'no_registration' | 'queued' | 'detached' }>;
  unregisterCurrent(
    authToken: string,
    expectedUserId?: string,
  ): Promise<{ status: 'no_registration' | 'queued' | 'detached' }>;
  retryPendingDetachments(): Promise<{ remaining: number }>;
}

export function createPushDeviceLifecycle(
  adapter: PushDeviceLifecycleAdapter,
  options?: { maxPending?: number },
): PushDeviceLifecycle;

export function sameRegistration(
  left: StoredPushRegistration | null,
  right: StoredPushRegistration | null,
): boolean;

export function sameDetachment(
  left: PendingPushDetachment,
  right: PendingPushDetachment,
): boolean;

export function addPendingDetachment(
  pending: PendingPushDetachment[],
  detachment: PendingPushDetachment,
  maxPending: number,
): PendingPushDetachment[];

export function removePendingDetachment(
  pending: PendingPushDetachment[],
  detachment: PendingPushDetachment,
): PendingPushDetachment[];
