import React, { useEffect, useMemo, useState } from 'react';
import { Player, Thumbnail } from '@remotion/player';
import { StudioVideo, sizeOf } from '../../studio/remotion/Root.jsx';
import timing from '../../studio/remotion/timing.cjs';
import brandkit from '../../studio/remotion/brandkit.cjs';
import color from '../../Questera-Backend/studio/color.cjs';
import { audioBase, fileQuery, filesBase, request } from './api';

/* The live preview: the same Remotion composition the renderer uses, playing in the browser. Every storyboard frame and
   the editor canvas are the real video, so an edit shows the moment it is made; the MP4 export renders exactly this. */

export const { timeline } = timing;
export const sizeOfPlan = sizeOf;

/** The brand as captured (fonts, logo, screens with their elements), loaded once per job and re-read after a new capture. */
export function useCapturedBrand(job) {
  const [raw, setRaw] = useState(null);
  const ready = Boolean(job?.brand);
  const screens = job?.brand?.screens?.length || 0;
  useEffect(() => {
    if (!ready) return undefined;
    let live = true;
    request(`/jobs/${job.id}/preview`)
      .then((r) => live && setRaw(r.brand))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [job?.id, ready, screens, job?.withLogin]);
  return raw;
}

/** The captured brand with the user's kit applied, ready for the composition. */
export function useBrand(job, raw, kit) {
  const key = JSON.stringify(kit || null);
  return useMemo(() => {
    if (!raw) return null;
    return { ...brandkit.applyKit(raw, kit, color.buildPalette), assetBase: `${filesBase(job)}/capture`, assetQuery: fileQuery(job), audioBase };
  }, [raw, key, job.id]);
}

export const paletteFor = (raw, kit) => (raw ? brandkit.applyKit(raw, kit, color.buildPalette).palette : null);

/** The frame of a scene the storyboard shows: after its entrance has settled (as the visual check sees it). */
export function SceneFrame({ plan, scene, brand, size, className }) {
  const single = useMemo(() => ({ ...plan, size, scenes: [scene] }), [plan, scene, size]);
  const t = timing.timeline(single);
  const item = t.items[0];
  const frame = item.from + Math.max(0, Math.min(item.dur - 12, scene.type === 'focus' ? 110 : 70));
  const { width, height } = sizeOf(single);
  if (!brand) return <div className={`animate-pulse bg-white/[0.04] ${className || ''}`} style={{ aspectRatio: `${width} / ${height}` }} />;
  return (
    <div className={`overflow-hidden ${className || ''}`} style={{ aspectRatio: `${width} / ${height}` }}>
      <Thumbnail component={StudioVideo} compositionWidth={width} compositionHeight={height} frameToDisplay={frame} durationInFrames={t.total} fps={30} inputProps={{ plan: single, brand, music: false }} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

/** The whole video, with music and sound, at one size. */
export function VideoPlayer({ plan, brand, size, maxHeight = '70vh' }) {
  const sized = useMemo(() => ({ ...plan, size }), [plan, size]);
  const t = timing.timeline(sized);
  const { width, height } = sizeOf(sized);
  // Open on the product (the reveal, else the title) once it has settled, not on an empty first frame.
  const cover = t.items.find((i) => i.scene.type === 'reveal') || t.items.find((i) => i.scene.type === 'title') || t.items[0];
  const initialFrame = Math.min(t.total - 1, cover.from + Math.min(cover.dur - 12, 70));
  if (!brand) return <div className="grid w-full animate-pulse place-items-center rounded-xl bg-white/[0.04]" style={{ aspectRatio: `${width} / ${height}`, maxHeight }} />;
  return (
    <div className="mx-auto w-full overflow-hidden rounded-xl bg-black shadow-2xl shadow-black/50" style={{ aspectRatio: `${width} / ${height}`, maxWidth: `calc(${maxHeight} * ${width / height})` }}>
      <Player component={StudioVideo} inputProps={{ plan: sized, brand, music: true }} durationInFrames={t.total} fps={30} compositionWidth={width} compositionHeight={height} initialFrame={initialFrame} controls loop clickToPlay style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
