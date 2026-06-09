'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Loader2, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import SocialStudioTabs from '@/components/social-studio/SocialStudioTabs';
import InstagramPostPreview from '@/components/social-studio/InstagramPostPreview';
import StatusBadge from '@/components/social-studio/StatusBadge';
import { api } from '@/lib/api';
import type { SocialAspectRatio, SocialPost, SocialPostType } from '@/types';

export default function GenerateSocialPostPage() {
  const [topic, setTopic] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [audience, setAudience] = useState('Men looking for practical mental health support');
  const [objective, setObjective] = useState('Encourage one honest next step toward support');
  const [tone, setTone] = useState('Warm, grounded, premium, and practical');
  const [postType, setPostType] = useState<SocialPostType>('single_image');
  const [aspectRatio, setAspectRatio] = useState<SocialAspectRatio>('4:5');
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState<SocialPost | null>(null);

  const submit = async () => {
    if (topic.trim().length < 3) {
      toast.error('Add a topic first');
      return;
    }

    setLoading(true);
    const response = await api.generateSocialPost({ topic, campaignName, audience, objective, tone, postType, aspectRatio });
    setLoading(false);

    if (response.success && response.data?.post) {
      setGenerated(response.data.post);
      toast.success('Post generated for review');
      return;
    }

    toast.error(response.message || 'Unable to generate post');
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Generate Instagram Post</h2>
        <p className="mt-0.5 text-sm text-gray-500">AI creates a draft, then the backend renders the image and sends it to admin review.</p>
      </div>
      <SocialStudioTabs />

      <div className="grid gap-5 xl:grid-cols-[430px_minmax(0,1fr)]">
        <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Topic</span>
            <textarea
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Example: Why asking for help is strength for men"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Campaign name</span>
            <input value={campaignName} onChange={(event) => setCampaignName(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Men's Mental Health Month" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Audience</span>
            <input value={audience} onChange={(event) => setAudience(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Objective</span>
            <input value={objective} onChange={(event) => setObjective(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Tone</span>
            <input value={tone} onChange={(event) => setTone(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Post type</span>
              <select value={postType} onChange={(event) => setPostType(event.target.value as SocialPostType)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="single_image">Single image</option>
                <option value="carousel">Carousel</option>
                <option value="reel_cover">Reel cover</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Aspect ratio</span>
              <select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as SocialAspectRatio)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                <option value="1:1">1:1 square</option>
                <option value="4:5">4:5 portrait</option>
                <option value="9:16">9:16 story</option>
              </select>
            </label>
          </div>
          <button
            onClick={submit}
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {loading ? 'Generating...' : 'Generate Draft'}
          </button>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          {generated ? (
            <div className="grid gap-5 lg:grid-cols-[390px_minmax(0,1fr)]">
              <InstagramPostPreview post={generated} />
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <StatusBadge status={generated.status} />
                  <span className="text-xs text-gray-500">{generated.qualityScore || 0}/100 quality score</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{generated.topic}</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-600">{generated.caption}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(generated.hashtags || []).map((tag) => (
                    <span key={tag} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">#{tag}</span>
                  ))}
                </div>
                {generated.qualityIssues && generated.qualityIssues.length > 0 && (
                  <div className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                    {generated.qualityIssues[0]}
                  </div>
                )}
                <Link href={`/ai-social-studio/posts/${generated.id}`} className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800">
                  Open review screen
                  <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
              <Sparkles size={42} className="text-gray-300" />
              <p className="mt-3 text-sm font-semibold text-gray-700">Generated preview appears here</p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-gray-400">The post will not be uploaded to Instagram. It goes to review first.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
