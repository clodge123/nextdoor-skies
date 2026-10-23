// W5-FEED — typed client for the posts API (docs/WAVE-2-CONTRACTS.md §S2–S4).
// Honest states: every call returns a discriminated result — never throws at
// the caller, never fabricates data. R17: clock/RNG-free; ISO timestamps are
// treated as opaque strings (formatting is pure string slicing).
//
// W4-C1 FETCH-HYGIENE: every request routes through lib/net.netFetch —
// 10s timeout, 1 retry (GETs), per-key abort of superseded requests
// (wave-4 session 2 law 2). A superseded/aborted request resolves as
// { ok:false, aborted:true } so panels can ignore it silently (the caller's
// ignore-flag pattern keeps working) without leaking console noise.
import townsData from '../../data/towns/us-towns.json'
import type { TownsFile } from './map/gazetteer'
import { netFetch } from './net'

const TOWNS: TownsFile = townsData as TownsFile

export type ReactionEmoji = '👍' | '❤️' | '😂'
export const REACTION_EMOJIS: readonly ReactionEmoji[] = ['👍', '❤️', '😂']

export interface Post {
  id: string
  author: string
  town: string
  text: string
  snapshot: string | null
  /** W4-D2: stored snapshot id (api/snapshot.js) when the post carries one. */
  snapshotId: string | null
  /** Poster's captured view (null on legacy rows). */
  lat: number | null
  lon: number | null
  zoom: number | null
  createdAt: string
  reactions: Record<ReactionEmoji, number>
  myReaction: ReactionEmoji | null
  commentsCount: number
  hot: boolean
}

export interface Comment {
  id: string
  author: string
  text: string
  createdAt: string
}

/** Structural mirror of the S1 Session contract (owner: W3-IDENTITY). */
export interface Session {
  nickname: string
  townSlug: string
  townName: string
}

export const SESSION_STORAGE_KEY = 'nds-session'

/**
 * Read the session per the S1 contract (localStorage 'nds-session').
 * Returns null when absent/corrupt — the caller must degrade gracefully
 * (no session => no town => honest identity prompt, never a fake feed).
 */
export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Session>
    if (typeof parsed.nickname !== 'string' || !parsed.nickname) return null
    if (typeof parsed.townSlug !== 'string' || !parsed.townSlug) return null
    const townName = typeof parsed.townName === 'string' && parsed.townName ? parsed.townName : parsed.townSlug
    return { nickname: parsed.nickname, townSlug: parsed.townSlug, townName }
  } catch {
    return null
  }
}

export function writeSession(session: Session): void {
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

/** Injectable fetch (mirrors the weather refresher's seam for tests). */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; aborted?: boolean }

const defaultFetch: FetchLike = (input, init) => window.fetch(input, init)

function sessionHeaders(session: Session | null): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (session) headers['x-nds-session'] = JSON.stringify(session)
  return headers
}

async function apiJson<T>(
  url: string,
  init: RequestInit,
  fetchImpl: FetchLike,
  key?: string,
): Promise<ApiResult<T>> {
  try {
    const res = await netFetch(url, {
      key,
      method: init.method ?? 'GET',
      headers: (init.headers ?? undefined) as Record<string, string> | undefined,
      body: init.body ?? null,
      fetchImpl,
    })
    if (!res.ok) {
      let message = `HTTP ${res.status}`
      try {
        const body = (await res.json()) as { error?: unknown }
        if (typeof body?.error === 'string' && body.error) message = body.error
      } catch {
        /* body was not JSON — keep the status line */
      }
      return { ok: false, status: res.status, error: message }
    }
    const data = (await res.json()) as T
    return { ok: true, data }
  } catch (err) {
    // Superseded/externally aborted: honest "aborted" result, no console
    // noise, no fabricated data (callers ignore it via their ignore-flag).
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, status: 0, error: 'aborted', aborted: true }
    }
    return { ok: false, status: 0, error: err instanceof Error ? err.message : 'network error' }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function reactionCounts(raw: unknown): Record<ReactionEmoji, number> {
  const counts: Record<ReactionEmoji, number> = { '👍': 0, '❤️': 0, '😂': 0 }
  if (isRecord(raw)) {
    for (const emoji of REACTION_EMOJIS) {
      const n = raw[emoji]
      if (typeof n === 'number' && Number.isFinite(n) && n >= 0) counts[emoji] = Math.floor(n)
    }
  }
  return counts
}

/** Validate + normalize one API row. Junk rows are dropped, not guessed. */
export function normalizePost(raw: unknown): Post | null {
  if (!isRecord(raw)) return null
  if (typeof raw.id !== 'string' || !raw.id) return null
  if (typeof raw.text !== 'string') return null
  const author = typeof raw.author === 'string' ? raw.author : 'unknown'
  const town = typeof raw.town === 'string' ? raw.town : ''
  const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : ''
  const snapshot = typeof raw.snapshot === 'string' && raw.snapshot ? raw.snapshot : null
  const snapshotId = typeof raw.snapshotId === 'string' && raw.snapshotId ? raw.snapshotId : null
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const lat = num(raw.lat)
  const lon = num(raw.lon)
  const zoom = num(raw.zoom)
  const myReaction = REACTION_EMOJIS.includes(raw.myReaction as ReactionEmoji)
    ? (raw.myReaction as ReactionEmoji)
    : null
  const commentsCount =
    typeof raw.commentsCount === 'number' && Number.isFinite(raw.commentsCount)
      ? Math.max(0, Math.floor(raw.commentsCount))
      : 0
  return {
    id: raw.id,
    author,
    town,
    text: raw.text,
    snapshot,
    snapshotId,
    lat,
    lon,
    zoom,
    createdAt,
    reactions: reactionCounts(raw.reactions),
    myReaction,
    commentsCount,
    hot: raw.hot === true,
  }
}

/** Parse a /api/posts body: rows that fail validation are honestly dropped. */
export function parsePosts(body: unknown): Post[] {
  const rows = isRecord(body) ? (body as { posts?: unknown }).posts : undefined
  if (!Array.isArray(rows)) return []
  const out: Post[] = []
  for (const row of rows) {
    const post = normalizePost(row)
    if (post) out.push(post)
  }
  return out
}

export function parseComments(body: unknown): Comment[] {
  if (!Array.isArray(body)) return []
  const out: Comment[] = []
  for (const row of body) {
    if (!isRecord(row) || typeof row.id !== 'string' || !row.id || typeof row.text !== 'string') continue
    out.push({
      id: row.id,
      author: typeof row.author === 'string' ? row.author : 'unknown',
      text: row.text,
      createdAt: typeof row.createdAt === 'string' ? row.createdAt : '',
    })
  }
  return out
}

/** S2: GET /api/posts?town=<slug>&sort=hot|new.
 *  Optional `key` overrides the supersession key (panel uses one shared
 *  'panel-posts' key so fast pans between towns cancel the previous town's
 *  request — Google Maps rule). */
export async function fetchPosts(
  params: { town?: string; sort: 'hot' | 'new'; fetchImpl?: FetchLike; key?: string },
): Promise<ApiResult<Post[]>> {
  const fetchImpl = params.fetchImpl ?? defaultFetch
  // W4-E1 ALL-FEED: omit `town` for the global stream (API lists every town).
  const townQ = params.town ? `town=${encodeURIComponent(params.town)}&` : ''
  const url = `/api/posts?${townQ}sort=${params.sort}`
  // Supersession key: a fast pan (panel slug change / sort toggle) cancels
  // the older in-flight posts request — Google Maps rule.
  const res = await apiJson<unknown>(
    url,
    { method: 'GET' },
    fetchImpl,
    params.key ?? `posts:${params.town ?? 'all'}:${params.sort}`,
  )
  if (!res.ok) return res
  return { ok: true, data: parsePosts(res.data) }
}

/** S2: POST /api/posts (session header required by contract). W4-D2: the
 *  snapshotId/lat/lon/zoom fields carry the server-composited snapshot
 *  reference (docs/SNAPSHOT-API.md) — validated loudly server-side. */
export async function createPost(
  payload: {
    town: string
    text: string
    snapshot?: string
    snapshotId?: string
    lat?: number
    lon?: number
    zoom?: number
  },
  session: Session | null,
  fetchImpl?: FetchLike,
): Promise<ApiResult<Post>> {
  const fetchImpl_ = fetchImpl ?? defaultFetch
  const res = await apiJson<unknown>(
    '/api/posts',
    { method: 'POST', headers: sessionHeaders(session), body: JSON.stringify(payload) },
    fetchImpl_,
  )
  if (!res.ok) return res
  // Server contract (api/posts.js): 201 body is { post: {...} }. Accept the
  // bare row too so the client is robust to both shapes.
  const raw = isRecord(res.data) && isRecord(res.data.post) ? res.data.post : res.data
  const post = normalizePost(raw)
  if (!post) return { ok: false, status: 0, error: 'malformed post response' }
  return { ok: true, data: post }
}

/**
 * Route an action on a post. Production (Vercel) filesystem routing only
 * dispatches the exact `/api/posts` file, so subpaths like
 * `/api/posts/:id/reactions` fall through to the SPA rewrite and 404
 * (docs/WAVE-3-CRITIQUE-TRIAGE.md C6). The server's supported form is the
 * query-param route `/api/posts?path=<id>/<action>` (api/posts.js parses
 * `path`); every per-post call uses it.
 */
function postActionUrl(postId: string, action: string): string {
  return `/api/posts?path=${encodeURIComponent(`${postId}/${action}`)}`
}

/** S3: GET /api/posts?path=<id>/comments */
export async function fetchComments(
  postId: string,
  fetchImpl?: FetchLike,
): Promise<ApiResult<Comment[]>> {
  const impl = fetchImpl ?? defaultFetch
  const res = await apiJson<unknown>(
    postActionUrl(postId, 'comments'),
    { method: 'GET' },
    impl,
  )
  if (!res.ok) return res
  return { ok: true, data: parseComments(res.data) }
}

/** S3: POST /api/posts/:id/comments (session required). */
export async function addComment(
  postId: string,
  text: string,
  session: Session | null,
  fetchImpl?: FetchLike,
): Promise<ApiResult<Comment>> {
  const impl = fetchImpl ?? defaultFetch
  const res = await apiJson<unknown>(
    postActionUrl(postId, 'comments'),
    { method: 'POST', headers: sessionHeaders(session), body: JSON.stringify({ text }) },
    impl,
  )
  if (!res.ok) return res
  const rows = parseComments([res.data])
  if (rows.length === 0) return { ok: false, status: 0, error: 'malformed comment response' }
  return { ok: true, data: rows[0] }
}

/**
 * S4: POST /api/posts?path=<id>/reactions — server-side toggle.
 * The server's real body is `{ ok: true, myReaction }` (NOT a full post);
 * the client reconciles the authoritative myReaction into the optimistic
 * post view (counts adjusted to match the server's truth).
 */
export async function setReaction(
  postId: string,
  emoji: ReactionEmoji,
  session: Session | null,
  fetchImpl?: FetchLike,
): Promise<ApiResult<Post>> {
  const impl = fetchImpl ?? defaultFetch
  const res = await apiJson<unknown>(
    postActionUrl(postId, 'reactions'),
    { method: 'POST', headers: sessionHeaders(session), body: JSON.stringify({ emoji }) },
    impl,
  )
  if (!res.ok) return res
  const body = isRecord(res.data) ? res.data : {}
  if ('myReaction' in body) {
    // Real server shape: { ok: true, myReaction }. Merge the authoritative
    // value into the optimistic view.
    const serverMy = REACTION_EMOJIS.includes(body.myReaction as ReactionEmoji)
      ? (body.myReaction as ReactionEmoji)
      : null
    return { ok: true, data: reconcileReaction(postId, serverMy) }
  }
  // Legacy/contract-echo shape: a full post row (mocked gates). Keep the
  // historical behavior — normalize the row.
  const post = normalizePost(res.data)
  if (!post) return { ok: false, status: 0, error: 'malformed reaction response' }
  return { ok: true, data: post }
}

/** Last optimistic view per post id (module-level, keyed) so the server's
 *  authoritative myReaction can be merged into fresh counts. Cleared on
 *  success; the map is a reconciliation aid, not a cache. */
const pendingReactions = new Map<string, Post>()

/** Called by FeedPostCard's optimistic update path (see applyReaction). */
export function noteOptimisticReaction(postId: string, view: Post): void {
  pendingReactions.set(postId, view)
}

function reconcileReaction(postId: string, serverMy: ReactionEmoji | null): Post {
  const base = pendingReactions.get(postId)
  pendingReactions.delete(postId)
  if (!base) {
    // No optimistic view tracked (direct call): synthesize a minimal view
    // reflecting the server truth for this emoji only.
    return {
      id: postId, author: '', town: '', text: '', snapshot: null, snapshotId: null,
      lat: null, lon: null, zoom: null, createdAt: '',
      reactions: { '👍': 0, '❤️': 0, '😂': 0, ...(serverMy ? { [serverMy]: 1 } : {}) },
      myReaction: serverMy, commentsCount: 0, hot: false,
    }
  }
  // Trust the server's myReaction; adjust counts so the sum matches exactly
  // one reaction per nickname (the optimistic delta may have raced).
  const reactions = { ...base.reactions }
  if (base.myReaction && base.myReaction !== serverMy) {
    reactions[base.myReaction] = Math.max(0, reactions[base.myReaction] - 1)
  }
  if (serverMy && serverMy !== base.myReaction) {
    reactions[serverMy] = reactions[serverMy] + 1
  }
  return { ...base, reactions, myReaction: serverMy }
}

/** S2: POST /api/posts/:id/flag — hidden after 3 distinct flags server-side. */
export async function flagPost(
  postId: string,
  session: Session | null,
  fetchImpl?: FetchLike,
): Promise<ApiResult<{ flagged: true }>> {
  const impl = fetchImpl ?? defaultFetch
  return apiJson<{ flagged: true }>(
    postActionUrl(postId, 'flag'),
    { method: 'POST', headers: sessionHeaders(session), body: JSON.stringify({}) },
    impl,
  )
}

/**
 * Optimistic local toggle (client mirror of S4 semantics): same emoji twice
 * removes it; switching replaces the previous reaction. Pure — feeds the
 * immediate UI update; the API response (or an error) reconciles afterwards.
 */
export function applyReaction(post: Post, emoji: ReactionEmoji): Post {
  const reactions = { ...post.reactions }
  if (post.myReaction === emoji) {
    reactions[emoji] = Math.max(0, reactions[emoji] - 1)
    return { ...post, reactions, myReaction: null }
  }
  if (post.myReaction) reactions[post.myReaction] = Math.max(0, reactions[post.myReaction] - 1)
  reactions[emoji] = reactions[emoji] + 1
  return { ...post, reactions, myReaction: emoji }
}

/** Hot view: server-pinned posts first (order preserved), remainder follows. */
export function partitionHot(posts: readonly Post[]): { pinned: Post[]; rest: Post[] } {
  const pinned: Post[] = []
  const rest: Post[] = []
  for (const post of posts) (post.hot ? pinned : rest).push(post)
  return { pinned, rest }
}

/** Newest view: pure ISO-string sort, descending. Deterministic (R17). */
export function sortByNewest(posts: readonly Post[]): Post[] {
  return [...posts].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Deterministic stamp from an ISO-8601 string: "2026-10-21 15:04". */
export function formatStamp(iso: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso)
  return match ? `${match[1]} ${match[2]}` : iso
}

/* ---- Identity helpers (structural mirror of W3's session.ts, S1) ---- */

/** Lowercase, non-alnum -> single dash, trimmed. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function round2(n: number): string {
  return String(Math.round(n * 100) / 100)
}

/**
 * Resolve a town name to its canonical gazetteer slug (S1 pickTownSlug).
 * Multiple hits resolve deterministically: highest pop, then lowest lat,
 * then lowest lon. Unknown names fall back to the bare slug.
 */
export function pickTownSlug(name: string): string {
  const slug = slugify(name)
  if (!slug) return ''
  const matches = TOWNS.towns.filter((t) => slugify(t.name) === slug)
  if (matches.length === 0) return slug
  const best = matches.reduce((a, b) =>
    b.pop !== a.pop
      ? b.pop > a.pop
        ? b
        : a
      : b.lat !== a.lat
        ? b.lat < a.lat
          ? b
          : a
        : b.lon < a.lon
          ? b
          : a,
  )
  return `${slugify(best.name)}-${round2(best.lat)}-${round2(best.lon)}`
}

/** Nickname sanitizer mirroring W3: strips HTML/markup/control chars. */
export function sanitizeNickname(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-zA-Z][a-zA-Z0-9]*;|&#\d+;|&#x[0-9a-fA-F]+;/g, '')
    .replace(/[<>&]/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * W3-D3 POST DETAIL: GET /api/posts?path=<id> — single post by id (the
 * /p/<id> deep link). Same contract shape as a list row; unknown id 404s
 * honestly (the caller maps that to NotFoundPage, never a fabricated post).
 */
export async function fetchPost(
  postId: string,
  fetchImpl?: FetchLike,
): Promise<ApiResult<Post>> {
  const impl = fetchImpl ?? defaultFetch
  const res = await apiJson<unknown>(
    `/api/posts?path=${encodeURIComponent(postId)}`,
    { method: 'GET' },
    impl,
  )
  if (!res.ok) return res
  const raw = isRecord(res.data) && isRecord(res.data.post) ? res.data.post : res.data
  const post = normalizePost(raw)
  if (!post) return { ok: false, status: 0, error: 'malformed post response' }
  return { ok: true, data: post }
}
