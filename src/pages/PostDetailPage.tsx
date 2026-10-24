// W3-D3 POST DETAIL — /p/<id> is the real post page (brainstorm session 4:
// "post detail full page", flat one-level comments, lightbox on the snapshot,
// share = copy-link + native Web Share when available).
// Deep-link law: unknown id -> honest NotFoundPage (never a fabricated post).
// R17: clock/RNG-free — timestamps are opaque ISO strings via formatStamp.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  REACTION_EMOJIS,
  addComment,
  applyReaction,
  fetchComments,
  fetchPost,
  formatStamp,
  getSession,
  noteOptimisticReaction,
  setReaction,
  type Comment,
  type FetchLike,
  type Post,
  type ReactionEmoji,
} from '../lib/feed'
import { canNativeShare, copyText, nativeShare } from '../lib/share'
import NotFoundPage from './NotFoundPage'

export interface PostDetailPageProps {
  /** Injectable fetch seam (feed lib law); defaults to window.fetch. */
  fetchImpl?: FetchLike
}

export default function PostDetailPage({ fetchImpl }: PostDetailPageProps = {}) {
  const { id = '' } = useParams()
  const [session] = useState(() => getSession())
  const [post, setPost] = useState<Post | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'not-found' | 'error'>('loading')
  const [error, setError] = useState('')
  const [comments, setComments] = useState<Comment[]>([])
  const [commentsStatus, setCommentsStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [commentsError, setCommentsError] = useState('')
  const [reactionError, setReactionError] = useState('')
  const [replyText, setReplyText] = useState('')
  const [replyError, setReplyError] = useState('')
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'shared' | 'failed'>('idle')
  const localIdRef = useRef(0)

  const load = useCallback(async () => {
    if (!id) {
      setStatus('not-found')
      return
    }
    setStatus('loading')
    setError('')
    const res = await fetchPost(id, fetchImpl)
    if (res.ok) {
      setPost(res.data)
      setStatus('ready')
    } else if (res.status === 404) {
      setPost(null)
      setStatus('not-found') // honest: this id does not exist (flagged-out reads as gone)
    } else {
      setPost(null)
      setError(res.error)
      setStatus('error')
    }
  }, [id, fetchImpl])

  useEffect(() => {
    let ignore = false
    if (!id) {
      setStatus('not-found')
      return
    }
    setStatus('loading')
    setError('')
    void fetchPost(id, fetchImpl).then((res) => {
      if (ignore) return
      if (res.ok) {
        setPost(res.data)
        setStatus('ready')
      } else if (res.status === 404) {
        setPost(null)
        setStatus('not-found')
      } else {
        setPost(null)
        setError(res.error)
        setStatus('error')
      }
    })
    return () => {
      ignore = true
    }
  }, [id, fetchImpl])

  useEffect(() => {
    if (!id) return
    let ignore = false
    setCommentsStatus('loading')
    setCommentsError('')
    void fetchComments(id, fetchImpl).then((res) => {
      if (ignore) return
      if (res.ok) {
        setComments(res.data)
        setCommentsStatus('ready')
      } else {
        setCommentsError(res.error)
        setCommentsStatus('error')
      }
    })
    return () => {
      ignore = true
    }
  }, [id, fetchImpl])

  async function react(emoji: ReactionEmoji) {
    if (!post) return
    const prev = post
    const next = applyReaction(post, emoji) // optimistic mirror of the S4 toggle
    setPost(next)
    noteOptimisticReaction(post.id, next)
    setReactionError('')
    const res = await setReaction(post.id, emoji, session, fetchImpl)
    if (res.ok) setPost(res.data)
    else {
      setPost(prev)
      setReactionError(`Couldn't save reaction (${res.error}).`)
    }
  }

  async function sendReply() {
    const text = replyText.trim()
    if (!text || !post) return
    const tempId = `local-${(localIdRef.current += 1)}`
    setComments((c) => [...c, { id: tempId, author: session?.nickname ?? 'you', text, createdAt: '' }])
    setReplyText('')
    setReplyError('')
    const res = await addComment(post.id, text, session, fetchImpl)
    if (res.ok) setComments((c) => c.map((row) => (row.id === tempId ? res.data : row)))
    else {
      setComments((c) => c.filter((row) => row.id !== tempId))
      setReplyError(`Reply not sent (${res.error}).`)
    }
  }

  async function copyLink() {
    const url = `${window.location.origin}/p/${id}`
    const ok = await copyText(url)
    setShareState(ok ? 'copied' : 'failed')
  }

  async function nativeSharePost() {
    const url = `${window.location.origin}/p/${id}`
    const outcome = await nativeShare({ title: `Post by ${post?.author ?? 'neighbor'}`, text: post?.text.slice(0, 100), url })
    setShareState(outcome === 'shared' ? 'shared' : outcome === 'failed' ? 'failed' : 'idle')
  }

  if (status === 'not-found') return <NotFoundPage />

  if (status === 'error') {
    return (
      <section className="post-detail-page" aria-labelledby="post-heading" data-testid="post-detail-page">
        <h1 id="post-heading">Post</h1>
        <p className="feed-error" role="alert" data-testid="post-detail-error">
          Couldn't load this post ({error}).{' '}
          <button type="button" data-testid="post-detail-retry" onClick={() => void load()}>
            Retry
          </button>
        </p>
      </section>
    )
  }

  if (status === 'loading' || !post) {
    return (
      <section className="post-detail-page" aria-labelledby="post-heading" data-testid="post-detail-page">
        <h1 id="post-heading">Post</h1>
        <p className="post-detail-loading" data-testid="post-detail-loading">
          Loading post…
        </p>
      </section>
    )
  }

  return (
    <section className="post-detail-page" aria-labelledby="post-heading" data-testid="post-detail-page">
      <div className="post-detail-actions">
        <a href="/feed" data-testid="post-detail-back">
          ← Feed
        </a>
        <div className="post-detail-share" role="group" aria-label="Share">
          <button type="button" data-testid="share-copy" onClick={() => void copyLink()}>
            {shareState === 'copied' ? 'Copied!' : 'Copy link'}
          </button>
          {canNativeShare() && (
            <button type="button" data-testid="share-native" onClick={() => void nativeSharePost()}>
              Share
            </button>
          )}
        </div>
      </div>
      {shareState === 'copied' && (
        <p className="post-detail-share-note" data-testid="share-copied" role="status">
          Copied! Link to this post is on your clipboard.
        </p>
      )}
      {shareState === 'failed' && (
        <p className="feed-error" role="alert" data-testid="share-failed">
          Copy failed — your browser blocked clipboard access.
        </p>
      )}

      <article className="feed-card post-detail-post" data-testid={`post-${post.id}`} data-post-id={post.id}>
        <p className="feed-card-text" data-testid="post-detail-text">
          {post.text}
        </p>
        {/* W4-BF: snapshot image removed from the detail surface (owner
            call: "take the images out"). Author + timestamp stay in feed
            chrome below the text (C-03 geometry). */}
        <div className="feed-card-meta feed-card-meta-below" data-testid="post-detail-meta">
          <strong className="feed-author">{post.author}</strong>
          <span className="feed-town">{post.town}</span>
          <span className="feed-stamp" data-testid="post-detail-stamp">
            {formatStamp(post.createdAt)}
          </span>
          {post.hot && (
            <span className="feed-hot-badge" title="Hot in this town">
              hot
            </span>
          )}
        </div>
        <div className="feed-reactions">
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="feed-reaction"
              data-testid={`react-${post.id}-${emoji}`}
              aria-pressed={post.myReaction === emoji}
              onClick={() => void react(emoji)}
            >
              <span aria-hidden="true">{emoji}</span>
              <span className="feed-reaction-count">{post.reactions[emoji]}</span>
            </button>
          ))}
        </div>
        {reactionError && (
          <p className="feed-error" role="alert" data-testid="post-detail-reaction-error">
            {reactionError}
          </p>
        )}
      </article>

      <section className="post-detail-comments" aria-label="Comments" data-testid="post-detail-comments">
        <h2>Comments ({comments.length})</h2>
        {commentsStatus === 'loading' && (
          <p data-testid="post-detail-comments-loading">Loading comments…</p>
        )}
        {commentsStatus === 'error' && (
          <p className="feed-error" role="alert" data-testid="post-detail-comments-error">
            Couldn't load comments ({commentsError}).
          </p>
        )}
        {commentsStatus === 'ready' && comments.length === 0 && (
          <p data-testid="post-detail-comments-empty">No comments yet.</p>
        )}
        {comments.map((c) => (
          <div className="feed-reply" key={c.id} data-testid={`comment-${c.id}`}>
            <strong>{c.author}</strong>
            {c.createdAt && (
              <span className="feed-stamp"> {formatStamp(c.createdAt)}</span>
            )}
            <p>{c.text}</p>
          </div>
        ))}
        {session ? (
          <form
            className="feed-reply-form"
            onSubmit={(e) => {
              e.preventDefault()
              void sendReply()
            }}
          >
            <input
              data-testid="post-detail-reply-input"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write a comment…"
              maxLength={500}
            />
            <button type="submit" data-testid="post-detail-reply-send" disabled={!replyText.trim()}>
              Send
            </button>
          </form>
        ) : (
          <p data-testid="post-detail-reply-gate">Pick a nickname in the feed to comment.</p>
        )}
        {replyError && (
          <p className="feed-error" role="alert" data-testid="post-detail-reply-error">
            {replyError}
          </p>
        )}
      </section>
    </section>
  )
}
