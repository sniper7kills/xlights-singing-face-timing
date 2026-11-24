---
name: xlights-import-check
description: Manual check that xLights imports an exported .xtiming file and a Faces
  effect animates. Use when a change affects the exported file, or at the end of an
  epic that changes export.
allowed-tools: Read
---

# Check an export in xLights

A person does this check, because xLights is a desktop application. Give these
steps to the person and record the result.

1. In the app, open the demo song and add a second voice.
2. Move two phrases to the second voice.
3. Export with "One timing track for each voice" and "One file with all timing
   tracks".
4. In xLights, open a sequence that uses the demo audio file.
5. Check that the frame size of the sequence equals the frame size in the export
   dialog.
6. Right-click a timing row heading. Select "Import Timing Track".
7. Select the `.xtiming` file.
8. Check that xLights shows no error message.
9. Check that xLights adds two timing tracks, each with three layers.
10. Drop a Faces effect on a face model. Under "Mouth Movements", select the first
    timing track.
11. Play the sequence. Check that the mouth moves with the words.
12. Repeat steps 10 and 11 for the second timing track on a second face model.
13. Export a song that has a word label with each of `&`, `<`, `>`, `"` and `'`.
    Check that xLights shows each label unchanged.

Record in the PR body: the xLights version, the operating system, and pass or fail
for steps 8, 9, 11, 12 and 13.
