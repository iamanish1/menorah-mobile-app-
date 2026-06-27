'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, PhoneOff, Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Spinner } from '@/components/ui';
import { connectSocket } from '@/lib/socket';
import dynamic from 'next/dynamic';
import '@livekit/components-styles';
import type { Booking } from '@/types';

const LiveKitRoom = dynamic(
  () => import('@livekit/components-react').then((m) => m.LiveKitRoom),
  { ssr: false }
);
const VideoConference = dynamic(
  () => import('@livekit/components-react').then((m) => m.VideoConference),
  { ssr: false }
);

type PageState =
  | 'loading'
  | 'waiting'
  | 'joining'
  | 'in-call'
  | 'external'
  | 'not-configured'
  | 'disabled'
  | 'ended'
  | 'cancelled'
  | 'completed'
  | 'error';

interface RoomData {
  provider?: string;
  joinMode?: string;
  livekitToken?: string;
  token?: string;
  livekitUrl?: string;
  joinUrl?: string;
  externalJoinUrl?: string;
  providerName?: string;
  externalProviderName?: string;
  region?: string;
  status?: string;
  message?: string;
  counsellorName: string;
  duration: number;
}

export default function VideoCallPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const router = useRouter();

  const [pageState, setPageState] = useState<PageState>('loading');
  const [booking, setBooking]     = useState<Booking | null>(null);
  const [roomData, setRoomData]   = useState<RoomData | null>(null);
  const [errorMsg, setErrorMsg]   = useState('');
  const [elapsed, setElapsed]     = useState(0);
  const [overTime, setOverTime]   = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fatalError = useCallback((msg: string) => {
    setErrorMsg(msg);
    setPageState('error');
  }, []);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const joinRoom = useCallback(async () => {
    setPageState('joining');
    try {
      const res = await api.joinVideoRoom(bookingId);
      if (!res.success || !res.data) {
        const failedData = res.data as RoomData | undefined;
        if (failedData?.joinMode === 'external_link' || failedData?.status === 'not_configured') {
          setRoomData(failedData);
          setPageState('not-configured');
          return;
        }
        if (failedData?.joinMode === 'disabled' || failedData?.provider === 'disabled') {
          setRoomData(failedData);
          setPageState('disabled');
          return;
        }
        if (res.message?.toLowerCase().includes('not been started')) {
          setPageState('waiting');
          return;
        }
        fatalError(res.message || 'Failed to join session. Please try again.');
        return;
      }
      const next = res.data as RoomData;
      setRoomData(next);
      if (next.provider === 'livekit' && next.joinMode === 'in_app' && next.livekitUrl && (next.livekitToken || next.token)) {
        setPageState('in-call');
        return;
      }
      if (next.joinMode === 'external_link') {
        setPageState(next.joinUrl || next.externalJoinUrl ? 'external' : 'not-configured');
        return;
      }
      if (next.joinMode === 'disabled' || next.provider === 'disabled') {
        setPageState('disabled');
        return;
      }
      fatalError(next.message || 'Failed to join session. Please try again.');
    } catch {
      fatalError('Failed to connect to session. Please check your connection.');
    }
  }, [bookingId, fatalError]);

  // Start elapsed timer when call begins
  useEffect(() => {
    if (pageState !== 'in-call') return;
    const start    = Date.now();
    const duration = (roomData?.duration ?? 0) * 60 * 1000;
    timerRef.current = setInterval(() => {
      const secs = Math.floor((Date.now() - start) / 1000);
      setElapsed(secs);
      if (duration > 0 && Date.now() - start > duration) setOverTime(true);
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [pageState, roomData?.duration]);

  // Initial booking fetch
  useEffect(() => {
    const init = async () => {
      const res = await api.getBooking(bookingId);
      if (!res.success || !res.data?.booking) {
        fatalError('Booking not found. Please check the link and try again.');
        return;
      }

      const b = res.data.booking;
      setBooking(b);

      if (b.sessionType !== 'video') {
        fatalError(`This is a ${b.sessionType} session. Video call is not available.`);
        return;
      }

      switch (b.status) {
        case 'pending':
          fatalError('Your session is not confirmed yet. A counsellor needs to be assigned first.');
          break;
        case 'cancelled':
          setPageState('cancelled');
          break;
        case 'completed':
        case 'no-show':
          setPageState('completed');
          break;
        case 'confirmed':
          setPageState('waiting');
          break;
        case 'in-progress':
          await joinRoom();
          break;
        default:
          fatalError('Unexpected session status. Please contact support.');
      }
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  // Socket.IO — auto-join when counsellor starts; end when session completes
  useEffect(() => {
    const socket = connectSocket();
    if (!socket) return;

    const onSessionStarted = (data: { bookingId: string }) => {
      if (data.bookingId !== bookingId) return;
      joinRoom();
    };

    const onStatusChanged = (data: { bookingId: string; status: string }) => {
      if (data.bookingId !== bookingId) return;
      if (data.status === 'completed') setPageState('ended');
      else if (data.status === 'cancelled') setPageState('cancelled');
    };

    socket.on('session_started',        onSessionStarted);
    socket.on('booking_status_changed', onStatusChanged);

    return () => {
      socket.off('session_started',        onSessionStarted);
      socket.off('booking_status_changed', onStatusChanged);
    };
  }, [bookingId, joinRoom]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ── Render helpers ─────────────────────────────────────────────────────────

  const topBar = (title?: string, subtitle?: string) => (
    <div className="flex items-center justify-between px-4 py-3 bg-gray-800/80 backdrop-blur-sm">
      <button
        onClick={() => router.back()}
        className="p-2 rounded-lg hover:bg-gray-700 text-white transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>
      <div className="text-center">
        <p className="text-white font-medium text-sm">
          {title ?? (booking ? `Session with ${booking.counsellorName ?? 'Counsellor'}` : '')}
        </p>
        {subtitle && <p className="text-gray-400 text-xs">{subtitle}</p>}
      </div>
      <div className="w-9" />
    </div>
  );

  // ── Loading ────────────────────────────────────────────────────────────────

  if (pageState === 'loading') {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col">
        {topBar('Loading session…')}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <Spinner size="lg" className="mx-auto" />
            <p className="text-gray-400">Checking session status…</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Waiting (counsellor hasn't started) ────────────────────────────────────

  if (pageState === 'waiting') {
    const scheduledAt = booking?.scheduledAt
      ? new Date(booking.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : null;

    return (
      <div className="min-h-screen bg-gray-900 flex flex-col">
        {topBar()}
        <div className="flex-1 flex flex-col items-center justify-center space-y-6 px-4 text-white">
          <div className="w-24 h-24 bg-primary-600 rounded-full flex items-center justify-center mx-auto text-3xl font-bold">
            {booking?.counsellorName?.charAt(0) ?? '?'}
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-xl font-semibold">{booking?.counsellorName ?? 'Your Counsellor'}</h2>
            <p className="text-gray-400">
              {scheduledAt
                ? `Session scheduled for ${scheduledAt}`
                : `${booking?.sessionDuration ?? 0} min ${booking?.sessionType} session`}
            </p>
          </div>

          <div className="bg-gray-800 rounded-2xl p-6 text-center max-w-sm w-full space-y-3">
            <Spinner size="md" className="mx-auto" />
            <p className="text-gray-300 font-medium">Waiting for counsellor to start…</p>
            <p className="text-gray-500 text-sm">
              You will be admitted automatically once your counsellor begins the session.
            </p>
          </div>

          <Button variant="secondary" onClick={() => router.push('/bookings')}>
            Leave waiting room
          </Button>
        </div>
      </div>
    );
  }

  // ── Joining (calling API) ──────────────────────────────────────────────────

  if (pageState === 'joining') {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col">
        {topBar()}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <Spinner size="lg" className="mx-auto" />
            <p className="text-gray-400">Connecting to session…</p>
          </div>
        </div>
      </div>
    );
  }

  if (pageState === 'external' && roomData) {
    const joinUrl = roomData.joinUrl || roomData.externalJoinUrl;
    const providerName = roomData.providerName || roomData.externalProviderName || 'external provider';
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col">
        {topBar('External Session')}
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-4 text-white max-w-sm">
            <h2 className="text-2xl font-bold">Join on {providerName}</h2>
            <p className="text-gray-400">This session uses an approved external provider link.</p>
            <Button onClick={() => { if (joinUrl) window.location.href = joinUrl; }}>Open session link</Button>
            <Button variant="secondary" onClick={() => router.push(`/bookings/${bookingId}`)}>Back to booking</Button>
          </div>
        </div>
      </div>
    );
  }

  if (pageState === 'not-configured') {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col">
        {topBar('Session Link Pending')}
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-4 text-white max-w-sm">
            <Clock className="w-10 h-10 text-primary-400 mx-auto" />
            <h2 className="text-2xl font-bold">Session link not ready</h2>
            <p className="text-gray-400">{roomData?.message || 'Your secure video session link is not ready yet. Please wait for your counsellor or admin to prepare it.'}</p>
            <Button variant="secondary" onClick={() => router.push(`/bookings/${bookingId}`)}>Back to booking</Button>
          </div>
        </div>
      </div>
    );
  }

  if (pageState === 'disabled') {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col">
        {topBar('Calling Unavailable')}
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-4 text-white max-w-sm">
            <PhoneOff className="w-10 h-10 text-red-400 mx-auto" />
            <h2 className="text-2xl font-bold">Calling unavailable</h2>
            <p className="text-gray-400">{roomData?.message || 'Video calling is not available until your region is verified.'}</p>
            <Button variant="secondary" onClick={() => router.push(`/bookings/${bookingId}`)}>Back to booking</Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Cancelled ──────────────────────────────────────────────────────────────

  if (pageState === 'cancelled') {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col">
        {topBar('Session Cancelled')}
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-4 text-white max-w-sm">
            <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
              <PhoneOff className="w-10 h-10 text-red-400" />
            </div>
            <h2 className="text-2xl font-bold">Session Cancelled</h2>
            <p className="text-gray-400">This session has been cancelled.</p>
            <Button onClick={() => router.push('/bookings')}>Back to Bookings</Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Completed (already done before user arrived) ───────────────────────────

  if (pageState === 'completed') {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col">
        {topBar('Session Complete')}
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-4 text-white max-w-sm">
            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
              <Clock className="w-10 h-10 text-green-400" />
            </div>
            <h2 className="text-2xl font-bold">Session Completed</h2>
            <p className="text-gray-400">This session has already ended.</p>
            <Button onClick={() => router.push(`/bookings/${bookingId}`)}>View Booking</Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Ended (counsellor ended session while user was in call) ───────────────

  if (pageState === 'ended') {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col">
        {topBar('Session Ended')}
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-4 text-white max-w-sm">
            <div className="w-20 h-20 bg-primary-500/20 rounded-full flex items-center justify-center mx-auto">
              <PhoneOff className="w-10 h-10 text-primary-400" />
            </div>
            <h2 className="text-2xl font-bold">Session Ended</h2>
            <p className="text-gray-400">Your counsellor has ended the session. Thank you for attending.</p>
            <Button onClick={() => router.push(`/bookings/${bookingId}`)}>View Booking</Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────

  if (pageState === 'error') {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col">
        {topBar('Error')}
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-4 text-white max-w-sm">
            <p className="text-red-400">{errorMsg}</p>
            <Button variant="secondary" onClick={() => router.push('/bookings')}>
              My Bookings
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── In-call — LiveKit ──────────────────────────────────────────────────────

	if (pageState === 'in-call' && roomData) {
    const token = roomData.livekitToken || roomData.token;
    if (!roomData.livekitUrl || !token) return null;
    return (
      <div style={{ width: '100vw', height: '100vh', background: '#0f172a', position: 'relative' }}>
        {/* Timer overlay */}
        <div
          style={{
            position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
            zIndex: 20, pointerEvents: 'none',
          }}
        >
          <div
            style={{
              padding: '4px 12px', borderRadius: 9999, fontSize: 13,
              fontFamily: 'monospace', color: '#fff', backdropFilter: 'blur(4px)',
              background: overTime ? 'rgba(220,38,38,0.8)' : 'rgba(0,0,0,0.5)',
            }}
          >
            {overTime && <span style={{ marginRight: 4 }}>+</span>}
            {formatTime(elapsed)}
            {overTime && <span style={{ marginLeft: 8, fontSize: 11 }}>Session time exceeded</span>}
          </div>
        </div>

        <LiveKitRoom
          video={true}
	          audio={true}
	          token={token}
	          serverUrl={roomData.livekitUrl}
          data-lk-theme="default"
          style={{ height: '100vh' }}
          onDisconnected={() => {
            if (timerRef.current) clearInterval(timerRef.current);
            router.push(`/bookings/${bookingId}`);
          }}
        >
          <VideoConference />
        </LiveKitRoom>
      </div>
    );
  }

  return null;
}
