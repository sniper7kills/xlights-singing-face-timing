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
      <p className="card-note">
        The app uses the{' '}
        <a href="https://github.com/cmusphinx/cmudict">CMU Pronouncing Dictionary</a> of Carnegie
        Mellon University (<a href="dict/cmudict-LICENSE.txt">licence</a>).
      </p>
      {/* CC BY 4.0 requires this attribution. See docs/licences/singer-models.md. */}
      <p className="card-note">
        The singer option uses the{' '}
        <a href="https://huggingface.co/pyannote/wespeaker-voxceleb-resnet34-LM">
          wespeaker-voxceleb-resnet34-LM
        </a>{' '}
        model of the WeSpeaker project (
        <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>) and the{' '}
        <a href="https://huggingface.co/pyannote/segmentation-3.0">segmentation-3.0</a> model of
        pyannote (MIT).
      </p>
    </section>
  )
}
