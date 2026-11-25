# Troubleshooting

This page lists real cases. Each case gives the message of the app and what to do.

## Transcription is slow

1. Open "Transcribe". Read the device note.
2. If it reads "WebGPU is not available. Transcription is slower on this browser.", use a current Chrome or Edge with WebGPU, or select the speech model "tiny".
3. If you selected "Demucs, experimental (181 MB, much slower)", select "Fast (Spleeter, 79 MB)". Without WebGPU, the window warns "Demucs needs about 4 GB of memory and several minutes for a song on this browser."
4. For a long song, select a time range and run a range. See [02 Transcribe](02-transcribe.md).

If a run on the graphics card sends no progress for 45 seconds, the window shows "The graphics card was too slow. The run continues on the CPU." The CPU run has no time limit.

The window shows the speed during a run, for example "CPU, about 3 times slower than the song". A run on the CPU with the speech model "small" takes the longest.

## The song is open in two tabs

Open each song in one tab only. Two tabs that edit the same song can overwrite each other.

If the library shows "Close the other tabs of the app. Then reload this page.", another tab of the app holds the database during an upgrade. Close the other tabs. Reload the page.

If the library shows "This browser holds data from a newer version of the app. Reload the page. If the message stays, close the other tabs of the app and reload.", follow the message.

## Storage is full

| Message | What to do |
|---|---|
| "Browser storage is full. Delete a song and try again." | Delete a song that you do not need. See [01 Song library](01-song-library.md). Export it first. |
| "The browser storage is full, so the app did not keep the separated tracks." | The run completed. The marks are there. Delete a song, then run "Transcribe" again if you need the tracks. |

The storage meter of the song library shows the space that the app uses. The kept audio tracks count in it.

## A remote endpoint does not answer

| Message | What to do |
|---|---|
| "The app could not connect to <host>. Check that the server runs and that the base URL is correct." Then "If the server runs: its CORS settings can block this page. Check that the server sends the header Access-Control-Allow-Origin: <origin of the app>" | Check that the server runs. Check the base URL. Set the CORS header of the server to the origin that the message shows. |
| "This page is secure (https), and the browser blocks a call to an http address. Use an https address for the endpoint." | Use an `https` address. An `http` address works only on this computer (`localhost` or `127.0.0.1`). |
| "<host> refused the API key (HTTP 401). Check the API key of the remote endpoint." | Select "Change". Type the right key. |
| "<host> has no transcription service at this address (HTTP 404). Check the base URL. It usually ends with /v1." | Correct the base URL. |
| "The audio is too large for the remote endpoint. Select a shorter part of the song in the editor, and transcribe the time selection." | Select a time range of about 13 minutes or less. |
| "<host> received too many requests (HTTP 429). Wait one minute, then select Retry." | Wait. Select "Retry". |
| "<host> did not return JSON. Check the base URL. It usually ends with /v1." | Correct the base URL. |
| "<host> returned no word times. Use a server and a speech model that return the words field of verbose_json." | Use a server and a model that return word times. |

The page cannot tell a CORS refusal from no connection. Use "Test connection" in the endpoint panel to check the server before a run.

## The lyrics do not fit

If the window asks "The lyrics have <n> words. This song has room for about <m> words. The app leaves out the lines after line <k>.", the lyrics have more words than the song has room for.

1. Select "Cancel".
2. Remove the lines that you do not need, or select a longer time range.
3. Select "Start" again.

Select "Continue" to run with the lines that fit. If the window asks "Only <n>% of the lyrics matched the audio. Check that the lyrics belong to this song.", check that the lyrics are the lyrics of this song.

If the window shows "No words were found. Paste the lyrics and use Lyrics only.", the speech model found no word in the range. Paste the lyrics and select "Lyrics only".

If the toast says "The app left out <n> words that it cannot use.", the lyrics have text with no letter and no digit, for example `&` or an emoji.

## All phrases are on one voice

After a run with "Put each singer on its own voice (experimental)", the toast can read "The app found one singer. All phrases stay on <voice name>. If the song has more singers, select the count in "Singers" and run again."

1. Open "Transcribe".
2. Select "Separate the vocals first".
3. Select "Put each singer on its own voice (experimental)".
4. Select the count in "Singers".
5. Select "Start".

Or move the phrases by hand with "Move to voice". See [04 Voices and sections](04-voices-and-sections.md). Open "Run report" and read the summary under "Singers". See [05 Audio tracks and run report](05-audio-tracks-and-run-report.md).

Other toasts of the singer step:

| Message | Meaning |
|---|---|
| "The app found 2 singers and put the phrases on 2 voices." in the run report | The step worked. |
| "The app finds the singers only in separated vocals. All phrases stay on <voice name>." | The vocal separation failed, so the step did not run. |
| "The song has 12 voices, so the app cannot add a voice for each singer. All phrases stay on <voice name>." | Delete a voice that you do not use. Run again. |
| "The app could not download the singer model. Check the connection. All phrases stay on <voice name>." | Check the connection. Run again. |

## xLights shows a different name

xLights removes `= < > & " '` and each character that is not ASCII from a timing track name. Then it adds `_1` to a name that exists.

1. Open "Export".
2. Read the warning "xLights shows the timing track “<timing track name>” as “<name after the import>”."
3. Change the voice name or the section name. Or change the name in "Timing track names in xLights".

## The mouth does not move in xLights

Check these points in this order.

1. **Frame size.** In xLights, open "Sequence Settings". The tab "Info / Media" shows "Sequence Timing". It must match the frame size in the export window. If the sequence has 50 ms and the song has 25 ms, xLights moves each time down to a multiple of 50 ms.
2. **Timing track.** Select the Faces effect. Under "Mouth Movements", select "Timing Track". Select the imported timing track. The list shows only the timing tracks with three layers.
3. **Face definition.** The face model needs a face definition with a mouth for each phoneme label: `AI`, `E`, `etc`, `FV`, `L`, `MBP`, `O`, `rest`, `U`, `WQ`. xLights shows no mouth for a label that the face definition does not have.
4. **Effect time.** The Faces effect moves the mouth only during its own time. Drop it from the start to the end of the song.
5. **Audio.** Use the same audio file in the sequence as in the app, so the times match.
6. **Model group.** On a model group, xLights shows only a face definition of the type "Matrix". Put the effect on each face model.

See [06 Export to xLights](06-export-to-xlights.md).

## Other messages

| Message | What to do |
|---|---|
| "The app could not read the audio from browser storage. Reload the page." | Reload the page. |
| "The audio for this song is missing. Load the file again." | Select the audio file again. The marks stay. |
| "This browser ran out of memory. Select a smaller speech model." | Select "tiny" or "base". |
| "The speech model did not download. Check the connection and retry." | Check the connection. Select "Retry". |
| "The app could not store the choices of this dialog in this browser. They work until you reload the page." | Free browser storage. |
