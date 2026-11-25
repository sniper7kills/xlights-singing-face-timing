"""Compares the rendered mouth of each model with the phoneme layer of its timing track.

Each model has 13 nodes. Node n (1-based) shows one face part: 1 AI, 2 E, 3 FV, 4 L, 5 MBP, 6 O, 7 U,
8 WQ, 9 etc, 10 rest, 11 Eyes-Open, 12 Eyes-Closed, 13 FaceOutline.
"""
import struct
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

PARTS = ["AI", "E", "FV", "L", "MBP", "O", "U", "WQ", "etc", "rest", "Eyes-Open", "Eyes-Closed", "FaceOutline"]
FRAME_MS = 50
render_dir = Path(sys.argv[1])
xtiming = Path(sys.argv[2])
models = {"LeadTree": "Lead", "ChorusPumpkin1": "Chorus", "ChorusPumpkin2": "Chorus"}

root = ET.parse(xtiming).getroot()
tracks = {t.get("name"): [list(layer) for layer in t.findall("EffectLayer")] for t in root.findall("timing")}


def expected(track, frame):
    t = frame * FRAME_MS + 1  # FacesEffect.cpp reads the phoneme at curPeriod * frameTimeInMs + 1.
    for e in tracks[track][2]:
        if int(e.get("starttime")) <= t < int(e.get("endtime")):
            return e.get("label")
    return "rest"


def frames(path):
    data = path.read_bytes()
    assert data[:4] == b"ESEQ", data[:4]
    # FSEQFile.cpp reads the frame size from offset 8. Offset 16 holds the channel count of the model.
    stride = struct.unpack("<I", data[8:12])[0]
    channels = struct.unpack("<I", data[16:20])[0]
    body = data[20:]
    assert len(body) % stride == 0, (len(body), stride)
    return [body[i : i + channels] for i in range(0, len(body), stride)], channels, struct.unpack("<5I", data[:20])


shown = {}
for model, track in models.items():
    fr, channels, header = frames(render_dir / f"{model}.eseq")
    ok = bad = 0
    seq = []
    for index, frame in enumerate(fr):
        lit = [PARTS[n] for n in range(channels // 3) if any(frame[n * 3 : n * 3 + 3])]
        mouth = [p for p in lit if p in PARTS[:10]]
        seq.append(tuple(mouth))
        want = expected(track, index)
        if mouth == [want]:
            ok += 1
        else:
            bad += 1
            if bad <= 5:
                print(f"  {model} frame {index} ({index * FRAME_MS} ms): lit {lit}, expected mouth {want}")
    eyes = sum(1 for f in fr if any(f[30:33]))
    shown[model] = seq
    print(f"{model} <- {track}: {len(fr)} frames, {channels} channels, header {header[1:]}; "
          f"mouth matches the phoneme layer in {ok} frames, differs in {bad}; Eyes-Open lit in {eyes} frames")

lead, c1, c2 = shown["LeadTree"], shown["ChorusPumpkin1"], shown["ChorusPumpkin2"]
print("chorus models agree in", sum(a == b for a, b in zip(c1, c2)), "of", len(c1), "frames")
print("lead and chorus differ in", sum(a != b for a, b in zip(lead, c1)), "of", len(lead), "frames")
singing = lambda s: sum(1 for m in s if m and m != ("rest",))
print("frames with a mouth other than rest: lead", singing(lead), "chorus", singing(c1))
