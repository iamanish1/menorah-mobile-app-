import { ArrowLeft, Phone, MessageCircle, Globe, AlertTriangle } from 'lucide-react';
import Link from 'next/link';

const resources = [
  { name: 'iCall (India)',          phone: '9152987821',    type: 'phone',   desc: 'Free psychological counselling' },
  { name: 'Vandrevala Foundation',  phone: '1860-2662-345', type: 'phone',   desc: '24/7 mental health helpline (India)' },
  { name: 'NIMHANS Helpline',       phone: '080-46110007',  type: 'phone',   desc: 'National mental health helpline (India)' },
  { name: 'Befrienders Worldwide',  phone: null,            type: 'web',     desc: 'Find local crisis support worldwide', url: 'https://www.befrienders.org' },
  { name: 'Dubai Health Authority', phone: '800342',        type: 'phone',   desc: 'Mental health support in UAE' },
  { name: 'Rashid Center (UAE)',    phone: '+971-4-219-2000', type: 'phone', desc: 'Psychiatric & psychological services' },
];

export default function CrisisHelpPage() {
  return (
    <div className="page-container max-w-xl">
      <Link href="/profile" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back
      </Link>

      <div className="bg-red-50 border border-red-200 rounded-2xl p-5 mb-6 flex gap-3">
        <AlertTriangle className="w-6 h-6 text-red-500 shrink-0 mt-0.5" />
        <div>
          <h2 className="font-semibold text-red-700">If you are in immediate danger</h2>
          <p className="text-sm text-red-600 mt-1">
            Please call your local emergency services immediately (112 in UAE, 112 in India) or go to your nearest emergency room.
          </p>
        </div>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">Crisis Resources</h1>
      <p className="text-gray-500 text-sm mb-6">Free and confidential support is available 24/7.</p>

      <div className="space-y-3">
        {resources.map((r) => (
          <div key={r.name} className="card p-4 flex items-center gap-4">
            <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center shrink-0">
              {r.type === 'phone' ? (
                <Phone className="w-5 h-5 text-primary-600" />
              ) : (
                <Globe className="w-5 h-5 text-primary-600" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900">{r.name}</p>
              <p className="text-sm text-gray-500">{r.desc}</p>
            </div>
            {r.phone && (
              <a
                href={`tel:${r.phone.replace(/[\s-]/g, '')}`}
                className="shrink-0 px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors font-medium"
              >
                Call
              </a>
            )}
            {r.url && (
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors font-medium"
              >
                Visit
              </a>
            )}
          </div>
        ))}
      </div>

      <div className="card p-5 mt-5 bg-primary-50 border-primary-100">
        <p className="text-sm text-primary-700 text-center">
          You are not alone. Reaching out is a sign of strength. 💚
        </p>
      </div>
    </div>
  );
}
