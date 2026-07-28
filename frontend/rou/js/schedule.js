window.Schedule = {
  current: null, fyFilter: '',
  render(rou) {
    this.current = rou; this.fyFilter = '';
    const sch = Engine.compute(rou);
    if (sch.error) { document.getElementById('schedule-content').innerHTML = `<div class="card"><div class="card-body">Error: ${sch.error}</div></div>`; return; }
    const period = DB.get('settings')?.period || rou.endDate;
    const pos = Engine.positionAt(rou, period, DB.get('settings')?.periodStart);
    const fys = [...new Set(sch.rows.map(r => r.fy))];

    document.getElementById('schedule-content').innerHTML = `
      <div class="card" style="margin-bottom:12px">
        <div class="card-header" style="padding:12px 16px"><h3>${rou.branchName} ${Utils.statusBadge(Utils.getStatus(rou))} ${
          Engine._effectiveScheduleBasis(rou) === 'calendar'
            ? '<span style="display:inline-block;background:#fffbeb;border:1px solid #fde68a;color:#78350f;font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;margin-left:6px" title="Calendar-aligned schedule: end-of-month dates, partial first/last months pro-rated by days. Controlled by Admin > Date & Escalation Defaults.">📆 Calendar Period</span>'
            : '<span style="display:inline-block;background:#f1f5f9;border:1px solid #cbd5e1;color:#475569;font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;margin-left:6px" title="Default month-bucket schedule: N equal lease-month buckets, no proration. Controlled by Admin > Date & Escalation Defaults.">📅 Default Mode</span>'
        }</h3>
        <button class="btn btn-ghost btn-sm" onclick="App.editROU('${rou.id}')">Edit</button></div>
        <div class="card-body" style="padding:14px 16px">
          <div class="sched-summary">
            <div class="sched-card"><div class="sc-label">Initial Liability (PV)</div><div class="sc-val">${Utils.fmt(sch.computedInitialLiability || sch.initialLiability)}</div><div class="sc-sub">sum of PV column</div></div>
            <div class="sched-card"><div class="sc-label">Closing Liability</div><div class="sc-val">${Utils.fmt(pos?pos.closingLiab:0)}</div><div class="sc-sub">as of ${Utils.fmtDate(period)}</div></div>
            <div class="sched-card"><div class="sc-label">ROU Net Block</div><div class="sc-val">${Utils.fmt(pos?pos.closingROU:0)}</div><div class="sc-sub">cost − acc. dep</div></div>
            <div class="sched-card"><div class="sc-label">Monthly Depreciation</div><div class="sc-val">${Utils.fmt(sch.monthlyDep)}</div><div class="sc-sub">straight-line · ${sch.Norig || sch.N} months</div></div>
          </div>
          <div class="sched-meta">
            <div class="sched-meta-item"><div class="label">Counterparty</div><div class="value">${rou.partyName || '-'}</div></div>
            <div class="sched-meta-item"><div class="label">Monthly Rent</div><div class="value">${Utils.fmt(rou.baseRent)}/mo</div></div>
            <div class="sched-meta-item"><div class="label">IBR</div><div class="value">${rou.ibr}%</div></div>
            <div class="sched-meta-item"><div class="label">Lease Period</div><div class="value">${Utils.fmtDate(rou.startDate)} - ${Utils.fmtDate(rou.endDate)}</div></div>
            ${sch.secDep
              ? `<div class="sched-meta-item"><div class="label">Security Deposit</div><div class="value">${Utils.fmt(sch.secDep.gross)}${sch.secDep.hasEscalation ? ' (Final)' : ''}</div><div class="form-hint" style="margin-top:2px">Ind AS Day 1: ${Utils.fmt(sch.secDep.initialIndAS)} · Method: ${sch.secDep.unwindFrom === 'month_end' ? 'End of 1st month' : 'Start of 1st month'}${sch.secDep.hasEscalation ? ' · Escalation: ' + (sch.secDep.escalationType === 'fixed' ? 'Fixed %' : 'Custom') : ''} · Calc: ${sch.secDep.calcMethod === 'gross_difference' ? 'Gross Diff' : 'PV Diff'}</div></div>`
              : `<div class="sched-meta-item"><div class="label">Security Deposit</div><div class="value">-</div></div>`
            }
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Amortisation Schedule</h3>
          <select class="form-select" style="width:160px" id="sched-fy-filter" onchange="Schedule.filterFY(this.value)">
            <option value="">All Financial Years</option>${fys.map(f=>`<option value="${f}">${f}</option>`).join('')}
          </select>
        </div>
        ${sch.liabilityAdjustment ? `
        <div style="background:#fff4ee;border-bottom:1px solid var(--border);padding:10px 16px;display:flex;align-items:center;gap:10px">
                    <div style="flex:1">
            <div style="font-size:11.5px;font-weight:600;color:var(--ebix);margin-bottom:2px">Automatic Adjustment Applied</div>
            <div style="font-size:11px;color:var(--text2);line-height:1.5">
              Interest in month ${sch.liabilityAdjustment.month} (${Utils.fmtDate(sch.liabilityAdjustment.date)}) adjusted by <strong>${Utils.fmt(sch.liabilityAdjustment.adjustmentAmount)}</strong> 
              (from ${Utils.fmt(sch.liabilityAdjustment.originalInterest)} to ${Utils.fmt(sch.liabilityAdjustment.adjustedInterest)}) 
              to ensure final lease liability closes at exactly ₹0. Original closing balance was ${Utils.fmt(sch.liabilityAdjustment.originalClosingBalance)}.
            </div>
          </div>
        </div>
        ` : ''}
        <div class="card-body" style="padding:0"><div class="table-wrap"><table class="sched-table">
          <thead>
            <tr class="group-head">
              <th colspan="5">Lease Info</th>
              <th colspan="4" class="group-start">Lease Liability</th>
              <th colspan="5" class="group-start">ROU Asset</th>
              <th colspan="8" class="group-start">Security Deposit</th>
            </tr>
            <tr>
              <th>#</th><th>Month</th><th>FY</th><th>Rent</th><th>PV of Payment</th>
              <th class="group-start">Open Liab</th><th>Interest</th><th>Payment</th><th>Close Liab</th>
              <th class="group-start">Open ROU</th><th>Dep'n</th><th>Close ROU</th><th>Acc Dep</th><th>NBV</th>
              <th class="group-start">SD Gross</th><th>SD Open</th><th>SD Interest</th><th>SD Close</th><th>SD PV</th><th>Discount Open</th><th>Discount Dep</th><th>Discount Close</th>
            </tr>
          </thead>
          <tbody id="sched-tbody"></tbody>
        </table></div></div>
      </div>`;
    this.renderRows();
  },
  filterFY(fy) { this.fyFilter = fy; this.renderRows(); },
  renderRows() {
    const rou = this.current;
    const sch = Engine.compute(rou);
    let rows = sch.rows;
    if (this.fyFilter) rows = rows.filter(r => r.fy === this.fyFilter);
    // Build sec dep lookup
    const sdMap = {};
    if (sch.secDep) sch.secDep.rows.forEach(sr => { sdMap[sr.date.toISOString().split('T')[0]] = sr; });
    const tb = document.getElementById('sched-tbody');
    tb.innerHTML = rows.map(r => {
      const dk = r.date.toISOString().split('T')[0];
      const sd = sdMap[dk];
      const sdCols = sd
        ? `<td class="mono group-start" style="color:var(--orange);font-weight:600">${Utils.fmt(sd.gross)}</td><td class="mono">${Utils.fmt(sd.open)}</td><td class="mono">${Utils.fmt(sd.interest)}</td><td class="mono">${Utils.fmt(sd.close)}</td><td class="mono" style="color:var(--accent)">${Utils.fmt(sd.pv)}</td><td class="mono">${Utils.fmt(sd.discountOpen)}</td><td class="mono">${Utils.fmt(sd.discountDep)}</td><td class="mono">${Utils.fmt(sd.discountClose)}</td>`
        : `<td class="mono group-start" style="color:var(--text3)">-</td><td class="mono" style="color:var(--text3)">-</td><td class="mono" style="color:var(--text3)">-</td><td class="mono" style="color:var(--text3)">-</td><td class="mono" style="color:var(--text3)">-</td><td class="mono" style="color:var(--text3)">-</td><td class="mono" style="color:var(--text3)">-</td><td class="mono" style="color:var(--text3)">-</td>`;
      return `<tr class="${r.reassess?'reassess-row':''}${r.isPartialMonth?' partial-row':''}">
        <td style="color:var(--text3);font-size:11px">${r.m}</td>
        <td style="font-size:12px;white-space:nowrap">${
          r.periodFrom && r.periodTo && r.daysInPeriod !== null
            ? `${Utils.fmtDate(r.date)}${r.isPartialMonth ? `<div style="font-size:10px;color:#b45309;font-weight:500">${Utils.fmtDate(r.periodFrom)} → ${Utils.fmtDate(r.periodTo)} <span style="background:#fef3c7;padding:1px 5px;border-radius:3px;font-size:9px">${r.daysInPeriod}/${r.daysInMonth} days</span></div>` : ''}`
            : Utils.fmtDate(r.date)
        }</td>
        <td style="font-size:10px;color:var(--text3)">${r.fy}</td>
        <td class="mono">${Utils.fmt(r.rent)}</td>
        <td class="mono" style="color:${r.isExtension?'var(--text3)':'var(--accent)'}${r.isExtension?';font-style:italic':''}" title="${r.isExtension?'Extension month — not in initial PV':'PV at commencement (sum = initial liability)'}">${r.isExtension?'—':Utils.fmt(r.pvPayment)}</td>
        <td class="mono group-start">${Utils.fmt(r.openLiab)}</td><td class="mono">${Utils.fmt(r.interest)}</td>
        <td class="mono">${Utils.fmt(r.payment)}</td><td class="mono">${Utils.fmt(r.closeLiab)}</td>
        <td class="mono group-start">${Utils.fmt(r.openROU)}</td><td class="mono">${Utils.fmt(r.dep)}</td>
        <td class="mono">${Utils.fmt(r.closeROU)}</td><td class="mono">${Utils.fmt(r.accDep)}</td>
        <td class="mono">${Utils.fmt(r.nbv)}</td>${sdCols}
      </tr>`;
    }).join('');
  }
};

// ════════════════════════════════════════════════════════════
// EXCEL EXPORTER - ExcelJS, live formulas + full formatting
