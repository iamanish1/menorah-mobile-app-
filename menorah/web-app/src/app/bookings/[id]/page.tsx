'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import type { CounsellorBooking } from '@/types';
import { format } from 'date-fns';
import Link from 'next/link';
import ScheduleModal from '@/components/Calendar/ScheduleModal';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import AppLayout from '@/components/layout/AppLayout';
import styles from './page.module.css';

export default function BookingDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { isAuthenticated, isLoading } = useAuth();
  const [booking, setBooking] = useState<CounsellorBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [callLinkForm, setCallLinkForm] = useState({
    provider: 'vsee',
    externalJoinUrl: '',
    externalHostUrl: '',
    externalProviderName: 'VSee',
  });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (params.id && isAuthenticated) {
      fetchBooking();
    }
  }, [params.id, isAuthenticated]);

  const fetchBooking = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.getBookingById(params.id as string);
      if (response.success && response.data) {
        const nextBooking = response.data.booking;
        setBooking(nextBooking);
        if (nextBooking.accessScope === 'assigned' && nextBooking.videoCall) {
          setCallLinkForm({
            provider: nextBooking.videoCall.provider && nextBooking.videoCall.provider !== 'livekit' ? nextBooking.videoCall.provider : 'vsee',
            externalJoinUrl: nextBooking.videoCall.externalJoinUrl || '',
            externalHostUrl: nextBooking.videoCall.externalHostUrl || '',
            externalProviderName: nextBooking.videoCall.externalProviderName || 'VSee',
          });
        }
      } else {
        setError(response.message || 'Failed to load booking');
      }
    } catch (error) {
      console.error('Failed to fetch booking:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async () => {
    if (!booking || booking.accessScope === 'assigned') return;
    try {
      setActionLoading('accept');
      setError(null);
      const response = await api.acceptBooking(booking.id);
      if (response.success) {
        await fetchBooking();
        setSuccessMsg('Booking accepted successfully. Assigned client details are now available.');
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setError(response.message || 'Failed to accept booking');
      }
    } catch (error: any) {
      console.error('Failed to accept booking:', error);
      setError(error.message || 'Failed to accept booking');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSchedule = async (scheduledAt: string) => {
    if (!booking || booking.accessScope !== 'assigned') return;
    try {
      setActionLoading('schedule');
      setScheduleError(null);
      const response = await api.scheduleBooking(booking.id, scheduledAt);
      if (response.success) {
        setShowScheduleModal(false);
        setScheduleError(null);
        await fetchBooking();
        const dt = new Date(scheduledAt).toLocaleString('en-IN', {
          weekday: 'short', day: 'numeric', month: 'short',
          hour: '2-digit', minute: '2-digit',
        });
        setSuccessMsg(`Session scheduled for ${dt}`);
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setScheduleError(response.message || 'Failed to schedule booking');
      }
    } catch (error: any) {
      setScheduleError(error.message || 'Failed to schedule booking');
    } finally {
      setActionLoading(null);
    }
  };

  const handleStartSession = async () => {
    if (!booking || booking.accessScope !== 'assigned') return;
    try {
      setActionLoading('start');
      setError(null);

      if (booking.sessionType === 'video') {
        // For video sessions, navigate directly to the call page.
        // POST /api/video/room/:id/join handles starting the session AND
        // creating the LiveKit room in one atomic step — no separate startSession needed.
        router.push(`/call/${booking.id}`);
      } else {
        // For audio/chat sessions, start explicitly then refresh
        const startResponse = await api.startSession(booking.id);
        if (!startResponse.success) {
          setError(startResponse.message || 'Failed to start session');
          return;
        }
        await fetchBooking();
      }
    } catch (error: any) {
      console.error('Failed to start session:', error);
      setError(error.message || 'Failed to start session');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCompleteSession = async () => {
    if (!booking || booking.accessScope !== 'assigned') return;
    try {
      setActionLoading('complete');
      setError(null);
      const response = await api.completeSession(booking.id);
      if (response.success) {
        fetchBooking();
      } else {
        setError(response.message || 'Failed to complete session');
      }
    } catch (error: any) {
      console.error('Failed to complete session:', error);
      setError(error.message || 'Failed to complete session');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveCallLink = async () => {
    if (!booking || booking.accessScope !== 'assigned') return;
    try {
      setActionLoading('call-link');
      setError(null);
      const response = await api.updateCallLink(booking.id, callLinkForm);
      if (response.success) {
        setSuccessMsg('External session link saved');
        await fetchBooking();
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setError(response.message || 'Failed to save external session link');
      }
    } catch (error: any) {
      setError(error.message || 'Failed to save external session link');
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
      'confirmed': 'success',
      'pending': 'warning',
      'completed': 'info',
      'cancelled': 'danger',
      'in-progress': 'info',
    };
    return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
  };

  if (isLoading || loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingContent}>
          <div className={styles.spinner}></div>
          <p className={styles.loadingText}>Loading booking details...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (!booking) {
    return (
      <div className={styles.notFoundContainer}>
        <Card className={styles.notFoundCard}>
          <svg className={styles.notFoundIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className={styles.notFoundTitle}>Booking not found</h3>
          <p className={styles.notFoundText}>The booking you're looking for doesn't exist or has been removed.</p>
          <Link href="/bookings">
            <Button variant="primary">Back to Bookings</Button>
          </Link>
        </Card>
      </div>
    );
  }

  if (booking.accessScope !== 'assigned') {
    return (
      <AppLayout>
        <div>
          {error && (
            <Card padding="md" className={styles.errorCard}>
              <div className={styles.errorContent}>
                <div className={styles.errorLeft}>
                  <svg className={styles.errorIcon} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 00-1.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <p className={styles.errorText}>{error}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setError(null); fetchBooking(); }}>
                  Retry
                </Button>
              </div>
            </Card>
          )}

          <div className={styles.content}>
            <Card padding="lg" className={styles.headerCard}>
              <div className={styles.headerContent}>
                <div className={styles.headerLeft}>
                  <div className={styles.headerAvatar} aria-hidden="true">
                    <span className={styles.headerAvatarText}>B</span>
                  </div>
                  <div className={styles.headerInfo}>
                    <h2 className={styles.headerName}>New booking request</h2>
                    <p className={styles.headerEmail}>Client details are private until assignment</p>
                  </div>
                </div>
                <div className={styles.headerRight}>
                  {getStatusBadge(booking.status)}
                </div>
              </div>
            </Card>

            <div className={styles.detailsGrid}>
              <div className={styles.mainContent}>
                <Card padding="lg" className={styles.infoCard}>
                  <h3 className={styles.cardHeader}>
                    <svg className={styles.cardIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Session preview
                  </h3>
                  <div className={styles.infoGrid}>
                    <div className={styles.infoItem}>
                      <p className={styles.infoLabel}>Service</p>
                      <p className={styles.infoValue} style={{ textTransform: 'capitalize' }}>{booking.sessionType}</p>
                    </div>
                    <div className={styles.infoItem}>
                      <p className={styles.infoLabel}>Duration</p>
                      <p className={styles.infoValue}>{booking.sessionDuration} minutes</p>
                    </div>
                    <div className={styles.infoItem}>
                      <p className={styles.infoLabel}>Scheduled At</p>
                      <p className={styles.infoValue}>
                        {format(new Date(booking.scheduledAt), 'MMM d, yyyy h:mm a')}
                      </p>
                    </div>
                  </div>
                </Card>

                <Card padding="lg" className={styles.infoCard}>
                  <h3 className={styles.cardHeader}>Privacy-protected preview</h3>
                  <p className={styles.concernsText}>
                    Identity, contact, clinical, emergency-contact, and call details are available only after successful assignment.
                  </p>
                </Card>
              </div>

              <div className={styles.sidebar}>
                <Card padding="lg" className={styles.actionsCard}>
                  <h3 className={styles.actionsTitle}>Actions</h3>
                  <div className={styles.actionsList}>
                    <Button
                      variant="primary"
                      size="lg"
                      className={styles.actionButton}
                      onClick={handleAccept}
                      isLoading={actionLoading === 'accept'}
                      disabled={booking.canAccept === false}
                    >
                      {booking.canAccept === false ? 'Not available' : 'Accept Booking'}
                    </Button>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Allow starting session if booking is confirmed and assigned
  // For instant sessions, counselors can start immediately after acceptance
  // For scheduled sessions, the backend will validate the scheduled time
  const canStart = booking.status === 'confirmed' && booking.assignedAt;
  const canComplete = booking.status === 'in-progress';
  const isExternalCall = booking.videoCall?.joinMode === 'external_link' || (
    booking.videoCall?.provider && booking.videoCall.provider !== 'livekit' && booking.videoCall.provider !== 'disabled'
  );

  return (
    <AppLayout>
      <div>
        {successMsg && (
          <div className={styles.successBanner}>
            <svg className={styles.errorIcon} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <p className={styles.errorText}>{successMsg}</p>
          </div>
        )}

        {error && (
          <Card padding="md" className={styles.errorCard}>
            <div className={styles.errorContent}>
              <div className={styles.errorLeft}>
                <svg className={styles.errorIcon} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <p className={styles.errorText}>{error}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setError(null); fetchBooking(); }}>
                Retry
              </Button>
            </div>
          </Card>
        )}

        {booking && (
          <div className={styles.content}>
            <Card padding="lg" className={styles.headerCard}>
              <div className={styles.headerContent}>
                <div className={styles.headerLeft}>
                  <div className={styles.headerAvatar}>
                    <span className={styles.headerAvatarText}>
                      {booking.userName.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className={styles.headerInfo}>
                    <h2 className={styles.headerName}>{booking.userName}</h2>
                    <p className={styles.headerEmail}>{booking.userEmail}</p>
                  </div>
                </div>
                <div className={styles.headerRight}>
                  {getStatusBadge(booking.status)}
                </div>
              </div>
            </Card>

            <div className={styles.detailsGrid}>
              <div className={styles.mainContent}>
                <Card padding="lg" className={styles.infoCard}>
                  <h3 className={styles.cardHeader}>
                    <svg className={styles.cardIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    User Information
                  </h3>
                  <div className={styles.infoGrid}>
                    <div className={styles.infoItem}>
                      <p className={styles.infoLabel}>Name</p>
                      <p className={styles.infoValue}>{booking.userName}</p>
                    </div>
                    <div className={styles.infoItem}>
                      <p className={styles.infoLabel}>Email</p>
                      <p className={styles.infoValue}>{booking.userEmail}</p>
                    </div>
                    <div className={styles.infoItem}>
                      <p className={styles.infoLabel}>Phone</p>
                      <p className={styles.infoValue}>{booking.userPhone}</p>
                    </div>
                    {booking.userGender && (
                      <div className={styles.infoItem}>
                        <p className={styles.infoLabel}>Gender</p>
                        <p className={styles.infoValue} style={{ textTransform: 'capitalize' }}>{booking.userGender}</p>
                      </div>
                    )}
                  </div>
                </Card>

                <Card padding="lg" className={styles.infoCard}>
                  <h3 className={styles.cardHeader}>
                    <svg className={styles.cardIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Session Details
                  </h3>
                  <div className={styles.infoGrid}>
                    <div className={styles.infoItem}>
                      <p className={styles.infoLabel}>Session Type</p>
                      <p className={styles.infoValue} style={{ textTransform: 'capitalize' }}>{booking.sessionType}</p>
                    </div>
                    <div className={styles.infoItem}>
                      <p className={styles.infoLabel}>Duration</p>
                      <p className={styles.infoValue}>{booking.sessionDuration} minutes</p>
                    </div>
                    <div className={styles.infoItem}>
                      <p className={styles.infoLabel}>Scheduled At</p>
                      <p className={styles.infoValue}>
                        {format(new Date(booking.scheduledAt), 'MMM d, yyyy h:mm a')}
                      </p>
                    </div>
                    {booking.assignedAt && (
                      <div className={styles.infoItem}>
                        <p className={styles.infoLabel}>Assigned At</p>
                        <p className={styles.infoValue}>
                          {format(new Date(booking.assignedAt), 'MMM d, yyyy h:mm a')}
                        </p>
                      </div>
                    )}
                  </div>
                </Card>

                {booking.concerns && (
                  <Card padding="lg" className={styles.infoCard}>
                    <h3 className={styles.cardHeader}>Concerns</h3>
                    <p className={styles.concernsText}>{booking.concerns}</p>
                  </Card>
                )}

                {booking.sessionType === 'video' && (
                  <Card padding="lg" className={styles.infoCard}>
                    <h3 className={styles.cardHeader}>Call Setup</h3>
                    <div className={styles.infoGrid}>
                      <div className={styles.infoItem}>
                        <p className={styles.infoLabel}>Provider</p>
                        <p className={styles.infoValue}>{booking.videoCall?.externalProviderName || booking.videoCall?.provider || 'Not checked'}</p>
                      </div>
                      <div className={styles.infoItem}>
                        <p className={styles.infoLabel}>Region</p>
                        <p className={styles.infoValue}>{booking.videoCall?.region || 'Unknown'}</p>
                      </div>
                      <div className={styles.infoItem}>
                        <p className={styles.infoLabel}>Call Status</p>
                        <p className={styles.infoValue}>{booking.videoCall?.status || 'not_configured'}</p>
                      </div>
                    </div>

                    {isExternalCall && (
                      <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
                        <p style={{ color: '#92400e', fontSize: 13, fontWeight: 600 }}>
                          LiveKit is disabled for UAE sessions. Add an approved external provider link.
                        </p>
                        <select
                          value={callLinkForm.provider}
                          onChange={(event) => setCallLinkForm((current) => ({ ...current, provider: event.target.value }))}
                          className={styles.dateInput}
                        >
                          <option value="vsee">VSee</option>
                          <option value="doxy">DOXY</option>
                          <option value="zoom">Zoom</option>
                          <option value="google_meet">Google Meet</option>
                          <option value="teams">Microsoft Teams</option>
                        </select>
                        <input
                          className={styles.dateInput}
                          placeholder="Participant HTTPS join link"
                          value={callLinkForm.externalJoinUrl}
                          onChange={(event) => setCallLinkForm((current) => ({ ...current, externalJoinUrl: event.target.value }))}
                        />
                        <input
                          className={styles.dateInput}
                          placeholder="Host HTTPS link (optional)"
                          value={callLinkForm.externalHostUrl}
                          onChange={(event) => setCallLinkForm((current) => ({ ...current, externalHostUrl: event.target.value }))}
                        />
                        <Button
                          variant="outline"
                          onClick={handleSaveCallLink}
                          isLoading={actionLoading === 'call-link'}
                        >
                          Save External Link
                        </Button>
                      </div>
                    )}
                  </Card>
                )}

                {booking.symptoms && booking.symptoms.length > 0 && (
                  <Card padding="lg" className={styles.infoCard}>
                    <h3 className={styles.cardHeader}>Symptoms</h3>
                    <div className={styles.symptomsList}>
                      {booking.symptoms.map((symptom, index) => (
                        <Badge key={index} variant="default">{symptom}</Badge>
                      ))}
                    </div>
                  </Card>
                )}

                {booking.goals && booking.goals.length > 0 && (
                  <Card padding="lg" className={styles.infoCard}>
                    <h3 className={styles.cardHeader}>Goals</h3>
                    <ul className={styles.goalsList}>
                      {booking.goals.map((goal, index) => (
                        <li key={index} className={styles.goalItem}>
                          <svg className={styles.goalIcon} fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          <span className={styles.goalText}>{goal}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}

                {booking.emergencyContact && (
                  <Card padding="lg" className={styles.infoCard}>
                    <h3 className={styles.cardHeader}>
                      <svg className={`${styles.cardIcon} ${styles.cardIconDanger}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      Emergency Contact
                    </h3>
                    <div className={`${styles.infoGrid} ${styles.infoGridThree}`}>
                      <div className={styles.infoItem}>
                        <p className={styles.infoLabel}>Name</p>
                        <p className={styles.infoValue}>{booking.emergencyContact.name}</p>
                      </div>
                      <div className={styles.infoItem}>
                        <p className={styles.infoLabel}>Phone</p>
                        <p className={styles.infoValue}>{booking.emergencyContact.phone}</p>
                      </div>
                      <div className={styles.infoItem}>
                        <p className={styles.infoLabel}>Relationship</p>
                        <p className={styles.infoValue}>{booking.emergencyContact.relationship}</p>
                      </div>
                    </div>
                  </Card>
                )}
              </div>

              <div className={styles.sidebar}>
                <Card padding="lg" className={styles.actionsCard}>
                  <h3 className={styles.actionsTitle}>Actions</h3>
                  <div className={styles.actionsList}>
                    <Button
                      variant="outline"
                      size="lg"
                      className={styles.actionButton}
                      onClick={() => setShowScheduleModal(true)}
                      disabled={actionLoading !== null}
                    >
                      Schedule/Reschedule
                    </Button>
                    {canStart && (
                      <Button
                        variant="primary"
                        size="lg"
                        className={styles.actionButton}
                        onClick={handleStartSession}
                        isLoading={actionLoading === 'start'}
                      >
                        Start Session
                      </Button>
                    )}
                    {canComplete && (
                      <Button
                        variant="secondary"
                        size="lg"
                        className={styles.actionButton}
                        onClick={handleCompleteSession}
                        isLoading={actionLoading === 'complete'}
                      >
                        Complete Session
                      </Button>
                    )}
                  </div>
                </Card>
              </div>
            </div>
          </div>
        )}
      </div>

      {showScheduleModal && booking && (
        <ScheduleModal
          booking={booking}
          onSchedule={handleSchedule}
          onClose={() => { setShowScheduleModal(false); setScheduleError(null); }}
          loading={actionLoading === 'schedule'}
          error={scheduleError}
        />
      )}
    </AppLayout>
  );
}
