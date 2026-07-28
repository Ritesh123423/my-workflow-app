// BOOT — auth, hydrate from Postgres, then start app
(async function boot() {
  if (!API.requireAuth('/rou/')) return;

  const overlay = document.createElement('div');
  overlay.id = 'boot-loading';
  overlay.style.cssText = 'position:fixed;inset:0;background:#0a1e3d;color:#fff;display:flex;align-items:center;justify-content:center;font-family:Poppins,sans-serif;font-size:14px;z-index:99999';
  overlay.textContent = 'Loading workspace…';
  document.body.appendChild(overlay);

  try {
    await DB.hydrate();
    overlay.remove();
    App.init();
    setTimeout(() => LivePreview.attach(), 200);
  } catch (err) {
    overlay.remove();
    console.error('Boot failed:', err);
    if (typeof toast === 'function') toast('Failed to load workspace: ' + err.message, 'error', 8000);
    else alert('Failed to load workspace: ' + err.message);
  }
})();
