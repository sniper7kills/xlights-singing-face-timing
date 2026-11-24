import type { Mark } from '../../store/types.ts'

/** Returns the mark with the id, or undefined when no mark has it. */
export function findMark(marks: readonly Mark[], id: string): Mark | undefined {
  return marks.find((mark) => mark.id === id)
}

function onSameLayer(other: Mark, mark: Mark): boolean {
  return other.id !== mark.id && other.voiceId === mark.voiceId && other.layer === mark.layer
}

/** Returns the adjacent mark before the mark on its layer of its voice, or undefined when no mark is before it. */
export function previousOnLayer(marks: readonly Mark[], mark: Mark): Mark | undefined {
  let found: Mark | undefined
  for (const other of marks)
    if (
      onSameLayer(other, mark) &&
      other.endMs <= mark.startMs &&
      other.endMs > (found?.endMs ?? -1)
    )
      found = other
  return found
}

/** Returns the adjacent mark after the mark on its layer of its voice, or undefined when no mark is after it. */
export function nextOnLayer(marks: readonly Mark[], mark: Mark): Mark | undefined {
  let found: Mark | undefined
  for (const other of marks)
    if (
      onSameLayer(other, mark) &&
      other.startMs >= mark.endMs &&
      other.startMs < (found?.startMs ?? Infinity)
    )
      found = other
  return found
}

/** Returns the child marks of the mark, in time order: the words of a phrase, or the phonemes of a word. */
export function childrenOf(marks: readonly Mark[], id: string): Mark[] {
  return marks.filter((mark) => mark.parentId === id).sort((a, b) => a.startMs - b.startMs)
}

/** Returns the children of the mark and all their children: the words and phonemes of a phrase, or the phonemes of a word. */
export function descendantsOf(marks: readonly Mark[], id: string): Mark[] {
  return childrenOf(marks, id).flatMap((child) => [child, ...descendantsOf(marks, child.id)])
}
