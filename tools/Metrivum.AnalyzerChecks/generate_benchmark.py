"""Generate two deterministic 1080p/30fps clips for the opt-in full-pipeline benchmark."""
import argparse
import math
from pathlib import Path
import av
import cv2
import numpy as np

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('directory', type=Path)
args = parser.parse_args()
args.directory.mkdir(parents=True, exist_ok=True)
base = cv2.resize(np.random.default_rng(42).integers(0, 256, (256, 256, 3), dtype=np.uint8), (1920, 1080), interpolation=cv2.INTER_NEAREST)
for name, direction in [('a', 1), ('b', -1)]:
    with av.open(str(args.directory / (name + '.mp4')), 'w') as container:
        stream = container.add_stream('libx264', rate=30)
        stream.width = 1920; stream.height = 1080; stream.pix_fmt = 'yuv420p'
        stream.options = {'preset': 'ultrafast', 'crf': '18'}
        for i in range(90):
            image = np.roll(base, direction * round(70 * math.sin(2 * math.pi * i / 60)), axis=0)
            frame = av.VideoFrame.from_ndarray(image, format='bgr24'); frame.pts = i
            for packet in stream.encode(frame): container.mux(packet)
        for packet in stream.encode(): container.mux(packet)
