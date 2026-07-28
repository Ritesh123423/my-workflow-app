// BOOT — auth check, hydrate from Postgres, then start app
(async function boot() {
  // 1. Auth check — if not logged in, requireAuth() redirects and returns false
  //    Page stays hidden (visibility:hidden set in <head>) until we reveal it
  if (!API.requireAuth()) return; // redirecting — never reveal

  // 2. Auth passed — render a loading overlay while hydrating
  const overlay = document.createElement('div');
  overlay.id = 'boot-loading';
  overlay.style.cssText = [
    'position:fixed', 'inset:0', 'background:#0a1e3d', 'color:#fff',
    'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
    'font-family:Poppins,sans-serif', 'font-size:14px', 'z-index:99999', 'gap:12px'
  ].join(';');
  overlay.innerHTML = '<div style="font-size:22px;font-weight:800;letter-spacing:-0.5px">ROU</div>' +
    '<div style="opacity:0.6">Loading workspace…</div>';
  document.body.appendChild(overlay);

  // 3. Reveal page (behind overlay) — no more flicker
  document.documentElement.style.visibility = '';

  try {
    await DB.hydrate();
    overlay.remove();
    App.init();

    // 4. Render user bar
    _renderUserBar();

    setTimeout(() => LivePreview.attach(), 200);
  } catch (err) {
    overlay.remove();
    console.error('Boot failed:', err);
    if (typeof toast === 'function') toast('Failed to load workspace: ' + err.message, 'error', 8000);
    else alert('Failed to load workspace: ' + err.message);
  }
})();

function _renderUserBar() {
  var bar = document.getElementById('home-user-bar');
  if (!bar) return;
  try {
    var token = localStorage.getItem('rou_token');
    if (!token) return;
    var p = JSON.parse(atob(token.split('.')[1]));
    var roleColors = { admin:'#e8520a', partner:'#7c3aed', manager:'#1a3f6b', article:'#059669' };
    var roleLabels = { admin:'Administrator', partner:'Partner', manager:'Manager', article:'Article' };
    var color = roleColors[p.role] || '#1e293b';
    bar.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:10px 0;border-top:1px solid rgba(255,255,255,0.1);margin-top:8px">' +
        '<div style="display:flex;align-items:center;gap:9px">' +
          '<div style="width:30px;height:30px;border-radius:8px;background:' + color + ';display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff">' +
            (p.name || '?').charAt(0).toUpperCase() +
          '</div>' +
          '<div>' +
            '<div style="font-size:12px;font-weight:600;color:#1e293b">' + (p.name || p.email) + '</div>' +
            '<div style="font-size:11px;color:' + color + ';font-weight:600">' + (roleLabels[p.role] || p.role) + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:7px">' +
          (p.role === 'admin' ? '<a href="admin.html" style="font-size:11.5px;font-weight:600;color:#e8520a;text-decoration:none;padding:5px 11px;background:#fff3ee;border-radius:6px;border:1px solid rgba(232,82,10,0.25)">⚙ Admin</a>' : '') +
          '<a href="login.html" onclick="localStorage.clear();return true;" style="font-size:11.5px;color:#94a3b8;text-decoration:none;padding:5px 11px;background:#f1f5f9;border-radius:6px;border:1px solid #e2e8f0">Sign out</a>' +
        '</div>' +
      '</div>';
  } catch(e) {}
}
