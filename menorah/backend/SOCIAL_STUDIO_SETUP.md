# Menorah AI Social Studio Setup

Menorah AI Social Studio generates static Instagram post drafts, renders the final image on the backend, sends the result to the admin panel for human review, and only publishes after admin approval.

## Flow

1. Admin opens `AI Social Studio`.
2. Admin generates a post from a topic, campaign, audience, objective, tone, post type, and aspect ratio.
3. Backend creates a structured AI concept, caption, hashtags, and image direction.
4. Backend generates a unique premium image with the same OpenAI image model used for article covers, then composes the final static post image with Sharp using Menorah brand settings.
5. The draft is saved as `needs_review`.
6. Admin edits image text, caption, and hashtags in the review screen.
7. Admin approves the post.
8. Admin schedules or publishes through the official Meta Instagram API.

AI never publishes directly.

## Required Env Vars

```env
SOCIAL_STUDIO_ENABLED=true
SOCIAL_STUDIO_AUTO_PUBLISH=false
SOCIAL_STUDIO_GENERATION_RATE_LIMIT=10
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

This uses the same image model family as article cover images, but Social Studio media can stay on the backend machine with `SOCIAL_STUDIO_STORAGE=local`.

For production Docker deploys, mount a persistent host folder:

```bash
-v /opt/menorah/uploads:/app/uploads
```

The public API domain must proxy `/uploads/` to the backend so admin previews and Meta's image fetch can reach the rendered post image. For production, set `PUBLIC_WEB_BASE_URL` to the API origin used by the admin panel, for example `https://api.menorah.me`.

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
2. `POST /{ig-user-id}/media_publish` with the returned `creation_id`.

Only posts with `approved` or `scheduled` status can be published. Drafts, rejected posts, failed posts, and `needs_review` posts cannot publish.

## Production Checklist

- Set `AI_MOCK_MODE=false`.
- Set `SOCIAL_STUDIO_OPENAI_API_KEY`, or allow Social Studio to fall back to `OPENAI_API_KEY`.
- Set `SOCIAL_STUDIO_AI_IMAGE_MODEL=gpt-image-2` to match article cover generation unless article covers are moved to a different `OPENAI_IMAGE_MODEL`.
- Set `SOCIAL_TOKEN_ENCRYPTION_KEY`.
- Configure Cloudinary.
- Ensure `PUBLIC_WEB_BASE_URL` points to a public HTTPS backend URL.
- Connect and verify the Instagram account.
- Confirm Meta app permissions and app review are complete if required.
- Generate one test draft, approve it, and publish a controlled test post.
