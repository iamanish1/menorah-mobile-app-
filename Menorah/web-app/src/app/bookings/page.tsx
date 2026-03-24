'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useBookings, usePendingBookings } from '@/hooks/useBookings';
import { Booking } from '@/types';
import { format } from 'date-fns';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import AppLayout from '@/components/layout/AppLayout';
import styles from './page.module.css';

export default function BookingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'all');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<'date' | 'status' | 'name'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const { bookings: allBookings, loading: allLoading, error: allError, refetch: refetchAllBookings } = useBookings(
    activeTab === 'all' ? { status: statusFilter || undefined } : undefined
  );
  const { bookings: pendingBookings, loading: pendingLoading, error: pendingError, refetch: refetchPendingBookings } = usePendingBookings();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  const getBookingsForTab = (): Booking[] => {
    let bookings: Booking[] = [];
    switch (activeTab) {
      case 'pending':
        bookings = pendingBookings;
        break;
      case 'upcoming':
        bookings = allBookings.filter(b => 
          b.status === 'confirmed' && new Date(b.scheduledAt) > new Date()
        );
        break;
      case 'completed':
        bookings = allBookings.filter(b => b.status === 'completed');
        break;
      default:
        bookings = allBookings;
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      bookings = bookings.filter(b => 
        b.userName.toLowerCase().includes(query) ||
        b.userEmail.toLowerCase().includes(query) ||
        b.userPhone.toLowerCase().includes(query) ||
        (b.concerns && b.concerns.toLowerCase().includes(query))
      );
    }

    if (startDate || endDate) {
      bookings = bookings.filter(b => {
        const bookingDate = new Date(b.scheduledAt);
        if (startDate && bookingDate < new Date(startDate)) return false;
        if (endDate && bookingDate > new Date(endDate)) return false;
        return true;
      });
    }

    bookings.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'date':
          comparison = new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'name':
          comparison = a.userName.localeCompare(b.userName);
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return bookings;
  };

  const getLoadingState = (): boolean => {
    if (activeTab === 'pending') return pendingLoading;
    return allLoading;
  };

  const getErrorState = (): string | null => {
    if (activeTab === 'pending') return pendingError;
    return allError;
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

  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingContent}>
          <div className={styles.spinner}></div>
          <p className={styles.loadingText}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const bookings = getBookingsForTab();
  const loading = getLoadingState();

  const tabs = [
    { id: 'all', label: 'All Bookings', count: allBookings.length },
    { id: 'pending', label: 'Pending', count: pendingBookings.length },
    { id: 'upcoming', label: 'Upcoming', count: allBookings.filter(b => b.status === 'confirmed' && new Date(b.scheduledAt) > new Date()).length },
    { id: 'completed', label: 'Completed', count: allBookings.filter(b => b.status === 'completed').length },
  ];

  return (
    <AppLayout>
      <div>
        <div className={styles.header}>
          <h2 className={styles.headerTitle}>Bookings Management</h2>
          <p className={styles.headerSubtitle}>View and manage all your bookings</p>
        </div>

        <Card padding="md" hover={false} className={styles.tabsContainer}>
          <div className={styles.tabs}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={`${styles.tabCount} ${activeTab === tab.id ? styles.tabCountActive : styles.tabCountInactive}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </Card>

        <Card padding="md" className={styles.filtersCard}>
          <div className={styles.filtersGrid}>
            <div className={styles.searchWrapper}>
              <svg className={styles.searchIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Search by name, email, phone, or concerns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <input
              type="date"
              className={styles.dateInput}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <input
              type="date"
              className={styles.dateInput}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          
          <div className={styles.filtersRow}>
            {activeTab === 'all' && (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={styles.select}
              >
                <option value="">All Status</option>
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="in-progress">In Progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            )}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date' | 'status' | 'name')}
              className={styles.select}
            >
              <option value="date">Sort by Date</option>
              <option value="status">Sort by Status</option>
              <option value="name">Sort by Name</option>
            </select>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            >
              {sortOrder === 'asc' ? '↑ Ascending' : '↓ Descending'}
            </Button>
            {(searchQuery || startDate || endDate || statusFilter) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery('');
                  setStartDate('');
                  setEndDate('');
                  setStatusFilter('');
                }}
              >
                Clear Filters
              </Button>
            )}
          </div>
        </Card>

        {getErrorState() && (
          <Card padding="md" className={styles.errorCard}>
            <div className={styles.errorContent}>
              <div className={styles.errorLeft}>
                <svg className={styles.errorIcon} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <div>
                  <h3 className={styles.errorTitle}>Error loading bookings</h3>
                  <p className={styles.errorMessage}>{getErrorState()}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (activeTab === 'pending') {
                    refetchPendingBookings();
                  } else {
                    refetchAllBookings();
                  }
                }}
              >
                Retry
              </Button>
            </div>
          </Card>
        )}

        {loading ? (
          <div className={styles.loadingContainer}>
            <div className={styles.loadingContent}>
              <div className={styles.spinner}></div>
              <p className={styles.loadingText}>Loading bookings...</p>
            </div>
          </div>
        ) : bookings.length === 0 ? (
          <Card>
            <div className={styles.emptyState}>
              <svg className={styles.emptyIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <h3 className={styles.emptyTitle}>No bookings found</h3>
              <p className={styles.emptyText}>Try adjusting your filters or check back later.</p>
            </div>
          </Card>
        ) : (
          <div className={styles.bookingsList}>
            {bookings.map((booking) => (
              <Card key={booking.id} hover padding="md" className={styles.bookingCard}>
                <div className={styles.bookingContent}>
                  <div className={styles.bookingMain}>
                    <div className={styles.bookingHeader}>
                      <div className={styles.bookingAvatar}>
                        <span className={styles.bookingAvatarText}>
                          {booking.userName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className={styles.bookingInfo}>
                        <div className={styles.bookingNameRow}>
                          <h3 className={styles.bookingName}>{booking.userName}</h3>
                          {getStatusBadge(booking.status)}
                          {booking.isSubscriptionBooking && (
                            <Badge variant="info" style={{ marginLeft: '8px' }}>Subscription</Badge>
                          )}
                        </div>
                        <p className={styles.bookingContact}>{booking.userEmail}</p>
                        {booking.userPhone && (
                          <p className={styles.bookingContact}>{booking.userPhone}</p>
                        )}
                      </div>
                    </div>
                    
                    <div className={styles.bookingDetails}>
                      <div className={styles.detailItem}>
                        <svg className={styles.detailIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <div className={styles.detailContent}>
                          <p className={styles.detailLabel}>Type</p>
                          <p className={styles.detailValue}>{booking.sessionType}</p>
                        </div>
                      </div>
                      <div className={styles.detailItem}>
                        <svg className={styles.detailIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className={styles.detailContent}>
                          <p className={styles.detailLabel}>Duration</p>
                          <p className={styles.detailValue}>{booking.sessionDuration} min</p>
                        </div>
                      </div>
                      <div className={styles.detailItem}>
                        <svg className={styles.detailIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <div className={styles.detailContent}>
                          <p className={styles.detailLabel}>Scheduled</p>
                          <p className={styles.detailValue}>
                            {format(new Date(booking.scheduledAt), 'MMM d, h:mm a')}
                          </p>
                        </div>
                      </div>
                      {booking.isSubscriptionBooking ? (
                        <div className={styles.detailItem}>
                          <svg className={`${styles.detailIcon} ${styles.detailIconSuccess}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                          </svg>
                          <div className={styles.detailContent}>
                            <p className={styles.detailLabel}>Payment</p>
                            <p className={styles.detailValue}>Subscription</p>
                          </div>
                        </div>
                      ) : booking.amount ? (
                        <div className={styles.detailItem}>
                          <svg className={`${styles.detailIcon} ${styles.detailIconSuccess}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <div className={styles.detailContent}>
                            <p className={styles.detailLabel}>Amount</p>
                            <p className={styles.detailValue}>
                              {booking.currency} {booking.amount.toFixed(2)}
                            </p>
                          </div>
                        </div>
                      ) : null}
                    </div>
                    
                    {booking.concerns && (
                      <div className={styles.concernsBox}>
                        <p className={styles.concernsLabel}>Concerns</p>
                        <p className={styles.concernsText}>{booking.concerns}</p>
                      </div>
                    )}
                  </div>
                  
                  <div className={styles.bookingActions}>
                    <Link href={`/bookings/${booking.id}`}>
                      <Button variant="primary" size="md" style={{ width: '100%' }}>
                        View Details
                      </Button>
                    </Link>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
