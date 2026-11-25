# TODO

Repairs with no open change set. The next batch that touches the file takes the line.

- Transcribe dialog: a click on an area that is not a control moves the focus to the page.
- `addMark` in `src/store/actions/addMark.ts` does not check that the voice exists. No screen reaches it with a deleted voice.
- `AppSettings.theme` in `src/store/types.ts` and `src/store/settings.ts` has no reader. The theme is in localStorage. Remove the field.
