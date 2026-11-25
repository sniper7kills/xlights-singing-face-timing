# Licences of third-party files

The app does not bundle these files. The browser downloads them at run time from
the host below. Each file keeps the licence of its source.

## Spleeter 2-stem model

- Use: the vocal separation step of a transcribe run. See
  `docs/adr/0008-vocal-separation-in-the-browser.md`.
- Files: `vocals.onnx` (39 318 336 bytes) and `accompaniment.onnx` (39 318 343
  bytes) from https://huggingface.co/csukuangfj/sherpa-onnx-spleeter-2stems ,
  commit `7001ba316a615cacddb3f9ef3ec416661a277e26`.
- Source of the weights: the `2stems.tar.gz` release asset of Spleeter by Deezer,
  https://github.com/deezer/spleeter/releases/tag/v1.4.0 . The repository has the
  MIT licence. The copy is in `spleeter-LICENSE.txt`.
- The ONNX export: `scripts/spleeter/export_onnx.py` of
  https://github.com/k2-fsa/sherpa-onnx (Apache-2.0), commit
  `716ba8317bb36cbcce9ac6c130396e8ec71b3c9c`.
- The Hugging Face repository states no licence. The Spleeter repository states the
  MIT licence for its code, and it gives no separate licence for the weights.
