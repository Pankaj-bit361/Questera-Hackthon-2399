# Velos Studio — website in, product videos out

Studio replaces the old prompt-to-layout Motion Studio at `/motion` (the old one is still at `/motion/classic`).
A user pastes their website (and, optionally, a login for their product), picks the videos they want, and gets
finished MP4s with their own brand, real screens, music and sound — usually in 2–3 minutes per video.

## How it works

1. **Capture** (`Questera-Backend/studio/capture.cjs`) — headless Chrome opens the site, accepts cookie banners,
   scrolls so lazy content and scroll animations settle, and records:
   - the brand: background measured from pixels, headline/text colours, the call-to-action colour, button radius, the
     display and body fonts (downloaded from the site's own `@font-face` rules, else Google Fonts), the logo and icon;
   - the copy of the home page and up to two more pages (features, pricing, integrations, about);
   - screenshots of the first screen and main sections, a phone-sized first screen, and — with a login — up to four
     product screens. Every screenshot comes with the position of each heading, button, input and card on it.
   Credentials are used once in that browser session and never written to disk or logs. Email addresses on product
   screens are replaced before the screenshot. The browser refuses private, loopback and link-local addresses.
2. **Script** (`planner.cjs`) — Gemini (the `MOTION_LLM_MODEL`, default `google/gemini-3.8-flash`, via OpenRouter)
   sees the screenshots, the element lists and the copy, and fills tested scene templates for each requested format.
   Code then checks the plan against the capture: real screen and element ids, length limits, numbers that really
   appear on the site, no hype words. One corrected retry.
3. **Visual check** (`review.cjs`) — one settled frame per scene is rendered and shown to the model, which can shorten
   text or pick a better element. One pass; never blocks the render.
4. **Render** (`render.cjs`, templates in `studio/remotion/`) — Remotion renders the plan with the brand, then ffmpeg
   masters the audio to −14 LUFS / −1.5 dBTP.

Formats: **Launch film** (16:9), **Walkthrough** (16:9, numbered steps through the real flow), **Vertical teaser** (9:16),
**Square ad** (1:1). Scenes: hook, title, product reveal, close-up (camera zooms into a real element, a cursor clicks it),
features, checklist, number, end card. Scene timing lives in `studio/remotion/timing.cjs` (shared by renderer and server);
every scene is a whole number of beats of the 120 bpm music, so cuts land on the beat.

Sound is original and synthesized (`studio/audio/stems.py`, using the synth in `studio/audio/synth.py`): loopable
intro/main stems on one chord timeline, an outro, and UI sound effects cued per scene (clicks, ticks, whooshes, pops,
riser and impact on the logo). Regenerate with `python3 -m venv .venv && .venv/bin/pip install numpy scipy` then
`.venv/bin/python studio/audio/stems.py`.

## Run it locally

```sh
npm install
npm run studio:dev          # API on 127.0.0.1:4702, data in .studio-data/ (local session, no production database)
npm run dev                 # frontend; Vite proxies /api/studio to the API
```

Open `/motion`. Needs `OPENROUTER_API_KEY` in `Questera-Backend/.env`, `ffmpeg` on the PATH, and Chrome (Remotion's
Chrome Headless Shell in `node_modules/.remotion` is used automatically; `npx remotion browser ensure` downloads it).

```sh
npm run studio:test         # palette, network guard, timing and schema checks
```

## API (`/api/studio`, Velos JWT)

| | |
| --- | --- |
| `POST /jobs` | `{ url, formats: ["launch","walkthrough","teaser","square"], notes?, login?: { loginUrl?, email, password } }` |
| `GET /jobs`, `GET /jobs/:id` | the user's jobs; the UI polls the running one |
| `POST /jobs/:id/retry` | continue a failed job from where it stopped (capture and scripts are kept) |
| `POST /jobs/:id/videos/:vid/edit` | `{ scenes }` — new words, validated, re-rendered (~20–40 s) |
| `DELETE /jobs/:id` | |
| `GET /files/:id/*?t=` | screenshots, logo, videos — signed with the job's 6-hour file ticket |

One job at a time per user, `STUDIO_DAILY_LIMIT` (default 10) per day.

## On autopilot

Studio is the Velos autopilot's video engine. When an autopilot's daily plan includes a video or reel and the brand has a
website (`Autopilot.websiteUrl`, else the crawled `AutopilotMemory.website.url`), `AutopilotService.makeProductVideo`
makes a Studio video about that post's idea, not a generated clip. The generated clip remains the fallback when Studio
is off or fails. Then the autopilot's usual rules apply:

1. **Plan.** The planner is told that a video is a real product video, and asked for about two a week, never two days in
   a row, each about a different feature (`SocialGrowthAgent.productVideoBlock`).
2. **Make.** The format follows the platform: Instagram and TikTok get the vertical teaser, LinkedIn and X the square ad.
   One site capture is reused for 7 days (`STUDIO_CAPTURE_DAYS`), so daily videos start at the script, about 3½ minutes
   end to end.
3. **Watch the site.** After 7 days the site is read again and compared with the last capture. New headlines, sections or
   pages are listed on the job ("New on the site since the last video") and become the video's subject when they are
   a real product change.
4. **Check.** The autopilot writes the caption and hashtags, and its review agent watches the video and scores the post.
   A post at or above `autoPublishMinScore` (default 75) is scheduled; below it, or with "always ask" on, it waits in
   the approval queue. The post links back to its Studio job (`ScheduledPost.studioJobId`). The job shows in Studio,
   marked "Autopilot · Instagram".
5. **Publish.** Posts store a permanent signed link (`/api/studio/media/…`, needs `STUDIO_PUBLIC_API_URL`). Just before
   publishing, the scheduler swaps it for a fresh direct S3 link, so a post can wait in the queue for any length of time.

The account to post to is checked before anything renders, so an autopilot without a connected account wastes nothing.

## Production: one AWS Fargate task per job

With `STUDIO_RUNNER=fargate`, the Velos API only creates and lists jobs. Every run is its own Fargate task in a separate
AWS account, with files in S3. The capture browser can only reach the public web, and logins travel sealed. See
[deploy/studio/README.md](../deploy/studio/README.md) for the AWS setup, settings, security and deploys.

```sh
deploy/studio/deploy.sh                       # ship worker changes (anything under studio/ or Questera-Backend/studio/)
STUDIO_RUNNER=process npm run studio:dev      # the S3 + worker path on your machine, without ECS
```

Still to know:
- **Logins** must only ever travel over HTTPS. Two-factor and SSO sign-ins are not supported.
- **Fonts**: sites that rely on system fonts are captured with Inter, Liberation and Noto in place of Apple and Windows
  fonts. Chinese, Japanese and Korean system fonts are not in the image.
- **Remotion licence**: free for individuals and companies of up to 3 people; check before a larger company runs it.
