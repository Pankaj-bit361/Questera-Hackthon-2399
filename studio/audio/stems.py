"""Music stems for Studio videos, built with the synth in synth.py (original, no samples).

Writes studio/remotion/public/studio-audio/{intro,main,outro}.wav. intro and main are 8-bar loops (16 s, 480 frames at
30 fps) on one shared chord timeline, so the renderer can switch from intro to main at any bar and loop either
seamlessly. Each loop is cut from the middle of a longer render, so its reverb tail is already present at the start.

    python3 -m venv .venv && .venv/bin/pip install numpy scipy
    .venv/bin/python studio/audio/stems.py
"""

import os

import numpy as np

import synth
from synth import BAR, SR, arp_layer, drums_and_bass, hp, norm, pad_layer, reverb, write

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "remotion", "public", "studio-audio")
LOOP_BARS = 8


def loop_from(render_fn):
    """Render three loops' worth and keep the middle one, so the loop starts with the tail of the one before."""
    total = BAR * LOOP_BARS * 3
    x = render_fn(total)
    a, b = int(BAR * LOOP_BARS * SR), int(BAR * LOOP_BARS * 2 * SR)
    return x[a:b]


def intro(total):
    pad = reverb(pad_layer(total, total + 10, 9999), 3.0, 0.35)
    arp = reverb(arp_layer(total, total + 10, 0.0), 2.2, 0.3)
    return hp(pad + arp * 0.9, 30)


def main(total):
    pad = pad_layer(total, total + 10, 0)
    arp = arp_layer(total, total + 10, 0.0)
    drums, bass, duck = drums_and_bass(total, 0.0, total + 10)
    pad = reverb(pad, 3.0, 0.35) * duck[:, None] ** 0.6
    arp = reverb(arp, 2.2, 0.3) * duck[:, None] ** 0.35
    return hp(pad + arp * 0.9 + drums * 0.85 + bass, 30)


def outro():
    total = 6.0
    pad = reverb(pad_layer(total, 0.0, 0), 3.0, 0.38)
    arp = reverb(arp_layer(total, 0.0, 0.0), 2.2, 0.3)
    x = hp(pad + arp * 0.9, 30)
    t = np.arange(len(x)) / SR
    return x * np.clip((total - t) / 2.5, 0, 1)[:, None]


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    m = loop_from(main)
    # one gain for all stems, set by the full-band loop, so the drop doesn't jump in level
    gain = 10 ** (-20 / 20) / np.sqrt(np.mean(m**2))
    stems = {"intro": loop_from(intro) * gain * 1.6, "main": m * gain, "outro": outro() * gain * 1.6}
    for name, x in stems.items():
        peak = np.max(np.abs(x))
        if peak > 0.89:
            x = np.tanh(x / 0.89) * 0.89
        write(os.path.join(OUT, f"{name}.wav"), x)
        print(name, f"{len(x) / SR:.2f}s", f"rms {20 * np.log10(np.sqrt(np.mean(x ** 2))):.1f} dBFS")
