import { describe, expect, it } from 'vitest'
import { idList } from './idList.ts'

describe('idList', () => {
  it('joins the present ids with one space', () => {
    expect(idList('a', false, 'b', null)).toBe('a b')
  })

  it('returns undefined when no id is present', () => {
    expect(idList(false, null, '')).toBeUndefined()
  })
})
