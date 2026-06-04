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
  roomId:         string;
  livekitUrl:     string;
  livekitToken:   string;
  sessionType:    string;
  counsellorName: string;
  userName:       string;
  status:         string;
}

type PageState = 'loading' | 'ready' | 'in-call' | 'ended' | 'error';

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
      if (res.success && res.data) {
        setRoomData(res.data);
        setPageState('ready');
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

  // ── Ready / In-call ───────────────────────────────────────────────────────
  if (!roomData) return null;

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
        token={roomData.livekitToken}
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
