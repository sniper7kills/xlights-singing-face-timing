// This file has no imports, so the dialog can show the download size without the engine code in the entry chunk.

/** The size of `onnx/model.onnx` of the segmentation model at its fixed commit, in bytes. */
export const SEGMENTATION_MODEL_BYTES = 5_986_908

/** The size of `onnx/model.onnx` of the embedding model at its fixed commit, in bytes. */
export const EMBEDDING_MODEL_BYTES = 26_535_549

/** The download size of the two singer models, in bytes. The small JSON files of each model are not included. */
export const SINGER_MODEL_BYTES = SEGMENTATION_MODEL_BYTES + EMBEDDING_MODEL_BYTES
