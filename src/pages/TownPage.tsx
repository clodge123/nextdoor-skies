// W3-B1 ROUTING — /t/<slug> town page shell (session 2 decision 1: town
// detail page; the full weather-card/alerts/recent-posts surface lands in
// the wave-3 detail lanes). This shell resolves the slug against the baked
// gazetteer: known -> real town name + link into the town feed; unknown ->
// the honest 404 page. No fake data, no session-town coupling.
import { Link, useParams } from 'react-router-dom'
import { resolveTown } from '../lib/routing'
import NotFoundPage from './NotFoundPage'

export default function TownPage() {
  const { slug = '' } = useParams()
  const town = resolveTown(slug)
  if (!town) return <NotFoundPage slug={slug} />

  return (
    <section className="town-page" aria-labelledby="town-heading" data-testid="town-page">
      <h1 id="town-heading">{town.name}</h1>
      <p className="town-meta" data-testid="town-meta">
        {town.lat}, {town.lon} · pop {town.pop.toLocaleString('en-US')} · {town.tier}
      </p>
      <p className="town-placeholder" data-testid="town-placeholder">
        Weather card, town alerts, and recent posts land in the wave-3 detail
        lanes.
      </p>
      <Link to={`/t/${slug}/feed`} data-testid="town-open-feed">
        Open town feed
      </Link>
    </section>
  )
}
