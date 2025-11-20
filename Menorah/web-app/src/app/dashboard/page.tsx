'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { api } from '@/lib/api';
import { DashboardStats, TodaySchedule, Booking } from '@/types';
import { format } from 'date-fns';
import Link from 'next/link';
import NotificationCenter from '@/components/Notifications/NotificationCenter';
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

    const debouncedFetchDashboard = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        fetchDashboard();
      }, 1000); // Debounce by 1 second
    };

    const handleNewBooking = (data: any) => {
      debouncedFetchDashboard();
    };

    const handleBookingAssigned = (data: any) => {
      debouncedFetchDashboard();
    };

    const handleBookingScheduled = (data: any) => {
      debouncedFetchDashboard();
    };

    const handleStatusChanged = (data: any) => {
      debouncedFetchDashboard();
    };

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
    // Prevent multiple simultaneous requests
    if (isFetching) {
      return;
    }

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
        // Don't set error for rate limiting - just log it
        if (response.message?.includes('Too many requests')) {
          console.warn('Rate limit reached, will retry later');
          return;
        }
        setError(response.message || 'Failed to load dashboard data');
      }
    } catch (error: any) {
      // Don't set error for rate limiting - just log it
      if (error.message?.includes('Too many requests') || error.status === 429) {
        console.warn('Rate limit reached, will retry later');
        return;
      }
      console.error('Failed to fetch dashboard:', error);
      setError(error.message || 'An error occurred while loading dashboard');
    } finally {
      setLoading(false);
      setIsFetching(false);
    }
  };

  if (isLoading || loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingContent}>
          <div className={styles.spinner}></div>
          <p className={styles.loadingText}>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
      'confirmed': 'success',
      'pending': 'warning',
      'completed': 'info',
      'cancelled': 'danger',
    };
    return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
  };

  return (
    <div className={styles.container}>
      <NotificationCenter />
      
      {successMessage && (
        <div className={`${styles.alert} ${styles.alertSuccess}`}>
          <div className={styles.alertContent}>
            <div className={styles.alertLeft}>
              <svg className={`${styles.alertIcon} ${styles.alertIconSuccess}`} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <p className={styles.alertText}>{successMessage}</p>
            </div>
            <button
              className={styles.alertClose}
              onClick={() => setSuccessMessage(null)}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className={`${styles.alert} ${styles.alertError}`}>
          <div className={styles.alertContent}>
            <div className={styles.alertLeft}>
              <svg className={`${styles.alertIcon} ${styles.alertIconError}`} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <p className={styles.alertText}>{error}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setError(null);
                fetchDashboard();
              }}
            >
              Retry
            </Button>
          </div>
        </div>
      )}

      <nav className={styles.nav}>
        <div className={styles.navContainer}>
          <div className={styles.navContent}>
            <div className={styles.navLeft}>
              <Link href="/dashboard" className={styles.navBrand}>
                <div className={styles.navLogo}>
                  <span className={styles.navLogoText}>M</span>
                </div>
                <h1 className={styles.navTitle}>Menorah Counselor</h1>
              </Link>
              <div className={styles.navLinks}>
                <Link href="/dashboard" className={`${styles.navLink} ${styles.navLinkActive}`}>
                  Dashboard
                </Link>
                <Link href="/bookings" className={styles.navLink}>
                  Bookings
                </Link>
                <Link href="/chat" className={styles.navLink}>
                  Chat
                </Link>
              </div>
            </div>
            <div className={styles.navRight}>
              <div className={styles.userInfo}>
                <p className={styles.userName}>{user?.firstName} {user?.lastName}</p>
                <p className={styles.userRole}>Counsellor</p>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={logout} 
                style={{ 
                  background: 'rgba(255,255,255,0.15)', 
                  color: 'white', 
                  borderColor: 'rgba(255,255,255,0.3)',
                  fontWeight: 'var(--font-weight-semibold)'
                }}
              >
                Logout
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <main className={styles.main}>
        <div className={styles.header}>
          <h2 className={styles.headerTitle}>
            Welcome back, {user?.firstName}! 👋
          </h2>
          <p className={styles.headerSubtitle}>Here's what's happening with your bookings today.</p>
        </div>

        <div className={styles.statsGrid}>
          <Card hover className={styles.statCard}>
            <div className={styles.statContent}>
              <div className={styles.statInfo}>
                <p className={styles.statLabel}>Total Bookings</p>
                <p className={styles.statValue}>{stats?.totalBookings || 0}</p>
              </div>
              <div className={styles.statIcon}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
            </div>
          </Card>

          <Card hover className={styles.statCard}>
            <div className={styles.statContent}>
              <div className={styles.statInfo}>
                <p className={styles.statLabel}>Upcoming Sessions</p>
                <p className={styles.statValue}>{stats?.upcomingSessions || 0}</p>
              </div>
              <div className={styles.statIcon}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
          </Card>

          <Card hover className={styles.statCard}>
            <div className={styles.statContent}>
              <div className={styles.statInfo}>
                <p className={styles.statLabel}>Pending Assignments</p>
                <p className={`${styles.statValue} ${styles.statValueWarning}`}>{stats?.pendingAssignments || 0}</p>
              </div>
              <div className={`${styles.statIcon} ${styles.statIconWarning}`}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </Card>

          <Card hover className={styles.statCard}>
            <div className={styles.statContent}>
              <div className={styles.statInfo}>
                <p className={styles.statLabel}>Monthly Earnings</p>
                <p className={`${styles.statValue} ${styles.statValueSuccess}`}>
                  {stats?.monthlyEarnings?.currency || 'INR'} {stats?.monthlyEarnings?.amount.toFixed(2) || '0.00'}
                </p>
              </div>
              <div className={`${styles.statIcon} ${styles.statIconSuccess}`}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </Card>
        </div>

        <div className={styles.contentGrid}>
          <Card>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>Today's Schedule</h3>
              <Badge variant="info">{todaySchedule.length} sessions</Badge>
            </div>
            <div>
              {todaySchedule.length === 0 ? (
                <div className={styles.emptyState}>
                  <svg className={styles.emptyIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className={styles.emptyText}>No sessions scheduled for today</p>
                </div>
              ) : (
                todaySchedule.map((session) => (
                  <Link
                    key={session.id}
                    href={`/bookings/${session.id}`}
                    className={styles.scheduleItem}
                  >
                    <div className={styles.itemContent}>
                      <div className={styles.itemLeft}>
                        <div className={styles.itemAvatar}>
                          <span className={styles.itemAvatarText}>
                            {session.userName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className={styles.itemInfo}>
                          <p className={styles.itemName}>{session.userName}</p>
                          <p className={styles.itemMeta}>
                            {format(new Date(session.scheduledAt), 'h:mm a')} • {session.sessionType}
                          </p>
                        </div>
                      </div>
                      <div className={styles.itemRight}>
                        {getStatusBadge(session.status)}
                        <svg className={styles.itemArrow} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </Card>

          <Card>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>Recent Bookings</h3>
              <Link href="/bookings">
                <Button variant="ghost" size="sm">View all</Button>
              </Link>
            </div>
            <div>
              {recentBookings.length === 0 ? (
                <div className={styles.emptyState}>
                  <svg className={styles.emptyIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <p className={styles.emptyText}>No recent bookings</p>
                </div>
              ) : (
                recentBookings.map((booking) => (
                  <Link
                    key={booking.id}
                    href={`/bookings/${booking.id}`}
                    className={styles.bookingItem}
                  >
                    <div className={styles.itemContent}>
                      <div className={styles.itemLeft}>
                        <div className={`${styles.itemAvatar} ${styles.itemAvatarSecondary}`}>
                          <span className={styles.itemAvatarText}>
                            {booking.userName.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className={styles.itemInfo}>
                          <p className={styles.itemName}>{booking.userName}</p>
                          <p className={styles.itemMeta}>
                            {format(new Date(booking.scheduledAt), 'MMM d, yyyy h:mm a')}
                          </p>
                        </div>
                      </div>
                      <div className={styles.itemRight}>
                        {getStatusBadge(booking.status)}
                        <svg className={styles.itemArrow} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </Card>
        </div>

        <div className={styles.quickActions}>
          <Card>
            <h3 className={styles.quickActionsTitle}>Quick Actions</h3>
            <div className={styles.quickActionsGrid}>
              <Link href="/bookings?tab=pending">
                <Button variant="primary" size="lg">
                  View Pending Assignments
                </Button>
              </Link>
              <Link href="/bookings">
                <Button variant="outline" size="lg">
                  All Bookings
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
