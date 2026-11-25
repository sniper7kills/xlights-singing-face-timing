# Licences of the singer models

The app does not bundle these files. The browser downloads them at run time from
the Hugging Face Hub, when the person turns on "Put each singer on its own voice".
Each file keeps the licence of its source. See
`docs/adr/0009-singer-voices-from-diarization.md`.

## pyannote segmentation 3.0

- Files: `config.json`, `preprocessor_config.json` and `onnx/model.onnx`
  (5 986 908 bytes) from
  https://huggingface.co/onnx-community/pyannote-segmentation-3.0 , commit
  `733a93b6473d019a773298e08cefa686894b1854`.
- Licence: MIT, as the model card states.
- Source of the weights: https://huggingface.co/pyannote/segmentation-3.0 by
  pyannote, MIT licence. That repository asks each person to share contact
  information before the download. The ONNX copy asks for nothing.

## WeSpeaker ResNet34 speaker embedding

- Files: `config.json`, `preprocessor_config.json` and `onnx/model.onnx`
  (26 535 549 bytes) from
  https://huggingface.co/onnx-community/wespeaker-voxceleb-resnet34-LM , commit
  `6a61a1833ff2583aabeba044f5c8221f00b67ceb`.
- Licence: Creative Commons Attribution 4.0 International (CC BY 4.0),
  https://creativecommons.org/licenses/by/4.0/ .
- Attribution: "wespeaker-voxceleb-resnet34-LM" by the WeSpeaker project
  (https://github.com/wenet-e2e/wespeaker), as packaged by pyannote
  (https://huggingface.co/pyannote/wespeaker-voxceleb-resnet34-LM), CC BY 4.0. The
  ONNX conversion is by onnx-community. The app uses the weights unchanged.
