import { AuthGuard } from '@/components/auth/AuthGuard';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { BottomNav } from '@/components/layout/BottomNav';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="menorah-app-shell min-h-screen bg-[var(--app-bg)] text-gray-950 transition-colors dark:text-primary-50">
        <Sidebar />
        <Topbar />

        <main className="min-h-screen pb-24 lg:pb-0 lg:pl-8">
          {children}
        </main>

        <BottomNav />
      </div>
    </AuthGuard>
  );
}
