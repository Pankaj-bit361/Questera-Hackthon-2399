"""Music moods for Studio videos, built with the synth in synth.py (original, no samples).

Each mood is three stems like stems.py writes for the default ("Pulse"): intro and main are 8-bar loops (16 s) on one
shared chord timeline and outro is a 6 s tail, all at 120 bpm, so scene cuts still land on the beat whichever mood the
user picks. Writes studio/remotion/public/studio-audio/music/<mood>/{intro,main,outro}.wav, at the same loudness as
the default stems (the renderer masters every video to -14 LUFS afterwards anyway).

    .venv/bin/python studio/audio/moods.py            (needs numpy and scipy)
"""

import os

import numpy as np

import synth
from synth import BAR, BEAT, SR, bp, env_ad, hp, lp, midi, place, reverb, stereo, write

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "remotion", "public", "studio-audio", "music")
LOOP_BARS = 8
rng = np.random.default_rng(7)


# ─── voices ──────────────────────────────────────────────────────────────

def keys(freq, seconds=1.1):
    """A soft electric-piano tone: sine with a little bell, slow decay."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * freq * t) + 0.22 * np.sin(2 * np.pi * freq * 2 * t) * np.exp(-t / 0.25) + 0.08 * np.sin(2 * np.pi * freq * 7 * t) * np.exp(-t / 0.04)
    return x * env_ad(n, 0.004, 0.42)


def saw_pluck(freq, seconds=0.32):
    """A bright, short saw pluck with a closing filter."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    x = sum(np.sin(2 * np.pi * freq * k * t) / k for k in range(1, 9))
    x = x * env_ad(n, 0.002, 0.09)
    return lp(x, 4200) * 0.8


def glass(freq, seconds=1.4):
    """A glassy bell: inharmonic partials, long ring."""
    n = int(seconds * SR)
    t = np.arange(n) / SR
    x = np.sin(2 * np.pi * freq * t) + 0.5 * np.sin(2 * np.pi * freq * 2.76 * t) * np.exp(-t / 0.3) + 0.25 * np.sin(2 * np.pi * freq * 5.4 * t) * np.exp(-t / 0.12)
    return x * env_ad(n, 0.003, 0.6)


# ─── moods ───────────────────────────────────────────────────────────────

MOODS = {
    # Warm and unhurried: D major I-vi-IV-V, electric piano in eighths, a soft kick and shaker, no clap.
    "calm": dict(
        chords=[(38, [62, 66, 69, 73]), (47, [62, 66, 69, 71]), (43, [62, 67, 71, 74]), (45, [61, 64, 69, 73])],
        arp=[0, 2, 1, 3, 2, 1, 3, 2],
        step=BEAT / 2,
        voice=keys,
        octave=0,
        arp_gain=0.16,
        pad_gain=0.8,
        kicks=[0, 2],
        kick_gain=0.42,
        claps=[],
        hats="shaker",
        bass="sustain",
        duck=0.7,
        pad_dark=900,
    ),
    # Driving: E minor i-VI-III-VII, bright saw plucks in sixteenths, four on the floor, clap on 2 and 4, pumping bass.
    "drive": dict(
        chords=[(40, [59, 64, 67, 71]), (36, [60, 64, 67, 71]), (43, [59, 62, 67, 71]), (38, [57, 62, 66, 69])],
        arp=[0, 1, 2, 3, 2, 1, 0, 2, 3, 1, 2, 0, 3, 2, 1, 3],
        step=BEAT / 4,
        voice=saw_pluck,
        octave=12,
        arp_gain=0.15,
        pad_gain=0.75,
        kicks=[0, 1, 2, 3],
        kick_gain=0.7,
        claps=[1, 3],
        hats="offbeat",
        bass="eighths",
        duck=0.35,
        pad_dark=1200,
    ),
    # Minimal and precise: C minor colours, sparse glass notes every three sixteenths, kick and ticking hats only.
    "minimal": dict(
        chords=[(36, [63, 67, 70, 74]), (44, [60, 63, 67, 72]), (39, [62, 67, 70, 74]), (46, [62, 65, 70, 74])],
        arp=[0, 3, 1, 2, 3, 0, 2, 1],
        step=BEAT * 0.75,
        voice=glass,
        octave=12,
        arp_gain=0.11,
        pad_gain=0.55,
        kicks=[0, 2.5],
        kick_gain=0.55,
        claps=[],
        hats="ticks",
        bass="sustain",
        duck=0.6,
        pad_dark=650,
    ),
}


def arp(m, total):
    n = int(total * SR)
    out = np.zeros((n, 2))
    # The pattern restarts on every bar, so any step size stays on the grid and the 8-bar loop repeats seamlessly.
    per_bar = int(round(BAR / m["step"] + 0.4999))
    k = 0
    for bar in range(int(np.ceil(total / BAR))):
        _, tones = m["chords"][bar % 4]
        for j in range(per_bar):
            s = bar * BAR + j * m["step"]
            if s >= total or j * m["step"] >= BAR - 1e-6:
                break
            note = tones[m["arp"][k % len(m["arp"])]] + m["octave"]
            vel = 0.9 if j % 4 == 0 else 0.62
            pan = 0.5 + 0.3 * np.sin(k * 0.9)
            clip = m["voice"](midi(note)) * vel * m["arp_gain"]
            place(out, np.stack([clip * (1 - pan) * 1.4, clip * pan * 1.4], axis=1), s)
            k += 1
    d = int(BEAT * 0.75 * SR)
    echo = np.zeros_like(out)
    echo[d:, 0] = out[:-d, 1] * 0.4
    echo[2 * d :, 1] = out[: -2 * d, 0] * 0.25
    return lp(out + echo, 6000)


def pad(m, total):
    synth.CHORDS = m["chords"]
    x = synth.pad_layer(total, total + 10, 9999)
    return lp(x, m["pad_dark"]) * m["pad_gain"]


def shaker():
    n = int(0.09 * SR)
    t = np.arange(n) / SR
    return bp(rng.standard_normal(n), 5000, 11000) * np.clip(t / 0.02, 0, 1) * np.exp(-t / 0.03) * 0.3


def drums(m, total):
    n = int(total * SR)
    out = np.zeros((n, 2))
    bass = np.zeros(n)
    duck = np.ones(n)
    K, CL, H, OH, SH = synth.kick(), synth.clap(), synth.hat(), synth.hat(True), shaker()
    t = np.arange(n) / SR
    bars = int(np.ceil(total / BAR))
    for b in range(bars):
        s0 = b * BAR
        for beat in m["kicks"]:
            s = s0 + beat * BEAT
            if s >= total:
                continue
            place(out, K, s, m["kick_gain"])
            i, dl = int(s * SR), int(0.28 * SR)
            j = min(n, i + dl)
            duck[i:j] = np.minimum(duck[i:j], m["duck"] + (1 - m["duck"]) * (np.arange(j - i) / dl) ** 0.7)
        for beat in m["claps"]:
            place(out, reverb(CL, 1.0, 0.25), s0 + beat * BEAT, 0.5)
        for q in range(16):
            s = s0 + q * BEAT / 4
            if m["hats"] == "shaker" and q % 2 == 0:
                place(out, stereo(SH, 0.004), s, 0.5 if q % 4 == 2 else 0.3)
            elif m["hats"] == "offbeat" and q % 4 == 2:
                place(out, stereo(OH, 0.003), s, 0.42)
            elif m["hats"] == "offbeat" and q % 2 == 1:
                place(out, H, s, 0.2)
            elif m["hats"] == "ticks":
                place(out, H, s, 0.16 if q % 4 == 0 else 0.08)
        root, _ = m["chords"][b % 4]
        i0, i1 = int(s0 * SR), min(n, int((s0 + BAR) * SR))
        tt = t[i0:i1]
        f = midi(root)
        tone = np.tanh(1.5 * (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(2 * np.pi * 2 * f * tt))) * 0.16
        if m["bass"] == "eighths":
            tone = tone * (((tt - s0) % (BEAT / 2)) < BEAT * 0.38)
        bass[i0:i1] += tone
    bass = lp(bass, 180) * duck
    return out, stereo(bass), duck


def loop(render, total_loops=3):
    total = BAR * LOOP_BARS * total_loops
    x = render(total)
    a, b = int(BAR * LOOP_BARS * SR), int(BAR * LOOP_BARS * 2 * SR)
    return x[a:b]


def stems(m):
    def intro(total):
        return hp(reverb(pad(m, total), 3.0, 0.35) + reverb(arp(m, total), 2.2, 0.3) * 0.9, 30)

    def main(total):
        d, b, duck = drums(m, total)
        p = reverb(pad(m, total), 3.0, 0.35) * duck[:, None] ** 0.6
        a = reverb(arp(m, total), 2.2, 0.3) * duck[:, None] ** 0.35
        return hp(p + a * 0.9 + d * 0.85 + b, 30)

    def outro():
        total = 6.0
        x = hp(reverb(pad(m, total), 3.0, 0.38) + reverb(arp(m, total), 2.2, 0.3) * 0.9, 30)
        t = np.arange(len(x)) / SR
        return x * np.clip((total - t) / 2.5, 0, 1)[:, None]

    return loop(intro), loop(main), outro()


if __name__ == "__main__":
    for name, m in MOODS.items():
        intro, main, outro = stems(m)
        # Loudness as LUFS hears it (roughly K-weighted: low cut, high shelf), so drums don't skew the match.
        rms = lambda x: np.sqrt(np.mean((hp(x, 60) + 0.58 * hp(x, 1500)) ** 2))
        gain = 10 ** (-20 / 20) / rms(main)
        # The intro sits 1.5 dB under the main loop and the outro 3 dB under, as in the default score, so the drop
        # doesn't jump in level whatever the mood.
        parts = {"intro": intro * gain * rms(main) / rms(intro) * 10 ** (-1.5 / 20), "main": main * gain, "outro": outro * gain * rms(main) / rms(outro) * 10 ** (-3 / 20)}
        d = os.path.join(OUT, name)
        os.makedirs(d, exist_ok=True)
        for part, x in parts.items():
            if np.max(np.abs(x)) > 0.89:
                x = np.tanh(x / 0.89) * 0.89
            write(os.path.join(d, f"{part}.wav"), x)
            print(name, part, f"{len(x) / SR:.2f}s", f"rms {20 * np.log10(np.sqrt(np.mean(x ** 2))):.1f} dBFS")
