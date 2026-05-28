import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { searchGiphy, type GiphySearchResult } from '../api/giphySearchApi'

const SEARCH_DEBOUNCE_MS = 300
const SEARCH_LIMIT = 20

export type ChatGiphyPickerProps = {
  accessToken: string
  onSelect: (result: GiphySearchResult) => void
}

export function ChatGiphyPicker({ accessToken, onSelect }: ChatGiphyPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GiphySearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchErr, setSearchErr] = useState<string | null>(null)
  const popoverId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchSeqRef = useRef(0)

  const runSearch = useCallback(
    async (q: string, seq: number) => {
      const trimmed = q.trim()
      if (trimmed === '') {
        setResults([])
        setSearching(false)
        setSearchErr(null)
        return
      }
      setSearching(true)
      setSearchErr(null)
      try {
        const { results: next } = await searchGiphy(accessToken, { q: trimmed, limit: SEARCH_LIMIT })
        if (searchSeqRef.current !== seq) return
        setResults(next)
      } catch (e) {
        if (searchSeqRef.current !== seq) return
        setResults([])
        setSearchErr(e instanceof Error ? e.message : 'Giphy search failed.')
      } finally {
        if (searchSeqRef.current === seq) setSearching(false)
      }
    },
    [accessToken],
  )

  useEffect(() => {
    if (!open) return
    const seq = ++searchSeqRef.current
    const handle = window.setTimeout(() => {
      void runSearch(query, seq)
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(handle)
  }, [open, query, runSearch])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        toggleRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current
      if (!root || !(event.target instanceof Node)) return
      if (!root.contains(event.target)) {
        setOpen(false)
        toggleRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    requestAnimationFrame(() => searchInputRef.current?.focus())
  }, [open])

  const handleToggle = () => {
    setOpen((was) => {
      const next = !was
      if (!next) {
        setQuery('')
        setResults([])
        setSearchErr(null)
        searchSeqRef.current += 1
      }
      return next
    })
  }

  const handleSelect = (result: GiphySearchResult) => {
    onSelect(result)
    setOpen(false)
    setQuery('')
    setResults([])
    setSearchErr(null)
    searchSeqRef.current += 1
    toggleRef.current?.focus()
  }

  return (
    <div ref={rootRef} className="riffsync-room-chat-giphy">
      <button
        ref={toggleRef}
        type="button"
        className="riffsync-room-chat-giphy-toggle gen-button"
        aria-label="Insert GIF"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        onClick={handleToggle}
      >
        <span aria-hidden="true">GIF</span>
      </button>
      {open ? (
        <div
          id={popoverId}
          className="riffsync-room-chat-giphy-popover"
          role="dialog"
          aria-label="Giphy picker"
        >
          <input
            ref={searchInputRef}
            type="search"
            className="riffsync-room-chat-giphy-search"
            value={query}
            placeholder="Search Giphy…"
            aria-label="Search Giphy"
            onChange={(e) => setQuery(e.target.value)}
          />
          {searchErr ? (
            <p className="riffsync-room-chat-giphy-status riffsync-room-chat-giphy-status--err" role="alert">
              {searchErr}
            </p>
          ) : searching ? (
            <p className="riffsync-room-chat-giphy-status" role="status">
              Searching…
            </p>
          ) : query.trim() === '' ? (
            <p className="riffsync-room-chat-giphy-status riffsync-muted">Type to search GIFs.</p>
          ) : results.length === 0 ? (
            <p className="riffsync-room-chat-giphy-status riffsync-muted">No GIFs found.</p>
          ) : null}
          <ul className="riffsync-room-chat-giphy-results" aria-label="Giphy search results">
            {results.map((result) => (
              <li key={result.giphyId}>
                <button
                  type="button"
                  className="riffsync-room-chat-giphy-result"
                  onClick={() => handleSelect(result)}
                >
                  <img
                    src={result.previewUrl}
                    alt={result.title?.trim() || 'GIF'}
                    loading="lazy"
                    className="riffsync-room-chat-giphy-result__thumb"
                  />
                </button>
              </li>
            ))}
          </ul>
          <p className="riffsync-room-chat-giphy-attribution">
            <a href="https://giphy.com/" target="_blank" rel="noopener noreferrer">
              Powered by GIPHY
            </a>
          </p>
        </div>
      ) : null}
    </div>
  )
}
