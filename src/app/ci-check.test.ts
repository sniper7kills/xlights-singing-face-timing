import { expect, test } from 'vitest'

test('fails on purpose to prove that CI shows a failed check', () => {
  expect(1).toBe(2)
})
