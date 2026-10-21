// W5-FEED compose form — posts to /api/posts with a map snapshot attached
// via composePost (S7). IdentityPicker-gated: FeedPage only renders this
// when a session exists; without one the picker shows first-click.
// R17: clock/RNG-free.
import { useState } from 'react'
import { composePost } from '../lib/snapshot'
import { createPost, type FetchLike, type Session } from '../lib/feed'

export interface FeedComposerProps {
  session: Session
  fetchImpl?: FetchLike
  onPosted: () => void
}

export function FeedComposer({ session, fetchImpl, onPosted }: FeedComposerProps) {
  const [text, setText] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'error'>('idle')
  const [error, setError] = useState('')

  async function submit() {
    const body = text.trim()
    if (!body) return
    setStatus('sending')
    setError('')
    const payload = composePost(session.townSlug, body)
    const res = await createPost(payload, session, fetchImpl)
    if (res.ok) {
      setText('')
      setStatus('idle')
      onPosted()
    } else {
      setStatus('error')
      setError(res.status === 401 ? 'Session missing — set your identity first.' : `Post not sent (${res.error}).`)
    }
  }

  return (
    <form
      className="feed-composer"
      data-testid="feed-composer"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <textarea
        data-testid="composer-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`What's happening in ${session.townName}?`}
        maxLength={500}
        rows={3}
      />
      <div className="feed-composer-row">
        <span className="feed-composer-hint">Posting as {session.nickname} · map snapshot included when the map is visible</span>
        <button type="submit" data-testid="composer-send" disabled={!text.trim() || status === 'sending'}>
          {status === 'sending' ? 'Posting…' : 'Post'}
        </button>
      </div>
      {status === 'error' && (
        <p className="feed-error" role="alert" data-testid="composer-error">
          {error}
        </p>
      )}
    </form>
  )
}
