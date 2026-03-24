import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      {/* Left panel – branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary-600 flex-col justify-between p-12">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
            <span className="text-primary-600 font-bold text-lg">M</span>
          </div>
          <span className="text-white text-xl font-semibold">Menorah Health</span>
        </Link>

        <div className="space-y-6">
          <h1 className="text-4xl font-bold text-white leading-tight">
            Your mental well-being<br />journey starts here.
          </h1>
          <p className="text-primary-100 text-lg">
            Connect with certified counsellors, book sessions, and get the support you deserve — all in one place.
          </p>

          <div className="grid grid-cols-2 gap-4 pt-4">
            {[
              { num: '500+', label: 'Expert Counsellors' },
              { num: '10K+', label: 'Sessions Completed' },
              { num: '4.9',  label: 'Average Rating' },
              { num: '24/7', label: 'Always Available' },
            ].map((s) => (
              <div key={s.label} className="bg-primary-700/50 rounded-2xl p-4">
                <div className="text-2xl font-bold text-white">{s.num}</div>
                <div className="text-primary-200 text-sm mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-primary-200 text-sm">
          &copy; {new Date().getFullYear()} Menorah Health. All rights reserved.
        </p>
      </div>

      {/* Right panel – form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 bg-white">
        {/* Mobile logo */}
        <Link href="/" className="flex items-center gap-2 mb-8 lg:hidden">
          <div className="w-9 h-9 bg-primary-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold">M</span>
          </div>
          <span className="text-gray-900 text-lg font-semibold">Menorah Health</span>
        </Link>

        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
