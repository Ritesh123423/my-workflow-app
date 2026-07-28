window.Admin = {
  // Switch between admin panel tabs (Company, Defaults, Storage, Security, Danger)
  switchTab(tabName) {
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-tab') === tabName);
    });
    document.querySelectorAll('.admin-tab-pane').forEach(pane => {
      pane.style.display = pane.getAttribute('data-pane') === tabName ? '' : 'none';
    });
  },

  loadStats() {
    const bytes = DB.sizeBytes();
    const infoEl = document.getElementById('admin-storage-info');
    const pctEl = document.getElementById('admin-storage-pct');
    const barEl = document.getElementById('admin-storage-bar');
    if (infoEl) {
      infoEl.textContent = API.token()
        ? `${(bytes / 1024).toFixed(1)} KB local mirror · synced to cloud database`
        : `${(bytes / 1024).toFixed(1)} KB local cache only`;
    }
    if (pctEl) pctEl.textContent = DB._ready ? 'Cloud ✓' : 'Local';
    if (barEl) {
      barEl.style.width = DB._ready ? '100%' : '40%';
      barEl.style.background = DB._ready ? 'var(--green)' : 'var(--orange)';
    }
    
    // Populate company details for editing
    if (App.currentClient) {
      document.getElementById('admin-edit-name').value = App.currentClient.name || '';
      document.getElementById('admin-edit-code').value = App.currentClient.code || '';
      document.getElementById('admin-edit-address').value = App.currentClient.address || '';
      document.getElementById('admin-edit-name-err').textContent = '';
      document.getElementById('admin-edit-code-err').textContent = '';
      document.getElementById('admin-edit-address-err').textContent = '';
      const escBasisEl = document.getElementById('admin-default-esc-basis');
      if (escBasisEl) escBasisEl.value = App.currentClient.defaultEscStepBasis === 'period' ? 'period' : 'month';
      const curEl = document.getElementById('admin-defaults-current');
      if (curEl) {
        const b = App.currentClient.defaultEscStepBasis === 'period' ? 'period' : 'month';
        curEl.innerHTML = b === 'period'
          ? '✅ Currently: <strong style="color:#78350f">Calendar Period</strong> — all ROUs under <em>' + (App.currentClient.name || 'this company') + '</em> are computing with end-of-month dates and pro-rated partial periods.'
          : '✅ Currently: <strong>Default (Month Number)</strong> — all ROUs under <em>' + (App.currentClient.name || 'this company') + '</em> are computing with the original lease-month bucket logic.';
      }
    }
  },

  // Saves the per-client default escalation step basis (Month Number vs Calendar Period).
  // This is the "central control" setting — applied automatically to new ROUs created
  // for this client. Existing ROUs retain whatever basis they were saved with.
  updateDateEscalationDefaults() {
    if (!App.currentClient) { toast('No company selected', 'error'); return; }
    const basis = document.getElementById('admin-default-esc-basis').value === 'period' ? 'period' : 'month';
    const clients = DB.get('clients') || [];
    const idx = clients.findIndex(c => c.id === App.currentClient.id);
    if (idx === -1) { toast('Company not found', 'error'); return; }
    clients[idx].defaultEscStepBasis = basis;
    clients[idx].updatedAt = new Date().toISOString();
    DB.set('clients', clients);
    App.currentClient.defaultEscStepBasis = basis;
    // Refresh the "current setting" indicator immediately so the user sees the new state
    const curEl = document.getElementById('admin-defaults-current');
    if (curEl) {
      curEl.innerHTML = basis === 'period'
        ? '✅ Currently: <strong style="color:#78350f">Calendar Period</strong> — all ROUs under <em>' + (App.currentClient.name || 'this company') + '</em> are computing with end-of-month dates and pro-rated partial periods.'
        : '✅ Currently: <strong>Default (Month Number)</strong> — all ROUs under <em>' + (App.currentClient.name || 'this company') + '</em> are computing with the original lease-month bucket logic.';
    }
    toast(
      basis === 'period'
        ? 'Switched to Calendar Period — every schedule under this company is now recomputed with calendar dates'
        : 'Switched to Default — every schedule under this company is now recomputed with the original logic',
      'success'
    );
  },

  updateCompanyDetails() {
    if (!App.currentClient) {
      toast('No company selected', 'error');
      return;
    }

    const name = document.getElementById('admin-edit-name').value.trim();
    const code = document.getElementById('admin-edit-code').value.trim();
    const address = document.getElementById('admin-edit-address').value.trim();

    // Validation
    let hasError = false;
    if (!name) {
      document.getElementById('admin-edit-name-err').textContent = 'Company name is required';
      hasError = true;
    } else {
      document.getElementById('admin-edit-name-err').textContent = '';
    }

    if (!code) {
      document.getElementById('admin-edit-code-err').textContent = 'Short name/code is required';
      hasError = true;
    } else {
      document.getElementById('admin-edit-code-err').textContent = '';
    }

    if (!address) {
      document.getElementById('admin-edit-address-err').textContent = 'Address is required';
      hasError = true;
    } else {
      document.getElementById('admin-edit-address-err').textContent = '';
    }

    if (hasError) return;

    // Update the client
    const clients = DB.get('clients') || [];
    const clientIndex = clients.findIndex(c => c.id === App.currentClient.id);
    
    if (clientIndex === -1) {
      toast('Company not found', 'error');
      return;
    }

    clients[clientIndex].name = name;
    clients[clientIndex].code = code;
    clients[clientIndex].address = address;
    clients[clientIndex].updatedAt = new Date().toISOString();

    DB.set('clients', clients);
    
    // Update current client reference
    App.currentClient.name = name;
    App.currentClient.code = code;
    App.currentClient.address = address;

    // Update UI
    document.getElementById('sidebar-client-name').textContent = name;
    
    toast('Company details updated successfully!', 'success');
    App.renderHomeClients();
  },

  backup() {
    const data = {};
    DB.keys().forEach(k => { data[k.replace(DB.PREFIX, '')] = DB.get(k.replace(DB.PREFIX, '')); });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `EbixCash_ROU_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click(); URL.revokeObjectURL(url);
    toast('Backup downloaded!', 'success');
  },

  restore(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const data = JSON.parse(e.target.result);
        if (!confirm('This will overwrite your cloud workspace. Continue?')) return;
        await DB.restoreWorkspace(data);
        toast('Workspace restored from backup!', 'success');
        App.currentClient = null;
        App.init();
      } catch (err) {
        toast(err.message || 'Invalid backup file', 'error');
      }
    };
    reader.readAsText(file);
    input.value = '';
  },

  async changePassword() {
    const np = document.getElementById('admin-new-pass').value;
    const cp = document.getElementById('admin-confirm-pass').value;
    const errEl = document.getElementById('admin-pass-err');
    if (!np) { errEl.textContent = 'Enter a new password'; return; }
    if (np !== cp) { errEl.textContent = 'Passwords do not match'; return; }
    if (np.length < 6) { errEl.textContent = 'Password must be at least 6 characters'; return; }
    errEl.textContent = '';
    const hash = await Utils.sha256(np);
    sessionStorage.setItem('rou_bot_adminHash', hash);
    DB.set('admin_hash', hash);
    const s = DB.get('settings') || {};
    if (s.adminPasswordHash) { delete s.adminPasswordHash; DB.set('settings', s); }
    document.getElementById('admin-new-pass').value = '';
    document.getElementById('admin-confirm-pass').value = '';
    toast('Password updated!', 'success');
  },

  resetClient() {
    const clients = DB.get('clients') || [];
    if (!clients.length) { toast('No companies to reset', 'error'); return; }
    const name = clients.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
    const idx = parseInt(prompt(`Which client to reset? Enter number:\n${name}`)) - 1;
    if (isNaN(idx) || idx < 0 || idx >= clients.length) { toast('Cancelled', 'info'); return; }
    const client = clients[idx];
    if (!confirm(`Reset all ROUs for "${client.name}"? This cannot be undone.`)) return;
    DB.set('rous_' + client.id, []);
    toast(`All ROUs for "${client.name}" deleted`, 'success');
    if (App.currentClient?.id === client.id) App.renderDashboard();
    this.loadStats();
  },

  deleteClient() {
    const clients = DB.get('clients') || [];
    if (!clients.length) { toast('No companies to delete', 'error'); return; }
    
    const name = clients.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
    const idx = parseInt(prompt(`Which company to DELETE permanently? Enter number:\n${name}`)) - 1;
    if (isNaN(idx) || idx < 0 || idx >= clients.length) { toast('Cancelled', 'info'); return; }
    
    const client = clients[idx];
    const confirmText = prompt(`⚠️ WARNING: This will PERMANENTLY DELETE the company "${client.name}" and ALL its data.\n\nType the company name exactly to confirm deletion:`);
    
    if (confirmText !== client.name) {
      toast('Deletion cancelled - name did not match', 'info');
      return;
    }
    
    // Delete all ROUs for this client
    DB.remove('rous_' + client.id);
    
    // Remove client from clients list
    clients.splice(idx, 1);
    DB.set('clients', clients);
    
    toast(`Company "${client.name}" and all its data have been permanently deleted`, 'success');
    
    // If we just deleted the current client, redirect to home
    if (App.currentClient?.id === client.id) {
      App.currentClient = null;
      Modal.close('modal-admin-panel');
      document.getElementById('view-app').classList.remove('active');
      document.getElementById('view-home').classList.add('active');
      App.init();
    } else {
      this.loadStats();
    }
  },

  confirmResetAll() {
    const input = document.getElementById('reset-confirm-input').value.trim();
    if (input !== 'RESET') { toast('Type RESET in the box to confirm', 'error'); return; }
    if (!confirm('This will permanently delete ALL clients and ROU data. Are you absolutely sure?')) return;
    DB.keys().forEach(k => localStorage.removeItem(k));
    document.getElementById('reset-confirm-input').value = '';
    Modal.close('modal-admin-panel');
    toast('All data has been reset', 'info');
    App.currentClient = null;
    App.init();
    document.getElementById('view-app').classList.remove('active');
    document.getElementById('view-home').classList.add('active');
  }
};

// ════════════════════════════════════════════════════════════
// ACCOUNTING ENGINE - Ind AS 116 (arrears PV, monthlyRate = IBR/12/100)
