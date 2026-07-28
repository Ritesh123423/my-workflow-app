window.Utils = {
  uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },
  fmt(n) {
    if (n == null || n === '') return '-';
    return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  },
  fmtDate(d) {
    if (!d) return '-';
    const dt = new Date(d);
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  },
  fmtDateInput(d) {
    if (!d) return '';
    return new Date(d).toISOString().split('T')[0];
  },
  statusBadge(s) {
    const map = { Active: 'badge-green', Expired: 'badge-gray', Reassessed: 'badge-orange', Renewed: 'badge-blue' };
    const label = s === 'Expired' ? 'Expired' : (s || 'Unknown');
    return `<span class="badge ${map[s] || 'badge-gray'}">${label}</span>`;
  },
  
  // Calculate status dynamically based on current period
  getStatus(rou) {
    const s = DB.get('settings') || {};
    const period = s.period || new Date().toISOString().split('T')[0];
    const periodStart = s.periodStart || '';
    
    // Check for reassessments
    const hasReassess = rou.hasReassessment && rou.reassessments && rou.reassessments.length > 0;
    if (hasReassess) return 'Reassessed';
    
    // Check for manually set Renewed status
    if (rou.status === 'Renewed') return 'Renewed';
    
    // Check for manually set Expired (early termination)
    if (rou.status === 'Expired' && (!rou.endDate || rou.endDate > period)) {
      // User manually marked as expired even though end date is in future
      return 'Expired';
    }
    
    // Calculate based on end date and period
    if (rou.endDate) {
      if (periodStart && rou.endDate < periodStart) {
        // Ended before period start
        return 'Expired';
      } else if (rou.endDate > period) {
        // Ends after period end
        return 'Active';
      } else {
        // Ends during or at period end - still active during the period
        return 'Active';
      }
    }
    
    // No end date = perpetual = active
    return 'Active';
  },
  async sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  },
  initials(name) {
    return (name || '').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  },
  toCode(name) {
    return (name || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase();
  }
};

// ════════════════════════════════════════════════════════════
// MODAL MANAGER
