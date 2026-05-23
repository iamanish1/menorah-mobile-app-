'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, CalendarDays, MessageSquare, User2,
  LogOut, Menu, HeartPulse,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import NotificationCenter from '@/components/Notifications/NotificationCenter';
import styles from './AppLayout.module.css';

interface AppLayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/bookings',  label: 'Bookings',  icon: CalendarDays },
  { href: '/chat',      label: 'Chat',      icon: MessageSquare },
  { href: '/profile',   label: 'Profile',   icon: User2 },
];

export default function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const sidebar = document.getElementById('app-sidebar');
      const toggle  = document.getElementById('sidebar-toggle');
      if (sidebarOpen && sidebar && !sidebar.contains(e.target as Node) && !toggle?.contains(e.target as Node)) {
        setSidebarOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [sidebarOpen]);

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);

  const initials =
    `${user?.firstName?.charAt(0) ?? ''}${user?.lastName?.charAt(0) ?? ''}`.toUpperCase() || 'C';

  return (
    <div className={styles.layout}>
      <NotificationCenter />

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
              <img src="/logo.png" alt="Menorah" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
            </div>
            <div>
              <p className={styles.brandName}>Menorah</p>
              <p className={styles.brandRole}>Counselor Portal</p>
            </div>
          </Link>
        </div>

        {/* Nav */}
        <nav className={styles.sidebarNav}>
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`${styles.navItem} ${isActive(href) ? styles.navItemActive : ''}`}
            >
              <span className={styles.navIcon}>
                <Icon size={18} />
              </span>
              <span className={styles.navLabel}>{label}</span>
            </Link>
          ))}
        </nav>

        {/* User section */}
        <div className={styles.sidebarFooter}>
          <div className={styles.userCard}>
            <div className={styles.userAvatar}>
              <span className={styles.userAvatarText}>{initials}</span>
            </div>
            <div className={styles.userInfo}>
              <p className={styles.userName}>{user?.firstName} {user?.lastName}</p>
              <p className={styles.userRole}>Counsellor</p>
            </div>
          </div>
          <button onClick={logout} className={styles.logoutBtn}>
            <LogOut size={16} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className={styles.main}>
        {/* Topbar */}
        <header className={styles.topbar}>
          <button
            id="sidebar-toggle"
            className={styles.hamburger}
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            <Menu size={20} />
          </button>

          <div className={styles.topbarBreadcrumb}>
            <span className={styles.breadcrumbPage}>
              {navItems.find((n) => isActive(n.href))?.label ?? 'Dashboard'}
            </span>
          </div>

          <div className={styles.topbarRight}>
            <div className={styles.topbarUser}>
              <div className={styles.topbarAvatar}>
                <span>{initials}</span>
              </div>
              <div className={styles.topbarUserInfo}>
                <span className={styles.topbarUserName}>{user?.firstName} {user?.lastName}</span>
                <span className={styles.topbarUserRole}>Counsellor</span>
              </div>
            </div>
          </div>
        </header>

        <main className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  );
}
