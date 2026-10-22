// W3-B1 ROUTING — /alerts page placeholder (session 3 decision 3: the
// severity-grouped alert center replaces the banner in the wave-3 lanes).
// Honest state: no fabricated alert list; the page says what is coming.
export default function AlertsPage() {
  return (
    <section className="alerts-page" aria-labelledby="alerts-heading" data-testid="alerts-page">
      <h1 id="alerts-heading">Alerts</h1>
      <p className="alerts-placeholder" data-testid="alerts-placeholder">
        The severity-grouped alert center lands in wave 3 (D2).
      </p>
    </section>
  )
}
