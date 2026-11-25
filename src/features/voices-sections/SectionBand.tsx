import { useSongStore } from '../../store/songStore.ts'
import type { Section } from '../../store/types.ts'
import { useStageScale } from '../timeline-editor/useStageScale.ts'
import { SectionBlock } from './SectionBlock.tsx'

const NO_SECTIONS: readonly Section[] = []

/**
 * Shows the section band at the top of the stage: one block for each section of the song, on the time scale of the stage.
 * With no section, the band shows the hint "Drag on the waveform, then Add section".
 * @param durationMs The duration of the open song in milliseconds.
 */
export function SectionBand({ durationMs }: { durationMs: number }) {
  const sections = useSongStore((state) => state.current?.sections) ?? NO_SECTIONS
  const { scale } = useStageScale(durationMs)
  return (
    // The band takes the focus after a delete, so the focus does not drop to the page. It is not a Tab stop.
    <div className="section-band" role="group" aria-label="Sections" tabIndex={-1}>
      {sections.length === 0 ? (
        <p className="section-hint">Drag on the waveform, then Add section</p>
      ) : (
        sections.map((section) => (
          <SectionBlock key={section.id} section={section} scale={scale} durationMs={durationMs} />
        ))
      )}
    </div>
  )
}
