'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { api } from '@/lib/api';
import { DashboardStats, TodaySchedule, Booking } from '@/types';
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
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [todaySchedule, setTodaySchedule] = useState<TodaySchedule[]>([]);
  const [recentBookings, setRecentBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  const { on, off } = useSocket(token);

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

  useEffect(() => {
    if (isAuthenticated) {
      fetchDashboard();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!token || !isAuthenticated) return;

    let debounceTimer: NodeJS.Timeout;
    const debouncedFetch = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { fetchDashboard(); }, 1000);
    };

    const handleNewBooking = () => { debouncedFetch(); };
    const handleBookingAssigned = () => { debouncedFetch(); };
    const handleBookingScheduled = () => { debouncedFetch(); };
    const handleStatusChanged = () => { debouncedFetch(); };

    on('new_booking_available', handleNewBooking);
    on('booking_assigned', handleBookingAssigned);
    on('booking_scheduled', handleBookingScheduled);
    on('booking_status_changed', handleStatusChanged);

    return () => {
      clearTimeout(debounceTimer);
      off('new_booking_available', handleNewBooking);
      off('booking_assigned', handleBookingAssigned);
      off('booking_scheduled', handleBookingScheduled);
      off('booking_status_changed', handleStatusChanged);
    };
  }, [token, on, off, isAuthenticated]);

  const fetchDashboard = async () => {
    if (isFetching) return;
    try {
      setIsFetching(true);
      setLoading(true);
      setError(null);
      const response = await api.getDashboard();
      if (response.success && response.data) {
        setStats(response.data.stats);
        setTodaySchedule(response.data.todaySchedule);
        setRecentBookings(response.data.recentBookings);
      } else {
        if (response.message?.includes('Too many requests')) {
          console.warn('Rate limit reached, will retry later');
          return;
        }
        setError(response.message || 'Failed to load dashboard data');
      }
    } catch (error: any) {
      if (error.message?.includes('Too many requests') || error.status === 429) {
        console.warn('Rate limit reached, will retry later');
        return;
      }
      setError(error.message || 'An error occurred while loading dashboard');
    } finally {
      setLoading(false);
      setIsFetching(false);
    }
  };

  if (isLoading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.spinner}></div>
        <p className={styles.loadingText}>Loading dashboard...</p>
      </div>
    );
  }

  if (!isAuthenticated) return null;

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
      value: `${stats?.monthlyEarnings?.currency || 'AED'} ${(stats?.monthlyEarnings?.amount || 0).toFixed(2)}`,
      icon: (
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      colorClass: styles.statSuccess,
    },
  ];

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
          <Button variant="ghost" size="sm" onClick={() => { setError(null); fetchDashboard(); }}>Retry</Button>
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
