// BOOT — auth check → hydrate → start app
(async function boot() {
  // 1. requireAuth() handles SSO token absorption and session validation.
  //    Returns false and redirects if not authenticated.
  if (!API.requireAuth()) return;

  // 2. Loading overlay
  var overlay = document.createElement('div');
  overlay.id = 'boot-loading';
  overlay.style.cssText = [
    'position:fixed','inset:0','background:#0a1e3d','color:#fff',
    'display:flex','flex-direction:column','align-items:center','justify-content:center',
    'font-family:Inter,Poppins,sans-serif','font-size:14px','z-index:99999','gap:14px'
  ].join(';');
  overlay.innerHTML =
    '<div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#2563eb,#1d4ed8);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;letter-spacing:-0.5px;color:#fff">KG</div>' +
    '<div style="opacity:0.6;font-size:13px">Loading workspace…</div>';
  document.body.appendChild(overlay);

  // 3. Reveal page behind overlay — prevents flash
  document.documentElement.style.visibility = '';

  try {
    await DB.hydrate();
    overlay.remove();
    App.init();
    _renderUserBar();
    setTimeout(function() { LivePreview.attach(); }, 200);
  } catch (err) {
    overlay.remove();
    console.error('[boot] Failed to initialise workspace:', err);
    if (typeof toast === 'function') {
      toast('Failed to load workspace: ' + err.message, 'error', 8000);
    } else {
      alert('Failed to load workspace: ' + err.message);
    }
  }
})();

// ── User bar (rendered into home.html sidebar bottom) ─────────────────────
function _renderUserBar() {
  var bar = document.getElementById('home-user-bar');
  if (!bar) return;
  try {
    var token = localStorage.getItem('rou_token');
    if (!token) return;
    // Safe base64 decode with padding fix
    var parts = token.split('.');
    if (parts.length !== 3) return;
    var b64 = parts[1];
    b64 += '='.repeat((4 - b64.length % 4) % 4);
    var p = JSON.parse(atob(b64));
    var roleColors = { admin:'#e8520a', partner:'#7c3aed', manager:'#1a3f6b', article:'#059669' };
    var roleLabels = { admin:'Administrator', partner:'Partner', manager:'Manager', article:'Article' };
    var color = roleColors[p.role] || '#1e293b';
    var label = roleLabels[p.role] || p.role;
    bar.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:10px 0;border-top:1px solid rgba(255,255,255,0.1);margin-top:8px">' +
        '<div style="display:flex;align-items:center;gap:9px">' +
          '<div style="width:30px;height:30px;border-radius:8px;background:' + color + ';display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff">' +
            (p.name || '?').charAt(0).toUpperCase() +
          '</div>' +
          '<div>' +
            '<div style="font-size:12px;font-weight:600;color:#1e293b">' + _escHtml(p.name || p.email) + '</div>' +
            '<div style="font-size:11px;color:' + color + ';font-weight:600">' + label + '</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:7px">' +
          (p.role === 'admin' ? '<a href="admin.html" style="font-size:11.5px;font-weight:600;color:#e8520a;text-decoration:none;padding:5px 11px;background:#fff3ee;border-radius:6px;border:1px solid rgba(232,82,10,0.25)">⚙ Admin</a>' : '') +
          '<button onclick="App.signOut()" style="font-size:11.5px;color:#94a3b8;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:5px 11px;cursor:pointer;font-family:inherit">Sign out</button>' +
        '</div>' +
      '</div>';
  } catch(e) {
    console.warn('[boot] _renderUserBar failed:', e);
  }
}

// Minimal HTML escaper used in _renderUserBar to prevent XSS from user name
function _escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
