// W3-B1 ROUTING — /p/<id> post detail placeholder (session 2 decision 6:
// full page with comment thread lands in D3). Honest state: this shell says
// it is loading and names what is coming; it never fabricates a post.
export default function PostDetailPage() {
  return (
    <section className="post-detail-page" aria-labelledby="post-heading" data-testid="post-detail-page">
      <h1 id="post-heading">Post</h1>
      <p className="post-detail-loading" data-testid="post-detail-loading">
        Loading post…
      </p>
      <p className="post-detail-note" data-testid="post-detail-note">
        The full post with its comment thread lands in wave 3 (D3).
      </p>
    </section>
  )
}
