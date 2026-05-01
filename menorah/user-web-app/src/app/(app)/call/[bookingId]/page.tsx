'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Mic, MicOff, Video, VideoOff, PhoneOff, Clock, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Spinner } from '@/components/ui';
import { getSocket, connectSocket } from '@/lib/socket';
import type { VideoRoom, Booking } from '@/types';

declare global {
  interface Window {
    JitsiMeetExternalAPI: new (
      domain: string,
      options: Record<string, unknown>
    ) => JitsiInstance;
  }
}

interface JitsiInstance {
  dispose: () => void;
  executeCommand: (command: string, ...args: unknown[]) => void;
  addEventListeners: (listeners: Record<string, unknown>) => void;
}

// ── Page states ────────────────────────────────────────────────────────────────
type PageState =
  | 'loading'      // fetching booking
  | 'waiting'      // booking confirmed, counsellor hasn't started yet
  | 'sdk-loading'  // booking in-progress, loading Jitsi SDK
  | 'ready'        // SDK loaded, pre-call screen
  | 'in-call'      // Jitsi iframe active
  | 'ended'        // session completed by counsellor
  | 'cancelled'    // booking cancelled
  | 'completed'    // booking was already completed before arriving
  | 'error';       // any fatal error

export default function VideoCallPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const router = useRouter();

  const [pageState, setPageState] = useState<PageState>('loading');
  const [booking, setBooking]     = useState<Booking | null>(null);
  const [room, setRoom]           = useState<VideoRoom | null>(null);
  const [errorMsg, setErrorMsg]   = useState('');
  const [isMuted, setIsMuted]     = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [elapsed, setElapsed]     = useState(0); // seconds since call joined
  const [overTime, setOverTime]   = useState(false);

  const jitsiRef     = useRef<JitsiInstance | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const sdkLoadedRef = useRef(false);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const fatalError = (msg: string) => {
    setErrorMsg(msg);
    setPageState('error');
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // ── Load Jitsi SDK and join room ───────────────────────────────────────────

  const loadSDKAndJoin = useCallback(async () => {
    setPageState('sdk-loading');

    try {
      const res = await api.joinVideoRoom(bookingId);
      if (!res.success || !res.data) {
        // "Session has not been started by the counsellor yet" → go to waiting
        if (res.message?.toLowerCase().includes('not been started')) {
          setPageState('waiting');
          return;
        }
        fatalError(res.message || 'Failed to join video room');
        return;
      }
      setRoom(res.data);
    } catch {
      fatalError('Failed to connect to session');
      return;
    }

    if (sdkLoadedRef.current) {
      setPageState('ready');
      return;
    }

    const domain = process.env.NEXT_PUBLIC_JITSI_DOMAIN || 'meet.jit.si';
    const script  = document.createElement('script');
    script.src    = `https://${domain}/external_api.js`;
    script.async  = true;
    script.onload = () => {
      sdkLoadedRef.current = true;
      setPageState('ready');
    };
    script.onerror = () => fatalError('Failed to load video SDK. Please check your connection.');
    document.head.appendChild(script);
  }, [bookingId]);

  // ── Initial booking fetch ──────────────────────────────────────────────────

  useEffect(() => {
    const init = async () => {
      const res = await api.getBooking(bookingId);

      if (!res.success || !res.data?.booking) {
        const msg = res.message || 'Booking not found';
        if (msg.toLowerCase().includes('not found')) {
          fatalError('Booking not found. Please check the link and try again.');
        } else if (msg.toLowerCase().includes('access')) {
          fatalError('You do not have access to this session.');
        } else {
          fatalError(msg);
        }
        return;
      }

      const b = res.data.booking;
      setBooking(b);

      // Non-video sessions cannot use this page
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
          // Counsellor hasn't started yet — show waiting room
          setPageState('waiting');
          break;
        case 'in-progress':
          // Ready to join
          await loadSDKAndJoin();
          break;
        default:
          fatalError('Unexpected session status. Please contact support.');
      }
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  // ── Socket.IO listeners ────────────────────────────────────────────────────

  useEffect(() => {
    const socket = connectSocket();
    if (!socket) return;

    const onSessionStarted = (data: { bookingId: string }) => {
      if (data.bookingId !== bookingId) return;
      // Counsellor just started — move from waiting room to call
      loadSDKAndJoin();
    };

    const onStatusChanged = (data: { bookingId: string; status: string }) => {
      if (data.bookingId !== bookingId) return;
      if (data.status === 'completed') {
        // Counsellor ended the session
        jitsiRef.current?.dispose();
        jitsiRef.current = null;
        if (timerRef.current) clearInterval(timerRef.current);
        setPageState('ended');
      } else if (data.status === 'cancelled') {
        jitsiRef.current?.dispose();
        jitsiRef.current = null;
        if (timerRef.current) clearInterval(timerRef.current);
        setPageState('cancelled');
      }
    };

    socket.on('session_started', onSessionStarted);
    socket.on('booking_status_changed', onStatusChanged);

    return () => {
      socket.off('session_started', onSessionStarted);
      socket.off('booking_status_changed', onStatusChanged);
    };
  }, [bookingId, loadSDKAndJoin]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      jitsiRef.current?.dispose();
      jitsiRef.current = null;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ── Start Jitsi iframe ─────────────────────────────────────────────────────

  const startJitsi = useCallback(() => {
    if (!room || !containerRef.current || !window.JitsiMeetExternalAPI) return;

    const domain = process.env.NEXT_PUBLIC_JITSI_DOMAIN || 'meet.jit.si';

    // Only pass jwt when the backend generated a real token (requires JITSI_APP_ID/SECRET).
    // The public meet.jit.si server works without authentication — passing a null/invalid
    // jwt will cause a "JWT validation failed" error in the Jitsi iframe.
    const jitsiOptions: Record<string, unknown> = {
      roomName:   room.roomId,
      parentNode: containerRef.current,
      width:      '100%',
      height:     '100%',
      configOverwrite: {
        startWithAudioMuted:     isMuted,
        startWithVideoMuted:     isVideoOff,
        disableDeepLinking:      true,
        enableNoisyMicDetection: true,
      },
      interfaceConfigOverwrite: {
        TOOLBAR_BUTTONS: ['microphone', 'camera', 'closedcaptions', 'desktop', 'fullscreen', 'hangup', 'chat', 'raisehand', 'tileview'],
        SHOW_JITSI_WATERMARK:        false,
        SHOW_WATERMARK_FOR_GUESTS:   false,
        DEFAULT_REMOTE_DISPLAY_NAME: room.counsellorName,
      },
      userInfo: {
        displayName: room.userName,
      },
    };

    if (room.jitsiToken) {
      jitsiOptions.jwt = room.jitsiToken;
    }

    jitsiRef.current = new window.JitsiMeetExternalAPI(domain, jitsiOptions);

    jitsiRef.current.addEventListeners({
      readyToClose:         () => handleLeaveCall(),
      videoConferenceLeft:  () => handleLeaveCall(),
    });

    setPageState('in-call');

    // Start elapsed-time counter
    const start = Date.now();
    const duration = (booking?.sessionDuration ?? 0) * 60 * 1000;
    timerRef.current = setInterval(() => {
      const secs = Math.floor((Date.now() - start) / 1000);
      setElapsed(secs);
      if (duration > 0 && Date.now() - start > duration) {
        setOverTime(true);
      }
    }, 1000);
  }, [room, isMuted, isVideoOff, booking]);

  // ── User leaves call (does NOT complete the session — only counsellor does) ─

  const handleLeaveCall = useCallback(() => {
    jitsiRef.current?.dispose();
    jitsiRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    // Navigate back — do NOT call leaveVideoRoom because that would
    // complete the session server-side. Only the counsellor's side calls that.
    router.push(`/bookings/${bookingId}`);
  }, [bookingId, router]);

  const toggleMute = () => {
    jitsiRef.current?.executeCommand('toggleAudio');
    setIsMuted(p => !p);
  };

  const toggleVideo = () => {
    jitsiRef.current?.executeCommand('toggleVideo');
    setIsVideoOff(p => !p);
  };

  // ── Render helpers ─────────────────────────────────────────────────────────

  const topBar = (title?: string, subtitle?: string) => (
    <div className="flex items-center justify-between px-4 py-3 bg-gray-800/80 backdrop-blur-sm">
      <button
        onClick={() => router.back()}
        className="p-2 rounded-lg hover:bg-gray-700 text-white transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>
      {(title || booking) && (
        <div className="text-center">
          <p className="text-white font-medium text-sm">
            {title ?? `Session with ${booking?.counsellorName ?? 'Counsellor'}`}
          </p>
          {subtitle && <p className="text-gray-400 text-xs">{subtitle}</p>}
        </div>
      )}
      <div className="w-9" />
    </div>
  );

  // ── State: loading ─────────────────────────────────────────────────────────

  if (pageState === 'loading') {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col">
        {topBar('Loading session…')}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <Spinner size="lg" className="mx-auto border-white border-t-primary-400" />
            <p className="text-gray-400">Checking session status…</p>
          </div>
        </div>
      </div>
    );
  }

  // ── State: waiting (counsellor hasn't started) ─────────────────────────────

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
            <Loader2 className="w-8 h-8 animate-spin text-primary-400 mx-auto" />
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

  // ── State: sdk-loading ─────────────────────────────────────────────────────

  if (pageState === 'sdk-loading') {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col">
        {topBar()}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <Spinner size="lg" className="mx-auto border-white border-t-primary-400" />
            <p className="text-gray-400">Connecting to session…</p>
          </div>
        </div>
      </div>
    );
  }

  // ── State: cancelled ───────────────────────────────────────────────────────

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

  // ── State: completed (already done before user arrived) ────────────────────

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

  // ── State: ended (counsellor ended session while user was in call / waiting) ─

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

  // ── State: error ───────────────────────────────────────────────────────────

  if (pageState === 'error') {
    return (
      <div className="min-h-screen bg-gray-900 flex flex-col">
        {topBar('Error')}
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center space-y-4 text-white max-w-sm">
            <p className="text-red-400">{errorMsg}</p>
            <div className="flex gap-3 justify-center">
              <Button variant="secondary" onClick={() => router.push('/bookings')}>
                My Bookings
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── States: ready + in-call ────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Top bar — only shown when not fully in-call */}
      {pageState !== 'in-call' && (
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800/80 backdrop-blur-sm">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-lg hover:bg-gray-700 text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          {room && (
            <div className="text-center">
              <p className="text-white font-medium text-sm">Session with {room.counsellorName}</p>
              <p className="text-gray-400 text-xs">{room.duration} min session</p>
            </div>
          )}
          <div className="w-9" />
        </div>
      )}

      {/* Pre-call screen */}
      {pageState === 'ready' && room && (
        <div className="flex-1 flex flex-col items-center justify-center space-y-6 px-4">
          <div className="text-center space-y-3 text-white">
            <div className="w-24 h-24 bg-primary-600 rounded-full flex items-center justify-center mx-auto text-3xl font-bold">
              {room.counsellorName.charAt(0)}
            </div>
            <h2 className="text-xl font-semibold">{room.counsellorName}</h2>
            <p className="text-gray-400">Ready to join your {room.sessionType} session</p>
          </div>

          <div className="flex gap-4">
            <button
              onClick={toggleMute}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors
                ${isMuted ? 'bg-red-500 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'}`}
            >
              {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
            </button>
            <button
              onClick={toggleVideo}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors
                ${isVideoOff ? 'bg-red-500 text-white' : 'bg-gray-700 text-white hover:bg-gray-600'}`}
            >
              {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
            </button>
          </div>

          <Button size="lg" className="px-10" onClick={startJitsi}>
            Join Session
          </Button>
        </div>
      )}

      {/* Jitsi iframe container */}
      <div className={`flex-1 relative ${pageState === 'in-call' ? 'block' : 'hidden'}`}>
        <div ref={containerRef} className="absolute inset-0" />

        {/* In-call overlay controls */}
        {pageState === 'in-call' && (
          <>
            {/* Timer */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
              <div className={`px-3 py-1 rounded-full text-sm font-mono text-white backdrop-blur-sm
                ${overTime ? 'bg-red-600/80' : 'bg-black/50'}`}>
                {overTime && <span className="mr-1">+</span>}
                {formatTime(elapsed)}
                {overTime && <span className="ml-2 text-xs">Session time exceeded</span>}
              </div>
            </div>

            {/* Leave button */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
              <button
                onClick={handleLeaveCall}
                className="w-14 h-14 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white shadow-lg transition-colors"
              >
                <PhoneOff className="w-6 h-6" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
