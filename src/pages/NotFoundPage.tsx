// W3-B1 ROUTING — honest 404 page. Session 2 law: unknown town slugs get a
// real 404 (never a silent redirect to the map) WITH a town search box, so
// a mistyped share link is self-service. Search reuses the IdentityPicker
// ranking (prefix-first, pop-desc) over the baked gazetteer.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import townsData from '../../data/towns/us-towns.json'
import { rankTowns } from '../components/IdentityPicker'
import type { TownsFile } from '../lib/map/gazetteer'
import { townSlug } from '../lib/session'

const TOWNS: TownsFile = townsData as TownsFile

export interface NotFoundPageProps {
  /** Town slug from a bad /t/<slug> URL — echoed for the search seed. */
  slug?: string
}

export default function NotFoundPage({ slug }: NotFoundPageProps) {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const results = useMemo(() => rankTowns(query, TOWNS.towns), [query])

  return (
    <section className="not-found-page" aria-labelledby="nf-heading" data-testid="not-found-page">
      <h1 id="nf-heading">404 — page not found</h1>
      {slug && (
        <p className="not-found-detail" data-testid="not-found-slug">
          No town matches <code>{slug}</code> in the gazetteer.
        </p>
      )}
      <form
        className="not-found-search"
        onSubmit={(e) => {
          e.preventDefault()
          const top = results[0]
          if (top) navigate(`/t/${townSlug(top)}`)
        }}
      >
        <label htmlFor="nf-search">Search towns</label>
        <input
          id="nf-search"
          type="search"
          data-testid="not-found-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. Springfield"
          autoComplete="off"
        />
      </form>
      {results.length > 0 && (
        <ul className="not-found-results" data-testid="not-found-results">
          {results.map((t) => (
            <li key={townSlug(t)}>
              <button
                type="button"
                data-testid={`not-found-result-${townSlug(t)}`}
                onClick={() => navigate(`/t/${townSlug(t)}`)}
              >
                {t.name} ({t.pop.toLocaleString('en-US')})
              </button>
            </li>
          ))}
        </ul>
      )}
      <p>
        <a href="/">Back to the map</a>
      </p>
    </section>
  )
}
