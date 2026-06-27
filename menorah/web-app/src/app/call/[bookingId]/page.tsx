'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import dynamic from 'next/dynamic';
// Side-effect import — applies LiveKit's default theme CSS.
// This is a 'use client' component so Next.js processes this client-side only.
import '@livekit/components-styles';

// LiveKit components use browser-only APIs — must be loaded client-side only
const LiveKitRoom     = dynamic(() => import('@livekit/components-react').then(m => m.LiveKitRoom),     { ssr: false });
const VideoConference = dynamic(() => import('@livekit/components-react').then(m => m.VideoConference), { ssr: false });

interface VideoRoomData {
  provider?: string;
  joinMode?: string;
  roomId?: string;
  livekitUrl?: string;
  livekitToken?: string;
  token?: string;
  joinUrl?: string;
  externalJoinUrl?: string;
  hostUrl?: string;
  externalHostUrl?: string;
  providerName?: string;
  externalProviderName?: string;
  message?: string;
  sessionType?: string;
  counsellorName?: string;
  userName?: string;
  status?: string;
}

type PageState = 'loading' | 'ready' | 'external' | 'not-configured' | 'disabled' | 'ended' | 'error';

export default function VideoCallPage() {
  const router           = useRouter();
  const params           = useParams();
  const bookingId        = params?.bookingId as string;
  const { isAuthenticated, isLoading } = useAuth();

  const [pageState,  setPageState]  = useState<PageState>('loading');
  const [roomData,   setRoomData]   = useState<VideoRoomData | null>(null);
  const [errorMsg,   setErrorMsg]   = useState<string>('');

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (bookingId && isAuthenticated) {
      fetchToken();
    }
  }, [bookingId, isAuthenticated]);

  const fetchToken = async () => {
    setPageState('loading');
    try {
      const res = await api.joinVideoRoom(bookingId);
      if (res.data?.provider === 'livekit' && res.data.joinMode === 'in_app') {
        setRoomData(res.data);
        setPageState('ready');
      } else if (res.data?.joinMode === 'external_link') {
        setRoomData(res.data);
        setPageState(res.data.joinUrl || res.data.externalJoinUrl ? 'external' : 'not-configured');
      } else if (res.data?.joinMode === 'disabled' || res.data?.provider === 'disabled') {
        setRoomData(res.data);
        setPageState('disabled');
      } else {
        setErrorMsg(res.message || 'Failed to join video room');
        setPageState('error');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to join video room');
      setPageState('error');
    }
  };

  // Called when the counsellor clicks "Leave" inside the LiveKit VideoConference UI
  const handleDisconnected = useCallback(async () => {
    setPageState('ended');
    try {
      await api.completeSession(bookingId);
    } catch {
      // Already completed, or user disconnected mid-session — not fatal
    }
  }, [bookingId]);

  // ── Loading ─────────────────────────────────────────────────────────────
  if (isLoading || pageState === 'loading') {
    return (
      <div style={styles.centred}>
        <div style={styles.spinner} />
        <p style={styles.hint}>Connecting to session…</p>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  // ── Error ────────────────────────────────────────────────────────────────
  if (pageState === 'error') {
    return (
      <div style={styles.centred}>
        <p style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: '#ef4444' }}>
          Could not join session
        </p>
        <p style={{ color: '#94a3b8', marginBottom: 24, textAlign: 'center', maxWidth: 360 }}>
          {errorMsg}
        </p>
        <button style={styles.btn} onClick={() => router.push('/bookings')}>
          Back to Bookings
        </button>
      </div>
    );
  }

  // ── Session ended ─────────────────────────────────────────────────────────
  if (pageState === 'ended') {
    return (
      <div style={styles.centred}>
        <p style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Session Complete</p>
        <p style={{ color: '#94a3b8', marginBottom: 24 }}>
          The session has ended. You can now close this window.
        </p>
        <button style={styles.btn} onClick={() => router.push('/bookings')}>
          Back to Bookings
        </button>
      </div>
    );
  }

  if (pageState === 'external' && roomData) {
    const joinUrl = roomData.hostUrl || roomData.externalHostUrl || roomData.joinUrl || roomData.externalJoinUrl;
    const providerName = roomData.providerName || roomData.externalProviderName || 'external provider';
    return (
      <div style={styles.centred}>
        <p style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Start on {providerName}</p>
        <p style={{ color: '#94a3b8', marginBottom: 24, textAlign: 'center', maxWidth: 380 }}>
          LiveKit is disabled for UAE sessions. Use the approved external provider link.
        </p>
        <button style={styles.btn} onClick={() => { if (joinUrl) window.location.href = joinUrl; }}>
          Open session link
        </button>
      </div>
    );
  }

  if (pageState === 'not-configured') {
    return (
      <div style={styles.centred}>
        <p style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>External session link not configured</p>
        <p style={{ color: '#94a3b8', marginBottom: 24, textAlign: 'center', maxWidth: 380 }}>
          Add an approved external provider link before starting this session.
        </p>
        <button style={styles.btn} onClick={() => router.push(`/bookings/${bookingId}`)}>
          Back to Booking
        </button>
      </div>
    );
  }

  if (pageState === 'disabled') {
    return (
      <div style={styles.centred}>
        <p style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Calling unavailable</p>
        <p style={{ color: '#94a3b8', marginBottom: 24, textAlign: 'center', maxWidth: 380 }}>
          {roomData?.message || 'Video calling is not available until the user region is verified.'}
        </p>
        <button style={styles.btn} onClick={() => router.push(`/bookings/${bookingId}`)}>
          Back to Booking
        </button>
      </div>
    );
  }

  // ── Ready / In-call ───────────────────────────────────────────────────────
  if (!roomData) return null;
  const token = roomData.livekitToken || roomData.token;
  if (!roomData.livekitUrl || !token) return null;

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0f172a' }}>
      {/*
        LiveKitRoom connects to the LiveKit server using the token.
        VideoConference renders the full call UI:
          - participant tiles
          - camera/mic/screen-share controls
          - chat panel
          - leave button
        When the user clicks "Leave", onDisconnected fires.
      */}
      <LiveKitRoom
        video={roomData.sessionType === 'video'}
        audio={true}
        token={token}
        serverUrl={roomData.livekitUrl}
        data-lk-theme="default"
        style={{ height: '100vh' }}
        onDisconnected={handleDisconnected}
      >
        <VideoConference />
      </LiveKitRoom>
    </div>
  );
}

// ── Inline styles ──────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  centred: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0f172a',
    color: '#f8fafc',
    fontFamily: 'system-ui, sans-serif',
  },
  spinner: {
    width: 48,
    height: 48,
    border: '4px solid #334155',
    borderTop: '4px solid #3d9470',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    marginBottom: 16,
  },
  hint: {
    color: '#94a3b8',
    fontSize: 15,
  },
  btn: {
    background: '#3d9470',
    color: 'white',
    border: 'none',
    borderRadius: 10,
    padding: '12px 28px',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
