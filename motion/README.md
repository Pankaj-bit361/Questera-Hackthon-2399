# Velos Motion Studio beta

Motion Studio lives at `/motion`. It is part of the existing React/Vite app and uses the same validated composition in the preview and MP4 renderer.

## Local start

From the repository root:

```sh
npm install
npm install --prefix Questera-Backend
npm run motion:dev
```

In a second terminal:

```sh
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Open http://127.0.0.1:5173/motion. The development API binds to loopback port 4701. Projects, assets, usage, and jobs persist under `.motion-data/`; this directory is ignored by Git. Its temporary development identity never connects to MongoDB or starts publishing crons. Restarting the local API preserves projects and its signing key.

Node 22 and `ffprobe` are required. On macOS, `brew install ffmpeg` supplies ffprobe. Remotion downloads its official Chrome Headless Shell on the first render. The bundled Manrope font includes its OFL license.

Set `OPENROUTER_API_KEY` in `Questera-Backend/.env` to enable design. `MOTION_LLM_MODEL` selects the model; the current default is `google/gemini-3.8-flash`. Optional `OPENAI_API_KEY` enables timed speech transcription through Whisper. SRT caption import and uploaded voiceover/music work without a speech provider.

## Supported creative workflow

### Prompt → original procedural video

Build the isolated Python graphics worker once with `npm run motion:python:build` (Docker must be running), then open `/motion/create`. Describe the message, visuals and ending, choose landscape/portrait/square, 5–30 seconds, and original instrumental music or silence. The normal authenticated API queues the job, reserves render allowance and counts one AI operation. Repeated request IDs do not create or charge another job.

Gemini 3.8 Flash writes original Python scene functions and a musical event score using the supplied graphics toolkit. Docker renders four moments per scene at reduced resolution; the multimodal reviewer inspects the actual frames and code. One repair pass can address runtime errors or creative issues. An accepted scene is checkpointed before full rendering, so a render retry uses the exact accepted code without another provider call. Generated code stays outside the native layer schema and is not advertised as individually layer-editable. Videos, progress, cancellation, review summaries and signed private playback/download links are available in the prompt screen.

The renderer adapts the user's supplied NumPy/Pillow/SciPy engine. It supports procedural particles, shape fields, shader-like math, typography, charts and visual effects; it does not generate photographic footage or vocals. Sound uses the existing validated musical-event synthesizer. Frames are encoded with FFmpeg into H.264/AAC MP4. Python code runs only inside a non-root, read-only, network-disabled Docker container with no capabilities, bounded memory/CPU/processes/runtime, a read-only job input directory and temporary size-limited output. The AST compatibility filter is not the security boundary. The Node worker needs a reachable Docker daemon and the prebuilt image; the existing deployment image does not itself provision that service.

Offline proof: `npm run motion:prompt:proof` uses **authored fixture code and a mocked reviewer**, the real queue, actual Docker rendering and an isolated temporary wallet. It produces `.motion-proof/prompt-video/offline-integration.mp4`, confirms a 5-second 1080×1080 H.264/AAC stream with 150 frames, decodes the full video, previews all three formats, checks rejected imports and verifies cancellation. It makes no provider call and changes no real workspace usage. This is integration evidence, not automatic creative acceptance or a verified 9/10 ad. A fresh provider run remains gated by the existing daily allowance.

When port 5173 is occupied, launch the local API with `MOTION_FRONTEND_PORT=5175 npm run motion:dev` and Vite with `npm run dev -- --host 127.0.0.1 --port 5175 --strictPort`. The API continues on 4701 and preserves existing local data. The development origin check accepts only the configured loopback frontend port.

### Native layer editor

- Choose a starter or create a new project. Landscape, portrait, and square use a 1080px short edge at 30 FPS.
- In Design, choose **New design from brief** for an original composition. Other scopes refine the project, a selected scene, or a selected layer. Auto scope recognizes numbered scene requests.
- New designs default to **AI generated · automatic**: original editable geometry and keyframes, rendered preview review, one repair cycle, a new musical event score, saved revision, and queued MP4. Undo and revision history remain available.
- Scoped edits and optional template/raw approaches produce a preview to accept or discard. Template starting points remain an explicit choice.
- Edit scene order, timing, transitions, texture, typography, shape/media layers, animation presets, and position keyframes. Locked layers survive AI edits. Selected scene/layer changes preserve unrelated content by merging stable IDs.
- Upload PNG/JPG/WebP, MP4, or MP3/WAV/OGG/M4A. Assets are private and checked for content, dimensions, and actual media duration. Video inserts are muted; use audio tracks for a soundtrack.
- Mix up to four tracks with start, trim, volume, and fades. Import SRT captions using their actual timestamps; captions are editable text layers with an end time.
- Undo/redo; autosave; restore any of the last 25 project revisions. Concurrent saves from another tab return a conflict rather than overwrite work.
- Export a saved revision. The queue preserves that snapshot while subsequent edits continue. Exports provide progress, cancellation, thumbnails, and authenticated signed downloads.

Beta bounds: 60 seconds, 12 scenes, 25 layers per scene, 30 keyframes per layer, four audio tracks, 40 MB per upload, 40 megapixels per visual asset, 100 active projects, 200 assets. The daily allowance defaults to 300 rendered seconds and 30 AI operations. Failed/cancelled exports release their reserved allowance; repeated request IDs settle once. There is no motion checkout in this beta; this is a free quota rather than a new paid credit plan.

## Checks

```sh
npm run build
npm run motion:test
npm run motion:proof
```

Tests start their own temporary MongoDB and file storage. No production database or provider is used by the test suite. `motion:proof` renders a reference MP4 and still to `.motion-proof/`.

`node motion/benchmark.mjs` is an **opt-in live provider check** and consumes the configured OpenRouter account. `node motion/acceptance.mjs` requires the isolated local API and the generated test WAV, SRT, and reference proof files. It exercises private image/video/audio uploads and three format exports, including an edit after enqueue.

## Local acceptance record — 30 September 2026

All 17 automated checks and the lint/production build pass. Actual landscape, portrait, and square exports are H.264, 30 FPS, 15-second video streams, with private media uploads, mixed tracks, captions, and immutable snapshots. The live AI launch brief produced a 20-second portrait project; a scene-two refinement preserved unrelated scenes and a manually locked headline. Browser checks covered manual editing, undo/redo, keyframes, audio/SRT import, save/reload, download, and mobile/tablet layout.

The final edited launch MP4 is `.motion-proof/ai-launch.mp4`. A real forced shutdown during rendering was recovered automatically on attempt two; its single reservation settled once. The generated evidence and screenshots are ignored by Git. Automatic speech transcription, real S3, container deployment, and live billing delivery remain unverified. The root dependency audit is clean; the legacy backend retains one low PM2 advisory, and the standalone Motion entry points do not use PM2.

## Eight-ad creative benchmark

The live Velos advertising benchmark created eight distinct 10–15-second concepts across all three formats. Six of the initial eight requests produced accepted projects within the two-attempt correction limit; two required a new request. The six initially accepted videos averaged 4.8/10 in a subjective creative review, with clipping, logo overlap, unsupported destinations, and invisible shape labels among the defects. Seven layouts received documented operator polish. The initial 7.5/10 score for repaired output was withdrawn after the user rejected the creative quality. The repairs improved readability and correctness, but the ads still resemble sparse animated slides. A product-demo reference is being rebuilt with deliberate pacing and art direction. No campaign outcomes were measured.

The benchmark prompted new design gates for settled text bounds, supplied-logo overlap, invented domains, and text stored in shape metadata. Coordinates are now explicitly top-left, assets include dimensions in design context, and usage counts every correction attempt. A real scoped AI repair took 5.4 seconds and preserved unrelated scenes and audio. Originals, final projects, videos, metrics, ratings, and a comparison player are in the ignored `.motion-proof/velos-ads/` directory.

To replay the prepared benchmark, `node motion/ad-benchmark.mjs` uses the isolated API, prepared logo/audio assets, live provider, and daily allowance; completed projects are resumed rather than regenerated. `node motion/ad-inspect.mjs` inspects actual local export files. `node motion/ad-gallery.mjs` builds the comparison player from the recorded evidence. `motion/ad-polish.mjs` records the operator repairs for this particular batch; it is not part of automatic AI generation.

Serve the comparison locally with `python3 -m http.server 5180 --bind 127.0.0.1 --directory .motion-proof/velos-ads` and open http://127.0.0.1:5180/. Original and refined versions remain available, including both initial design failures in the log. This is a small sequential benchmark against one model; it does not establish comparative provider quality or audience conversion performance.

## Creative rebuild after user rejection

The user rejected the eight-ad batch. The earlier numerical creative score is withdrawn. Layout fixes and successful exports do not meet the polished-beta creative bar.

A manually art-directed 16.5-second reference is saved as `.motion-proof/velos-ads/reference-rebuild.mp4` and as an editable Studio project. It uses actual captured editor screens, a real before/after text edit, six varied shots, an original synthesized score, quick entrances and hard cuts. New bounded image/video camera keyframes (`zoom`, `panX`, `panY`) animate media inside a clipped frame. Entrance and exit fade timing are editable; existing projects retain their prior defaults. Seventeen checks and the production build pass. Client-aborted file transfers no longer attempt error responses on a closed connection.

`node motion/reference-ad.mjs fixture` prepares the actual demo canvas; `assemble` consumes the captured JPEG screens and original WAV; `render` produces the shared-composition QA video. The reference is manually designed, not an automatic AI-quality claim. Its direct local QA render did not alter product quotas or billing; the original eight-ad benchmark used 297 of 300 daily development render seconds.

`node motion/reference-ai-check.mjs` is an opt-in live provider retest. The real retest produced six shots after two model attempts in 50.7 seconds. It used the supplied editor images, a timed before/after swap and camera moves. The unmodified visual result still fails the creative bar: repetitive sparse blocks, weak framing, a visually colliding caption/accent, and a text-only format payoff. The report preserves that failure without assigning a favorable score. That result motivated the guided pipeline described below; unrestricted generation remains experimental.

## Guided creative pipeline and Gemini 3.8 migration

The earlier guided pipeline remains available as **Template starting point**. The AI produces a constrained story plan: copy, visual direction, palette, shot order, duration weights, and actual asset references. A trusted compiler creates ordinary editable native layers using ten layouts: editorial poster, kinetic words, workflow, real product screen, refinement, formats, orbit, collage, ribbons, and close. The close remains readable for at least two seconds after its entrance and occupies at most 3.6 seconds. Native word/line entrances, tracking, outlines, shadows, continuous linear/smooth motion, and clipped camera controls are available in the inspector. Critical text still passes bounds, factual-destination, media, and contrast checks. Explicit storyboard selections are validated. Freeform coordinate generation remains an experimental option; scoped refinement preserves unrelated IDs and locked branding.

On the user's instruction, Motion was migrated to `google/gemini-3.8-flash`, verified in both the current provider catalog and a real generation response. The OpenRouter attribution header is `X-Title: Greta`. Motion has a dedicated model setting and no longer inherits the legacy autopilot model. The current request uses high reasoning, omits deprecated sampling parameters for this model, and allows a larger response budget. Usage records distinguish the requested model from the actual response model, and count all correction attempts. Studio displays the configured model. That migration passed 24 checks; the current expanded suite passes 31.

The old freeform batch, manual reference, and Gemini 2.5 guided rebuild remain under `.motion-proof/velos-ads/` and its `v2/` subdirectory. The new Gemini 3.8 batch is saved separately in `v3/`. Each new ad has an AI story JSON, editable project JSON, local Studio project, full H.264/AAC MP4, and early/settled shot frames. These are generated artifacts, ignored by Git. Existing user projects were preserved.

`node motion/creative-benchmark.mjs` runs or resumes the **live** eight-ad Gemini 3.8 batch. `--limit=1` limits the prototype; `--only=<slug>` limits a concept. `--rerender` recomposes accepted plans using the current shared layouts; `--render-current` renders the saved native project without overwriting a targeted edit. `node motion/creative-inspect.mjs` fully decodes the clips, checks media metadata and audio peaks, and generates review sheets. `node motion/creative-gallery.mjs` builds the comparison player at http://127.0.0.1:5180/v3/ when the earlier local server is running. `--batch=v2` inspects preserved older evidence; it does not change the configured model.

New clips use direct local QA renders through the same composition as Studio. The original batch used 297 of 300 daily development export seconds. This QA work changes neither export allowance nor billing records; it is not evidence of additional normal queued exports. AI generation still uses the real Studio API and its daily AI allowance. All clips share an original synthesized score; voiceover and campaign performance remain untested. A newer model alone does not establish professional creative quality: every final output still requires visual review.

## Deploying the standalone services

Use the standalone Motion API and a separate worker:

```sh
npm run motion:api
npm run motion:worker
```

Configure a dedicated MongoDB, the existing Velos `JWT_SECRET`, `MOTION_PUBLIC_API_URL`, and `MOTION_FRONTEND_ORIGIN`. The API verifies existing Velos login JWTs; it has no local-session endpoint. Route `/api/motion` to it and retain the established login service. Configure the frontend's API base to the matching proxy. The worker must reach the absolute signed media URL. Initialize the MotionRecord unique index before allowing traffic (the standalone entry does this).

The production default is private S3 (`AWS_REGION`, `AWS_S3_BUCKET_NAME`, IAM credentials). Keep the bucket private and restrict the worker/API role to the `motion/` prefix. The alternative `MOTION_STORAGE=local` requires a durable shared volume for API and worker. Never use ephemeral container storage for retained files.

The Dockerfile and compose example are provided in `deploy/motion`. They install ffprobe and the renderer's browser. They have **not** been deployed or verified against real S3. The compose example uses a shared local volume and an externally configured MongoDB. Put a TLS reverse proxy in front of the loopback API; do not expose MongoDB. Separate workers atomically claim jobs, renew 45-second leases, and reclaim expired jobs after restart. Three recovery attempts are allowed. Set renderer concurrency to match measured CPU/memory capacity.

The integrated legacy backend also mounts Motion when `MOTION_PUBLIC_API_URL` is set. Use `MOTION_INLINE_WORKER=true` only for a deliberately small deployment; separate workers are the normal production path. The legacy social/publishing APIs need their own complete ownership and deduplication audit before broader exposure; social publishing is not a destination in this motion beta.

## Operations and retention

- Back up MongoDB and the asset/export storage together. Local development backups must include the signing key and records/blobs directories.
- Alert on failed jobs, expired leases, rendering latency, provider errors, and storage pressure. Logs must exclude provider keys, database connection strings, and signed media tickets.
- Keep assets referenced by any project revision or job. The beta deliberately archives projects rather than permanently deleting their files. Set an explicit retention policy before public release; no automatic destructive cleanup is enabled.
- Old signed media links expire after four hours. Reload the studio to obtain fresh links. A job obtains fresh links for each render attempt.
- The existing Razorpay handler now requires a raw-body signature, owner-bound authenticated billing requests, and one grant per subscription billing period. Live checkout/webhook delivery has not been exercised; local signature, concurrency, and duplicate-grant tests are recorded separately.
- Verify Remotion's applicable company/automation license before commercial release: https://www.remotion.dev/docs/license/pricing . AI, CPU, storage, and license costs are separate.

Automatic transcription is implemented according to the official API but **unverified against a live speech account**, because none is configured. Voice synthesis, arbitrary generated React code, collaboration, and automatic social publishing are outside this beta. The deployment remains a separate release action.

The final Gemini 3.8 benchmark contains eight verified MP4s. All story plans passed on their first response; factual copy review corrected three ads, and a real layer-scoped refinement preserved three unrelated scenes, ten locked layers and audio. The local comparison gallery includes each correction and the original AI story alongside the final editable project. The subjective creative review is 6.5/10 and leaves polished-beta creative acceptance open. Desktop and mobile canvas fit were corrected; accepting a scoped proposal now retains the selected scene/layer and clears stale redo history.

## Automatic original compositions — 30 September 2026

The default create pipeline no longer supplies or chooses a catalog layout. Gemini writes bounded, editable scene/layer geometry and keyframes from the brief and owned assets. The shared Remotion renderer now captures four actual frames per scene: opening, action, settled view and the exact last frame. A multimodal review checks those images; a rejected draft gets one repair cycle and a second review. Failure leaves the saved project intact. Approval is an internal heuristic, not independent creative acceptance, and sampled frames do not establish that every animation frame is correct. The request has a four-minute deadline and at most eight provider calls, including JSON correction attempts. One bounded pipeline consumes one AI operation; recorded token/cost totals include every provider response.

The reviewer also writes a timed musical event score. A deterministic local synthesizer renders those notes into a private WAV asset with bounded peaks and a closing fade. This supports instrumental tones, percussion and cues, not voice synthesis or a professional music-generation service. An explicit silence request is honored; an explicitly requested uploaded soundtrack can be used instead. Each generated score remains a normal editable audio track.

Automatic creation saves a recoverable revision and queues the ordinary immutable export with the existing allowance and idempotency rules. If export allowance is exhausted, the design stays saved and the UI explains that export must wait. Concurrent manual edits stay local for comparison. An audio-asset refresh failure cannot roll the draft back to the previous saved revision.

All 31 checks, lint and production build pass. The offline integration fixture (`node motion/automatic-proof.mjs`) rendered eight real preview images and a 12-second H.264/AAC MP4, verified full decode, and checked distinct bounded sound scores. It deliberately reuses historical visuals and is not a new live AI creative benchmark. Fresh live automatic generation remains unverified because the existing local day has used 30/30 AI operations and 297/300 render seconds; a requested temporary local test allowance is awaiting the user's answer. Production limits have not changed. `MOTION_LOCAL_AI_LIMIT` is an explicit loopback-development setting (default 30, range 1–100); it never affects production.

The earlier eight-ad creative score and open polished-beta acceptance remain historical evidence. This implementation does not establish professional output quality or campaign performance.

`node motion/automatic-ad-check.mjs` is the opt-in live test for the original square Velos ad brief saved under `.motion-proof/automatic-flow/`. It uses the normal AI allowance and queued export, records every automatic review and provider usage, downloads the authenticated result, and resumes an existing project/job without regenerating. The current fresh run stops before any provider call at the exhausted allowance. The historical ad 08 posting review and 30-frame timeline are separate evidence; that version is not recommended for a launch post.

## 9/10 target and moving-result reference

The requested 9/10 target is an internal review threshold, not a verified quality result. Review now requires separate hook, visible proof, motion, phone readability, brand and ending ratings. The overall rating is capped by their weighted average, and any criterion below 8 blocks automatic approval. A high aggregate number cannot conceal tiny text. The saved project still survives rejection. The expanded suite has 34 passing checks; lint and production build pass. Live original AI output remains pending the local allowance answer.

`node motion/launch-reference.mjs` builds a separate **manually designed** 15-second square reference with an original operator score. It uses real before/after editor captures and includes a real MP4 rendered from that same edited Studio project, replacing the earlier static result shot. The source project and revision are recorded, and the reference remains editable in Studio. Its direct local QA render is not a normal queued export and uses no provider request. `.motion-proof/launch-reference/` preserves the earlier result for comparison, final frames, timeline, source JSON, score and evidence. This reference demonstrates renderer capability; it does not establish that the automatic generator reliably meets 9/10.
