"""Make the unit test fixtures of the singer split signal path (issue #194).

Usage:
  <python with numpy> -I scripts/make-singer-split-fixtures.py <spike folder> [<output folder>]

The spike folder holds reference.py, testvec_bs.npz and testvec_mel.npz of issue #191.
The output folder is tests/fixtures/singer-split by default. The script needs numpy only.
It does not load an ONNX model: a fake session multiplies the input spectrogram by a fixed
gain for each stem, so the fixtures check the STFT, the tensor layout, the iSTFT and the
overlap-add of reference.py, not the separation.

Each file is raw little-endian float32. manifest.json gives the shape of each file.
"""
import importlib.util
import json
import os
import sys

import numpy as np

CHUNK = 4410  # 10 hops, so T = 11 frames: small files, same rules as the model chunks.
OVERLAP = 2
LENGTH = 12000  # Not a multiple of the step, so the last chunk moves to the end.
SHORT = 3000  # Shorter than one chunk, so the run pads and cuts back.


def load_reference(spike):
    spec = importlib.util.spec_from_file_location("reference", os.path.join(spike, "reference.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class GainSession:
    """A fake session: stem 0 = spec * bin / 1024, stem 1 = spec * 0.5j. The unit test uses the same gains."""

    def run(self, names, feeds):
        spec = feeds["spec"].astype(np.float64)  # (1, 2, 1025, T, 2)
        c = spec[..., 0] + 1j * spec[..., 1]
        gain = (np.arange(1025) / 1024.0)[None, None, :, None]
        stems = np.stack([c * gain, c * 0.5j], axis=1)  # (1, 2, 2, 1025, T)
        out = np.stack([stems.real, stems.imag], axis=-1).astype(np.float32)
        return [out]


def write(folder, name, array, manifest):
    data = np.ascontiguousarray(array, dtype="<f4")
    data.tofile(os.path.join(folder, name))
    manifest[name] = list(data.shape)


def main():
    spike = sys.argv[1]
    folder = sys.argv[2] if len(sys.argv) > 2 else os.path.join("tests", "fixtures", "singer-split")
    os.makedirs(folder, exist_ok=True)
    ref = load_reference(spike)
    manifest = {"chunk": CHUNK, "overlap": OVERLAP, "length": LENGTH, "short": SHORT, "files": {}}
    for kind in ("bs", "mel"):
        tv = np.load(os.path.join(spike, f"testvec_{kind}.npz"))
        audio = tv["input"][:, :LENGTH].astype(np.float32)
        write(folder, f"{kind}-input.f32", audio, manifest["files"])
        write(folder, f"{kind}-spec.f32", ref.to_model_input(audio[:, :CHUNK]), manifest["files"])
        session = GainSession()
        write(folder, f"{kind}-separate.f32", ref.separate(session, audio, CHUNK, OVERLAP), manifest["files"])
        write(folder, f"{kind}-short.f32", ref.separate(session, audio[:, :SHORT], CHUNK, OVERLAP), manifest["files"])
    with open(os.path.join(folder, "manifest.json"), "w") as handle:
        json.dump(manifest, handle, indent=2)
        handle.write("\n")


if __name__ == "__main__":
    main()
