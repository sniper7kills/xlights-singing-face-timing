import type { ReactNode } from 'react'

/** The licence notes of the vocal separation models, in the public repository of the app. */
const LICENCE_NOTES =
  'https://github.com/sniper7kills/xlights-singing-face-timing/blob/main/docs/licences/README.md'

/** Shows a link that opens in a new tab, so the song library stays open. */
function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  )
}

/** Shows the five steps from an audio file to a timing track in xLights, and the credits of the models and the dictionary. */
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
        The transcribe step uses the{' '}
        <ExternalLink href="https://github.com/openai/whisper">Whisper</ExternalLink> speech model
        of OpenAI (
        <ExternalLink href="https://github.com/openai/whisper/blob/main/LICENSE">MIT</ExternalLink>
        ), in the ONNX files of{' '}
        <ExternalLink href="https://huggingface.co/onnx-community/whisper-base_timestamped">
          onnx-community
        </ExternalLink>
        .
      </p>
      <p className="card-note">
        The vocal separation option uses the 2-stem model of{' '}
        <ExternalLink href="https://github.com/deezer/spleeter">Spleeter</ExternalLink> by Deezer
        and the htdemucs model of{' '}
        <ExternalLink href="https://github.com/adefossez/demucs">Demucs</ExternalLink> by Meta. The
        code of each project has the MIT licence. The{' '}
        <ExternalLink href={LICENCE_NOTES}>licence notes</ExternalLink> state the facts about the
        weights.
      </p>
      <p className="card-note">
        The app uses the{' '}
        <ExternalLink href="https://github.com/cmusphinx/cmudict">
          CMU Pronouncing Dictionary
        </ExternalLink>{' '}
        of Carnegie Mellon University (
        <ExternalLink href="dict/cmudict-LICENSE.txt">licence</ExternalLink>).
      </p>
      {/* CC BY 4.0 requires this attribution. See docs/licences/singer-models.md. */}
      <p className="card-note">
        The singer option uses the{' '}
        <ExternalLink href="https://huggingface.co/pyannote/wespeaker-voxceleb-resnet34-LM">
          wespeaker-voxceleb-resnet34-LM
        </ExternalLink>{' '}
        model of the WeSpeaker project (
        <ExternalLink href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</ExternalLink>)
        and the{' '}
        <ExternalLink href="https://huggingface.co/pyannote/segmentation-3.0">
          segmentation-3.0
        </ExternalLink>{' '}
        model of pyannote (MIT).
      </p>
      {/* The maintainer ruled on 2026-11-25 to ship the two models with this attribution. See docs/adr/0011. */}
      <p className="card-note">
        The singer split option uses the BS-RoFormer male and female vocals model by aufr33, from
        the model list of{' '}
        <ExternalLink href="https://github.com/karaokenerds/python-audio-separator">
          python-audio-separator
        </ExternalLink>
        . The author states no licence. This project converted the model from PyTorch to ONNX with
        float16 weights. The project did not train the model.
      </p>
      <p className="card-note">
        The singer split option also uses the{' '}
        <ExternalLink href="https://huggingface.co/becruily/mel-band-roformer-karaoke">
          Mel-Band RoFormer karaoke model
        </ExternalLink>{' '}
        by becruily, from its Hugging Face page. The author states no licence. This project
        converted the model from PyTorch to ONNX with float16 weights. The project did not train the
        model.
      </p>
      <p className="card-note">
        The STFT is outside each model. The{' '}
        <ExternalLink href="models/NOTICE.txt">model notice</ExternalLink> gives the source and the
        SHA-256 of each file.
      </p>
    </section>
  )
}
