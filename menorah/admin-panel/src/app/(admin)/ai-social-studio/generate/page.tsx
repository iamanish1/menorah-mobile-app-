'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Loader2, Save, Sparkles, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import SocialStudioTabs from '@/components/social-studio/SocialStudioTabs';
import InstagramPostPreview from '@/components/social-studio/InstagramPostPreview';
import StatusBadge from '@/components/social-studio/StatusBadge';
import { api } from '@/lib/api';
import type { SocialAspectRatio, SocialPost, SocialPostType } from '@/types';

const MAX_BATCH_POSTS = 20;

export default function GenerateSocialPostPage() {
  const [textSystemPrompt, setTextSystemPrompt] = useState('');
  const [imageSystemPrompt, setImageSystemPrompt] = useState('');
  const [savedTextSystemPrompt, setSavedTextSystemPrompt] = useState('');
  const [savedImageSystemPrompt, setSavedImageSystemPrompt] = useState('');
  const [postCount, setPostCount] = useState(1);
  const [topic, setTopic] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [audience, setAudience] = useState('Men looking for practical mental health support');
  const [objective, setObjective] = useState('Encourage one honest next step toward support');
  const [tone, setTone] = useState('Warm, grounded, premium, and practical');
  const [postType, setPostType] = useState<SocialPostType>('single_image');
  const [aspectRatio, setAspectRatio] = useState<SocialAspectRatio>('4:5');
  const [loading, setLoading] = useState(false);
  const [savingPrompts, setSavingPrompts] = useState(false);
  const [generated, setGenerated] = useState<SocialPost | null>(null);
  const [generatedPosts, setGeneratedPosts] = useState<SocialPost[]>([]);

  useEffect(() => {
    let mounted = true;

    api.getSocialPromptSettings().then((response) => {
      if (!mounted) return;
      if (response.success && response.data?.settings) {
        setTextSystemPrompt(response.data.settings.textSystemPrompt || '');
        setImageSystemPrompt(response.data.settings.imageSystemPrompt || '');
        setSavedTextSystemPrompt(response.data.settings.textSystemPrompt || '');
        setSavedImageSystemPrompt(response.data.settings.imageSystemPrompt || '');
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  const useSavedDefaults = () => {
    setTextSystemPrompt(savedTextSystemPrompt);
    setImageSystemPrompt(savedImageSystemPrompt);
  };

  const savePromptDefaults = async () => {
    setSavingPrompts(true);
    const response = await api.updateSocialPromptSettings({ textSystemPrompt, imageSystemPrompt });
    setSavingPrompts(false);

    if (response.success && response.data?.settings) {
      setSavedTextSystemPrompt(response.data.settings.textSystemPrompt || '');
      setSavedImageSystemPrompt(response.data.settings.imageSystemPrompt || '');
      toast.success('Prompt defaults saved');
      return;
    }

    toast.error(response.message || 'Unable to save prompt defaults');
  };

  const submit = async () => {
    if (topic.trim().length < 3) {
      toast.error('Add a topic first');
      return;
    }

    const requestedCount = Math.max(1, Math.min(MAX_BATCH_POSTS, Math.floor(Number(postCount) || 1)));
    setLoading(true);
    setGeneratedPosts([]);
    const nextPosts: SocialPost[] = [];
    const failures: string[] = [];

    for (let index = 0; index < requestedCount; index += 1) {
      const response = await api.generateSocialPost({
        topic,
        campaignName,
        audience,
        objective,
        tone,
        postType,
        aspectRatio,
        textSystemPrompt,
        imageSystemPrompt,
        sequenceNumber: index + 1,
        totalCount: requestedCount
      });

      if (response.success && response.data?.post) {
        nextPosts.push(response.data.post);
        setGenerated(response.data.post);
        setGeneratedPosts([...nextPosts]);
      } else {
        failures.push(response.message || `Post ${index + 1} failed`);
      }
    }

    setLoading(false);

    if (nextPosts.length > 0) {
      toast.success(`${nextPosts.length} post${nextPosts.length === 1 ? '' : 's'} generated for review`);
      if (failures.length > 0) toast.error(`${failures.length} post${failures.length === 1 ? '' : 's'} failed and can be retried`);
      return;
    }

    toast.error(failures[0] || 'Unable to generate posts');
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
          <div className="space-y-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-gray-900">AI Instructions</h3>
                <p className="mt-0.5 text-xs text-gray-500">System prompts and batch size for this run.</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={useSavedDefaults}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                >
                  <RotateCcw size={14} />
                  Defaults
                </button>
                <button
                  type="button"
                  onClick={savePromptDefaults}
                  disabled={savingPrompts}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {savingPrompts ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save
                </button>
              </div>
            </div>
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Text model system prompt</span>
              <textarea
                value={textSystemPrompt}
                onChange={(event) => setTextSystemPrompt(event.target.value)}
                rows={5}
                className="mt-1 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm leading-5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Optional instructions for caption, hook, CTA, and hashtags"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Image model system prompt</span>
              <textarea
                value={imageSystemPrompt}
                onChange={(event) => setImageSystemPrompt(event.target.value)}
                rows={5}
                className="mt-1 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm leading-5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Optional instructions for image style, visual scene, and exclusions"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-gray-600">Number of posts</span>
              <input
                type="number"
                min={1}
                max={MAX_BATCH_POSTS}
                value={postCount}
                onChange={(event) => setPostCount(Math.max(1, Math.min(MAX_BATCH_POSTS, Number(event.target.value) || 1)))}
                className="mt-1 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
          </div>
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
            {loading ? 'Generating...' : `Generate ${Math.max(1, Math.min(MAX_BATCH_POSTS, Number(postCount) || 1))} Draft${Math.max(1, Math.min(MAX_BATCH_POSTS, Number(postCount) || 1)) === 1 ? '' : 's'}`}
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
                {generatedPosts.length > 1 && (
                  <div className="rounded-xl border border-gray-200">
                    <div className="border-b border-gray-100 px-3 py-2 text-xs font-bold text-gray-600">
                      Batch Output
                    </div>
                    <div className="max-h-64 divide-y divide-gray-100 overflow-auto">
                      {generatedPosts.map((post, index) => (
                        <Link
                          key={post.id}
                          href={`/ai-social-studio/posts/${post.id}`}
                          className="flex items-center justify-between gap-3 px-3 py-2 text-xs hover:bg-gray-50"
                        >
                          <span className="min-w-0 truncate font-semibold text-gray-700">Post {index + 1}: {post.topic}</span>
                          <StatusBadge status={post.status} />
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
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
