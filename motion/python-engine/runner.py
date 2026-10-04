"""Trusted container bridge. Generated scenes never execute in the API process."""
import ast
import base64
import contextlib
import importlib.util
import io
import json
import math
import os
import pathlib
import resource
import subprocess
import sys

import numpy as np
from PIL import Image

INPUT = pathlib.Path('/input')
OUTPUT = pathlib.Path('/output')
ALLOWED_IMPORTS = {'engine', 'math', 'numpy', 'scipy.ndimage'}
FORBIDDEN_NAMES = {'open', 'exec', 'eval', 'compile', '__import__', 'input', 'breakpoint',
                   'globals', 'locals', 'vars', 'getattr', 'setattr', 'delattr', 'help'}


def validate_source(source):
    if not source or len(source) > 80000:
        raise ValueError('Scene code must be under 80,000 characters.')
    tree = ast.parse(source)
    if not any(isinstance(n, ast.FunctionDef) and n.name == 'render_frame' for n in tree.body):
        raise ValueError('Define render_frame(fi).')
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            if any(n.name not in ALLOWED_IMPORTS for n in node.names):
                raise ValueError('Use only engine, math, numpy or scipy.ndimage imports.')
        if isinstance(node, ast.ImportFrom) and (node.module not in ALLOWED_IMPORTS or node.level):
            raise ValueError('This scene import is unsupported.')
        if isinstance(node, ast.Name) and (node.id in FORBIDDEN_NAMES or node.id.startswith('__')):
            raise ValueError('File, process and dynamic execution helpers are unsupported.')
        if isinstance(node, ast.Attribute) and node.attr.startswith('__'):
            raise ValueError('Private runtime attributes are unsupported.')
    # This is a compatibility filter, NOT a security boundary. Docker isolation is required.


def frame(scene, fi, width, height):
    with contextlib.redirect_stdout(io.StringIO()):
        value = scene.render_frame(fi)
    if not isinstance(value, np.ndarray) or value.shape != (height, width, 3):
        raise ValueError(f'Frame {fi} must be an H×W×3 numpy array.')
    if value.dtype != np.uint8:
        raise ValueError(f'Frame {fi} must be uint8; return to_u8(canvas).')
    return np.ascontiguousarray(value)


def main():
    resource.setrlimit(resource.RLIMIT_FSIZE, (96 * 1024 * 1024, 96 * 1024 * 1024))
    config = json.loads((INPUT / 'config.json').read_text())
    mode = config['mode']
    full_width, full_height = config['width'], config['height']
    scale = min(1, 640 / max(full_width, full_height)) if mode == 'preview' else 1
    width = max(2, int(round(full_width * scale / 2)) * 2)
    height = max(2, int(round(full_height * scale / 2)) * 2)
    os.environ.update(MOTION_WIDTH=str(width), MOTION_HEIGHT=str(height), MOTION_DURATION=str(config['duration']))
    source = (INPUT / 'scene.py').read_text()
    validate_source(source)
    spec = importlib.util.spec_from_file_location('scene', INPUT / 'scene.py')
    scene = importlib.util.module_from_spec(spec)
    with contextlib.redirect_stdout(io.StringIO()):
        spec.loader.exec_module(scene)
    n = round(config['duration'] * 30)
    OUTPUT.mkdir(exist_ok=True)
    if mode == 'preview':
        images = []
        for sample in config['samples']:
            fi = sample['frame']
            if not isinstance(fi, int) or not 0 <= fi < n:
                raise ValueError('Preview frame is outside the video.')
            image = Image.fromarray(frame(scene, fi, width, height))
            buf = io.BytesIO()
            image.save(buf, format='JPEG', quality=85)
            images.append({**sample, 'data': base64.b64encode(buf.getvalue()).decode('ascii')})
        print(json.dumps({'images': images}))
        return
    if mode != 'render':
        raise ValueError('Unknown render mode.')
    cmd = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
           '-s', f'{width}x{height}', '-r', '30', '-i', '-']
    if (INPUT / 'audio.wav').exists():
        cmd += ['-i', str(INPUT / 'audio.wav'), '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '192k']
    else:
        cmd += ['-an']
    cmd += ['-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-threads', '2',
            '-maxrate', '14M', '-bufsize', '28M', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
            str(OUTPUT / 'video.mp4')]
    with subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE) as ff:
        try:
            for fi in range(n):
                image = frame(scene, fi, width, height)
                ff.stdin.write(image.tobytes())
                if fi == min(45, n - 1):
                    Image.fromarray(image).save(OUTPUT / 'poster.png')
                if fi % 15 == 0:
                    print(f'MOTION_PROGRESS {fi / n:.4f}', file=sys.stderr, flush=True)
            ff.stdin.close()
            error = ff.stderr.read().decode('utf8', errors='replace')
            if ff.wait() != 0:
                raise RuntimeError(f'Video encoder failed: {error[:500]}')
        except BaseException:
            ff.kill()
            ff.wait()
            raise
    video = (OUTPUT / 'video.mp4').read_bytes()
    poster = (OUTPUT / 'poster.png').read_bytes()
    print(json.dumps({'video': base64.b64encode(video).decode('ascii'),
                      'poster': base64.b64encode(poster).decode('ascii'),
                      'frames': n, 'width': width, 'height': height}))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'MOTION_ERROR {type(error).__name__}: {str(error)[:1200]}', file=sys.stderr)
        sys.exit(1)
