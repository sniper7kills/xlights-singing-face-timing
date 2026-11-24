/** Shows the five steps from an audio file to a timing track in xLights. The copy comes from the mockup. */
export function HowItWorks() {
  return (
    <section className="card" aria-labelledby="how-title">
      <h3 id="how-title">How it works</h3>
      <ol className="how">
        <li>
          <span>
            <b>Add a song.</b> The app draws the waveform.
          </span>
        </li>
        <li>
          <span>
            <b>Transcribe.</b> A speech model in your browser finds each word and its time. Paste
            the lyrics for better results.
          </span>
        </li>
        <li>
          <span>
            <b>Check.</b> Drag words into place. Watch the face preview sing.
          </span>
        </li>
        <li>
          <span>
            <b>Export.</b> Download an .xtiming file with one timing track for each voice.
          </span>
        </li>
        <li>
          <span>
            <b>Import in xLights.</b> Import Timing Track, then drop a Faces effect.
          </span>
        </li>
      </ol>
    </section>
  )
}
