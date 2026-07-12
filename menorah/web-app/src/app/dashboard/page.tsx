'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { DashboardStats, TodaySchedule, Booking, CounsellorStatus } from '@/types';
import { format } from 'date-fns';
import Link from 'next/link';
import AppLayout from '@/components/layout/AppLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import styles from './page.module.css';

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [statusToggling, setStatusToggling] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('auth_token') : null;
  const { on, off } = useSocket(token);
  const queryClient = useQueryClient();

  // ── React Query — replaces manual useState + fetchDashboard ─────────────
  const {
    data:      dashboardData,
    isLoading: loading,
    error:     queryError,
    refetch,
  } = useQuery({
    queryKey:  ['dashboard'],
    queryFn:   () => api.getDashboard(),
    enabled:   isAuthenticated,
    staleTime: 60 * 1000,   // 1 min — dashboard stats change on new bookings
    select: (res) => res.success ? res.data : null,
  });

  const stats            = dashboardData?.stats           ?? null;
  const todaySchedule    = dashboardData?.todaySchedule   ?? [];
  const recentBookings   = dashboardData?.recentBookings  ?? [];
  const [counsellorStatus, setCounsellorStatus] = useState<CounsellorStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sync counsellor status from query result into local state (needed for optimistic toggle)
  useEffect(() => {
    if (dashboardData?.counsellorStatus) {
      setCounsellorStatus(dashboardData.counsellorStatus);
    }
  }, [dashboardData?.counsellorStatus]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const registrationSuccess = sessionStorage.getItem('registrationSuccess');
      const registrationMessage = sessionStorage.getItem('registrationMessage');
      if (registrationSuccess === 'true' && registrationMessage) {
        setSuccessMessage(registrationMessage);
        sessionStorage.removeItem('registrationSuccess');
        sessionStorage.removeItem('registrationMessage');
        setTimeout(() => setSuccessMessage(null), 10000);
      }
    }
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  // React Query handles the initial fetch when isAuthenticated → enabled:true
  // No manual fetchDashboard() needed here.

  // Socket events → invalidate dashboard cache (React Query re-fetches once, not on every event)
  useEffect(() => {
    if (!token || !isAuthenticated) return;
    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    on('new_booking_available', invalidate);
    on('booking_assigned',      invalidate);
    on('booking_scheduled',     invalidate);
    on('booking_status_changed', invalidate);
    return () => {
      off('new_booking_available', invalidate);
      off('booking_assigned',      invalidate);
      off('booking_scheduled',     invalidate);
      off('booking_status_changed', invalidate);
    };
  }, [token, isAuthenticated, on, off, queryClient]);


  if (isLoading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.spinner}></div>
        <p className={styles.loadingText}>Loading dashboard...</p>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const handleToggleAvailability = async () => {
    if (!counsellorStatus || statusToggling) return;
    if (!profileMediaReady) {
      router.push('/profile#profile-media');
      return;
    }
    const newStatus = !counsellorStatus.isAvailable;
    setStatusToggling(true);
    // Optimistic update — show change immediately, then re-validate from server
    setCounsellorStatus(prev => prev ? { ...prev, isAvailable: newStatus } : prev);
    const response = await api.updateAvailabilityStatus(newStatus);
    setStatusToggling(false);
    if (response.success) {
      // Invalidate so the next background fetch gets the server truth
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } else {
      // Roll back on failure
      setCounsellorStatus(prev => prev ? { ...prev, isAvailable: !newStatus } : prev);
      setError(response.message || 'Failed to update availability');
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
      'confirmed': 'success',
      'pending': 'warning',
      'completed': 'info',
      'cancelled': 'danger',
      'in-progress': 'warning',
    };
    return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
  };

  const statCards = [
    {
      label: 'Total Bookings',
      value: stats?.totalBookings || 0,
      icon: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
      colorClass: styles.statDefault,
    },
    {
      label: 'Upcoming Sessions',
      value: stats?.upcomingSessions || 0,
      icon: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      colorClass: styles.statInfo,
    },
    {
      label: 'Pending Assignments',
      value: stats?.pendingAssignments || 0,
      icon: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      colorClass: styles.statWarning,
    },
    {
      label: 'Monthly Earnings',
      value: `${stats?.monthlyEarnings?.currency || 'INR'} ${(stats?.monthlyEarnings?.amount || 0).toFixed(2)}`,
      icon: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      colorClass: styles.statSuccess,
    },
  ];
  const profileMediaReady = Boolean(counsellorStatus?.profileMediaComplete);
  const effectiveAvailability = Boolean(counsellorStatus?.isAvailable && profileMediaReady);

  return (
    <AppLayout>
      {successMessage && (
        <div className={styles.alertSuccess}>
          <svg fill="currentColor" viewBox="0 0 20 20" width="20" height="20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <p>{successMessage}</p>
          <button onClick={() => setSuccessMessage(null)} className={styles.alertClose}>&#x2715;</button>
        </div>
      )}

      {error && (
        <div className={styles.alertError}>
          <svg fill="currentColor" viewBox="0 0 20 20" width="20" height="20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <p>{error}</p>
          <Button variant="ghost" size="sm" onClick={() => { setError(null); refetch(); }}>Retry</Button>
        </div>
      )}

      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Welcome back, {user?.firstName}!</h1>
          <p className={styles.pageSubtitle}>Here&apos;s what&apos;s happening with your bookings today.</p>
        </div>
        <Link href="/bookings?tab=pending">
          <Button variant="primary" size="md">View Pending</Button>
        </Link>
      </div>

      {counsellorStatus && (
        <div className={effectiveAvailability ? styles.availabilityBannerGreen : styles.availabilityBannerOrange}>
          <div className={styles.availabilityBannerLeft}>
            <span className={effectiveAvailability ? styles.availabilityDotGreen : styles.availabilityDotOrange} />
            <span className={styles.availabilityBannerText}>
              {effectiveAvailability
                ? 'You are available to accept bookings'
                : counsellorStatus.message || 'Complete your profile setup before going live'}
            </span>
          </div>
          <Button
            variant={effectiveAvailability ? 'outline' : 'primary'}
            size="sm"
            onClick={handleToggleAvailability}
            isLoading={statusToggling}
            disabled={statusToggling}
          >
            {!profileMediaReady
              ? 'Complete Profile Setup'
              : effectiveAvailability
              ? 'Set Unavailable'
              : 'Set Available'}
          </Button>
        </div>
      )}

      {counsellorStatus && !profileMediaReady && (
        <div className={styles.profileMediaBanner}>
          <div>
            <h2 className={styles.profileMediaTitle}>Finish your public profile</h2>
            <p className={styles.profileMediaText}>
              Add your mandatory selfie and voice intro so users can see you on Menorah.
            </p>
          </div>
          <Link href="/profile">
            <Button variant="primary" size="sm">Complete Profile</Button>
          </Link>
        </div>
      )}

      {loading ? (
        <div className={styles.skeletonGrid}>
          {[1, 2, 3, 4].map(i => <div key={i} className={styles.skeletonCard} />)}
        </div>
      ) : (
        <div className={styles.statsGrid}>
          {statCards.map((card, i) => (
            <div key={i} className={`${styles.statCard} ${card.colorClass}`}>
              <div className={styles.statIconBox}>{card.icon}</div>
              <div>
                <p className={styles.statLabel}>{card.label}</p>
                <p className={styles.statValue}>{card.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.contentGrid}>
        <Card>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>Today&apos;s Schedule</h3>
            <Badge variant="info" size="sm">{todaySchedule.length} sessions</Badge>
          </div>
          {loading ? (
            <div className={styles.skeletonList}>
              {[1, 2, 3].map(i => <div key={i} className={styles.skeletonItem} />)}
            </div>
          ) : todaySchedule.length === 0 ? (
            <div className={styles.emptyState}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className={styles.emptyIcon}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p>No sessions scheduled for today</p>
            </div>
          ) : (
            <div className={styles.listItems}>
              {todaySchedule.map((session) => (
                <Link key={session.id} href={`/bookings/${session.id}`} className={styles.listItem}>
                  <div className={styles.listItemAvatar}>
                    {session.userName.charAt(0).toUpperCase()}
                  </div>
                  <div className={styles.listItemInfo}>
                    <p className={styles.listItemName}>{session.userName}</p>
                    <p className={styles.listItemMeta}>
                      {format(new Date(session.scheduledAt), 'h:mm a')} &middot; {session.sessionType}
                    </p>
                  </div>
                  <div className={styles.listItemRight}>
                    {getStatusBadge(session.status)}
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className={styles.arrow}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>Recent Bookings</h3>
            <Link href="/bookings">
              <Button variant="ghost" size="sm">View all</Button>
            </Link>
          </div>
          {loading ? (
            <div className={styles.skeletonList}>
              {[1, 2, 3].map(i => <div key={i} className={styles.skeletonItem} />)}
            </div>
          ) : recentBookings.length === 0 ? (
            <div className={styles.emptyState}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className={styles.emptyIcon}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p>No recent bookings</p>
            </div>
          ) : (
            <div className={styles.listItems}>
              {recentBookings.map((booking) => (
                <Link key={booking.id} href={`/bookings/${booking.id}`} className={styles.listItem}>
                  <div className={`${styles.listItemAvatar} ${styles.listItemAvatarAccent}`}>
                    {booking.userName.charAt(0).toUpperCase()}
                  </div>
                  <div className={styles.listItemInfo}>
                    <p className={styles.listItemName}>{booking.userName}</p>
                    <p className={styles.listItemMeta}>
                      {format(new Date(booking.scheduledAt), 'MMM d, yyyy · h:mm a')}
                    </p>
                  </div>
                  <div className={styles.listItemRight}>
                    {getStatusBadge(booking.status)}
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className={styles.arrow}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AppLayout>
  );
}
