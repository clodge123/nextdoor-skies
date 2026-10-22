// W3-B1 ROUTING — /t/<slug>/feed: the town feed seeded with THAT town,
// never the session town (session 2 decision 2: deep links resolve on their
// own). Unknown slug -> honest 404 page.
import { useParams } from 'react-router-dom'
import FeedPage from './FeedPage'
import NotFoundPage from './NotFoundPage'
import { resolveTown } from '../lib/routing'

export default function TownFeedPage() {
  const { slug = '' } = useParams()
  const town = resolveTown(slug)
  if (!town) return <NotFoundPage slug={slug} />
  return <FeedPage townSlug={slug} townName={town.name} />
}
