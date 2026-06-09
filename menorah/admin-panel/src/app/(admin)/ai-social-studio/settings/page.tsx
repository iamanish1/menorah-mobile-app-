'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import SocialStudioTabs from '@/components/social-studio/SocialStudioTabs';
import { api } from '@/lib/api';
import type { BrandGuideline, SocialAspectRatio } from '@/types';

const join = (values?: string[]) => (values || []).join(', ');
const split = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);

export default function SocialSettingsPage() {
  const [guideline, setGuideline] = useState<BrandGuideline | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [brandName, setBrandName] = useState('');
  const [tone, setTone] = useState('');
  const [audience, setAudience] = useState('');
  const [primaryColors, setPrimaryColors] = useState('');
  const [secondaryColors, setSecondaryColors] = useState('');
  const [fonts, setFonts] = useState('');
  const [defaultHashtags, setDefaultHashtags] = useState('');
  const [bannedHashtags, setBannedHashtags] = useState('');
  const [forbiddenWords, setForbiddenWords] = useState('');
  const [captionMaxLength, setCaptionMaxLength] = useState(2200);
  const [maxWordsOnImage, setMaxWordsOnImage] = useState(24);
  const [defaultAspectRatio, setDefaultAspectRatio] = useState<SocialAspectRatio>('4:5');
  const [ctaStyle, setCtaStyle] = useState('');

  useEffect(() => {
    api.getActiveBrandGuideline().then((response) => {
      if (response.success && response.data?.guideline) {
        const next = response.data.guideline;
        setGuideline(next);
        setBrandName(next.brandName);
        setTone(next.tone);
        setAudience(next.audience);
        setPrimaryColors(join(next.primaryColors));
        setSecondaryColors(join(next.secondaryColors));
        setFonts(join(next.fonts));
        setDefaultHashtags(join(next.instagramRules.defaultHashtags));
        setBannedHashtags(join(next.instagramRules.bannedHashtags));
        setForbiddenWords(join(next.postRules.forbiddenWords));
        setCaptionMaxLength(next.instagramRules.captionMaxLength || 2200);
        setMaxWordsOnImage(next.postRules.maxWordsOnImage || 24);
        setDefaultAspectRatio(next.postRules.defaultAspectRatio || '4:5');
        setCtaStyle(next.postRules.ctaStyle || '');
      } else {
        toast.error(response.message || 'Unable to load brand settings');
      }
      setLoading(false);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    const payload: Partial<BrandGuideline> = {
      brandName,
      tone,
      audience,
      primaryColors: split(primaryColors),
      secondaryColors: split(secondaryColors),
      fonts: split(fonts),
      postRules: {
        maxWordsOnImage,
        allowedAspectRatios: ['1:1', '4:5', '9:16'],
        defaultAspectRatio,
        forbiddenWords: split(forbiddenWords),
        ctaStyle
      },
      instagramRules: {
        defaultHashtags: split(defaultHashtags),
        bannedHashtags: split(bannedHashtags),
        captionMaxLength
      },
      status: 'active'
    };

    const response = guideline
      ? await api.updateBrandGuideline(guideline.id, payload)
      : await api.createBrandGuideline(payload);
    setSaving(false);

    if (response.success && response.data?.guideline) {
      setGuideline(response.data.guideline);
      toast.success('Brand settings saved');
      return;
    }

    toast.error(response.message || 'Unable to save settings');
  };

  if (loading) {
    return <div className="h-96 animate-pulse rounded-xl bg-white" />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Brand Settings</h2>
          <p className="mt-0.5 text-sm text-gray-500">Controls generation tone, colors, hashtags, and quality rules.</p>
        </div>
        <button onClick={save} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Save Settings
        </button>
      </div>
      <SocialStudioTabs />

      <section className="grid gap-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm xl:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold text-gray-600">Brand name</span>
          <input value={brandName} onChange={(event) => setBrandName(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-gray-600">Audience</span>
          <input value={audience} onChange={(event) => setAudience(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="block xl:col-span-2">
          <span className="text-xs font-semibold text-gray-600">Tone</span>
          <textarea value={tone} onChange={(event) => setTone(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-gray-600">Primary colors</span>
          <input value={primaryColors} onChange={(event) => setPrimaryColors(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-gray-600">Secondary colors</span>
          <input value={secondaryColors} onChange={(event) => setSecondaryColors(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-gray-600">Fonts</span>
          <input value={fonts} onChange={(event) => setFonts(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-gray-600">CTA style</span>
          <input value={ctaStyle} onChange={(event) => setCtaStyle(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-gray-600">Default hashtags</span>
          <textarea value={defaultHashtags} onChange={(event) => setDefaultHashtags(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-gray-600">Banned hashtags</span>
          <textarea value={bannedHashtags} onChange={(event) => setBannedHashtags(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-gray-600">Forbidden words</span>
          <textarea value={forbiddenWords} onChange={(event) => setForbiddenWords(event.target.value)} rows={3} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
        </label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Caption max</span>
            <input type="number" value={captionMaxLength} onChange={(event) => setCaptionMaxLength(Number(event.target.value) || 2200)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Image word max</span>
            <input type="number" value={maxWordsOnImage} onChange={(event) => setMaxWordsOnImage(Number(event.target.value) || 24)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Default ratio</span>
            <select value={defaultAspectRatio} onChange={(event) => setDefaultAspectRatio(event.target.value as SocialAspectRatio)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="1:1">1:1</option>
              <option value="4:5">4:5</option>
              <option value="9:16">9:16</option>
            </select>
          </label>
        </div>
      </section>
    </div>
  );
}
