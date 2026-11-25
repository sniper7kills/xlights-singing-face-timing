import { describe, expect, it } from 'vitest'
import { menuPosition } from './menuPosition.ts'

const view = { width: 1200, height: 800 }
const size = { width: 300, height: 100 }

describe('menuPosition', () => {
  it('opens below the anchor with the left edges together when the menu fits', () => {
    expect(menuPosition({ top: 400, bottom: 430, left: 50, right: 80 }, size, view)).toEqual({
      top: 434,
      left: 50,
    })
  })

  it('opens above the anchor near the window bottom', () => {
    expect(menuPosition({ top: 700, bottom: 730, left: 50, right: 80 }, size, view)).toEqual({
      top: 596,
      left: 50,
    })
  })

  it('puts the right edge of the menu at the right edge of the anchor near the window right', () => {
    expect(menuPosition({ top: 400, bottom: 430, left: 1100, right: 1130 }, size, view)).toEqual({
      top: 434,
      left: 830,
    })
  })

  it('stays inside the window when the menu fits on no side of the anchor', () => {
    expect(
      menuPosition(
        { top: 0, bottom: 790, left: 1000, right: 1150 },
        { width: 1190, height: 100 },
        view,
      ),
    ).toEqual({ top: 696, left: 6 })
  })

  it('starts at the top edge for a menu taller than the window', () => {
    expect(
      menuPosition(
        { top: 300, bottom: 330, left: 10, right: 40 },
        { width: 100, height: 900 },
        view,
      ),
    ).toEqual({ top: 4, left: 10 })
  })

  it('opens a menu that fits exactly at the window edge below the anchor', () => {
    expect(menuPosition({ top: 666, bottom: 692, left: 896, right: 920 }, size, view)).toEqual({
      top: 696,
      left: 896,
    })
  })
})
