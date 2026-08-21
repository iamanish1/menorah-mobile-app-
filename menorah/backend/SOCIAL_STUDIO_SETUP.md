# Menorah AI Social Studio Setup

Menorah AI Social Studio generates static Instagram post drafts, renders the final image on the backend, sends the result to the admin panel for human review, and only publishes after admin approval.

## Flow

1. Admin opens `AI Social Studio`.
2. Admin generates an image post, creates an image post, or uploads an MP4/MOV Reel from the admin panel.
3. Backend creates a structured AI concept, caption, hashtags, and image direction.
4. Backend generates a unique premium image with the same OpenAI image model used for article covers, then composes the final static post image with Sharp using Menorah brand settings.
5. The draft is saved as `needs_review`.
6. Admin edits image text, caption, and hashtags in the review screen.
7. Admin approves the post.
8. Admin explicitly publishes, or deliberately schedules, through the official Meta Instagram API.

AI never publishes directly.

## Required Env Vars

```env
SOCIAL_STUDIO_ENABLED=true
SOCIAL_STUDIO_AUTO_PUBLISH=false
SOCIAL_STUDIO_GENERATION_RATE_LIMIT=10
SOCIAL_STUDIO_VIDEO_UPLOAD_RATE_LIMIT=10
SOCIAL_STUDIO_MAX_VIDEO_SIZE_MB=50
SOCIAL_STUDIO_REEL_READY_ATTEMPTS=12
SOCIAL_STUDIO_REEL_READY_INTERVAL_MS=5000
SOCIAL_STUDIO_STORAGE=local

AI_PROVIDER=openai
AI_MOCK_MODE=true
SOCIAL_STUDIO_OPENAI_API_KEY=
SOCIAL_STUDIO_AI_TEXT_MODEL=gpt-4o-mini
SOCIAL_STUDIO_AI_IMAGE_MODEL=gpt-image-2
SOCIAL_STUDIO_AI_IMAGE_SIZE=1536x1024
SOCIAL_STUDIO_AI_IMAGE_QUALITY=medium
SOCIAL_STUDIO_AI_IMAGE_FORMAT=jpeg
OPENAI_API_KEY=
AI_TEXT_MODEL=gpt-4o-mini
AI_IMAGE_MODEL=

META_APP_ID=
META_APP_SECRET=
META_GRAPH_API_VERSION=v23.0
SOCIAL_TOKEN_ENCRYPTION_KEY=

PUBLIC_WEB_BASE_URL=https://api.menorah.me

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_SOCIAL_STUDIO_FOLDER=menorah/social-studio
CLOUDINARY_SOCIAL_STUDIO_ASSET_FOLDER=menorah/social-studio-assets
CLOUDINARY_SOCIAL_STUDIO_VIDEO_FOLDER=menorah/social-studio-videos
```

Generate `SOCIAL_TOKEN_ENCRYPTION_KEY` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Local Mock Mode

Set `AI_MOCK_MODE=true` in local development to generate realistic drafts without spending API credits. In production, generation requires `SOCIAL_STUDIO_OPENAI_API_KEY` or `OPENAI_API_KEY`.

With `SOCIAL_STUDIO_STORAGE=local`, rendered images and Social Studio brand assets are saved under:

```text
uploads/social-studio
uploads/social-studio-assets
```

The backend serves them from `/uploads`.

This uses the same image model family as article cover images. Local storage is suitable for development previews only.

For production Docker deploys, mount a persistent host folder:

```bash
-v /opt/menorah/uploads:/app/uploads
```

The public API domain must proxy `/uploads/` to the backend so development previews can load. In the production Compose topology, each API service has an isolated upload volume, so do not use service-local uploads as a publishing source.

## Reel Uploads

The `Create Social Post` dialog supports MP4 and MOV Reel uploads. The upload only creates a `needs_review` record; it never calls Meta.

- Default maximum file size is 50 MB (`SOCIAL_STUDIO_MAX_VIDEO_SIZE_MB`), with a hard application maximum of 250 MB.
- The Caddy reverse proxy has a 55 MB multipart request limit only for `POST /api/admin/social-studio/posts/video` (`SOCIAL_STUDIO_MAX_VIDEO_REQUEST_SIZE_MB`); all other API routes remain at 20 MB while the uploaded file itself stays capped at 50 MB.
- Production Reel uploads require `SOCIAL_STUDIO_STORAGE=cloudinary` plus valid Cloudinary credentials. The backend rejects the local-storage fallback in production rather than creating a Reel Meta cannot retrieve.
- The video is replayed in the admin review screen. Admins must verify rights, playback, sound, and captions before approval.

## Brand Setup

Use `AI Social Studio -> Assets` to upload logos, backgrounds, templates, and reference posts.

Use `AI Social Studio -> Settings` to edit:

- Brand tone and audience
- Primary and secondary colors
- Fonts
- Default hashtags
- Banned hashtags
- Forbidden words
- Caption length limit
- Image text word limit

## Instagram Setup

Use `AI Social Studio -> Instagram` for MVP manual connection.

Required Meta setup:

- Instagram Professional account
- Linked Facebook Page
- Meta app with the needed Instagram publishing permission
- Long-lived access token scoped for content publishing
- Instagram User ID
- Publicly accessible HTTPS image URLs

The backend stores the access token encrypted with AES-256-GCM. Tokens are never returned by API responses.

## Publishing

Publishing uses the official Meta Graph API flow:

1. `POST /{ig-user-id}/media` with `image_url` and `caption`.
2. For a Reel, `POST /{ig-user-id}/media` with `media_type=REELS`, `video_url`, `caption`, and `share_to_feed=true`.
3. For a Reel, wait until Meta reports the creation container as `FINISHED`.
4. `POST /{ig-user-id}/media_publish` with the returned `creation_id`.

Only posts with `approved` or `scheduled` status can be published. Drafts, rejected posts, failed posts, and `needs_review` posts cannot publish.

The publish endpoint also requires an explicit admin confirmation. The backend atomically claims the post before contacting Meta, so duplicate clicks or worker overlap cannot create two publish attempts. It persists Meta's creation container before the final publish call; a retry resumes that container after a network timeout instead of creating a duplicate post.

## Production Checklist

- Set `AI_MOCK_MODE=false`.
- Set `SOCIAL_STUDIO_OPENAI_API_KEY`, or allow Social Studio to fall back to `OPENAI_API_KEY`.
- Set `SOCIAL_STUDIO_AI_IMAGE_MODEL=gpt-image-2` to match article cover generation unless article covers are moved to a different `OPENAI_IMAGE_MODEL`.
- Set `SOCIAL_TOKEN_ENCRYPTION_KEY`.
- Configure Cloudinary and set `SOCIAL_STUDIO_STORAGE=cloudinary`.
- Set `CLOUDINARY_SOCIAL_STUDIO_VIDEO_FOLDER` (or use the default) for Reels.
- Keep the 50 MB file limit and 55 MB Caddy multipart limit in sync (`SOCIAL_STUDIO_MAX_VIDEO_SIZE_MB` and `SOCIAL_STUDIO_MAX_VIDEO_REQUEST_SIZE_MB`).
- Connect and verify the Instagram account.
- Confirm Meta app permissions and app review are complete if required.
- Generate one test draft, approve it, and publish a controlled test post.
