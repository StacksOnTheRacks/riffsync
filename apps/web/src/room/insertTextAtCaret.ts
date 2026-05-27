/** Truncate `text` to at most `maxUnits` UTF-16 code units without splitting a surrogate pair. */
function truncateToMaxCodeUnits(text: string, maxUnits: number): string {
  if (text.length <= maxUnits) return text
  if (maxUnits <= 0) return ''
  let end = maxUnits
  while (end > 0) {
    const head = text.charCodeAt(end - 1)
    const tail = text.charCodeAt(end)
    if (head >= 0xd800 && head <= 0xdbff && tail >= 0xdc00 && tail <= 0xdfff) {
      end -= 1
      continue
    }
    return text.slice(0, end)
  }
  return ''
}

/** Insert `insertion` into `current` at the selection, respecting `maxLength` (UTF-16, like HTML maxLength). */
export function insertTextAtCaret(
  current: string,
  insertion: string,
  selectionStart: number | null,
  selectionEnd: number | null,
  maxLength: number,
): { value: string; caret: number } {
  const start = selectionStart ?? current.length
  const end = selectionEnd ?? start
  const room = maxLength - (current.length - (end - start))
  const fitting = room >= insertion.length ? insertion : truncateToMaxCodeUnits(insertion, room)
  if (!fitting) {
    return { value: current, caret: start }
  }
  const value = current.slice(0, start) + fitting + current.slice(end)
  return { value, caret: start + fitting.length }
}
