// W4-BF TEXT-ONLY COMPOSER (owner bug-fix round #2: "we don't need the
// images — take them out, let people comment"). The W4-D2 snapshot flow
// (CAPTURE button, burned strip, preview, retry/post-without-image) is
// REMOVED: posting is text + town chip only. Reactions/replies/flags ride
// the existing feed contract unchanged.
//
// R17: clock/RNG-free — nothing here reads the clock; timestamps come from
// the server.
import { useState } from 'react'
import { createPost, type FetchLike, type Session } from '../lib/feed'

export interface FeedComposerProps {
  session: Session
  fetchImpl?: FetchLike
  onPosted: () => void
}

export function FeedComposer({ session, fetchImpl, onPosted }: FeedComposerProps) {
  const [text, setText] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending'>('idle')
  const [error, setError] = useState('')

  async function submit() {
    const body = text.trim()
    if (!body) return
    setStatus('sending')
    setError('')
    const res = await createPost({ town: session.townSlug, text: body }, session, fetchImpl)
    if (res.ok) {
      setText('')
      setStatus('idle')
      onPosted()
    } else {
      setStatus('idle')
      setError(res.status === 401 ? 'Session missing — set your identity first.' : `Post not sent (${res.error}).`)
    }
  }

  const sending = status === 'sending'
  const canPost = text.trim().length > 0 && !sending

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
        <span
          className="composer-town-chip"
          data-testid="composer-town-chip"
          title={session.townSlug}
        >
          📍 {session.townName}
        </span>
        <button type="submit" data-testid="composer-send" disabled={!canPost}>
          {sending ? 'Posting…' : 'Post'}
        </button>
      </div>

      {status === 'sending' && <p className="feed-status" data-testid="composer-sending">Posting…</p>}

      {status === 'idle' && error && (
        <p className="feed-error" role="alert" data-testid="composer-error">
          {error}
        </p>
      )}
    </form>
  )
}
