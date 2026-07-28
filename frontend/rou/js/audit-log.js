window.AuditLog = {
  KEY: 'audit_log_',

  record(clientId, action, rou, oldROU) {
    if (!clientId) return;
    const logs = this._load(clientId);
    const entry = {
      id: Utils.uid(),
      ts: new Date().toISOString(),
      action,                             // CREATE | EDIT | DELETE | DUPLICATE
      rouId: rou.id,
      branchName: rou.branchName || '',
      partyName: rou.partyName || '',
      changes: action === 'EDIT' && oldROU ? this._diff(oldROU, rou) : null,
      snapshot: {
        status: rou.status,
        startDate: rou.startDate,
        endDate: rou.endDate,
        baseRent: rou.baseRent,
        ibr: rou.ibr,
        hasReassessment: rou.hasReassessment,
        reassessmentCount: (rou.reassessments || []).length
      }
    };
    logs.unshift(entry);
    // Keep last 500 entries per client
    if (logs.length > 500) logs.length = 500;
    DB.set(this.KEY + clientId, logs);
  },

  _load(clientId) {
    return DB.get(this.KEY + clientId) || [];
  },

  _diff(before, after) {
    const fields = [
      ['branchName','Branch Name'], ['partyName','Party Name'], ['status','Status'],
      ['startDate','Start Date'], ['endDate','End Date'], ['baseRent','Monthly Rent'],
      ['ibr','IBR (%)'], ['paymentTiming','Payment Timing'],
      ['secDepAmount','Security Deposit'], ['escalationType','Escalation Type'],
      ['escalationPct','Escalation %'], ['escStepBasis','Escalation Step Basis'],
      ['sdEscStepBasis','SD Escalation Step Basis'],
      ['initialDirectCosts','Initial Direct Costs'], ['leaseIncentives','Lease Incentives'],
      ['variableRentMonthly','Variable Rent / Month'],
      ['hasReassessment','Reassessment'], ['hasMidLeaseOpening','Opening Balances'],
      ['address','Address']
    ];
    const changes = [];
    fields.forEach(([key, label]) => {
      const bv = before[key], av = after[key];
      if (String(bv||'') !== String(av||'')) {
        changes.push({ field: label, from: bv || '—', to: av || '—' });
      }
    });
    // Check reassessment count change
    const raBefore = (before.reassessments || []).length;
    const raAfter  = (after.reassessments  || []).length;
    if (raBefore !== raAfter) {
      changes.push({ field: 'Reassessments', from: raBefore + ' entries', to: raAfter + ' entries' });
    }
    return changes;
  },

  renderPage(clientId) {
    const logs = this._load(clientId);
    const wrap = document.getElementById('audit-log-content');
    if (!wrap) return;

    if (!logs.length) {
      wrap.innerHTML = '<div style="text-align:center;padding:48px 20px;color:var(--text3);font-size:13px">No activity recorded yet. Changes to ROUs will appear here.</div>';
      return;
    }

    // Action colours
    const tagStyle = {
      CREATE:    'background:#dcfce7;color:#166534',
      EDIT:      'background:#dbeafe;color:#1e40af',
      DELETE:    'background:#fee2e2;color:#991b1b',
      DUPLICATE: 'background:#fef3c7;color:#92400e',
    };

    wrap.innerHTML = logs.map(e => {
      const ts = new Date(e.ts);
      const dateStr = ts.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      const timeStr = ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
      const tag = e.action || 'EDIT';
      const style = tagStyle[tag] || tagStyle.EDIT;

      let changesHtml = '';
      if (e.changes && e.changes.length) {
        changesHtml = '<div style="margin-top:10px;border-top:1px solid var(--border);padding-top:10px">' +
          '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text3);margin-bottom:6px">Fields Changed</div>' +
          '<table style="font-size:11px;border-collapse:collapse;width:100%">' +
          '<thead><tr>' +
          '<th style="text-align:left;padding:3px 8px 3px 0;color:var(--text3);font-weight:600;width:30%">Field</th>' +
          '<th style="text-align:left;padding:3px 8px;color:var(--text3);font-weight:600;width:35%">Before</th>' +
          '<th style="text-align:left;padding:3px 0;color:var(--text3);font-weight:600;width:35%">After</th>' +
          '</tr></thead><tbody>' +
          e.changes.map((ch, ci) => `
            <tr style="${ci%2===1?'background:var(--light)':''}">
              <td style="padding:3px 8px 3px 0;color:var(--text2);font-weight:500">${ch.field}</td>
              <td style="padding:3px 8px;color:var(--red);text-decoration:line-through">${ch.from}</td>
              <td style="padding:3px 0;color:var(--green);font-weight:600">${ch.to}</td>
            </tr>`).join('') +
          '</tbody></table></div>';
      } else if (tag === 'CREATE') {
        const snap = e.snapshot || {};
        changesHtml = `<div style="margin-top:8px;font-size:11px;color:var(--text3)">Status: ${snap.status||'—'} · Rent: ₹${Number(snap.baseRent||0).toLocaleString('en-IN')} · IBR: ${snap.ibr||'—'}% · ${Utils.fmtDate(snap.startDate)} → ${Utils.fmtDate(snap.endDate)}</div>`;
      }

      return `
        <div style="background:var(--white);border:1px solid var(--border);border-radius:10px;padding:14px 18px;margin-bottom:10px">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;${style}">${tag}</span>
            <span style="font-size:13px;font-weight:600;color:var(--text)">${e.branchName || '—'}</span>
            <span style="font-size:12px;color:var(--text3)">${e.partyName || ''}</span>
            <div style="margin-left:auto;text-align:right;font-size:11px;color:var(--text3);white-space:nowrap">${dateStr}<br>${timeStr}</div>
          </div>
          ${changesHtml}
        </div>`;
    }).join('');
  },

  promptClear() {
    document.getElementById('audit-clear-password').value = '';
    document.getElementById('audit-clear-err').textContent = '';
    Modal.open('modal-audit-clear');
    setTimeout(() => document.getElementById('audit-clear-password').focus(), 120);
  },

  async confirmClear() {
    const pass = document.getElementById('audit-clear-password').value;
    if (!pass) { document.getElementById('audit-clear-err').textContent = 'Enter the admin password'; return; }
    const hash = await Utils.sha256(pass);
    const storedHash = sessionStorage.getItem('rou_bot_adminHash') || DB.get('admin_hash');
    if (!storedHash || hash !== storedHash) {
      document.getElementById('audit-clear-err').textContent = 'Incorrect admin password';
      return;
    }
    const clientId = App.currentClient?.id;
    if (!clientId) return;
    DB.set(this.KEY + clientId, []);
    Modal.close('modal-audit-clear');
    this.renderPage(clientId);
    toast('Audit log cleared', 'info');
  }
};

// ════════════════════════════════════════════════════════════
// REASSESSMENT OVERRIDE — Store differential between engine and audited figures
