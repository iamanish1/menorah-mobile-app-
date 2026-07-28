import { Bookmark, Heart, MessageCircle, Play, Send } from 'lucide-react';
import type { SocialPost } from '@/types';

const ensureHash = (tag: string) => {
  const clean = tag.replace(/^#+/, '').trim();
  return clean ? `#${clean}` : '';
};

export default function InstagramPostPreview({ post }: { post: Pick<SocialPost, 'postType' | 'caption' | 'hashtags' | 'finalImageUrl' | 'hookText' | 'thumbnailUrl' | 'videoUrl'> }) {
  const tags = (post.hashtags || []).map(ensureHash).filter(Boolean).join(' ');
  const isReel = post.postType === 'reel';

  return (
    <div className="overflow-hidden rounded-[2rem] border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#27533A] text-sm font-bold text-white">M</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-none text-gray-900">menorahhealth</p>
          <p className="mt-1 text-xs text-gray-400">Menorah Health</p>
        </div>
        <div className="flex gap-1">
          <span className="h-1 w-1 rounded-full bg-gray-400" />
          <span className="h-1 w-1 rounded-full bg-gray-400" />
          <span className="h-1 w-1 rounded-full bg-gray-400" />
        </div>
      </div>

      <div className={`relative bg-gray-100 ${isReel ? 'aspect-[9/16]' : 'aspect-[4/5]'}`}>
        {isReel && post.videoUrl ? (
          <>
            <video
              src={post.videoUrl}
              poster={post.thumbnailUrl || post.finalImageUrl || undefined}
              controls
              playsInline
              preload="metadata"
              className="h-full w-full bg-black object-contain"
            >
              Your browser cannot preview this Reel.
            </video>
            <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 text-xs font-semibold text-white">
              <Play size={12} fill="currentColor" /> Reel preview
            </span>
          </>
        ) : post.finalImageUrl || post.thumbnailUrl ? (
          <img
            src={post.finalImageUrl || post.thumbnailUrl}
            alt={post.hookText || 'Instagram post preview'}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-8 text-center text-sm text-gray-400">
            {isReel ? 'Reel video will appear after upload.' : 'Preview image will appear after generation.'}
          </div>
        )}
      </div>

      <div className="space-y-3 px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex gap-4 text-gray-900">
            <Heart size={22} />
            <MessageCircle size={22} />
            <Send size={22} />
          </div>
          <Bookmark size={22} />
        </div>
        <p className="text-sm font-semibold text-gray-900">menorahhealth</p>
        <p className="whitespace-pre-wrap text-sm leading-6 text-gray-800">
          {post.caption || 'Caption will appear here.'}
          {tags && <span className="text-blue-700"> {tags}</span>}
        </p>
      </div>
    </div>
  );
}
