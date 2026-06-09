'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Archive, ImagePlus, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import SocialStudioTabs from '@/components/social-studio/SocialStudioTabs';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { BrandAsset } from '@/types';

export default function SocialAssetsPage() {
  const [assets, setAssets] = useState<BrandAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<BrandAsset['type']>('background');
  const [tags, setTags] = useState('');
  const [colors, setColors] = useState('');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await api.getBrandAssets({ status: 'active' });
    if (response.success && response.data) setAssets(response.data.assets);
    else toast.error(response.message || 'Unable to load brand assets');
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const form = new FormData();
    form.set('name', name);
    form.set('type', type);
    form.set('tags', tags);
    form.set('colors', colors);
    if (url) form.set('url', url);
    if (file) form.set('file', file);

    const response = await api.createBrandAsset(form);
    setSaving(false);
    if (response.success) {
      toast.success('Brand asset saved');
      setName('');
      setTags('');
      setColors('');
      setUrl('');
      setFile(null);
      load();
      return;
    }
    toast.error(response.message || 'Unable to save asset');
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Brand Assets</h2>
        <p className="mt-0.5 text-sm text-gray-500">Upload logos, backgrounds, templates, and reference visuals for generated posts.</p>
      </div>
      <SocialStudioTabs />

      <div className="grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900">Add Asset</h3>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} required className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Type</span>
            <select value={type} onChange={(event) => setType(event.target.value as BrandAsset['type'])} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              {['logo', 'font', 'image', 'icon', 'template', 'background', 'product_image', 'reference_post', 'brand_guideline'].map((item) => <option key={item} value={item}>{item.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Upload file</span>
            <input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Or asset URL</span>
            <input value={url} onChange={(event) => setUrl(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Tags</span>
            <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="instagram, social, green" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Colors</span>
            <input value={colors} onChange={(event) => setColors(event.target.value)} placeholder="#27533A, #F7F0DF" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </label>
          <button disabled={saving || (!file && !url)} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
            Save Asset
          </button>
        </form>

        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          {loading ? (
            <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
              {[...Array(6)].map((_, index) => <div key={index} className="h-56 animate-pulse rounded-xl bg-gray-100" />)}
            </div>
          ) : (
            <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
              {assets.map((asset) => (
                <div key={asset.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                  <div className="aspect-video bg-gray-100">
                    {asset.mimeType?.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(asset.url) ? (
                      <img src={asset.url} alt={asset.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-gray-400">{asset.type}</div>
                    )}
                  </div>
                  <div className="space-y-3 p-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{asset.name}</p>
                      <p className="mt-1 text-xs text-gray-400">{asset.type.replace(/_/g, ' ')} - {formatDate(asset.createdAt)}</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(asset.tags || []).slice(0, 4).map((tag) => <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">{tag}</span>)}
                    </div>
                    <button onClick={async () => {
                      const response = await api.archiveBrandAsset(asset.id);
                      if (response.success) {
                        toast.success('Asset archived');
                        load();
                      } else toast.error(response.message || 'Unable to archive asset');
                    }} className="inline-flex items-center gap-2 text-xs font-semibold text-red-600 hover:underline">
                      <Archive size={13} />
                      Archive
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
