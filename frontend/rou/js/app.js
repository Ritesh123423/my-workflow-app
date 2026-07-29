/* ── Inline alert helper ── */
function _inlineAlert(el, msg, type) {
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  el.style.background = type === 'success' ? '#f0fdf4' : '#fef2f2';
  el.style.border     = '1.5px solid ' + (type === 'success' ? '#bbf7d0' : '#fecaca');
  el.style.color      = type === 'success' ? '#065f46' : '#991b1b';
  if (type === 'success') setTimeout(() => { el.style.display = 'none'; }, 3000);
}

/* ── Alert helper for profile view ── */
function _pvAlert(el, msg, type) {
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  el.style.background = type === 'success' ? '#f0fdf4' : '#fef2f2';
  el.style.border     = '1.5px solid ' + (type === 'success' ? '#bbf7d0' : '#fecaca');
  el.style.color      = type === 'success' ? '#065f46' : '#991b1b';
  if (type === 'success') setTimeout(function() { el.style.display = 'none'; }, 3500);
}

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

  /* Which page are we on? 'home' or 'app' (set via <body data-page>) */
  _page() {
    return (document.body && document.body.getAttribute('data-page')) || 'app';
  },


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

    if (this._page() === 'home') {
      // HOME PAGE — render workspace/profile dashboard only. Never enter app here.
      this.renderWorkspaceHome();
    } else {
      // APP PAGE — a company MUST be selected. Otherwise go back to home.
      const lastId = DB.get('last_client');
      const found  = lastId && (DB.get('clients') || []).find(c => c.id === lastId);
      if (!found) {
        window.location.replace('home.html');
        return;
      }
      this.currentClient = found;
      this.enterApp();
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

  /* ── WORKSPACE HOME ──────────────────────────────────────────────── */
  renderWorkspaceHome() {
    let user = API.user();
    if (!user) {
      try {
        const t = localStorage.getItem('rou_token');
        if (t) { const p = JSON.parse(atob(t.split('.')[1])); user={id:p.id,role:p.role,name:p.name,email:p.email}; localStorage.setItem('rou_user',JSON.stringify(user)); }
      } catch(e) {}
    }
    if (!user) return;

    const ROLE_COLORS = { admin:'#e8520a', partner:'#7c3aed', manager:'#1a3f6b', article:'#059669' };
    const ROLE_LABELS = { admin:'Administrator', partner:'Partner', manager:'Manager', article:'Article' };
    const ROLE_DESCS  = {
      admin:   'Full access — manage team members, assign clients, control all platform settings.',
      partner: 'Create and manage client companies. Full Ind AS 116 ROU computation access.',
      manager: 'Create and manage client companies. Full Ind AS 116 ROU computation access.',
      article: 'Access assigned companies only. Contact your manager to be assigned to a client.'
    };
    const color    = ROLE_COLORS[user.role] || '#1a3f6b';
    const label    = ROLE_LABELS[user.role] || user.role;
    const isArticle = user.role === 'article';
    _refreshUserDisplay(user);

    // Topbar pill
    const av  = document.getElementById('ws-avatar');
    if (av) { av.textContent = (user.name||user.email||'?').charAt(0).toUpperCase(); av.style.background = color; av.style.color = '#fff'; }
    const wun = document.getElementById('ws-user-name'); if (wun) wun.textContent = user.name || user.email || '';
    const wur = document.getElementById('ws-user-role'); if (wur) wur.textContent = label;

    // Dropdown header
    const ddn = document.getElementById('dd-name');  if (ddn) ddn.textContent = user.name || '';
    const dde = document.getElementById('dd-email'); if (dde) dde.textContent = user.email || '';

    // Greeting
    const h   = new Date().getHours();
    const gt  = h < 12 ? 'Good morning,' : h < 17 ? 'Good afternoon,' : 'Good evening,';
    const gel = document.querySelector('.ws-greeting-label'); if (gel) gel.textContent = gt;
    const gne = document.getElementById('ws-greeting-name');  if (gne) gne.textContent = user.name || 'there';

    // Right panel account header
    const pav = document.getElementById('ws-profile-avatar'); if (pav) { pav.textContent = (user.name||'?').charAt(0).toUpperCase(); pav.style.background = color; pav.style.color = '#fff'; }
    const pnm = document.getElementById('ws-profile-name');   if (pnm) pnm.textContent = user.name || '';
    const pem = document.getElementById('ws-profile-email');  if (pem) pem.textContent = user.email || '';
    const prb = document.getElementById('ws-profile-role');   if (prb) prb.textContent = label;
    const pni = document.getElementById('ws-name-input');     if (pni) pni.value = user.name || '';

    // Platform info
    const s   = DB.get('settings') || {};
    const prd = document.getElementById('ws-info-period');
    if (prd) prd.textContent = s.periodShort || s.periodLabel || 'Not set — click to configure';
    const irl = document.getElementById('ws-info-role'); if (irl) irl.textContent = label;

    // Role card
    const rb = document.getElementById('ws-role-badge');
    if (rb) { rb.textContent = label; rb.style.cssText = `background:${color}14;color:${color};display:inline-flex;padding:3px 11px;border-radius:20px;font-size:11px;font-weight:700;`; }
    const rd = document.getElementById('ws-role-desc'); if (rd) rd.textContent = ROLE_DESCS[user.role] || '';

    // Add company buttons — hide for articles
    ['ws-add-company-btn','ws-action-add'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = isArticle ? 'none' : '';
    });

    // Admin action — only for admin
    const adminA = document.getElementById('ws-action-admin');
    if (adminA) adminA.style.display = user.role === 'admin' ? 'flex' : 'none';
    const adminNavA = document.getElementById('ws-action-admin-nav');
    if (adminNavA) adminNavA.style.display = user.role === 'admin' ? 'flex' : 'none';

    // Sidebar profile
    const sbAv = document.getElementById('ws-sb-avatar');
    if (sbAv) { sbAv.textContent = (user.name||'?').charAt(0).toUpperCase(); sbAv.style.background = color; }
    const sbNm = document.getElementById('ws-sb-name'); if (sbNm) sbNm.textContent = user.name || '';
    const sbRl = document.getElementById('ws-sb-role'); if (sbRl) sbRl.textContent = label;

    // Hero card
    const hcAv = document.getElementById('ws-profile-avatar');
    if (hcAv) { hcAv.textContent = (user.name||'?').charAt(0).toUpperCase(); hcAv.style.background = color; }
    const hcNm = document.getElementById('ws-profile-name');  if (hcNm) hcNm.textContent = user.name || '';
    const hcEm = document.getElementById('ws-profile-email'); if (hcEm) hcEm.textContent = user.email || '';
    const hcRl = document.getElementById('ws-profile-role');  if (hcRl) hcRl.textContent = label;

    // KPI login time
    const kpiL = document.getElementById('kpi-login');
    if (kpiL) { const now = new Date(); kpiL.textContent = now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}); }

    // Activity timestamps
    const t1 = document.getElementById('ent-act-time-1'); if (t1) { const n=new Date(); t1.textContent = n.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}); }
    const t2 = document.getElementById('ent-act-time-2'); if (t2) { const n=new Date(); t2.textContent = n.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}); }

    this.renderCompaniesGrid();

    // Notification dot: show if there are actionable alerts
    const dot = document.getElementById('ent-notif-dot');
    if (dot) {
      const cl = DB.get('clients') || [];
      const hasAlert = !cl.length || cl.some(c => !(DB.get('rous_'+c.id)||[]).length);
      dot.style.display = hasAlert ? 'block' : 'none';
    }
  },

  toggleUserDropdown(e) {
    e.stopPropagation();
    const dd = document.getElementById('ws-dropdown');
    if (dd) dd.classList.toggle('open');
  },

  openChangePwModal() {
    document.getElementById('ws-dropdown')?.classList.remove('open');
    ['pm-pw-current','pm-pw-new','pm-pw-confirm'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
    const al = document.getElementById('pw-modal-alert'); if (al) { al.style.display='none'; }
    document.getElementById('modal-change-pw')?.classList.add('open');
  },

  closeChangePwModal() {
    document.getElementById('modal-change-pw')?.classList.remove('open');
  },

  async submitChangePw() {
    const cur     = document.getElementById('pm-pw-current')?.value;
    const nw      = document.getElementById('pm-pw-new')?.value;
    const conf    = document.getElementById('pm-pw-confirm')?.value;
    const alertEl = document.getElementById('pw-modal-alert');
    const showA   = (msg, type) => {
      if (!alertEl) return;
      alertEl.textContent = msg; alertEl.style.display = 'block';
      alertEl.style.background = type==='ok' ? '#f0fdf4' : '#fef2f2';
      alertEl.style.border = '1.5px solid '+(type==='ok' ? '#bbf7d0' : '#fecaca');
      alertEl.style.color  = type==='ok' ? '#065f46' : '#991b1b';
    };
    if (!cur||!nw||!conf) { showA('All three fields are required.','err'); return; }
    if (nw.length < 8)    { showA('New password must be at least 8 characters.','err'); return; }
    if (nw !== conf)       { showA('New passwords do not match.','err'); return; }
    try {
      const r = await fetch('/api/auth/change-password', {
        method:'PUT', headers:{'Content-Type':'application/json','Authorization':'Bearer '+API.token()},
        body: JSON.stringify({ currentPassword:cur, newPassword:nw })
      });
      const d = await r.json();
      if (!r.ok) { showA(d.error||'Failed.','err'); return; }
      showA('Password changed successfully!','ok');
      setTimeout(() => this.closeChangePwModal(), 1800);
    } catch(e) { showA('Network error. Please try again.','err'); }
  },

  renderCompaniesGrid(filter) {
    const list = document.getElementById('ws-companies-list');
    if (!list) return;
    let clients = DB.get('clients') || [];
    if (filter) {
      const q = filter.toLowerCase();
      clients = clients.filter(c => c.name.toLowerCase().includes(q) || (c.code||'').toLowerCase().includes(q));
    }

    // Stats (original + new KPI cards + nav badges)
    const sc = document.getElementById('ws-stat-companies'); if (sc) sc.textContent = clients.length;
    const sr = document.getElementById('ws-stat-rous');
    let totalRous = 0;
    clients.forEach(c => { totalRous += (DB.get('rous_' + c.id) || []).length; });
    if (sr) sr.textContent = totalRous;

    // KPI cards
    const kpiC = document.getElementById('kpi-companies'); if (kpiC) kpiC.textContent = clients.length;
    const kpiR = document.getElementById('kpi-rous');      if (kpiR) kpiR.textContent = totalRous;
    // Nav badges
    const nbC = document.getElementById('nav-badge-companies'); if (nbC) nbC.textContent = clients.length;
    const nbR = document.getElementById('nav-badge-rous');      if (nbR) nbR.textContent = totalRous;
    // Companies count footer
    const cnt = document.getElementById('ws-companies-count'); if (cnt) cnt.textContent = `Showing ${clients.length} compan${clients.length===1?'y':'ies'}`;

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

  /* ══ HOME SECTION SWITCHING ══ */
  showHomeSection(section) {
    const sections = ['dashboard','companies','activity','help','settings'];
    sections.forEach(s => {
      const el = document.getElementById('home-section-' + s);
      if (el) el.style.display = (s === section) ? '' : 'none';
    });
    // Nav highlight
    const navMap = { dashboard:'nav-dashboard', companies:'nav-companies', activity:'nav-activity', help:'nav-help', settings:'nav-settings' };
    Object.values(navMap).forEach(id => { const n = document.getElementById(id); if (n) n.classList.remove('active'); });
    const active = document.getElementById(navMap[section]); if (active) active.classList.add('active');
    // Populate on demand
    if (section === 'companies') this.renderAllCompanies();
    if (section === 'activity')  this.renderActivityFeed();
    if (section === 'settings')  this.populateSettings();
    // Scroll to top
    document.querySelector('.ent-main')?.scrollTo(0,0);
  },

  /* ══ FULL COMPANIES LIST ══ */
  renderAllCompanies(filter) {
    const list = document.getElementById('companies-full-list');
    if (!list) return;
    let clients = DB.get('clients') || [];
    if (filter) {
      const q = filter.toLowerCase();
      clients = clients.filter(c => (c.name||'').toLowerCase().includes(q) || (c.code||'').toLowerCase().includes(q));
    }
    if (!clients.length) {
      list.innerHTML = '<div style="text-align:center;padding:48px 20px;color:#94a3b8;font-size:13px">' +
        (filter ? 'No companies match your search.' : 'No companies yet. Click "Add Company" to get started.') + '</div>';
      return;
    }
    const COLORS = ['#0f2a47','#1a3f6b','#e8520a','#059669','#7c3aed','#d97706','#0891b2','#be123c'];
    list.innerHTML = clients.map((c, i) => {
      const rous = (DB.get('rous_' + c.id) || []).length;
      const col  = COLORS[i % COLORS.length];
      const init = (c.name||'?').replace(/[^A-Za-z0-9 ]/g,'').split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase() || '?';
      const nm = (Utils.esc ? Utils.esc(c.name) : c.name);
      return '<div class="ent-comp-row" onclick="App.openClientById(\'' + c.id + '\')">' +
        '<div class="ent-comp-logo" style="background:' + col + '">' + init + '</div>' +
        '<div style="flex:1;min-width:0"><div class="ent-comp-name">' + nm + '</div>' +
        '<div class="ent-comp-meta">' + (c.code||'—') + ' &middot; ' + (c.address ? (c.address.substring(0,50) + (c.address.length>50?'…':'')) : 'No address set') + '</div></div>' +
        '<div style="font-size:12px;font-weight:600;color:#475569;white-space:nowrap">' + rous + ' ROU' + (rous!==1?'s':'') + '</div>' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>' +
      '</div>';
    }).join('');
  },

  filterAllCompanies() {
    const q = document.getElementById('companies-search')?.value || '';
    this.renderAllCompanies(q);
  },

  /* ══ ACTIVITY FEED ══ */
  renderActivityFeed() {
    const list = document.getElementById('activity-full-list');
    if (!list) return;
    const user = API.user() || {};
    const now = new Date();
    const t = now.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
    const items = [
      { ic:'#eff6ff', st:'#2563eb', t:'Signed in', d:'Successful login from this device', tm:t },
      { ic:'#f0fdf4', st:'#16a34a', t:'Profile loaded', d:'Workspace data synced successfully', tm:t },
    ];
    // Add per-company creation notes
    (DB.get('clients')||[]).slice(0,6).forEach(c => {
      items.push({ ic:'#fff7ed', st:'#ea580c', t:'Company available', d:c.name, tm:'' });
    });
    list.innerHTML = items.map(a =>
      '<div class="ent-activity-item"><div class="ent-act-icon" style="background:' + a.ic + '">' +
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="' + a.st + '" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>' +
      '<div class="ent-act-body"><div class="ent-act-title">' + a.t + '</div><div class="ent-act-sub">' + a.d + '</div></div>' +
      '<div class="ent-act-time">' + a.tm + '</div></div>'
    ).join('');
  },

  /* ══ SETTINGS ══ */
  populateSettings() {
    const user = API.user() || {};
    const em = document.getElementById('set-account-email'); if (em) em.textContent = user.email || '—';
    const s = DB.get('settings') || {};
    const fy = document.getElementById('set-fy-period'); if (fy) fy.textContent = s.periodLabel || s.periodShort || 'Not set';
  },

  /* ══ NOTIFICATIONS POPOVER ══ */
  toggleNotifications(e) {
    if (e) e.stopPropagation();
    document.getElementById('ent-help-popover')?.classList.remove('open');
    const pop = document.getElementById('ent-notif-popover');
    if (!pop) return;
    const opening = !pop.classList.contains('open');
    pop.classList.toggle('open');
    if (opening) {
      this.renderNotifications();
      const dot = document.getElementById('ent-notif-dot'); if (dot) dot.style.display = 'none';
    }
  },

  renderNotifications() {
    const list = document.getElementById('ent-notif-list');
    if (!list) return;
    const clients = DB.get('clients') || [];
    const notifs = [];
    if (!clients.length) {
      notifs.push({ ic:'#eff6ff', st:'#2563eb', t:'Welcome to the ROU platform', d:'Add your first client company to begin.' });
    } else {
      notifs.push({ ic:'#f0fdf4', st:'#16a34a', t:'Workspace ready', d:clients.length + ' company' + (clients.length!==1?'ies':'') + ' available.' });
      const noRou = clients.filter(c => !(DB.get('rous_'+c.id)||[]).length);
      if (noRou.length) notifs.push({ ic:'#fff7ed', st:'#ea580c', t:'Action needed', d:noRou.length + ' company' + (noRou.length!==1?'ies':'') + ' with no ROUs yet.' });
    }
    list.innerHTML = notifs.map(n =>
      '<div class="ent-notif-item"><div class="ent-notif-ic" style="background:' + n.ic + '">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="' + n.st + '" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/></svg></div>' +
      '<div><div class="ent-notif-tt">' + n.t + '</div><div class="ent-notif-ds">' + n.d + '</div></div></div>'
    ).join('') || '<div class="ent-notif-empty">No notifications</div>';
  },

  /* ══ HELP POPOVER ══ */
  toggleHelp(e) {
    if (e) e.stopPropagation();
    document.getElementById('ent-notif-popover')?.classList.remove('open');
    document.getElementById('ent-help-popover')?.classList.toggle('open');
  },

  openClientById(id) {
    const client = (DB.get('clients')||[]).find(c => c.id === id);
    if (!client) { toast('Company not found','error'); return; }
    DB.set('last_client', id);
    if (this._page() === 'home') {
      // Persist selection then navigate to the company workspace page
      DB.flush().finally(() => { window.location.href = 'index.html'; });
      return;
    }
    this.currentClient = client;
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
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    const va = document.getElementById('view-app');
    if (va) va.classList.add('active');

    // Sidebar
    const sn = document.getElementById('sidebar-client-name');
    if (sn) sn.textContent = this.currentClient.name;
    const rous = DB.get('rous_' + this.currentClient.id) || [];
    const ss = document.getElementById('sidebar-client-sub');
    if (ss) ss.textContent = `${rous.length} ROU${rous.length!==1?'s':''}`;

    // Topbar period
    const s = DB.get('settings') || {};
    const tp = document.getElementById('topbar-period');
    if (tp) tp.textContent = s.periodShort || (s.period ? Utils.fmtDate(s.period) : 'Set Period');

    // Update sidebar user pill
    _refreshUserDisplay(API.user());

    // Render dashboard (or a target page requested from the home shortcuts)
    let target = 'dashboard';
    try {
      const t = sessionStorage.getItem('rou_target_page');
      if (t) { target = t; sessionStorage.removeItem('rou_target_page'); }
    } catch(e) {}
    this.showPage(target);
  },

  goHome() {
    // Clear the active company and return to the profile/home page
    DB.remove('last_client');
    this.currentClient = null;
    if (this._page() === 'app') {
      DB.flush().finally(() => { window.location.href = 'home.html'; });
      return;
    }
    // Already on home page — just re-render
    this.renderWorkspaceHome();
  },

  /* Navigate to a page inside the app (from the home sidebar shortcuts) */
  navToAppPage(page) {
    // On the app page and a client is loaded — just switch page
    if (this._page() === 'app' && this.currentClient) {
      this.showPage(page);
      return;
    }
    const clients = DB.get('clients') || [];
    if (!clients.length) { Modal.openAddClient(); return; }
    const lastId = DB.get('last_client');
    const found  = (lastId && clients.find(c => c.id === lastId)) || clients[0];
    DB.set('last_client', found.id);
    // Remember which page to open once the workspace loads
    try { sessionStorage.setItem('rou_target_page', page); } catch(e) {}
    if (this._page() === 'home') {
      DB.flush().finally(() => { window.location.href = 'index.html'; });
      return;
    }
    this.currentClient = found;
    this.enterApp();
    this.showPage(page);
  },

  showPage(page) {
    ['dashboard','rous','add-rou','schedule','export','audit','bulk-import','reassess-override'].forEach(p => {
      const el = document.getElementById('page-' + p);
      if (el) el.style.display = 'none';
    });
    const target = document.getElementById('page-' + page);
    if (target) target.style.display = '';
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });
    const titles = { dashboard:'Dashboard', rous:'All ROUs', 'add-rou':'Add ROU', schedule:'Schedule', export:'Export to Excel', audit:'Audit Log', 'bulk-import':'Bulk Import', 'reassess-override':'Reassessment Override' };
    const tb = document.getElementById('topbar-title');
    if (tb) tb.textContent = titles[page] || page;
    if (page === 'dashboard') this.renderDashboard();
    if (page === 'rous')      this.renderROUsTable();
    if (page === 'add-rou')   Form.reset();
    if (page === 'export')    this.prepareExport();
    if (page === 'audit')     AuditLog.renderPage(this.currentClient.id);
    if (page === 'reassess-override') { ReassessOverride.prepare(); ReassessOverride.renderTable(); }
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
    DB.set('last_client', client.id);
    Modal.close('modal-add-client');
    toast('Client "' + client.name + '" added!', 'success');
    if (this._page() === 'home') {
      // Go to the new company's workspace
      DB.flush().finally(() => { window.location.href = 'index.html'; });
      return;
    }
    this.currentClient = client;
    this.enterApp();
  },

  /* ── PROFILE ─────────────────────────────────────────────── */





  /* ══════════════════════════════════════════════════
     PROFILE VIEW — standalone full-page view
  ══════════════════════════════════════════════════ */

  /* Which view was active before opening profile */

  openProfileView() {
    // Open the profile modal (populated with current user data)
    const user = API.user();
    if (user) {
      const nd = document.getElementById('profile-name-display');   if (nd) nd.textContent = user.name || '';
      const ed = document.getElementById('profile-email-display');  if (ed) ed.textContent = user.email || '';
      const pav = document.getElementById('profile-avatar');
      const ROLE_COLORS = { admin:'#e8520a', partner:'#7c3aed', manager:'#1a3f6b', article:'#059669' };
      const ROLE_LABELS = { admin:'Administrator', partner:'Partner', manager:'Manager', article:'Article' };
      if (pav) { pav.textContent = (user.name||'?').charAt(0).toUpperCase(); pav.style.background = ROLE_COLORS[user.role]||'#1a3f6b'; }
      const rd = document.getElementById('profile-role-display');
      if (rd) { rd.textContent = ROLE_LABELS[user.role]||user.role; rd.style.background=(ROLE_COLORS[user.role]||'#1a3f6b')+'22'; rd.style.color=ROLE_COLORS[user.role]||'#1a3f6b'; }
      const ni = document.getElementById('profile-name-input'); if (ni) ni.value = user.name || '';
      const ei = document.getElementById('profile-email-input'); if (ei) { ei.value = user.email || ''; ei.setAttribute('readonly','true'); }
      const ri = document.getElementById('profile-role-input'); if (ri) ri.value = ROLE_LABELS[user.role] || user.role || '';
    }
    Modal.open('modal-profile');
  },

  closeProfileView() {
    this.goHome();
  },

  /* ── PROFILE MODAL: Save Details ──────────────────────────── */
  async saveProfile() {
    const name = document.getElementById('profile-name-input')?.value.trim();
    if (!name) { profileAlert('details', 'Name cannot be empty.', 'error'); return; }
    try {
      const r = await fetch('/api/auth/profile', {
        method:'PUT', headers:{'Content-Type':'application/json','Authorization':'Bearer '+API.token()},
        body: JSON.stringify({ name })
      });
      const d = await r.json();
      if (!r.ok) { profileAlert('details', d.error || 'Update failed.', 'error'); return; }
      localStorage.setItem('rou_token', d.token);
      localStorage.setItem('rou_user', JSON.stringify(d.user));
      profileAlert('details', '\u2713 Profile updated successfully!', 'success');
      _refreshUserDisplay(d.user);
      this.renderWorkspaceHome();
    } catch(e) { profileAlert('details', 'Network error. Please try again.', 'error'); }
  },

  /* ── PROFILE MODAL: Change Password ───────────────────────── */
  async changePassword() {
    const cur  = document.getElementById('profile-pw-current')?.value;
    const nw   = document.getElementById('profile-pw-new')?.value;
    const conf = document.getElementById('profile-pw-confirm')?.value;
    if (!cur || !nw || !conf) { profileAlert('password', 'All three fields are required.', 'error'); return; }
    if (nw.length < 8)        { profileAlert('password', 'New password must be at least 8 characters.', 'error'); return; }
    if (nw !== conf)          { profileAlert('password', 'New passwords do not match.', 'error'); return; }
    try {
      const r = await fetch('/api/auth/change-password', {
        method:'PUT', headers:{'Content-Type':'application/json','Authorization':'Bearer '+API.token()},
        body: JSON.stringify({ currentPassword:cur, newPassword:nw })
      });
      const d = await r.json();
      if (!r.ok) { profileAlert('password', d.error || 'Failed to change password.', 'error'); return; }
      profileAlert('password', '\u2713 Password changed successfully!', 'success');
      ['profile-pw-current','profile-pw-new','profile-pw-confirm'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
    } catch(e) { profileAlert('password', 'Network error. Please try again.', 'error'); }
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
    AuditLog.record(this.currentClient.id, 'DELETE', { id: this.pendingDeleteId, branch:'deleted' });
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
    AuditLog.record(this.currentClient.id, 'DUPLICATE', copy);
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


/* Close dropdowns/popovers on outside click */
document.addEventListener('click', function() {
  document.getElementById('ws-dropdown')?.classList.remove('open');
  document.getElementById('ent-notif-popover')?.classList.remove('open');
  document.getElementById('ent-help-popover')?.classList.remove('open');
});







