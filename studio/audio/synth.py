"""Seovyn's sound, synthesized from scratch (no samples, so every sound is original and ours to use).

Writes public/audio/sfx/*.wav (the UI sound kit) and public/audio/music-<id>.wav (one bed per video, cut to its length).
The music is one theme in A minor at 120 bpm (a beat is 15 frames at 30 fps): a filtered pad and a plucked arpeggio
for the intro, drums and a sidechained sub from `drums` onward, and a held final chord under the end card.

    .venv/bin/python audio/synth.py
"""

import json
import os
import sys

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

SR = 48000
FPS = 30
BPM = 120
BEAT = 60 / BPM
BAR = BEAT * 4
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "public", "audio")
rng = np.random.default_rng(7)


# ─── basics ──────────────────────────────────────────────────────────────


def t_axis(seconds):
    return np.arange(int(seconds * SR)) / SR


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def lp(x, hz, order=2):
    return sosfilt(butter(order, min(hz, SR * 0.45), "low", fs=SR, output="sos"), x, axis=0)


def hp(x, hz, order=2):
    return sosfilt(butter(order, hz, "high", fs=SR, output="sos"), x, axis=0)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, min(hi, SR * 0.45)], "band", fs=SR, output="sos"), x, axis=0)


def sweep_filter(x, f0, f1, kind="band", width=1.0, block=512):
    """Filter whose centre glides from f0 to f1 (log), block by block."""
    out = np.zeros_like(x)
    n = len(x)
    for start in range(0, n, block):
        frac = start / max(1, n - 1)
        fc = f0 * (f1 / f0) ** frac
        if kind == "band":
            sos = butter(2, [fc / (1 + width), min(fc * (1 + width), SR * 0.45)], "band", fs=SR, output="sos")
        elif kind == "high":
            sos = butter(2, fc, "high", fs=SR, output="sos")
        else:
            sos = butter(2, min(fc, SR * 0.45), "low", fs=SR, output="sos")
        seg = x[max(0, start - 2048) : start + block]
        out[start : start + block] = sosfilt(sos, seg)[-len(x[start : start + block]) :]
    return out


def env_ad(n, attack, decay_tau):
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-np.maximum(0, t - attack) / decay_tau)


def stereo(x, width=0.0):
    """Mono → stereo; width > 0 adds a tiny Haas offset for space."""
    if x.ndim == 2:
        return x
    if width <= 0:
        return np.stack([x, x], axis=1)
    d = int(width * SR)
    r = np.concatenate([np.zeros(d), x[:-d]]) if d else x
    return np.stack([x, r], axis=1)


_IR = {}


def reverb(x, seconds=2.2, wet=0.3, tone=5000):
    key = (seconds, tone)
    if key not in _IR:
        t = t_axis(seconds)
        ir = rng.standard_normal((len(t), 2)) * np.exp(-t / (seconds / 6.5))[:, None]
        ir = lp(ir, tone)
        ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))[:, None]
        _IR[key] = ir / np.sqrt(np.sum(ir**2, axis=0, keepdims=True))
    ir = _IR[key]
    x2 = stereo(x)
    w = np.stack([fftconvolve(x2[:, c], ir[:, c])[: len(x2)] for c in range(2)], axis=1)
    return x2 * (1 - wet) + w * wet


def place(buf, clip, at_s, gain=1.0):
    i = int(at_s * SR)
    if i >= len(buf):
        return
    clip = stereo(clip)
    j = min(len(buf), i + len(clip))
    buf[i:j] += clip[: j - i] * gain


def norm(x, peak_db=-1.0):
    p = np.max(np.abs(x)) or 1.0
    return x / p * 10 ** (peak_db / 20)


def write(path, x):
    x = np.clip(stereo(x), -1, 1)
    wavfile.write(path, SR, (x * 32767).astype(np.int16))


# ─── sound effects ───────────────────────────────────────────────────────


def sfx_click():
    n = int(0.06 * SR)
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * 1900 * t) * np.exp(-t / 0.008)
    snap = hp(rng.standard_normal(n), 2500) * np.exp(-t / 0.0025)
    thump = np.sin(2 * np.pi * 180 * t) * np.exp(-t / 0.012) * 0.6
    return reverb(norm(body * 0.5 + snap * 0.8 + thump, -3), 0.4, 0.12)


def sfx_tick(freq=2400):
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * freq * t) + 0.25 * np.sin(2 * np.pi * freq * 2.01 * t)
    x *= env_ad(n, 0.001, 0.025)
    return reverb(norm(x, -4), 0.6, 0.18)


def sfx_pop():
    n = int(0.16 * SR)
    t = np.arange(n) / SR
    f = 280 + 620 * (1 - np.exp(-t / 0.018))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_ad(n, 0.002, 0.045)
    x += 0.15 * hp(rng.standard_normal(n), 3000) * np.exp(-t / 0.004)
    return reverb(norm(x, -3), 0.5, 0.15)


def sfx_whoosh(seconds=0.7, f0=250, f1=4500):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    x = sweep_filter(noise, f0, f1, "band", 0.6)
    shape = np.sin(np.pi * np.clip(t / seconds, 0, 1)) ** 1.6
    x = x * shape
    return reverb(stereo(norm(x, -3), 0.004), 1.2, 0.25)


def sfx_type(i):
    n = int(0.05 * SR)
    t = np.arange(n) / SR
    pitch = [3200, 2800, 3600, 3000][i]
    snap = lp(hp(rng.standard_normal(n), 1200), pitch) * np.exp(-t / 0.004)
    thock = np.sin(2 * np.pi * (140 + 20 * i) * t) * np.exp(-t / 0.01) * 0.5
    return reverb(norm(snap + thock, -6), 0.3, 0.08)


def bell(freq, seconds=1.2, bright=1.0):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for ratio, amp, tau in [(1, 1, 0.5), (2.0, 0.35 * bright, 0.25), (3.01, 0.18 * bright, 0.15), (4.2, 0.08 * bright, 0.08)]:
        x += amp * np.sin(2 * np.pi * freq * ratio * t) * np.exp(-t / tau)
    return x * np.clip(t / 0.003, 0, 1)


def sfx_chime():
    x = np.zeros(int(1.6 * SR))
    for k, (note, at) in enumerate([(76, 0.0), (83, 0.07)]):
        b = bell(midi(note), 1.4)
        i = int(at * SR)
        x[i : i + len(b)] += b * (0.8 if k == 0 else 1)
    return reverb(norm(x, -3), 1.8, 0.3)


def sfx_autopilot():
    x = np.zeros(int(2.4 * SR))
    for k, note in enumerate([69, 72, 76, 79, 84]):
        b = bell(midi(note), 1.8, 0.8)
        i = int(k * 0.055 * SR)
        x[i : i + len(b)] += b * (0.6 + k * 0.1)
    shimmer = hp(rng.standard_normal(len(x)), 7000) * np.exp(-np.arange(len(x)) / SR / 0.5) * 0.05
    return reverb(norm(x + shimmer, -2), 2.4, 0.38)


def sfx_notify():
    x = np.zeros(int(1.2 * SR))
    for note, at in [(79, 0.0), (86, 0.11)]:
        b = bell(midi(note), 0.9, 0.6)
        i = int(at * SR)
        x[i : i + len(b)] += b
    return reverb(norm(x, -4), 1.4, 0.3)


def sfx_error():
    """Two soft descending notes: below the bar."""
    parts = []
    for f in (330, 247):
        n = int(0.16 * SR)
        t = np.arange(n) / SR
        tone = np.sign(np.sin(2 * np.pi * f * t)) * 0.5
        parts.append(lp(tone, 1400) * env_ad(n, 0.004, 0.06))
    x = np.concatenate(parts + [np.zeros(int(0.2 * SR))])
    return reverb(norm(x, -6), 0.8, 0.2)


def sfx_riser(seconds=1.6):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    noise = sweep_filter(rng.standard_normal(n), 400, 9000, "high")
    f = 180 * (6 ** (t / seconds))
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25
    x = (noise * 0.6 + tone) * (t / seconds) ** 2.2
    return reverb(stereo(norm(x, -4), 0.006), 1.5, 0.3)


def sfx_impact():
    n = int(2.6 * SR)
    t = np.arange(n) / SR
    f = 34 + 70 * np.exp(-t / 0.08)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.55)
    hit = lp(rng.standard_normal(n), 3500) * np.exp(-t / 0.05) * 0.5
    x = np.tanh((sub + hit) * 1.6)
    return reverb(norm(x, -1), 2.8, 0.32)


def sfx_ping():
    x = bell(midi(91), 1.0, 0.3) * 0.9
    echo = np.zeros(int(1.6 * SR))
    for k in range(4):
        i = int(k * 0.19 * SR)
        echo[i : i + len(x)] += x * (0.55**k)
    return reverb(norm(echo, -5), 1.6, 0.35)


def sfx_scratch():
    n = int(0.22 * SR)
    t = np.arange(n) / SR
    x = sweep_filter(rng.standard_normal(n), 1800, 600, "band", 0.5) * env_ad(n, 0.01, 0.07)
    return reverb(norm(x, -5), 0.5, 0.15)


def sfx_swipe():
    return sfx_whoosh(0.32, 900, 6000)


def make_sfx():
    d = os.path.join(OUT, "sfx")
    os.makedirs(d, exist_ok=True)
    kit = {
        "click": sfx_click(),
        "tick": sfx_tick(),
        "tick-hi": sfx_tick(3200),
        "pop": sfx_pop(),
        "whoosh": sfx_whoosh(),
        "swipe": sfx_swipe(),
        "chime": sfx_chime(),
        "autopilot": sfx_autopilot(),
        "notify": sfx_notify(),
        "error": sfx_error(),
        "riser": sfx_riser(),
        "impact": sfx_impact(),
        "ping": sfx_ping(),
        "scratch": sfx_scratch(),
    }
    for i in range(4):
        kit[f"type{i}"] = sfx_type(i)
    for name, clip in kit.items():
        write(os.path.join(d, f"{name}.wav"), clip)
    return list(kit)


# ─── music ───────────────────────────────────────────────────────────────

# i – VI – III – VII in A minor, voiced close: (bass, chord tones).
CHORDS = [
    (45, [57, 60, 64, 67]),  # Am7
    (41, [57, 60, 64, 65]),  # Fmaj7 (A C E F)
    (48, [55, 60, 64, 67]),  # C
    (43, [55, 59, 62, 67]),  # G
]
ARP = [0, 2, 3, 1, 2, 3, 0, 2, 1, 3, 2, 0, 3, 2, 1, 2]


def saw(freq, t):
    return 2 * ((t * freq) % 1.0) - 1


def pad_layer(total, end_s, bright_at):
    n = int(total * SR)
    t = np.arange(n) / SR
    out = np.zeros((n, 2))
    bars = int(np.ceil(total / BAR)) + 1
    for b in range(bars):
        start = b * BAR
        if start >= total:
            break
        last = start >= end_s - 0.01
        root, tones = CHORDS[b % 4] if not last else CHORDS[0]
        length = (total - start) if last else BAR + 0.6
        i0, i1 = int(start * SR), min(n, int((start + length) * SR))
        tt = t[i0:i1] - start
        seg = np.zeros((i1 - i0, 2))
        for note in tones:
            for c, det in enumerate([-0.11, 0.11]):
                f = midi(note + det)
                seg[:, c] += saw(f, tt + rng.random()) + 0.6 * saw(f * 1.003, tt + rng.random())
        e = np.clip(tt / 0.35, 0, 1) * np.clip((length - tt) / 0.6, 0, 1)
        out[i0:i1] += seg * e[:, None] * 0.085
        if last:
            break
    dark, bright = lp(out, 700, 2), lp(out, 3200, 2)
    mix = np.clip((t - bright_at + 2) / 4, 0, 1)[:, None]
    return dark * (1 - mix) + bright * mix


def pluck(freq, seconds=0.5):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    x = (np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * freq * 2 * t) + 0.12 * np.sin(2 * np.pi * freq * 3 * t)) * env_ad(n, 0.002, 0.13)
    return x


def arp_layer(total, end_s, start_s):
    n = int(total * SR)
    out = np.zeros((n, 2))
    step = BEAT / 4
    k = 0
    s = start_s
    while s < min(total, end_s + BAR):
        bar = int(s / BAR)
        _, tones = CHORDS[bar % 4]
        note = tones[ARP[k % 16]] + 12
        vel = 0.9 if k % 4 == 0 else 0.6
        if s >= end_s:
            vel *= max(0, 1 - (s - end_s) / BAR)
        pan = 0.5 + 0.25 * np.sin(k * 0.7)
        clip = pluck(midi(note)) * vel * 0.2
        place(out, np.stack([clip * (1 - pan) * 1.4, clip * pan * 1.4], axis=1), s)
        s += step
        k += 1
    # ping-pong delay at 3/16
    d = int(BEAT * 0.75 * SR)
    delayed = np.zeros_like(out)
    delayed[d:, 0] = out[:-d, 1] * 0.45
    delayed[2 * d :, 1] = out[: -2 * d, 0] * 0.3
    return lp(out + delayed, 5200)


def kick():
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 44 + 120 * np.exp(-t / 0.035)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.18)
    x += hp(rng.standard_normal(n), 3000) * np.exp(-t / 0.002) * 0.3
    return np.tanh(x * 1.5)


def clap():
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    e = np.zeros(n)
    for k, off in enumerate([0, 0.011, 0.022]):
        e += np.exp(-np.maximum(0, t - off) / (0.006 if k < 2 else 0.09)) * (t >= off)
    return bp(rng.standard_normal(n), 900, 4200) * e * 0.6


def hat(open_=False):
    n = int((0.18 if open_ else 0.05) * SR)
    t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 7500) * np.exp(-t / (0.05 if open_ else 0.012)) * 0.35


def drums_and_bass(total, drums_s, end_s):
    n = int(total * SR)
    drums = np.zeros((n, 2))
    bass = np.zeros(n)
    duck = np.ones(n)
    K, CL, H, OH = kick(), clap(), hat(), hat(True)
    s = drums_s
    beat = 0
    t = np.arange(n) / SR
    while s < end_s - 1e-6:
        place(drums, K, s, 0.62)
        i = int(s * SR)
        dl = int(0.28 * SR)
        j = min(n, i + dl)
        duck[i:j] = np.minimum(duck[i:j], 0.45 + 0.55 * (np.arange(j - i) / dl) ** 0.7)
        if beat % 2 == 1:
            place(drums, reverb(CL, 1.0, 0.25), s, 0.55)
        place(drums, stereo(OH, 0.003), s + BEAT / 2, 0.45)
        place(drums, H, s + BEAT / 4, 0.22)
        place(drums, H, s + 3 * BEAT / 4, 0.22)
        s += BEAT
        beat += 1
    # sub bass on the chord roots, under the drums
    for b in range(int(np.ceil(total / BAR))):
        start = b * BAR
        if start + BAR <= drums_s - 1e-6 or start >= end_s:
            continue
        root, _ = CHORDS[b % 4]
        i0, i1 = int(max(start, drums_s) * SR), min(n, int(min(start + BAR, end_s) * SR))
        tt = t[i0:i1]
        f = midi(root)
        bass[i0:i1] += np.tanh(1.6 * (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(2 * np.pi * 2 * f * tt))) * 0.16
    bass = lp(bass, 170) * duck
    return drums, stereo(bass), duck


def make_music(vid, total_frames, drums_frame, end_frame):
    total = total_frames / FPS
    end_s = end_frame / FPS
    # drums come in on the beat nearest the cue
    drums_s = round(drums_frame / FPS / BEAT) * BEAT
    pad = pad_layer(total, end_s, drums_s)
    arp = arp_layer(total, end_s, 0.0)
    drums, bass, duck = drums_and_bass(total, drums_s, end_s)
    pad = reverb(pad, 3.0, 0.35) * duck[:, None] ** 0.6
    arp = reverb(arp, 2.2, 0.3) * duck[:, None] ** 0.35
    mix = pad * 1.0 + arp * 0.9 + drums * 0.85 + bass * 1.0
    n = len(mix)
    t = np.arange(n) / SR
    fade = np.clip(t / 0.4, 0, 1) * np.clip((total - t) / 1.6, 0, 1)
    mix *= fade[:, None]
    mix = hp(mix, 30)
    # loudness, not peak: the main section sits at about -20 dBFS RMS so sound effects ride on top
    i0, i1 = int(drums_s * SR), int(end_s * SR)
    body = mix[i0:i1] if i1 - i0 > SR else mix
    rms = np.sqrt(np.mean(body**2))
    mix *= 10 ** (-20 / 20) / rms
    peak = np.max(np.abs(mix))
    if peak > 0.89:
        mix = np.tanh(mix / 0.89) * 0.89
    write(os.path.join(OUT, f"music-{vid}.wav"), mix)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    print("sfx:", ", ".join(make_sfx()))
    plan = json.load(open(os.path.join(HERE, "music-plan.json")))
    only = sys.argv[1:]
    for vid, (frames, drums, end) in plan.items():
        if only and vid not in only:
            continue
        make_music(vid, frames, drums, end)
        print("music:", vid)
