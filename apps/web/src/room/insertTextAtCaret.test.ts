import { describe, expect, it } from 'vitest'
import { insertTextAtCaret } from './insertTextAtCaret'

describe('insertTextAtCaret', () => {
  it('appends when selection is null', () => {
    expect(insertTextAtCaret('hi', '😀', null, null, 2000)).toEqual({
      value: 'hi😀',
      caret: 4,
    })
  })

  it('inserts at caret between existing text', () => {
    expect(insertTextAtCaret('hello', '😀', 2, 2, 2000)).toEqual({
      value: 'he😀llo',
      caret: 4,
    })
  })

  it('replaces a selection range', () => {
    expect(insertTextAtCaret('hello world', '👋', 0, 5, 2000)).toEqual({
      value: '👋 world',
      caret: 2,
    })
  })

  it('does not insert a partial emoji when only one code unit remains', () => {
    expect(insertTextAtCaret('12345', '😀', 5, 5, 6)).toEqual({
      value: '12345',
      caret: 5,
    })
  })

  it('inserts a full emoji when maxLength allows two code units', () => {
    expect(insertTextAtCaret('12345', '😀', 5, 5, 7)).toEqual({
      value: '12345😀',
      caret: 7,
    })
  })

  it('returns unchanged text when there is no room', () => {
    expect(insertTextAtCaret('123456', '😀', 6, 6, 6)).toEqual({
      value: '123456',
      caret: 6,
    })
  })
})
