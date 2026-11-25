---
name: xlights-import-check
description: Check that xLights imports an exported .xtiming file and that a Faces
  effect on each face model follows its timing track. Use when a change affects the
  exported file, or at the end of an epic that changes export. Runs xLights on an
  isolated display, or gives the steps to a person.
allowed-tools: Read, Bash
---

# Check an export in xLights

The last check ran on 2026-11-24 with xLights 2026.21 (AppImage, Linux). The
result is on issue #79. The menu path and the control names below are the names in
2026.21.

## The steps in xLights

1. Open a sequence that uses the demo audio file `public/demo/silent-night.ogg`.
2. Select File > "Sequence Settings". On the tab "Info / Media", check that
   "Sequence Timing" shows `50 ms / 20 fps`.
3. Right-click a timing row heading, for example "New Timing".
4. Select "Import Timing Track". The file dialog "Choose Timing file(s)" opens.
5. Select the `.xtiming` file. The dialog accepts more than one file.
6. Check that xLights shows no message and adds one timing track for each voice,
   each with three layers.
7. Drop a Faces effect on a face model. Make it as long as the song.
8. Under "Mouth Movements", select "Timing Track" and the timing track of the voice.
9. Repeat steps 7 and 8 for each face model. A chorus face model gets the timing
   track of the chorus voice.
10. Render and play the sequence. Check that each mouth moves with its voice.
11. Right-click the row heading of an imported timing track and select "Export
    Timing Track". Save to a scratch folder. In "Select Timings", check each
    imported timing track.
12. Compare the exported file with the file of the app. Only `SourceVersion` may
    differ.

## The automated check

The tools are in `tools/`. Run them only on an isolated display. Never send input
to the display of the person.

Rules of the machine:

- Before heavy work, check `free -m`, `uptime` and `df -h / /tmp`.
- Keep the scratch folder under 1.5 GB. Do not extract the AppImage.
- Give each long command a time limit with `timeout`.
- Stop each process that you start. At the end, check with `ps` that no `mutter`,
  `Xwayland`, xLights (`AppRun.wrapped`) or `sleep 7000` process of the check runs.

The display: a headless `mutter` on a private session bus, then a rootful
`Xwayland` as its client. The `Xwayland` that `mutter` starts itself refuses XTEST
input with no portal, so the check uses a second one on display `:7`. A Wayland
socket path has 108 bytes at most, so the runtime folder is short.

```bash
S=<scratch folder>; T=.claude/skills/xlights-import-check/tools
RT=$(mktemp -d /tmp/xlrt.XXXX)
bash $T/start-mutter.sh "$S" "$RT" > "$S/mutter.log" 2>&1 &      # writes $S/display.env
bash $T/start-xwayland.sh 7 "$RT" > "$S/xwayland.log" 2>&1 &
grep DBUS "$S/display.env" > "$S/display7.env"; echo DISPLAY=:7 >> "$S/display7.env"
gcc -O2 -o "$S/xt" $T/xt.c $(pkg-config --cflags --libs x11 xtst cairo)
export XT="$S/xt"                                                  # import.sh reads it
node $T/export.mts "$S/exports"                                    # from the repository root
python3 -I $T/make_show.py "$S/show" public/demo/silent-night.ogg
XLIGHTS_APPIMAGE=<path of the AppImage> bash $T/run-xlights.sh "$S" -q -a -s "$S/show" > "$S/xlights.log" 2>&1 &
```

Then, with `A=http://127.0.0.1:49913/xlDoAutomation`
(the option `-a` opens the xFade port A):

1. Close the dialog "Tip of the day" with `xt key "Tip of the day" Escape` or a
   click on "Close".
2. `{"cmd":"newSequence","force":"true","mediaFile":"$S/show/silent-night.ogg","frameMS":50,"view":"All Models"}`
3. For each file: `bash $T/import.sh "<full path of the .xtiming file>" "$S/shot.png"`.
   The script right-clicks "New Timing" at (500, 381) and clicks "Import Timing
   Track" at (605, 480). Check the screenshot first: the positions depend on the
   window layout.
4. For each face model: `{"cmd":"addEffect","target":"LeadTree","effect":"Faces","settings":"E_CHOICE_Faces_FaceDefinition=Face,E_CHOICE_Faces_TimingTrack=Lead,E_CHOICE_Faces_Eyes=Open","palette":"C_BUTTON_Palette1=#FF0000,C_CHECKBOX_Palette1=1,C_BUTTON_Palette2=#00FF00,C_CHECKBOX_Palette2=1","layer":"0"}`.
   `ChorusPumpkin1` and `ChorusPumpkin2` get `Chorus`.
5. `{"cmd":"renderAll"}`, then for each face model
   `{"cmd":"exportModel","filename":"$S/render/<model>.eseq","model":"<model>","format":"eseq"}`.
   Make the folder `render` first. A missing folder opens an error dialog.
6. `python3 -I $T/check_render.py "$S/render" "$S/exports/Silent Night.xtiming"`.
   Each face model must match its phoneme layer in every frame.
7. `{"cmd":"closexLights","force":"true"}`. Then stop `Xwayland` and `mutter` with
   `kill`, and the `sleep 7000` of `inner.sh`. Delete `$RT`.

No automation command imports a timing track in 2026.21, so step 3 uses the menu.

Record in the PR body or on the issue: the xLights version, the operating system,
and pass or fail for steps 6, 10 and 12.
