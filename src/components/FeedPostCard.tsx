// W5-FEED post card — author/town/text, snapshot <img> when present,
// reaction buttons (optimistic toggle, S4), flat one-level replies (S3),
// flag (S2). Square geometry (R20): no raw border-radius; the global
// `* { border-radius: var(--radius) }` rule keeps every corner square.
// R17: clock/RNG-free — timestamps render via
// formatStamp (pure string slicing).
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  REACTION_EMOJIS,
  addComment,
  applyReaction,
  fetchComments,
  flagPost,
  formatStamp,
  noteOptimisticReaction,
  setReaction,
  type Comment,
  type FetchLike,
  type Post,
  type ReactionEmoji,
  type Session,
} from '../lib/feed'
import { Lightbox } from './Lightbox'

export interface FeedPostCardProps {
  post: Post
  /** Session identity for mutations; null (town-feed deep link, no session) = read-only. */
  session: Session | null
  fetchImpl?: FetchLike
}

export function FeedPostCard({ post, session, fetchImpl }: FeedPostCardProps) {
  const [view, setView] = useState<Post>(post)
  useEffect(() => setView(post), [post])

  const [replyOpen, setReplyOpen] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentsStatus, setCommentsStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [commentsError, setCommentsError] = useState('')
  const [replyText, setReplyText] = useState('')
  const [replyError, setReplyError] = useState('')
  const [flagged, setFlagged] = useState(false)
  const [reactionError, setReactionError] = useState('')
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const localIdRef = useRef(0)
  const loadedRef = useRef(false)

  async function react(emoji: ReactionEmoji) {
    const prev = view
    const next = applyReaction(prev, emoji) // optimistic mirror of the S4 toggle
    setView(next)
    noteOptimisticReaction(post.id, next) // server response reconciles against this
    setReactionError('')
    const res = await setReaction(post.id, emoji, session, fetchImpl)
    if (res.ok) setView(res.data)
    else {
      setView(prev)
      setReactionError(`Couldn't save reaction (${res.error}).`)
    }
  }

  async function openReplies() {
    const next = !replyOpen
    setReplyOpen(next)
    if (!next || loadedRef.current) return
    loadedRef.current = true
    setCommentsStatus('loading')
    const res = await fetchComments(post.id, fetchImpl)
    if (res.ok) {
      setComments(res.data)
      setCommentsStatus('ready')
    } else {
      setCommentsError(res.error)
      setCommentsStatus('error')
      loadedRef.current = false
    }
  }

  async function sendReply() {
    const text = replyText.trim()
    if (!text) return
    const tempId = `local-${(localIdRef.current += 1)}`
    const optimistic: Comment = { id: tempId, author: session?.nickname ?? 'you', text, createdAt: '' }
    setComments((c) => [...c, optimistic])
    setReplyText('')
    setReplyError('')
    const res = await addComment(post.id, text, session, fetchImpl)
    if (res.ok) {
      setComments((c) => c.map((row) => (row.id === tempId ? res.data : row)))
    } else {
      setComments((c) => c.filter((row) => row.id !== tempId))
      setReplyError(`Reply not sent (${res.error}).`)
    }
  }

  async function flag() {
    const res = await flagPost(post.id, session, fetchImpl)
    if (res.ok) setFlagged(true)
    else setFlagged(false)
  }

  return (
    <article className="feed-card" data-testid={`post-${post.id}`} data-post-id={post.id}>
      <div className="feed-card-meta">
        {/* W3-D3 discoverability: author/timestamp click into /p/<id> so the
            full detail page (comments, share) is one tap from the feed. */}
        <Link className="feed-view-post" data-testid={`view-post-${post.id}`} to={`/p/${post.id}`}>
          <strong className="feed-author">{view.author}</strong>
          <span className="feed-stamp">{formatStamp(view.createdAt)}</span>
        </Link>
        <span className="feed-town">{view.town}</span>
        {view.hot && (
          <span className="feed-hot-badge" title="Hot in this town">
            hot
          </span>
        )}
      </div>
      <p className="feed-card-text">{view.text}</p>
      {view.snapshot && (
        <button
          type="button"
          className="feed-snapshot-button"
          data-testid={`snapshot-button-${post.id}`}
          aria-label="Open map snapshot full screen"
          onClick={() => setLightboxOpen(true)}
        >
          <img
            className="feed-snapshot"
            data-testid={`snapshot-${post.id}`}
            src={view.snapshot}
            alt={`Map snapshot from ${view.author}`}
          />
        </button>
      )}
      {lightboxOpen && view.snapshot && (
        <Lightbox
          src={view.snapshot}
          alt={`Map snapshot from ${view.author}`}
          onClose={() => setLightboxOpen(false)}
        />
      )}
      <div className="feed-reactions">
        {REACTION_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className="feed-reaction"
            data-testid={`react-${post.id}-${emoji}`}
            aria-pressed={view.myReaction === emoji}
            onClick={() => react(emoji)}
          >
            <span aria-hidden="true">{emoji}</span>
            <span className="feed-reaction-count">{view.reactions[emoji]}</span>
          </button>
        ))}
        <button type="button" className="feed-reply-toggle" data-testid={`reply-toggle-${post.id}`} onClick={openReplies}>
          {view.commentsCount > 0 ? `Replies (${view.commentsCount})` : 'Reply'}
        </button>
        <button
          type="button"
          className="feed-flag"
          data-testid={`flag-${post.id}`}
          onClick={flag}
          disabled={flagged}
        >
          {flagged ? 'Flagged' : 'Flag'}
        </button>
      </div>
      {reactionError && (
        <p className="feed-error" role="alert" data-testid={`reaction-error-${post.id}`}>
          {reactionError}
        </p>
      )}
      {replyOpen && (
        <div className="feed-replies" data-testid={`replies-${post.id}`}>
          {commentsStatus === 'loading' && <p>Loading replies…</p>}
          {commentsStatus === 'error' && (
            <p className="feed-error" role="alert">
              Couldn't load replies ({commentsError}).
            </p>
          )}
          {commentsStatus === 'ready' && comments.length === 0 && <p>No replies yet.</p>}
          {comments.map((c) => (
            <div className="feed-reply" key={c.id} data-testid={`reply-${c.id}`}>
              <strong>{c.author}</strong>
              {c.createdAt && <span className="feed-stamp"> {formatStamp(c.createdAt)}</span>}
              <p>{c.text}</p>
            </div>
          ))}
          <form
            className="feed-reply-form"
            onSubmit={(e) => {
              e.preventDefault()
              void sendReply()
            }}
          >
            <input
              data-testid={`reply-input-${post.id}`}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write a reply…"
              maxLength={500}
            />
            <button type="submit" data-testid={`reply-send-${post.id}`} disabled={!replyText.trim()}>
              Send
            </button>
          </form>
          {replyError && (
            <p className="feed-error" role="alert" data-testid={`reply-error-${post.id}`}>
              {replyError}
            </p>
          )}
        </div>
      )}
    </article>
  )
}
