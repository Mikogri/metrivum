"""Trim and/or stabilize a lift video before tracking.

Stabilization aligns every frame to the reference frame (the one the coach marked the two points on), so those
points stay valid and positions are measured as if the camera had stood still. It removes camera translation,
rotation and zoom found in the background; it cannot recover detail that left the frame.

Usage: preprocess.py <motiontrace-ai-dir> <input> <output.mp4> <report.json> --start S --end E --reference R [--stabilize]
"""
import argparse
import json
import math
import sys
from fractions import Fraction

import av
import cv2
import numpy as np

ANALYSIS_WIDTH = 640  # motion is estimated on a downscaled copy; matrices are scaled back up


def parse():
    parser = argparse.ArgumentParser()
    parser.add_argument('ai'); parser.add_argument('input'); parser.add_argument('output'); parser.add_argument('report')
    parser.add_argument('--start', type=float, default=0.); parser.add_argument('--end', type=float, default=math.inf)
    parser.add_argument('--reference', type=float, required=True); parser.add_argument('--stabilize', action='store_true')
    return parser.parse_args()


def frames(ai, path, start, end):
    sys.path.insert(0, ai)
    from motiontrace_ai.video_decode import VideoDecoder  # same rotation and timestamps as the tracker
    # Frames before the trimmed part are decoded (their timestamps must be checked) but never turned into images.
    decoder = VideoDecoder(path, materialize=lambda index, timestamp: timestamp >= start - 1e-6)
    try:
        for timestamp, image in decoder:
            if timestamp < start - 1e-6:
                continue
            if timestamp > end + 1e-6:
                break
            yield decoder, timestamp, image
    finally:
        decoder.close()


def expected_frames(decoder, start, end):
    """Frames in the chosen part, for the progress bar; read from the decoder that is already open."""
    length = (min(end, decoder.duration) if decoder.duration else end) - start
    return max(1, int(length * decoder.fps)) if math.isfinite(length) and length > 0 else max(1, int(decoder.count or 1))


def progress(stage, fraction):
    """One JSON line per step; the analyzer turns them into the progress bar in TrainFlow."""
    print(json.dumps({'stage': stage, 'fraction': round(min(1., max(0., fraction)), 4)}), flush=True)


def small_gray(image, scale):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA) if scale != 1 else gray


def pairwise(previous, current):
    """Similarity transform mapping current -> previous from background corners (RANSAC ignores the moving lifter)."""
    corners = cv2.goodFeaturesToTrack(previous, maxCorners=400, qualityLevel=0.01, minDistance=12, blockSize=7)
    if corners is None or len(corners) < 12:
        return np.eye(3)
    moved, status, _ = cv2.calcOpticalFlowPyrLK(previous, current, corners, None, winSize=(21, 21), maxLevel=3)
    ok = status.reshape(-1) == 1
    if ok.sum() < 12:
        return np.eye(3)
    matrix, inliers = cv2.estimateAffinePartial2D(moved[ok], corners[ok], method=cv2.RANSAC, ransacReprojThreshold=2.0, maxIters=2000, confidence=0.995)
    if matrix is None or inliers is None or inliers.sum() < 10:
        return np.eye(3)
    return np.vstack([matrix, [0, 0, 1]])


def main():
    args = parse()
    if not args.end > args.start:
        raise ValueError('The trim end must be after its start.')
    total = None  # known once the video is open
    # Stabilizing reads the video twice: measuring movement is the first ~40 %.
    measure, write = (.4, .6) if args.stabilize else (0., 1.)
    label = 'Stabilizing video' if args.stabilize else 'Trimming video'
    first = None
    transforms = []  # current frame -> first frame, in downscaled pixels
    times = []
    width = height = 0
    if args.stabilize:
        previous = None
        chain = np.eye(3)
        for decoder, timestamp, image in frames(args.ai, args.input, args.start, args.end):
            width, height = decoder.width, decoder.height
            total = total or expected_frames(decoder, args.start, args.end)
            scale = min(1., ANALYSIS_WIDTH / width)
            gray = small_gray(image, scale)
            if previous is not None:
                chain = chain @ pairwise(previous, gray)
            transforms.append(chain.copy()); times.append(timestamp)
            previous = gray
            if len(times) % 10 == 0:
                progress('Measuring camera movement', measure * len(times) / total)
        if not times:
            raise ValueError('No frames in the chosen part of the video.')
        reference = min(range(len(times)), key=lambda i: abs(times[i] - args.reference))
        inverse = np.linalg.inv(transforms[reference])
        scale = min(1., ANALYSIS_WIDTH / width)
        up = np.diag([1 / scale, 1 / scale, 1]); down = np.diag([scale, scale, 1])
        # frame -> reference frame, in full-resolution pixels
        warps = [up @ inverse @ t @ down for t in transforms]
        shifts = [float(math.hypot(w[0, 2], w[1, 2])) for w in warps]
        rotations = [abs(math.degrees(math.atan2(w[1, 0], w[0, 0]))) for w in warps]
    container = av.open(args.output, mode='w')
    stream = None
    count = 0
    last = -1
    fps = 30.
    try:
        for decoder, timestamp, image in frames(args.ai, args.input, args.start, args.end):
            width, height = decoder.width, decoder.height
            total = total or expected_frames(decoder, args.start, args.end)
            if stream is None:
                if width % 2 or height % 2:
                    raise ValueError('Trimming or stabilizing needs a video with even width and height.')
                stream = container.add_stream('libx264', rate=Fraction(decoder.fps).limit_denominator(1001))
                stream.width, stream.height, stream.pix_fmt = width, height, 'yuv420p'
                stream.options = {'crf': '18', 'preset': 'veryfast', 'movflags': '+faststart'}
                stream.codec_context.time_base = Fraction(1, 1000)
                first = timestamp
                fps = decoder.fps
            if args.stabilize:
                image = cv2.warpAffine(image, warps[count][:2], (width, height), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
            frame = av.VideoFrame.from_ndarray(image, format='bgr24')
            pts = int(round((timestamp - first) * 1000))
            if pts <= last:
                pts = last + 1
            frame.pts, frame.time_base, last = pts, Fraction(1, 1000), pts
            for packet in stream.encode(frame):
                container.mux(packet)
            count += 1
            if count % 10 == 0:
                progress(label, measure + write * count / total)
        if stream is None:
            raise ValueError('No frames in the chosen part of the video.')
        for packet in stream.encode():
            container.mux(packet)
    finally:
        container.close()
    report = {'frames': count, 'startSeconds': first, 'durationSeconds': last / 1000 + 1 / fps if last >= 0 else 0, 'width': width, 'height': height}
    if args.stabilize:
        report['maxShiftPixels'] = max(shifts); report['maxRotationDegrees'] = max(rotations)
    with open(args.report, 'w', encoding='utf-8') as handle:
        json.dump(report, handle)


if __name__ == '__main__':
    main()
