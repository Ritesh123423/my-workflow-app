/* ── Standalone alert helper for profile page ── */
function _pageAlert(el, msg, type) {
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  el.style.background = type === 'success' ? '#f0fdf4' : '#fef2f2';
  el.style.border     = '1.5px solid ' + (type === 'success' ? '#bbf7d0' : '#fecaca');
  el.style.color      = type === 'success' ? '#065f46' : '#991b1b';
  if (type === 'success') setTimeout(function() { el.style.display = 'none'; }, 3000);
}

/* ── Standalone helper: update sidebar + topbar user pill ── */
function _refreshUserDisplay(user) {
  if (!user) { try { user = JSON.parse(localStorage.getItem('rou_user')||'null'); } catch(e) {} }
  if (!user) return;
  var ROLE_COLORS = { admin:'#e8520a', partner:'#7c3aed', manager:'#1a3f6b', article:'#059669' };
  var ROLE_LABELS = { admin:'Administrator', partner:'Partner', manager:'Manager', article:'Article' };
  var color   = ROLE_COLORS[user.role] || '#1a3f6b';
  var label   = ROLE_LABELS[user.role] || user.role;
  var initial = (user.name || '?').charAt(0).toUpperCase();
  // Sidebar
  var sav = document.getElementById('sidebar-user-avatar'); if (sav) { sav.textContent = initial; sav.style.background = color; }
  var snm = document.getElementById('sidebar-user-name');   if (snm) snm.textContent = user.name || user.email || 'User';
  var srl = document.getElementById('sidebar-user-role');   if (srl) srl.textContent = label;
  // Topbar pill
  var tav = document.getElementById('topbar-user-avatar');  if (tav) { tav.textContent = initial; tav.style.background = color; }
  var tnm = document.getElementById('topbar-user-name');    if (tnm) tnm.textContent = user.name || user.email || 'User';
}

window.App = {
  currentClient: null,
  pendingDeleteId: null,
  pendingDuplicateId: null,
  uiBindingsReady: false,

  /* ── INIT ─────────────────────────────────────────────────── */
  bindUiActions() {
    if (this.uiBindingsReady) return;
    const homeAdminLink = document.getElementById('home-admin-link');
    if (homeAdminLink) {
      homeAdminLink.addEventListener('click', e => { e.preventDefault(); Modal.openAdminLogin(); });
      homeAdminLink.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' ') { e.preventDefault(); Modal.openAdminLogin(); } });
    }
    this.uiBindingsReady = true;
  },

  init() {
    this.bindUiActions();

    // Set default FY period if not set
    if (!DB.get('settings')) {
      const now = new Date();
      const sy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      const ey = sy + 1;
      const sd = new Date(sy + '-04-01');
      const ed = new Date(ey + '-03-31');
      const fmt  = d => d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
      const sfmt = d => d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'2-digit' });
      DB.set('settings', {
        periodStart: sy + '-04-01',
        period:      ey + '-03-31',
        periodLabel: fmt(sd) + ' – ' + fmt(ed),
        periodShort: sfmt(sd) + ' – ' + sfmt(ed),
        initialized: true
      });
    }

    // Render new workspace home
    this.renderWorkspaceHome();

    // Auto-open last client if valid
    const lastId = DB.get('last_client');
    if (lastId) {
      const found = (DB.get('clients') || []).find(c => c.id === lastId);
      if (found) { this.currentClient = found; this.enterApp(); return; }
    }

    // Auto-save interval
    setInterval(() => { DB.flush().catch(e => console.warn('Auto-save:', e.message)); }, 60000);
    window.addEventListener('beforeunload', () => { DB.flush().catch(() => {}); });
  },

  /* ── SIGN OUT ────────────────────────────────────────────── */
  signOut() {
    DB.flush().finally(() => {
      localStorage.removeItem('rou_token');
      localStorage.removeItem('rou_user');
      window.location.replace('login.html');
    });
  },

  /* ── WORKSPACE HOME ──────────────────────────────────────── */
  renderWorkspaceHome() {
    const user = API.user();
    if (!user) return;

    const ROLE_COLORS  = { admin:'#e8520a', partner:'#7c3aed', manager:'#1a3f6b', article:'#059669' };
    const ROLE_LABELS  = { admin:'Administrator', partner:'Partner', manager:'Manager', article:'Article' };
    const ROLE_DESCS   = {
      admin:   'Full access. Manage team, assign clients, control all settings.',
      partner: 'Create and manage companies. Full ROU computation access.',
      manager: 'Create and manage companies. Full ROU computation access.',
      article: 'Access assigned companies only. Cannot create new companies.'
    };
    const color = ROLE_COLORS[user.role] || '#1a3f6b';
    const label = ROLE_LABELS[user.role] || user.role;
    const isArticle = user.role === 'article';
    _refreshUserDisplay(user);

    // Top bar avatar + name
    const av = document.getElementById('ws-avatar');
    if (av) { av.textContent = (user.name||'?').charAt(0).toUpperCase(); av.style.background = color; }
    const nn = document.getElementById('ws-user-name'); if (nn) nn.textContent = user.name || user.email;
    const rn = document.getElementById('ws-user-role'); if (rn) rn.textContent = label;

    // Greeting
    const h = new Date().getHours();
    const gt = h < 12 ? 'Good morning,' : h < 17 ? 'Good afternoon,' : 'Good evening,';
    const gte = document.querySelector('.ws-greeting-text'); if (gte) gte.textContent = gt;
    const gne = document.getElementById('ws-greeting-name'); if (gne) gne.textContent = user.name || 'there';

    // Admin quick link
    const adminQ = document.getElementById('ws-quick-admin');
    if (adminQ) adminQ.style.display = (user.role === 'admin') ? 'flex' : 'none';

    // Add company button — disable for articles
    const addBtn = document.getElementById('ws-add-company-btn');
    if (addBtn) {
      if (isArticle) {
        addBtn.classList.add('disabled');
        addBtn.onclick = e => { e.preventDefault(); toast('Articles cannot create companies. Ask your manager or admin.','error',4000); };
      } else {
        addBtn.classList.remove('disabled');
        addBtn.onclick = () => Modal.openAddClient();
      }
    }

    // Role badge + description
    const rb = document.getElementById('ws-role-badge');
    if (rb) {
      const icons = { admin:'🔴', partner:'🏛', manager:'👔', article:'📋' };
      rb.textContent = (icons[user.role]||'') + ' ' + label;
      rb.style.cssText = `background:${color}18;color:${color};display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;margin-bottom:8px`;
    }
    const rd = document.getElementById('ws-role-desc');
    if (rd) rd.textContent = ROLE_DESCS[user.role] || '';

    this.renderCompaniesGrid();
  },

  renderCompaniesGrid(filter) {
    const list = document.getElementById('ws-companies-list');
    if (!list) return;
    let clients = DB.get('clients') || [];
    if (filter) {
      const q = filter.toLowerCase();
      clients = clients.filter(c => c.name.toLowerCase().includes(q) || (c.code||'').toLowerCase().includes(q));
    }

    // Stats
    const sc = document.getElementById('ws-stat-companies'); if (sc) sc.textContent = clients.length;
    const sr = document.getElementById('ws-stat-rous');
    if (sr) {
      let t = 0;
      clients.forEach(c => { t += (DB.get('rous_' + c.id) || []).length; });
      sr.textContent = t;
    }

    if (!clients.length) {
      const u = API.user();
      const art = u && u.role === 'article';
      list.innerHTML = `<div class="ws-empty">
        <div class="ws-empty-icon">${art ? '⏳' : '🏢'}</div>
        <div class="ws-empty-title">${art ? 'No companies assigned yet' : (filter ? 'No matches found' : 'No companies yet')}</div>
        <div class="ws-empty-desc">${art ? 'Ask your manager or admin to assign you to a company' : (filter ? 'Try a different search' : 'Click "Add" above to create your first company')}</div>
      </div>`;
      return;
    }

    const COLORS = ['#0f2a47','#1a3f6b','#e8520a','#059669','#7c3aed','#d97706','#0891b2','#be123c'];
    list.innerHTML = clients.map((c, i) => {
      const rous = (DB.get('rous_' + c.id) || []).length;
      const col  = COLORS[i % COLORS.length];
      const init = (c.name||'?').replace(/[^A-Za-z0-9 ]/g,'').split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase() || '?';
      return `<div class="ws-company-item" onclick="App.openClientById('${c.id}')">
        <div class="ws-company-logo" style="background:${col}">${init}</div>
        <div class="ws-company-info">
          <div class="ws-company-name">${Utils.esc ? Utils.esc(c.name) : c.name}</div>
          <div class="ws-company-meta">${c.code||'—'} · ${c.address ? c.address.substring(0,40)+(c.address.length>40?'…':'') : 'No address set'}</div>
        </div>
        <div class="ws-company-rous">${rous} ROU${rous!==1?'s':''}</div>
        <svg class="ws-company-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
      </div>`;
    }).join('');
  },

  filterCompanies() {
    const q = document.getElementById('ws-company-search')?.value || '';
    this.renderCompaniesGrid(q);
  },

  openClientById(id) {
    const client = (DB.get('clients')||[]).find(c => c.id === id);
    if (!client) { toast('Company not found','error'); return; }
    this.currentClient = client;
    DB.set('last_client', id);
    this.enterApp();
  },

  /* kept for legacy calls from saveClient etc. */
  renderHomeClients() { this.renderCompaniesGrid(); },

  /* ── ENTER APP (sidebar view) ─────────────────────────────── */
  openClient() {
    const id = document.getElementById('home-client-select')?.value;
    if (!id) { toast('Please select a company first','error'); return; }
    this.openClientById(id);
  },

  enterApp() {
    document.getElementById('view-home').classList.remove('active');
    document.getElementById('view-app').classList.add('active');
    document.getElementById('sidebar-client-name').textContent = this.currentClient.name;
    const rous = DB.get('rous_' + this.currentClient.id) || [];
    document.getElementById('sidebar-client-sub').textContent = `${rous.length} ROU${rous.length!==1?'s':''}`;
    const s = DB.get('settings') || {};
    document.getElementById('topbar-period').textContent = s.periodShort || (s.period ? Utils.fmtDate(s.period) : 'Set Period');
    this.showPage('dashboard');
  },

  goHome() {
    document.getElementById('view-app').classList.remove('active');
    document.getElementById('view-home').classList.add('active');
    DB.remove('last_client');
    this.currentClient = null;
    this.renderWorkspaceHome();
  },

  showPage(page) {
    ['dashboard','rous','add-rou','schedule','export','audit','bulk-import','reassess-override','profile'].forEach(p => {
      const el = document.getElementById('page-' + p);
      if (el) el.style.display = 'none';
    });
    const target = document.getElementById('page-' + page);
    if (target) target.style.display = '';
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });
    const titles = { dashboard:'Dashboard', rous:'All ROUs', 'add-rou':'Add ROU', schedule:'Schedule', export:'Export to Excel', audit:'Audit Log', 'bulk-import':'Bulk Import', 'reassess-override':'Reassessment Override', profile:'My Profile' };
    const tb = document.getElementById('topbar-title');
    if (tb) tb.textContent = titles[page] || page;
    if (page === 'dashboard') this.renderDashboard();
    if (page === 'rous')      this.renderROUsTable();
    if (page === 'add-rou')   Form.prepareAdd();
    if (page === 'export')    this.prepareExport();
    if (page === 'audit')     AuditLog.render();
    if (page === 'reassess-override') ReassessOverride.render();
    if (page === 'profile')   this.renderProfilePage();
    document.querySelector('.main-content')?.scrollTo(0,0);
  },

  /* ── SAVE CLIENT ─────────────────────────────────────────── */
  saveClient() {
    const user = API.user();
    if (user && user.role === 'article') {
      toast('Articles cannot create companies. Contact your manager or admin.','error',5000);
      Modal.close('modal-add-client');
      return;
    }
    const name       = document.getElementById('new-client-name').value.trim();
    const code       = document.getElementById('new-client-code').value.trim() || Utils.toCode(name);
    const ibr        = document.getElementById('new-client-ibr').value;
    const preparedBy = document.getElementById('new-client-prepared-by').value.trim();
    const address    = document.getElementById('new-client-address').value.trim();
    const nameErr    = document.getElementById('new-client-name-err');
    const addrErr    = document.getElementById('new-client-address-err');
    if (!name)    { if (nameErr) nameErr.textContent = 'Company name is required'; return; }
    if (nameErr)  nameErr.textContent = '';
    if (!address) { if (addrErr) addrErr.textContent = 'Registered address is required'; return; }
    if (addrErr)  addrErr.textContent = '';
    const clients = DB.get('clients') || [];
    const client  = { id: Utils.uid(), name, code, address, defaultIBR: parseFloat(ibr)||9, preparedBy: preparedBy||name, createdAt: new Date().toISOString() };
    clients.push(client);
    DB.set('clients', clients);
    DB.set('rous_' + client.id, []);
    Modal.close('modal-add-client');
    this.renderWorkspaceHome();
    this.currentClient = client;
    this.enterApp();
    toast('Client "' + client.name + '" added!', 'success');
  },

  /* ── PROFILE ─────────────────────────────────────────────── */
  openProfile() {
    const user = API.user();
    if (!user) return;
    const ROLE_COLORS = { admin:'#e8520a', partner:'#7c3aed', manager:'#1a3f6b', article:'#059669' };
    const ROLE_LABELS = { admin:'Administrator', partner:'Partner', manager:'Manager', article:'Article' };
    const color = ROLE_COLORS[user.role] || '#1a3f6b';

    const av = document.getElementById('profile-avatar');
    if (av) { av.textContent = (user.name||'?').charAt(0).toUpperCase(); av.style.background = color; }
    const nd = document.getElementById('profile-name-display'); if (nd) nd.textContent = user.name||'';
    const ed = document.getElementById('profile-email-display'); if (ed) ed.textContent = user.email||'';
    const rd = document.getElementById('profile-role-display');
    if (rd) {
      rd.textContent = ROLE_LABELS[user.role]||user.role;
      rd.style.cssText = `background:${color}18;color:${color};display:inline-flex;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;margin-top:5px`;
    }
    const ni = document.getElementById('profile-name-input'); if (ni) ni.value = user.name||'';
    const ei = document.getElementById('profile-email-input'); if (ei) ei.value = user.email||'';
    const ri = document.getElementById('profile-role-input'); if (ri) ri.value = ROLE_LABELS[user.role]||user.role;

    ['profile-pw-current','profile-pw-new','profile-pw-confirm'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    ['profile-details-alert','profile-pw-alert'].forEach(id => {
      const el = document.getElementById(id); if (el) el.style.display = 'none';
    });
    if (typeof switchProfileTab === 'function') switchProfileTab('details');
    Modal.open('modal-profile');
  },

  async saveProfile() {
    const name = document.getElementById('profile-name-input')?.value.trim();
    if (!name) { profileAlert('details','Name cannot be empty.','error'); return; }
    try {
      const r = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+API.token() },
        body: JSON.stringify({ name })
      });
      const d = await r.json();
      if (!r.ok) { profileAlert('details', d.error||'Update failed.','error'); return; }
      localStorage.setItem('rou_token', d.token);
      localStorage.setItem('rou_user', JSON.stringify(d.user));
      profileAlert('details','Profile updated!','success');
      _refreshUserDisplay(d.user);
      this.renderWorkspaceHome();
      const nd = document.getElementById('profile-name-display'); if (nd) nd.textContent = d.user.name;
      const av = document.getElementById('profile-avatar'); if (av) av.textContent = d.user.name.charAt(0).toUpperCase();
    } catch (e) { profileAlert('details','Network error. Try again.','error'); }
  },

  async changePassword() {
    const cur  = document.getElementById('profile-pw-current')?.value;
    const nw   = document.getElementById('profile-pw-new')?.value;
    const conf = document.getElementById('profile-pw-confirm')?.value;
    if (!cur||!nw||!conf) { profileAlert('password','All fields are required.','error'); return; }
    if (nw.length < 8)    { profileAlert('password','New password must be at least 8 characters.','error'); return; }
    if (nw !== conf)       { profileAlert('password','New passwords do not match.','error'); return; }
    try {
      const r = await fetch('/api/auth/change-password', {
        method: 'PUT',
        headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+API.token() },
        body: JSON.stringify({ currentPassword:cur, newPassword:nw })
      });
      const d = await r.json();
      if (!r.ok) { profileAlert('password', d.error||'Failed.','error'); return; }
      profileAlert('password','Password changed successfully!','success');
      ['profile-pw-current','profile-pw-new','profile-pw-confirm'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
    } catch (e) { profileAlert('password','Network error. Try again.','error'); }
  },


  /* ── PROFILE PAGE ──────────────────────────────────────────────────────── */
  renderProfilePage() {
    const user = API.user();
    if (!user) return;
    const ROLE_COLORS = { admin:'#e8520a', partner:'#7c3aed', manager:'#1a3f6b', article:'#059669' };
    const ROLE_LABELS = { admin:'Administrator', partner:'Partner', manager:'Manager', article:'Article' };
    const color = ROLE_COLORS[user.role] || '#1a3f6b';

    // Avatar + header
    const av = document.getElementById('profile-page-avatar');
    if (av) { av.textContent = (user.name||'?').charAt(0).toUpperCase(); av.style.background = color; }
    const pn = document.getElementById('profile-page-name');   if (pn) pn.textContent = user.name || '';
    const pe = document.getElementById('profile-page-email');  if (pe) pe.textContent = user.email || '';
    const rb = document.getElementById('profile-page-role-badge');
    if (rb) {
      rb.textContent = ROLE_LABELS[user.role] || user.role;
      rb.style.cssText = `background:${color}18;color:${color};display:inline-flex;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;margin-top:5px`;
    }
    // Inputs
    const ni = document.getElementById('profile-page-name-input');   if (ni) ni.value = user.name || '';
    const ei = document.getElementById('profile-page-email-input');  if (ei) ei.value = user.email || '';
    const ri = document.getElementById('profile-page-role-input');   if (ri) ri.value = ROLE_LABELS[user.role] || user.role;
    // Clear pw fields + alerts
    ['profile-page-pw-current','profile-page-pw-new','profile-page-pw-confirm'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    ['profile-page-alert','profile-pw-page-alert'].forEach(id => {
      const el = document.getElementById(id); if (el) el.style.display = 'none';
    });

    // Companies list
    this.renderProfileCompanies();
  },

  renderProfileCompanies() {
    const list  = document.getElementById('profile-companies-list');
    const count = document.getElementById('profile-companies-count');
    if (!list) return;
    const clients = DB.get('clients') || [];
    if (count) count.textContent = clients.length + ' compan' + (clients.length === 1 ? 'y' : 'ies');

    if (!clients.length) {
      const user = API.user();
      const isArt = user && user.role === 'article';
      list.innerHTML = `<div style="text-align:center;padding:36px 20px;color:var(--text3)">
        <div style="font-size:28px;margin-bottom:10px">${isArt ? '⏳' : '🏢'}</div>
        <div style="font-size:13px;font-weight:600;color:var(--text2);margin-bottom:4px">${isArt ? 'No companies assigned' : 'No companies yet'}</div>
        <div style="font-size:12px">${isArt ? 'Ask your manager or admin to assign you to a company.' : 'Go back to the workspace to add your first company.'}</div>
      </div>`;
      return;
    }

    const COLORS = ['#0f2a47','#1a3f6b','#e8520a','#059669','#7c3aed','#d97706','#0891b2','#be123c'];
    const current = this.currentClient;

    list.innerHTML = clients.map((c, i) => {
      const rous    = (DB.get('rous_' + c.id) || []).length;
      const col     = COLORS[i % COLORS.length];
      const init    = (c.name||'?').replace(/[^A-Za-z0-9 ]/g,'').split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase() || '?';
      const active  = current && current.id === c.id;
      return `<div onclick="App.switchToCompany('${c.id}')" style="
          display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:10px;cursor:pointer;
          border:1.5px solid ${active ? 'var(--accent)' : 'var(--border)'};
          background:${active ? '#fff3ee' : '#fff'};margin-bottom:8px;transition:all 0.15s;
        " onmouseover="if(!${active}) this.style.borderColor='#94a3b8'" onmouseout="if(!${active}) this.style.borderColor='var(--border)'">
        <div style="width:38px;height:38px;border-radius:9px;background:${col};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;flex-shrink:0">${init}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13.5px;font-weight:700;color:var(--navy);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.name}</div>
          <div style="font-size:11.5px;color:var(--text3);margin-top:2px">${c.code || '—'} · ${rous} ROU${rous!==1?'s':''}</div>
        </div>
        ${active
          ? '<span style="font-size:11px;font-weight:700;color:var(--accent);background:#fff3ee;padding:3px 9px;border-radius:20px;border:1px solid rgba(232,82,10,0.25);flex-shrink:0">Current</span>'
          : '<svg style="flex-shrink:0;color:#cbd5e1" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>'
        }
      </div>`;
    }).join('');
  },

  switchToCompany(id) {
    const clients = DB.get('clients') || [];
    const client  = clients.find(c => c.id === id);
    if (!client) { toast('Company not found', 'error'); return; }
    this.currentClient = client;
    DB.set('last_client', id);
    // Update sidebar active company label
    const sn = document.getElementById('sidebar-client-name'); if (sn) sn.textContent = client.name;
    const rous = DB.get('rous_' + client.id) || [];
    const ss = document.getElementById('sidebar-client-sub'); if (ss) ss.textContent = `${rous.length} ROU${rous.length!==1?'s':''}`;
    // Navigate to dashboard
    this.showPage('dashboard');
    toast('Switched to ' + client.name, 'success');
  },

  /* ── PROFILE SAVE (works from both page fields and modal fields) ──────── */
  async saveProfile() {
    // Try page fields first, fall back to modal fields
    const nameInput = document.getElementById('profile-page-name-input') ||
                      document.getElementById('profile-name-input');
    const alertEl   = document.getElementById('profile-page-alert') ||
                      document.getElementById('profile-details-alert');
    const name = nameInput?.value.trim();
    if (!name) { _pageAlert(alertEl, 'Name cannot be empty.', 'error'); return; }
    try {
      const r = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+API.token() },
        body: JSON.stringify({ name })
      });
      const d = await r.json();
      if (!r.ok) { _pageAlert(alertEl, d.error||'Update failed.', 'error'); return; }
      localStorage.setItem('rou_token', d.token);
      localStorage.setItem('rou_user', JSON.stringify(d.user));
      _pageAlert(alertEl, 'Name updated successfully!', 'success');
      _refreshUserDisplay(d.user);
      // Update page header live
      const pn = document.getElementById('profile-page-name'); if (pn) pn.textContent = d.user.name;
      const av = document.getElementById('profile-page-avatar'); if (av) av.textContent = d.user.name.charAt(0).toUpperCase();
    } catch(e) { _pageAlert(alertEl, 'Network error. Try again.', 'error'); }
  },

  /* ── CHANGE PASSWORD (works from both page fields and modal fields) ────── */
  async changePassword() {
    const curEl   = document.getElementById('profile-page-pw-current')  || document.getElementById('profile-pw-current');
    const newEl   = document.getElementById('profile-page-pw-new')      || document.getElementById('profile-pw-new');
    const confEl  = document.getElementById('profile-page-pw-confirm')  || document.getElementById('profile-pw-confirm');
    const alertEl = document.getElementById('profile-pw-page-alert')    || document.getElementById('profile-pw-alert');
    const cur = curEl?.value, nw = newEl?.value, conf = confEl?.value;
    if (!cur||!nw||!conf) { _pageAlert(alertEl, 'All fields are required.', 'error'); return; }
    if (nw.length < 8)    { _pageAlert(alertEl, 'New password must be at least 8 characters.', 'error'); return; }
    if (nw !== conf)       { _pageAlert(alertEl, 'New passwords do not match.', 'error'); return; }
    try {
      const r = await fetch('/api/auth/change-password', {
        method: 'PUT',
        headers: { 'Content-Type':'application/json', 'Authorization':'Bearer '+API.token() },
        body: JSON.stringify({ currentPassword:cur, newPassword:nw })
      });
      const d = await r.json();
      if (!r.ok) { _pageAlert(alertEl, d.error||'Failed.', 'error'); return; }
      _pageAlert(alertEl, 'Password changed successfully!', 'success');
      [curEl, newEl, confEl].forEach(el => { if (el) el.value = ''; });
    } catch(e) { _pageAlert(alertEl, 'Network error. Try again.', 'error'); }
  },

  /* ── ADMIN LOGIN (ROU admin panel inside app) ────────────── */
  async adminLogin() {
    const pass = document.getElementById('admin-password-input').value;
    if (!pass) { document.getElementById('admin-login-err').textContent = 'Enter your admin password'; return; }
    const hash = await Utils.sha256(pass);
    const storedHash = sessionStorage.getItem('rou_bot_adminHash') || DB.get('admin_hash');
    if (!storedHash) {
      sessionStorage.setItem('rou_bot_adminHash', hash);
      DB.set('admin_hash', hash);
      Modal.close('modal-admin-login');
      Modal.openAdminPanel();
      toast('Admin password set','success');
    } else if (hash === storedHash) {
      Modal.close('modal-admin-login');
      Modal.openAdminPanel();
    } else {
      document.getElementById('admin-login-err').textContent = 'Incorrect password';
    }
  },

  isAdmin() {
    const h = sessionStorage.getItem('rou_bot_adminHash') || DB.get('admin_hash');
    return !!h;
  },

  /* ── DASHBOARD ───────────────────────────────────────────── */
  renderDashboard() {
    if (!this.currentClient) return;
    const rous    = DB.get('rous_' + this.currentClient.id) || [];
    const s       = DB.get('settings') || {};
    const period  = s.period;
    const pStart  = s.periodStart;

    const statTotal   = document.getElementById('stat-total-rous');
    const statActive  = document.getElementById('stat-active');
    const statMid     = document.getElementById('stat-mid-expired');
    const statExp     = document.getElementById('stat-expired');
    const statReass   = document.getElementById('stat-reassessed');
    const noClient    = document.getElementById('dashboard-no-client');
    const statsRow    = document.getElementById('dashboard-stats');
    const finStats    = document.getElementById('dashboard-fin-stats');

    if (!rous.length) {
      if (noClient) noClient.style.display = '';
      if (statsRow) statsRow.style.display = 'none';
      if (finStats) finStats.style.display = 'none';
      document.getElementById('dashboard-rou-tbody').innerHTML = '';
      return;
    }
    if (noClient) noClient.style.display = 'none';
    if (statsRow) statsRow.style.display = '';
    if (finStats) finStats.style.display = '';

    let active=0, midExp=0, expired=0, reassessed=0;
    let totalRent=0, fyRent=0, totalLiab=0, totalNBV=0, totalDep=0;

    rous.forEach(r => {
      const st = (r.status||'Active');
      if (st==='Active')     active++;
      else if (st==='Expired') expired++;
      else if (st==='Reassessed') reassessed++;
      // Financial stats (simplified)
      if (st==='Active' && r.monthlyRent) totalRent += Number(r.monthlyRent)||0;
    });

    if (statTotal)  statTotal.textContent  = rous.length;
    if (statActive) statActive.textContent = active;
    if (statMid)    statMid.textContent    = midExp;
    if (statExp)    statExp.textContent    = expired;
    if (statReass)  statReass.textContent  = reassessed;

    // Recent ROUs table
    const tbody = document.getElementById('dashboard-rou-tbody');
    if (tbody) {
      tbody.innerHTML = rous.slice(0,8).map((r,i) => `
        <tr>
          <td>${i+1}</td>
          <td><strong>${r.branch||r.name||'—'}</strong></td>
          <td>${r.monthlyRent ? '₹'+Number(r.monthlyRent).toLocaleString('en-IN') : '—'}</td>
          <td>${r.startDate||'—'} → ${r.endDate||'—'}</td>
          <td>${r.ibr||r.discountRate||'—'}%</td>
          <td><span style="padding:2px 9px;border-radius:12px;font-size:11px;font-weight:600;background:${r.status==='Active'?'#dcfce7':r.status==='Expired'?'#f1f5f9':'#fff7ed'};color:${r.status==='Active'?'#166534':r.status==='Expired'?'#475569':'#92400e'}">${r.status||'Active'}</span></td>
          <td>
            <button class="btn btn-ghost btn-sm" onclick="App.editROU('${r.id}')">Edit</button>
            <button class="btn btn-ghost btn-sm" onclick="App.viewSchedule('${r.id}')">View</button>
          </td>
        </tr>`).join('');
    }

    // Financial stats placeholders
    const fmt = n => n ? '₹'+Math.round(n).toLocaleString('en-IN') : '—';
    const sv = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    sv('stat-total-rent', fmt(totalRent));
    sv('stat-fy-rent', '—'); sv('stat-total-liab','—'); sv('stat-total-rou-nbv','—'); sv('stat-total-dep','—');
  },

  /* ── ROUs TABLE ──────────────────────────────────────────── */
  renderROUsTable(filter, statusFilter) {
    if (!this.currentClient) return;
    let rous = DB.get('rous_' + this.currentClient.id) || [];
    if (filter) {
      const q = filter.toLowerCase();
      rous = rous.filter(r => (r.branch||r.name||'').toLowerCase().includes(q) || (r.party||r.lessor||'').toLowerCase().includes(q));
    }
    if (statusFilter) rous = rous.filter(r => (r.status||'Active') === statusFilter);
    const countLabel = document.getElementById('rou-count-label');
    if (countLabel) countLabel.textContent = rous.length + ' lease' + (rous.length!==1?'s':'');
    const tbody = document.getElementById('all-rou-tbody');
    if (!tbody) return;
    if (!rous.length) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--text3)">No ROUs found</td></tr>`;
      return;
    }
    tbody.innerHTML = rous.map((r,i) => `
      <tr>
        <td>${i+1}</td>
        <td><strong>${r.branch||r.name||'—'}</strong></td>
        <td>${r.party||r.lessor||'—'}</td>
        <td>${r.monthlyRent ? '₹'+Number(r.monthlyRent).toLocaleString('en-IN') : '—'}</td>
        <td>${r.startDate||'—'}</td>
        <td>${r.endDate||'—'}</td>
        <td>${r.ibr||r.discountRate||'—'}%</td>
        <td>${r.securityDeposit ? '₹'+Number(r.securityDeposit).toLocaleString('en-IN') : '—'}</td>
        <td><span style="padding:2px 9px;border-radius:12px;font-size:11px;font-weight:600;background:${r.status==='Active'?'#dcfce7':r.status==='Expired'?'#f1f5f9':'#fff7ed'};color:${r.status==='Active'?'#166534':r.status==='Expired'?'#475569':'#92400e'}">${r.status||'Active'}</span></td>
        <td>
          <button class="btn btn-ghost btn-sm" onclick="App.editROU('${r.id}')">Edit</button>
          <button class="btn btn-ghost btn-sm" onclick="App.viewSchedule('${r.id}')">View</button>
          <button class="btn btn-ghost btn-sm" onclick="App.promptDeleteROU('${r.id}','${(r.branch||r.name||'').replace(/'/g,'')}')" style="color:var(--red)">Del</button>
        </td>
      </tr>`).join('');
  },

  filterROUs() {
    const q  = document.getElementById('rou-search')?.value || '';
    const st = document.getElementById('rou-status-filter')?.value || '';
    this.renderROUsTable(q, st);
  },

  editROU(id) { Form.load(id); this.showPage('add-rou'); },
  viewSchedule(id) { Schedule.render(id); this.showPage('schedule'); },

  promptDeleteROU(id, name) {
    this.pendingDeleteId = id;
    const el = document.getElementById('delete-rou-name'); if (el) el.textContent = name;
    Modal.open('modal-delete-rou');
  },

  confirmDeleteROU() {
    if (!this.pendingDeleteId || !this.currentClient) return;
    const rous = (DB.get('rous_' + this.currentClient.id)||[]).filter(r => r.id !== this.pendingDeleteId);
    DB.set('rous_' + this.currentClient.id, rous);
    AuditLog.log('delete', this.pendingDeleteId, { branch:'deleted' });
    this.pendingDeleteId = null;
    Modal.close('modal-delete-rou');
    this.renderROUsTable();
    this.renderDashboard();
    const sub = document.getElementById('sidebar-client-sub');
    if (sub) sub.textContent = rous.length + ' ROU' + (rous.length!==1?'s':'');
    toast('ROU deleted','success');
  },

  promptDuplicateROU(id, name) {
    this.pendingDuplicateId = id;
    const el = document.getElementById('duplicate-rou-name'); if (el) el.textContent = name;
    Modal.open('modal-duplicate-rou');
  },

  confirmDuplicateROU() {
    if (!this.pendingDuplicateId || !this.currentClient) return;
    const rous = DB.get('rous_' + this.currentClient.id) || [];
    const orig = rous.find(r => r.id === this.pendingDuplicateId);
    if (!orig) return;
    const copy = { ...orig, id: Utils.uid(), branch: (orig.branch||orig.name||'Copy') + ' (Copy)', createdAt: new Date().toISOString() };
    rous.push(copy);
    DB.set('rous_' + this.currentClient.id, rous);
    AuditLog.log('duplicate', copy.id, copy);
    this.pendingDuplicateId = null;
    Modal.close('modal-duplicate-rou');
    this.renderROUsTable();
    toast('ROU duplicated','success');
  },

  /* ── EXPORT ──────────────────────────────────────────────── */
  prepareExport() {
    if (!this.currentClient) return;
    const n = document.getElementById('export-company-name'); if (n) n.textContent = this.currentClient.name;
    const s = DB.get('settings')||{};
    const p = document.getElementById('export-period'); if (p) p.textContent = s.periodLabel||s.period||'—';
    const rous = DB.get('rous_' + this.currentClient.id)||[];
    const c = document.getElementById('export-rou-count'); if (c) c.textContent = rous.length;
  },

  /* ── PERIOD ──────────────────────────────────────────────── */
  setPeriod() {
    const start = document.getElementById('period-start-input')?.value;
    const end   = document.getElementById('period-end-input')?.value;
    if (!start || !end) { toast('Set both start and end dates','error'); return; }
    const sd = new Date(start), ed = new Date(end);
    if (sd >= ed) { toast('Start must be before end','error'); return; }
    const fmt  = d => d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
    const sfmt = d => d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'2-digit' });
    const settings = DB.get('settings') || {};
    settings.periodStart  = start;
    settings.period       = end;
    settings.periodLabel  = fmt(sd) + ' – ' + fmt(ed);
    settings.periodShort  = sfmt(sd) + ' – ' + sfmt(ed);
    DB.set('settings', settings);
    const tb = document.getElementById('topbar-period'); if (tb) tb.textContent = settings.periodShort;
    const tp = document.getElementById('period-range-label'); if (tp) tp.textContent = settings.periodLabel;
    Modal.close('modal-period');
    toast('Period set: ' + settings.periodShort, 'success');
  },

  renderSessionBar() {
    // kept for compatibility — workspace home handles display now
  }
};
