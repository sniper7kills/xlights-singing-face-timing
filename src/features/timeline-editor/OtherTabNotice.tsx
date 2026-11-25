import { closeOtherTabNotice, useOtherTabStore } from '../../store/otherTabs.ts'

/** The text of the notice. The copy is in `docs/specs/features/01-audio-import.md`. */
export const OTHER_TAB_TEXT =
  'This song is open in a different tab. The tab that saves last keeps its version. Close one of the tabs.'

type OtherTabNoticeProps = {
  songId: string
}

/** Shows that a different tab saved the open song, until the person closes the notice (FR-audio-27). */
export function OtherTabNotice({ songId }: OtherTabNoticeProps) {
  const shown = useOtherTabStore((state) => state.songId === songId)
  if (!shown) return null
  return (
    <p className="message" role="alert">
      {OTHER_TAB_TEXT}{' '}
      <button type="button" className="button" onClick={closeOtherTabNotice}>
        Close
      </button>
    </p>
  )
}
