window.App = {
  currentClient: null,
  pendingDeleteId: null,
  pendingDuplicateId: null,
  uiBindingsReady: false,

  bindUiActions() {
    if (this.uiBindingsReady) return;

    const openAdmin = () => Modal.openAdminLogin();

    // Note: period selector and sidebar admin button already have onclick in HTML,
    // so we only bind the home admin link here to avoid duplicate triggers.
    const homeAdminLink = document.getElementById('home-admin-link');
    if (homeAdminLink) {
      homeAdminLink.addEventListener('click', e => {
        e.preventDefault();
        openAdmin();
      });
      homeAdminLink.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openAdmin();
        }
      });
    }

    this.uiBindingsReady = true;
  },

  init() {
    this.bindUiActions();
    this.renderSessionBar();

    if (!DB.get('settings')) {
      const now = new Date();
      const sy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      const ey = sy + 1;
      const sd = new Date(sy + '-04-01');
      const ed = new Date(ey + '-03-31');
      const fmt = d => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      const shortFmt = d => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
      DB.set('settings', {
        periodStart: sy + '-04-01',
        period: ey + '-03-31',
        periodLabel: fmt(sd) + ' – ' + fmt(ed),
        periodShort: shortFmt(sd) + ' – ' + shortFmt(ed),
        initialized: true
      });
    }

    const lastId = DB.get('last_client');
    if (lastId) {
      const clients = DB.get('clients') || [];
      const found = clients.find(c => c.id === lastId);
      if (found) {
        this.currentClient = found;
        this.enterApp();
        return;
      }
    }
    this.renderHomeClients();

    setInterval(() => {
      DB.flush().catch(err => console.warn('Auto-save failed:', err.message));
    }, 60000);

    window.addEventListener('beforeunload', () => {
      DB.flush().catch(() => {});
    });
  },

  renderSessionBar() {
    const user = API.user();
    const bar = document.getElementById('home-user-bar');
    if (!bar || !user) return;
    bar.innerHTML = `Signed in as <strong>${user.name}</strong> · <a href="#" onclick="App.signOut();return false">Sign out</a>`;
  },

  signOut() {
    DB.flush().finally(() => {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '../login.html?next=' + encodeURIComponent('/rou/');
    });
  },

  renderHomeClients() {
    const clients = DB.get('clients') || [];
    const sel = document.getElementById('home-client-select');
    sel.innerHTML = clients.length
      ? '<option value="">- Select a company -</option>' + clients.map(c => `<option value="${c.id}">${c.name} (${c.code || '?'})</option>`).join('')
      : '<option value="">- No companies yet -</option>';
  },

  openClient() {
    const id = document.getElementById('home-client-select').value;
    if (!id) { toast('Please select a company first', 'error'); return; }
    const clients = DB.get('clients') || [];
    const client = clients.find(c => c.id === id);
    if (!client) { toast('Company not found', 'error'); return; }
    this.currentClient = client;
    DB.set('last_client', id);
    this.enterApp();
  },

  enterApp() {
    document.getElementById('view-home').classList.remove('active');
    document.getElementById('view-app').classList.add('active');
    document.getElementById('sidebar-client-name').textContent = this.currentClient.name;
    const rous = DB.get('rous_' + this.currentClient.id) || [];
    document.getElementById('sidebar-client-sub').textContent = `${rous.length} ROU${rous.length !== 1 ? 's' : ''}`;
    const s = DB.get('settings') || {};
    document.getElementById('topbar-period').textContent = s.periodShort || (s.period ? Utils.fmtDate(s.period) : 'Set Period');
    this.showPage('dashboard');
  },

  showPage(page) {
    const pages = ['dashboard', 'rous', 'add-rou', 'schedule', 'export', 'audit', 'bulk-import', 'reassess-override'];
    pages.forEach(p => { const el = document.getElementById('page-' + p); if (el) el.style.display = 'none'; });
    document.getElementById('page-' + page).style.display = '';
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });
    const titles = { dashboard: 'Dashboard', rous: 'All ROUs', 'add-rou': 'Add ROU', schedule: 'Schedule', export: 'Export to Excel', audit: 'Audit Log', 'bulk-import': 'Bulk Import' };
    document.getElementById('topbar-title').textContent = titles[page] || page;
    if (page === 'dashboard') this.renderDashboard();
    if (page === 'rous') this.renderAllROUs();
    if (page === 'add-rou') { if (!document.getElementById('rou-edit-id').value) Form.reset(); LivePreview.attach(); LivePreview.refresh(); }
    if (page === 'export') Exporter.prepare();
    if (page === 'audit') AuditLog.renderPage(App.currentClient?.id);
    if (page === 'reassess-override') ReassessOverride.prepare();
    if (page === 'bulk-import') BulkImport.prepare();
  },

  renderDashboard() {
    if (!this.currentClient) return;
    const rous = DB.get('rous_' + this.currentClient.id) || [];
    const s = DB.get('settings') || {};
    const period = s.period || new Date().toISOString().split('T')[0];
    const periodStart = s.periodStart || '';

    // Derive counts dynamically based on period boundaries
    let cntActive = 0, cntMid = 0, cntExpired = 0, cntReassessed = 0;
    
    rous.forEach(r => {
      // Skip if not started by period end
      if (r.startDate && r.startDate > period) return;
      
      // Get dynamic status
      const status = Utils.getStatus(r);
      
      if (status === 'Reassessed' || status === 'Renewed') {
        cntReassessed++;
      } else if (r.endDate) {
        // Has an end date - check where it falls relative to period
        if (periodStart && r.endDate < periodStart) {
          // Ended before period start = pre-expired
          cntExpired++;
        } else if (periodStart && r.endDate >= periodStart && r.endDate <= period) {
          // Ended during the period = mid-expired
          cntMid++;
        } else if (!periodStart && r.endDate <= period) {
          // No period start set, ended on or before period end = expired
          cntExpired++;
        } else {
          // End date is after period end = active
          cntActive++;
        }
      } else {
        // No end date = active (perpetual or ongoing)
        cntActive++;
      }
    });

    document.getElementById('stat-total-rous').textContent = rous.length;
    document.getElementById('stat-active').textContent = cntActive;
    document.getElementById('stat-mid-expired').textContent = cntMid;
    document.getElementById('stat-expired').textContent = cntExpired;
    document.getElementById('stat-reassessed').textContent = cntReassessed;
    document.getElementById('nav-badge-rous').textContent = rous.length;
    document.getElementById('sidebar-client-sub').textContent = `${rous.length} ROU${rous.length !== 1 ? 's' : ''}`;

    // Financial summary — split P&L items from Balance Sheet items
    const fmt = n => '₹' + Math.round(n || 0).toLocaleString('en-IN');
    if (period && rous.length > 0) {
      // Monthly rent: active leases only (current obligation)
      let monthlyRent = 0;
      // FY Rent expense + FY Dep: active + mid-period expired (P&L items)
      let fyRent = 0, fyDep = 0;
      // Balance sheet: active leases only (liability & NBV at period end)
      let totalLiab = 0, totalNBV = 0;

      rous.forEach(r => {
        if (r.startDate && r.startDate > period) return; // not yet started

        // Exempt leases (short-term / low-value): count straight-line rent expense only
        if (r.leaseType === 'short-term' || r.leaseType === 'low-value') {
          const lStart = r.startDate > (periodStart || '') ? r.startDate : (periodStart || r.startDate);
          const lEnd = r.endDate && r.endDate < period ? r.endDate : period;
          if (lStart <= lEnd) {
            const months = Engine.monthsBetween(new Date(lStart), new Date(lEnd)) + 1;
            fyRent += months * (parseFloat(r.baseRent) || 0);
            if (isActive && (!r.endDate || r.endDate > period)) monthlyRent += parseFloat(r.baseRent) || 0;
          }
          return;
        }

        const isMidExpired = r.endDate && periodStart && r.endDate >= periodStart && r.endDate <= period;
        const isActive = !r.endDate || r.endDate > period;
        const isPreExpired = r.endDate && periodStart && r.endDate < periodStart;
        if (isPreExpired) return; // no contribution at all

        try {
          const computeAt = isMidExpired ? r.endDate : period;
          const pos = Engine.positionAt(r, computeAt, periodStart);
          if (!pos) return;

          // P&L items: active + mid-expired
          fyRent += pos.fyPay || 0;
          fyDep  += pos.fyDep || 0;

          // Balance sheet: active only
          if (isActive) {
            totalLiab += pos.closingLiab || 0;
            totalNBV  += pos.closingROU  || 0;
          }

          // Current monthly rent: active only
          if (isActive) {
            monthlyRent += parseFloat(r.baseRent) || 0;
          }
        } catch(e) {}
      });

      document.getElementById('stat-total-rent').textContent = fmt(monthlyRent);
      document.getElementById('stat-fy-rent').textContent = fmt(fyRent);
      document.getElementById('stat-total-liab').textContent = fmt(totalLiab);
      document.getElementById('stat-total-rou-nbv').textContent = fmt(totalNBV);
      document.getElementById('stat-total-dep').textContent = fmt(fyDep);
      document.getElementById('dashboard-fin-stats').style.display = '';
    } else {
      document.getElementById('dashboard-fin-stats').style.display = rous.length ? '' : 'none';
      ['stat-total-rent','stat-total-liab','stat-total-rou-nbv','stat-total-dep'].forEach(id => {
        document.getElementById(id).textContent = period ? '—' : 'Set period';
      });
    }

    if (rous.length === 0) {
      document.getElementById('dashboard-no-client').style.display = '';
      document.getElementById('dashboard-stats').style.display = 'none';
      document.getElementById('dashboard-fin-stats').style.display = 'none';
    } else {
      document.getElementById('dashboard-no-client').style.display = 'none';
      document.getElementById('dashboard-stats').style.display = '';
    }

    const tbody = document.getElementById('dashboard-rou-tbody');
    const recent = rous.slice(-10).reverse();
    tbody.innerHTML = recent.length ? recent.map((r, i) => {
      const ltBadge = r.leaseType === 'short-term' ? '<span style="font-size:9px;background:#dbeafe;color:#1e40af;padding:1px 5px;border-radius:3px;margin-left:4px">SHORT-TERM</span>'
        : r.leaseType === 'low-value' ? '<span style="font-size:9px;background:#fef9c3;color:#713f12;padding:1px 5px;border-radius:3px;margin-left:4px">LOW-VALUE</span>' : '';
      return `
      <tr>
        <td style="color:var(--text3);font-size:12px">${i + 1}</td>
        <td><strong>${r.branchName || '-'}</strong>${ltBadge}<br><span style="font-size:11px;color:var(--text3)">${r.partyName || ''}</span></td>
        <td class="mono">${Utils.fmt(r.baseRent)}</td>
        <td style="font-size:12px">${Utils.fmtDate(r.startDate)}<br><span style="color:var(--text3)">→ ${Utils.fmtDate(r.endDate)}</span></td>
        <td class="mono">${r.leaseType && r.leaseType !== 'full' ? 'Exempt' : (r.ibr || '-') + '%'}</td>
        <td>${Utils.statusBadge(Utils.getStatus(r))}</td>
        <td><div class="td-actions">
          <button class="btn btn-ghost btn-sm" onclick="App.viewSchedule('${r.id}')" ${r.leaseType && r.leaseType !== 'full' ? 'disabled title="Exempt lease — no schedule"' : ''}>Schedule</button>
          <button class="btn btn-ghost btn-sm" onclick="App.editROU('${r.id}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="App.deleteROU('${r.id}')">Del</button>
        </div></td>
      </tr>`;
    }).join('') : `<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text3)">No ROUs yet. Click "+ Add ROU" to start.</td></tr>`;
  },

  renderAllROUs(filter = '') {
    if (!this.currentClient) return;
    let rous = DB.get('rous_' + this.currentClient.id) || [];
    const search = (document.getElementById('rou-search')?.value || '').toLowerCase();
    const statusFilter = document.getElementById('rou-status-filter')?.value || '';
    if (search) rous = rous.filter(r => (r.branchName || '').toLowerCase().includes(search) || (r.partyName || '').toLowerCase().includes(search));
    const s = DB.get('settings') || {};
    const pStart = s.periodStart || '';
    const pEnd = s.period || '';
    // Compute effective display status for each ROU based on reporting period
    const getDisplayStatus = (r) => {
      if (!pStart || !pEnd) return { label: r.status, tag: '' };
      const end = r.endDate || '';
      const start = r.startDate || '';
      if (end && end < pStart) return { label: 'Expired', tag: '<span style="margin-left:5px;background:#f1f5f9;color:#64748b;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px">PRE-PERIOD</span>' };
      if (end && end >= pStart && end <= pEnd) return { label: 'Expired', tag: '<span style="margin-left:5px;background:#fee2e2;color:#991b1b;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px">MID-PERIOD</span>' };
      if (start && start > pEnd) return { label: r.status, tag: '<span style="margin-left:5px;background:#dbeafe;color:#1e40af;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px">POST-PERIOD</span>' };
      return { label: r.status, tag: '' };
    };
    // Apply status filter after computing display status
    const filteredROUs = statusFilter ? rous.filter(r => {
      const ds = getDisplayStatus(r);
      return ds.label === statusFilter;
    }) : rous;
    document.getElementById('rou-count-label').textContent = `${filteredROUs.length} lease${filteredROUs.length !== 1 ? 's' : ''}`;
    const tbody = document.getElementById('all-rou-tbody');
    tbody.innerHTML = filteredROUs.length ? filteredROUs.map((r, i) => {
      const ds = getDisplayStatus(r);
      const isPre = ds.tag.includes('PRE-PERIOD');
      const isMid = ds.tag.includes('MID-PERIOD');
      const rowStyle = isPre ? 'opacity:0.65' : isMid ? 'background:#fff5f5' : '';
      const badgeHtml = Utils.statusBadge(ds.label);
      return `
      <tr style="${rowStyle}">
        <td style="color:var(--text3);font-size:12px">${i + 1}</td>
        <td><strong>${r.branchName || '-'}</strong>${ds.tag}</td>
        <td style="font-size:12px;color:var(--text2)">${r.partyName || '-'}</td>
        <td class="mono">${Utils.fmt(r.baseRent)}</td>
        <td style="font-size:12px">${Utils.fmtDate(r.startDate)}</td>
        <td style="font-size:12px${isMid?';color:var(--red);font-weight:600':''}">${Utils.fmtDate(r.endDate)}</td>
        <td class="mono">${r.ibr || '-'}%</td>
        <td class="mono">${r.secDepAmount ? Utils.fmt(r.secDepAmount) : '-'}</td>
        <td>${badgeHtml}</td>
        <td><div class="td-actions">
          <button class="btn btn-ghost btn-sm" onclick="App.viewSchedule('${r.id}')">Schedule</button>
          <button class="btn btn-ghost btn-sm" onclick="App.editROU('${r.id}')">Edit</button>
          <button class="btn btn-ghost btn-sm" onclick="App.duplicateROU('${r.id}')">Duplicate</button>
          <button class="btn btn-danger btn-sm" onclick="App.deleteROU('${r.id}')">Del</button>
        </div></td>
      </tr>
    `}).join('') : `<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--text3)">No ROUs found.</td></tr>`;
  },

  filterROUs() { this.renderAllROUs(); },

  saveClient() {
    const name = document.getElementById('new-client-name').value.trim();
    const code = document.getElementById('new-client-code').value.trim() || Utils.toCode(name);
    const ibr = document.getElementById('new-client-ibr').value;
    const preparedBy = document.getElementById('new-client-prepared-by').value.trim();
    const address = document.getElementById('new-client-address').value.trim();
    if (!name) { document.getElementById('new-client-name-err').textContent = 'Company name is required'; return; }
    document.getElementById('new-client-name-err').textContent = '';
    if (!address) { document.getElementById('new-client-address-err').textContent = 'Registered address is required'; return; }
    document.getElementById('new-client-address-err').textContent = '';
    const clients = DB.get('clients') || [];
    const client = { id: Utils.uid(), name, code, address, defaultIBR: parseFloat(ibr) || 9, preparedBy: preparedBy || name, createdAt: new Date().toISOString() };
    clients.push(client);
    DB.set('clients', clients);
    DB.set('rous_' + client.id, []);
    Modal.close('modal-add-client');
    toast('Client "' + name + '" added!', 'success');
    this.currentClient = client;
    DB.set('last_client', client.id);
    this.renderHomeClients();
    this.enterApp();
  },

  async adminLogin() {
    const pass = document.getElementById('admin-password-input').value;
    if (!pass) { document.getElementById('admin-login-err').textContent = 'Enter your admin password'; return; }
    const hash = await Utils.sha256(pass);
    const storedHash = sessionStorage.getItem('rou_bot_adminHash') || DB.get('admin_hash');
    if (!storedHash) {
      // First time — set the password
      sessionStorage.setItem('rou_bot_adminHash', hash);
      DB.set('admin_hash', hash);
      Modal.close('modal-admin-login');
      Modal.openAdminPanel();
      toast('Admin password set for this session', 'success');
    } else if (hash === storedHash) {
      Modal.close('modal-admin-login');
      Modal.openAdminPanel();
    } else {
      document.getElementById('admin-login-err').textContent = 'Incorrect password';
    }
  },

  editROU(id) {
    const rous = DB.get('rous_' + this.currentClient.id) || [];
    const rou = rous.find(r => r.id === id);
    if (!rou) { toast('ROU not found', 'error'); return; }
    Form.load(rou);
    this.showPage('add-rou');
    document.getElementById('topbar-title').textContent = 'Edit ROU';
  },

  duplicateROU(id) {
    const rous = DB.get('rous_' + (this.currentClient?.id || '')) || [];
    const rou = rous.find(r => r.id === id);
    if (!rou) { toast('ROU not found', 'error'); return; }
    this.pendingDuplicateId = id;
    document.getElementById('duplicate-rou-name').textContent = rou.branchName || 'this ROU';
    Modal.open('modal-duplicate-rou');
  },

  confirmDuplicateROU() {
    if (!this.pendingDuplicateId || !this.currentClient) return;
    const rous = DB.get('rous_' + this.currentClient.id) || [];
    const original = rous.find(r => r.id === this.pendingDuplicateId);
    if (!original) { toast('ROU not found', 'error'); Modal.close('modal-duplicate-rou'); return; }
    const copy = JSON.parse(JSON.stringify(original));
    copy.id = Utils.uid();
    copy.branchName = (original.branchName || '') + ' (Copy)';
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = new Date().toISOString();
    rous.push(copy);
    DB.set('rous_' + this.currentClient.id, rous);
    AuditLog.record(this.currentClient.id, 'DUPLICATE', copy, null);
    this.pendingDuplicateId = null;
    Modal.close('modal-duplicate-rou');
    toast('Duplicated: ' + copy.branchName, 'success');
    this.renderAllROUs();
    this.renderDashboard();
  },

  viewSchedule(id) {
    const rous = DB.get('rous_' + this.currentClient.id) || [];
    const rou = rous.find(r => r.id === id);
    if (!rou) { toast('ROU not found', 'error'); return; }
    Schedule.render(rou);
    this.showPage('schedule');
  },

  deleteROU(id) {
    this.pendingDeleteId = id;
    const rous = DB.get('rous_' + (this.currentClient?.id || '')) || [];
    const rou = rous.find(r => r.id === id);
    document.getElementById('delete-rou-name').textContent = (rou && rou.branchName) ? rou.branchName : 'this ROU';
    Modal.open('modal-delete-rou');
  },

  confirmDeleteROU() {
    if (!this.pendingDeleteId || !this.currentClient) return;
    let rous = DB.get('rous_' + this.currentClient.id) || [];
    const target = rous.find(r => r.id === this.pendingDeleteId);
    rous = rous.filter(r => r.id !== this.pendingDeleteId);
    DB.set('rous_' + this.currentClient.id, rous);
    if (target) AuditLog.record(this.currentClient.id, 'DELETE', target, null);
    this.pendingDeleteId = null;
    Modal.close('modal-delete-rou');
    toast('ROU deleted', 'info');
    this.renderDashboard();
    this.renderAllROUs();
  },

  goHome() {
    DB.remove('last_client');
    this.currentClient = null;
    document.getElementById('view-app').classList.remove('active');
    document.getElementById('view-home').classList.add('active');
    this.renderHomeClients();
  },

  onQuickFY(sy, ey) {
    document.getElementById('period-start-input').value = `${sy}-04-01`;
    document.getElementById('period-end-input').value = `${ey}-03-31`;
    App._updatePeriodLabel();
  },
  _updatePeriodLabel() {
    const s = document.getElementById('period-start-input').value;
    const e = document.getElementById('period-end-input').value;
    const disp = document.getElementById('period-range-display');
    const lbl = document.getElementById('period-range-label');
    if (s && e) {
      const fmt = d => new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
      lbl.textContent = `${fmt(s)}  →  ${fmt(e)}`;
      disp.style.display = 'block';
    } else { disp.style.display = 'none'; }
  },

  setPeriod() {
    const startDate = document.getElementById('period-start-input').value;
    const endDate = document.getElementById('period-end-input').value;
    if (!startDate || !endDate) { toast('Please set both From and To dates', 'error'); return; }
    if (endDate <= startDate) { toast('To date must be after From date', 'error'); return; }
    const s = DB.get('settings') || {};
    s.periodStart = startDate;
    s.period = endDate;
    // derive FY label for display (works for Apr-Mar; otherwise shows date range)
    const sd = new Date(startDate), ed = new Date(endDate);
    const fmt = d => d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
    const shortFmt = d => d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'});
    s.periodLabel = `${fmt(sd)} – ${fmt(ed)}`;
    s.periodShort = `${shortFmt(sd)} – ${shortFmt(ed)}`;
    DB.set('settings', s);
    document.getElementById('topbar-period').textContent = s.periodShort;
    Modal.close('modal-period');
    toast(`Period set: ${s.periodLabel}`, 'success');
    if (document.getElementById('page-export').style.display !== 'none') Exporter.prepare();
  }
};

// ════════════════════════════════════════════════════════════
// ADMIN
