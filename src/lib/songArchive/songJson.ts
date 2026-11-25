import type { Mark, Section, SongContent, Voice } from '../../store/types.ts'

/** The value of `format` in `song.json`. A program checks it before it reads the file. */
export const SONG_JSON_FORMAT = 'singing-face-timing-song'

/** The version of the `song.json` shape. A change to the shape that a reader can break on adds 1. */
export const SONG_JSON_VERSION = 1

// Each function lists the keys in a fixed order, so two exports of one song give the same text.
function voiceJson(voice: Voice) {
  // `previewMuted` is view state of the face preview, so the file omits it.
  return {
    id: voice.id,
    songId: voice.songId,
    name: voice.name,
    order: voice.order,
    color: voice.color,
  }
}

function sectionJson(section: Section) {
  return {
    id: section.id,
    songId: section.songId,
    name: section.name,
    startMs: section.startMs,
    endMs: section.endMs,
  }
}

function markJson(mark: Mark) {
  // JSON.stringify omits a key with the value undefined, as the store has no value for these keys.
  return {
    id: mark.id,
    voiceId: mark.voiceId,
    layer: mark.layer,
    label: mark.label,
    startMs: mark.startMs,
    endMs: mark.endMs,
    parentId: mark.parentId,
    edited: mark.edited,
    estimated: mark.estimated,
    unknown: mark.unknown,
  }
}

/**
 * Returns the text of `song.json`: the song, the voices, the sections and the marks as the store holds them.
 * The file is for backup and for other programs. The app does not import it, and it holds no audio.
 * The keys have a fixed order, and the text ends with a line end.
 * @param content The song with its voices, sections and marks.
 */
export function songJson(content: SongContent): string {
  const { song } = content
  const value = {
    format: SONG_JSON_FORMAT,
    version: SONG_JSON_VERSION,
    song: {
      id: song.id,
      name: song.name,
      durationMs: song.durationMs,
      frameMs: song.frameMs,
      createdAt: song.createdAt,
      updatedAt: song.updatedAt,
    },
    voices: content.voices.map(voiceJson),
    sections: content.sections.map(sectionJson),
    marks: content.marks.map(markJson),
  }
  return `${JSON.stringify(value, null, 2)}\n`
}
