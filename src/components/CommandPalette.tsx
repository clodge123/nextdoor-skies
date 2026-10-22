// W3-C3 COMMAND PALETTE (wave-3 brainstorm session 3, decision 4): Ctrl/Cmd+K
// opens a power-user command palette. Portal dialog on document.body (same
// pattern as Lightbox — opening never shifts page layout), focus trap, Esc
// closes, scrim click closes. Keyboard navigable (↑/↓ + Enter), rows show
// shortcut hints (teach the existing gestures), recent commands persist to
// sessionStorage (honest empty state when none). Town jump reuses the
// gazetteer ranking pattern (IdentityPicker.rankTowns: prefix-first, pop-desc).
//
// Laws: square geometry R20 (var(--radius) only), theme vars (L4), ~150ms
// fade/scale entrance (animation law — nothing snaps), >=44px rows.
// Determinism R17: filtering is pure string matching; no clock, no RNG.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import townsData from '../../data/towns/us-towns.json'
import { rankTowns } from './IdentityPicker'
import { requestPanelOpen, requestPanelToggle } from './SidePanel'
import { toggleTheme } from '../lib/theme'
import { townSlug } from '../lib/session'
import type { TownPoint } from '../lib/map/gazetteer'
import {
  COMMANDS,
  filterCommands,
  pushRecent,
  recentCommands,
  type PaletteCommand,
} from '../lib/palette'

const TOWNS = (townsData as { count: number; towns: TownPoint[] })
const MAX_TOWN_RESULTS = 6

// Module-level open-request channel (same pattern as requestPanelOpen): the
// header chip / drawer item live outside App's palette state; App subscribes
// to the event and flips its open flag.
const OPEN_EVENT = 'nds-palette-open'

/** Ask the app to open the command palette. */
export function requestPaletteOpen(): void {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

/**
 * App-level palette state: Ctrl/Cmd+K toggles (ignored while typing, same
 * typing law as the P panel law), the OPEN_EVENT channel opens it from the
 * header chip / drawer item. Esc/scrim close via the dialog itself.
 */
export function usePaletteOpen(): { open: boolean; setOpen: (open: boolean) => void } {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener(OPEN_EVENT, onOpen)
    }
  }, [])
  return { open, setOpen }
}

type Mode = 'commands' | 'towns'

interface FlatItem {
  kind: 'cmd' | 'town'
  cmd?: PaletteCommand
  town?: TownPoint
}

export interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<Mode>('commands')
  const [hi, setHi] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Register on the open-request channel while mounted.
  useEffect(() => {
    const request = () => {
      setQuery('')
      setMode('commands')
      setHi(0)
    }
    window.addEventListener(OPEN_EVENT, request)
    return () => {
      window.removeEventListener(OPEN_EVENT, request)
    }
  }, [])

  // Fresh state every open + focus the input (focus restored on close).
  useEffect(() => {
    if (!open) return
    setQuery('')
    setMode('commands')
    setHi(0)
    const opener = document.activeElement as HTMLElement | null
    inputRef.current?.focus()
    return () => {
      opener?.focus?.()
    }
  }, [open])

  const recents = useMemo(() => (query ? [] : recentCommands()), [query])
  const filtered = useMemo(() => filterCommands(query), [query])
  const towns = useMemo(() => {
    if (mode === 'towns') {
      // Empty type-ahead: deterministic default list — highest-pop towns.
      if (!query.trim()) return [...TOWNS.towns].sort((a, b) => b.pop - a.pop || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)).slice(0, MAX_TOWN_RESULTS)
      return rankTowns(query, TOWNS.towns).slice(0, MAX_TOWN_RESULTS)
    }
    return query.trim() ? rankTowns(query, TOWNS.towns).slice(0, MAX_TOWN_RESULTS) : []
  }, [mode, query])

  // Flat interactive list (arrow-key order): recents, then commands (minus
  // recents), then town matches. In towns mode: towns only.
  const items = useMemo<FlatItem[]>(() => {
    if (mode === 'towns') return towns.map((t) => ({ kind: 'town', town: t }))
    const seen = new Set<string>()
    const list: FlatItem[] = []
    for (const c of recents) {
      list.push({ kind: 'cmd', cmd: c })
      seen.add(c.id)
    }
    const cmds = query ? filtered : COMMANDS
    for (const c of cmds) {
      if (seen.has(c.id)) continue
      list.push({ kind: 'cmd', cmd: c })
      seen.add(c.id)
    }
    for (const t of towns) list.push({ kind: 'town', town: t })
    return list
  }, [mode, recents, filtered, towns, query])

  const clampedHi = Math.min(hi, Math.max(0, items.length - 1))

  const runCommand = (id: string) => {
    pushRecent(id)
    switch (id) {
      case 'nav-map':
        navigate('/')
        break
      case 'nav-feed':
        navigate('/feed')
        break
      case 'nav-alerts':
        navigate('/alerts')
        break
      case 'toggle-theme':
        toggleTheme()
        break
      case 'toggle-panel':
        requestPanelToggle()
        break
      case 'open-alerts-center':
        navigate('/')
        requestPanelOpen()
        break
      case 'go-town':
        // Stay open, switch to the town typeahead (type-ahead gazetteer list).
        setMode('towns')
        setQuery('')
        setHi(0)
        return
    }
    onClose()
  }

  const runItem = (item: FlatItem) => {
    if (item.kind === 'cmd' && item.cmd) runCommand(item.cmd.id)
    else if (item.town) {
      navigate(`/t/${townSlug(item.town)}`)
      onClose()
    }
  }

  // Esc closes (document-level + stopPropagation, same as Lightbox, so the
  // phone drawer's window listener never double-fires).
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const node = dialogRef.current
      if (!node) return
      const focusables = node.querySelectorAll<HTMLElement>(
        'button, [href], input, [tabindex]:not([tabindex="-1"])',
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const onInputKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHi((h) => (items.length ? (Math.min(h, items.length - 1) + 1) % items.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHi((h) => (items.length ? (Math.min(h, items.length - 1) - 1 + items.length) % items.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = items[clampedHi]
      if (item) runItem(item)
    }
  }

  const showTownSection = mode === 'towns' || (query.trim().length > 0 && towns.length > 0)
  const showEmpty = items.length === 0

  return createPortal(
    <div
      className="palette-scrim"
      data-testid="palette"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      ref={dialogRef}
      onClick={(e) => {
        // Scrim click (anything outside the dialog) closes.
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="palette-dialog" data-testid="palette-dialog">
        <input
          ref={inputRef}
          className="palette-input"
          data-testid="palette-input"
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-label="Search commands"
          placeholder={mode === 'towns' ? 'Type a town name…' : 'Type a command…'}
          autoComplete="off"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setHi(0)
          }}
          onKeyDown={onInputKey}
        />
        {mode === 'towns' && (
          <p className="palette-mode-note" data-testid="palette-mode-note">
            Town jump — type to filter {TOWNS.count.toLocaleString('en-US')} towns.
          </p>
        )}
        <div id="palette-list" className="palette-list" role="listbox" aria-label="Commands">
          {mode === 'commands' && (
            <>
              {query === '' && (
                <div className="palette-section">
                  Recent{' '}
                  {recents.length === 0 && (
                    <span className="palette-empty" data-testid="palette-recents-empty">
                      — no recent commands yet
                    </span>
                  )}
                </div>
              )}
              {recents.map((c) => (
                <PaletteRow
                  key={`r-${c.id}`}
                  cmd={c}
                  highlighted={items[clampedHi]?.cmd?.id === c.id}
                  onRun={() => runCommand(c.id)}
                  onHover={() => setHi(items.findIndex((it) => it.kind === 'cmd' && it.cmd?.id === c.id))}
                />
              ))}
              <div className="palette-section">
                {query ? `Commands — "${query}"` : 'Commands'}
              </div>
              {(query ? filtered : COMMANDS.filter((c) => !recents.some((r) => r.id === c.id))).map((c) => (
                <PaletteRow
                  key={c.id}
                  cmd={c}
                  highlighted={items[clampedHi]?.cmd?.id === c.id}
                  onRun={() => runCommand(c.id)}
                  onHover={() => setHi(items.findIndex((it) => it.kind === 'cmd' && it.cmd?.id === c.id))}
                />
              ))}
            </>
          )}
          {showTownSection && (
            <>
              <div className="palette-section">Towns</div>
              {towns.map((t) => (
                <button
                  key={`t-${t.name}-${t.lat}-${t.lon}`}
                  type="button"
                  role="option"
                  aria-selected={items[clampedHi]?.town === t}
                  className={`palette-row${items[clampedHi]?.town === t ? ' is-highlighted' : ''}`}
                  data-testid={`palette-town-${townSlug(t)}`}
                  onMouseEnter={() => setHi(items.findIndex((it) => it.town === t))}
                  onClick={() => runItem({ kind: 'town', town: t })}
                >
                  <span className="palette-row-label">{t.name}</span>
                  <span className="palette-row-meta">{t.pop.toLocaleString('en-US')}</span>
                </button>
              ))}
            </>
          )}
          {showEmpty && (
            <p className="palette-empty palette-no-match" data-testid="palette-no-match">
              No matches for "{query}".
            </p>
          )}
        </div>
        <p className="palette-foot">
          <kbd>↑↓</kbd> navigate · <kbd>Enter</kbd> run · <kbd>Esc</kbd> close
        </p>
      </div>
    </div>,
    document.body,
  )
}

function PaletteRow({
  cmd,
  highlighted,
  onRun,
  onHover,
}: {
  cmd: PaletteCommand
  highlighted: boolean
  onRun: () => void
  onHover: () => void
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={highlighted}
      className={`palette-row${highlighted ? ' is-highlighted' : ''}`}
      data-testid={`palette-row-${cmd.id}`}
      onMouseEnter={onHover}
      onClick={onRun}
    >
      <span className="palette-row-label">{cmd.label}</span>
      {cmd.hint && (
        <kbd className="palette-hint" aria-label={`Shortcut: ${cmd.hint}`}>
          {cmd.hint}
        </kbd>
      )}
    </button>
  )
}

export default CommandPalette
