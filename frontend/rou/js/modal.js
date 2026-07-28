window.Modal = {
  open(id) { document.getElementById(id).classList.add('open'); },
  close(id) { document.getElementById(id).classList.remove('open'); },
  openAddClient() {
    document.getElementById('new-client-name').value = '';
    document.getElementById('new-client-code').value = '';
    document.getElementById('new-client-ibr').value = '9';
    document.getElementById('new-client-prepared-by').value = '';
    document.getElementById('new-client-address').value = '';
    document.getElementById('new-client-name-err').textContent = '';
    document.getElementById('new-client-address-err').textContent = '';
    // auto-fill code on name input
    document.getElementById('new-client-name').oninput = function() {
      document.getElementById('new-client-code').value = Utils.toCode(this.value);
    };
    this.open('modal-add-client');
    setTimeout(() => document.getElementById('new-client-name').focus(), 100);
  },
  openAdminLogin() {
    document.getElementById('admin-password-input').value = '';
    document.getElementById('admin-login-err').textContent = '';
    // Show first-time hint if no password has been set
    const storedHash = sessionStorage.getItem('rou_bot_adminHash') || DB.get('admin_hash');
    const hint = document.getElementById('admin-firsttime-hint');
    if (hint) hint.style.display = storedHash ? 'none' : 'block';
    this.open('modal-admin-login');
    setTimeout(() => document.getElementById('admin-password-input').focus(), 100);
  },
  openAdminPanel() {
    Admin.loadStats();
    Admin.switchTab('company');
    this.open('modal-admin-panel');
  },
  openPeriodSelector() {
    const s = DB.get('settings') || {};
    document.getElementById('period-start-input').value = s.periodStart || '';
    document.getElementById('period-end-input').value = s.period || '';
    // Build quick-select FY buttons
    const btn_wrap = document.getElementById('period-quick-btns');
    btn_wrap.innerHTML = '';
    const now = new Date();
    const curSY = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    for (let sy = curSY - 2; sy <= curSY + 2; sy++) {
      const ey = sy + 1;
      const b = document.createElement('button');
      b.className = 'btn btn-ghost btn-sm';
      b.textContent = `${sy}-${String(ey).slice(-2)}`;
      b.onclick = () => App.onQuickFY(sy, ey);
      btn_wrap.appendChild(b);
    }
    App._updatePeriodLabel();
    // Add listeners
    document.getElementById('period-start-input').oninput = App._updatePeriodLabel;
    document.getElementById('period-end-input').oninput = App._updatePeriodLabel;
    this.open('modal-period');
  }
};

// ════════════════════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════════════════════
window.toast = function toast(msg, type = 'info', duration = 3000) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  el.innerHTML = `<span>${icons[type] || 'ℹ'}</span> <span>${msg}</span>`;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), duration);
}
