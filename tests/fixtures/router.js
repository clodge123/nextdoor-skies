// L2 harness fixtures router — deterministic, no Math.random / Date.now / new Date.
// Minimal stand-in for L1's app shell: routes "/" (map home) and "/feed".

const routes = {
  '/': () => `
    <h1>NextDoor Skies</h1>
    <p>Home map placeholder (harness fixture — L1 shell replaces this).</p>
    <div class="card" id="map-placeholder">Map surface</div>
  `,
  '/feed': () => `
    <h1>Feed</h1>
    <p>Feed placeholder (harness fixture — L1 shell replaces this).</p>
    <div class="card">Demo data · seeded post</div>
  `,
};

function render() {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const view = routes[path] ?? routes['/'];
  document.getElementById('view').innerHTML = view();
  document.querySelectorAll('nav a').forEach((a) => {
    if (a.getAttribute('href') === path) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

document.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-route]');
  if (!link) return;
  event.preventDefault();
  window.history.pushState({}, '', link.getAttribute('href'));
  render();
});

window.addEventListener('popstate', render);
render();
