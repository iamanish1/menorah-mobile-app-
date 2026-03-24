'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import NotificationCenter from '@/components/Notifications/NotificationCenter';
import styles from './AppLayout.module.css';

interface AppLayoutProps {
  children: React.ReactNode;
}

const navItems = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    href: '/bookings',
    label: 'Bookings',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    href: '/chat',
    label: 'Chat',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    href: '/profile',
    label: 'Profile',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="20" height="20">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
];

export default function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  // Close sidebar on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const sidebar = document.getElementById('app-sidebar');
      const toggle = document.getElementById('sidebar-toggle');
      if (sidebarOpen && sidebar && !sidebar.contains(e.target as Node) && !toggle?.contains(e.target as Node)) {
        setSidebarOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [sidebarOpen]);

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  return (
    <div className={styles.layout}>
      <NotificationCenter />

      {/* Sidebar Overlay (mobile) */}
      {sidebarOpen && (
        <div className={styles.overlay} onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        id="app-sidebar"
        className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}
      >
        {/* Brand */}
        <div className={styles.sidebarBrand}>
          <Link href="/dashboard" className={styles.brandLink}>
            <div className={styles.brandLogo}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="24" height="24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <div>
              <p className={styles.brandName}>Menorah</p>
              <p className={styles.brandRole}>Counselor Portal</p>
            </div>
          </Link>
        </div>

        {/* Nav Items */}
        <nav className={styles.sidebarNav}>
          <p className={styles.navSection}>MAIN MENU</p>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navItem} ${isActive(item.href) ? styles.navItemActive : ''}`}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span className={styles.navLabel}>{item.label}</span>
              {isActive(item.href) && <span className={styles.navActiveIndicator} />}
            </Link>
          ))}
        </nav>

        {/* User Section */}
        <div className={styles.sidebarFooter}>
          <div className={styles.userCard}>
            <div className={styles.userAvatar}>
              <span className={styles.userAvatarText}>
                {user?.firstName?.charAt(0)?.toUpperCase() || 'C'}
              </span>
            </div>
            <div className={styles.userInfo}>
              <p className={styles.userName}>{user?.firstName} {user?.lastName}</p>
              <p className={styles.userRole}>Counsellor</p>
            </div>
          </div>
          <button onClick={logout} className={styles.logoutBtn}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="18" height="18">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className={styles.main}>
        {/* Topbar */}
        <header className={styles.topbar}>
          <button
            id="sidebar-toggle"
            className={styles.hamburger}
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="22" height="22">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className={styles.topbarBreadcrumb}>
            <Link href="/dashboard" className={styles.breadcrumbHome}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </Link>
          </div>

          <div className={styles.topbarRight}>
            <div className={styles.topbarUser}>
              <div className={styles.topbarAvatar}>
                <span>{user?.firstName?.charAt(0)?.toUpperCase() || 'C'}</span>
              </div>
              <div className={styles.topbarUserInfo}>
                <span className={styles.topbarUserName}>{user?.firstName} {user?.lastName}</span>
                <span className={styles.topbarUserRole}>Counsellor</span>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  );
}
