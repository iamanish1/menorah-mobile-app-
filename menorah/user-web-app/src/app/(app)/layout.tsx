import { AuthGuard } from '@/components/auth/AuthGuard';
import { Sidebar }   from '@/components/layout/Sidebar';
import { Topbar }    from '@/components/layout/Topbar';
import { BottomNav } from '@/components/layout/BottomNav';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-[var(--app-bg)] text-gray-950 transition-colors dark:text-primary-50">
        <Sidebar />
        {/* Mobile topbar */}
        <Topbar />

        {/* Main content – offset for sidebar on desktop */}
        <main className="lg:pl-72 pb-24 lg:pb-0 min-h-screen">
          {children}
        </main>

        {/* Mobile bottom navigation */}
        <BottomNav />
      </div>
    </AuthGuard>
  );
}
