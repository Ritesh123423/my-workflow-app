window.LivePreview = {
  _timer: null,
  attach() {
    const ids = ['f-start','f-end','f-tenure','f-rent','f-ibr','f-interest-ibr','f-esc-type','f-esc-pct','f-esc-freq','f-secdep','f-secdep-ibr','f-secdep-interest-ibr',
                 'f-secdep-paid','f-secdep-maturity','f-secdep-unwind-start',
                 'f-pay-timing','f-idc','f-incentives','f-var-rent','f-has-opening','f-open-date','f-open-rou','f-open-accdep','f-open-liab'];
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => this.scheduleRefresh());
        el.addEventListener('change', () => this.scheduleRefresh());
      }
    });
    // Also watch custom steps table changes via delegation
    const stepsTable = document.getElementById('custom-steps-tbody');
    if (stepsTable) stepsTable.addEventListener('input', () => this.scheduleRefresh());
  },
  scheduleRefresh() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.refresh(), 300);
  },
  refresh() {
    const page = document.getElementById('page-add-rou');
    if (!page || page.style.display === 'none') return;

    const start = document.getElementById('f-start').value;
    const end = document.getElementById('f-end').value;
    const rent = parseFloat(document.getElementById('f-rent').value) || 0;
    const ibr = parseFloat(document.getElementById('f-ibr').value) || 0;

    if (!start || !end || !rent || !ibr || end <= start) {
      document.getElementById('rp-empty').style.display = '';
      document.getElementById('rp-content').style.display = 'none';
      return;
    }

    // Build a minimal ROU object for the engine
    const rou = {
      startDate: start, endDate: end, baseRent: rent, ibr: ibr,
      interestIBR: parseFloat(document.getElementById('f-interest-ibr')?.value) || 0,
      paymentTiming: document.getElementById('f-pay-timing')?.value || 'advance',
      escalationType: document.getElementById('f-esc-type').value,
      escalationPct: parseFloat(document.getElementById('f-esc-pct').value) || 0,
      escalationFreqMonths: parseInt(document.getElementById('f-esc-freq').value) || 12,
      customSteps: Form ? (Form.escStepBasis === 'period' ? [] : Form._collectCustomSteps()) : [],
      customStepsPeriod: Form ? (Form.escStepBasis === 'period' ? Form._collectCustomSteps() : []) : [],
      escStepBasis: Form ? Form.escStepBasis : 'month',
      scheduleBasis: Form ? Form._resolveScheduleBasis() : 'month',
      initialDirectCosts: parseFloat(document.getElementById('f-idc')?.value) || 0,
      leaseIncentives: parseFloat(document.getElementById('f-incentives')?.value) || 0,
      variableRentMonthly: parseFloat(document.getElementById('f-var-rent')?.value) || 0,
      hasMidLeaseOpening: document.getElementById('f-has-opening')?.checked || false,
      openingDate: document.getElementById('f-open-date')?.value || '',
      openingROUnbv: parseFloat(document.getElementById('f-open-rou')?.value) || 0,
      openingAccDep: parseFloat(document.getElementById('f-open-accdep')?.value) || 0,
      openingLeaseLiab: parseFloat(document.getElementById('f-open-liab')?.value) || 0,
      hasReassessment: false, reassessments: [],
      secDepAmount: parseFloat(document.getElementById('f-secdep')?.value) || 0,
      secDepIBR: parseFloat(document.getElementById('f-secdep-ibr')?.value) || 0,
      secDepInterestIBR: parseFloat(document.getElementById('f-secdep-interest-ibr')?.value) || 0,
      secDepPaidDate: document.getElementById('f-secdep-paid')?.value || '',
      secDepMaturityDate: document.getElementById('f-secdep-maturity')?.value || '',
      secDepUnwindStart: document.getElementById('f-secdep-unwind-start')?.value || 'month_start'
    };

    const fmt = n => '₹' + Math.round(n||0).toLocaleString('en-IN');
    try {
      const sch = Engine.compute(rou);
      if (sch.error) { document.getElementById('rp-empty').style.display=''; document.getElementById('rp-content').style.display='none'; return; }

      const N = sch.N;
      const liability = sch.initialLiability;
      const dep = sch.monthlyDep;
      const totalOutflow = sch.rows.reduce((s, r) => s + r.payment, 0);
      const totalInterest = sch.rows.reduce((s, r) => s + r.interest, 0);
      const firstRow = sch.rows[0];

      document.getElementById('rp-tenure').textContent = N;
      document.getElementById('rp-dep').textContent = fmt(dep);
      document.getElementById('rp-liability').textContent = fmt(liability);
      const rouCostEl = document.getElementById('rp-rou-cost');
      if (rouCostEl) rouCostEl.textContent = fmt(sch.computedRouCost || sch.rouCost);
      document.getElementById('rp-outflow').textContent = fmt(totalOutflow);
      document.getElementById('rp-interest').textContent = fmt(totalInterest);
      const timingTag = document.getElementById('rp-timing-tag');
      if (timingTag) {
        const pt = document.getElementById('f-pay-timing')?.value || 'advance';
        timingTag.textContent = (pt === 'advance' ? '↑ Advance payments' : '↓ Arrears payments') + ' · IBR ' + (sch.computedInitialLiability ? ((parseFloat(document.getElementById('f-ibr').value)||0)+'% p.a.') : '');
      }
      // Also refresh reassessment computed cards whenever main form changes
      if (Form && Form.refreshReassessmentComputeds) Form.refreshReassessmentComputeds();

      // Security deposit section
      const sdAmt = parseFloat(document.getElementById('f-secdep').value) || 0;
      const sdRow = document.getElementById('rp-secdep-row');
      if (sdAmt > 0 && sch.secDep) {
        const sd = sch.secDep;
        const difference = sd.notionalDiscount;
        document.getElementById('rp-sd-gross').textContent = fmt(sd.gross);
        document.getElementById('rp-sd-indas').textContent = fmt(sd.initialIndAS);
        document.getElementById('rp-sd-discount').textContent = fmt(difference);
        document.getElementById('rp-sd-prepaid').textContent = 'See SD columns';
        sdRow.style.display = '';
      } else {
        sdRow.style.display = 'none';
      }

      // Journal entries — adapts to commencement vs transition (resumed) leases.
      // Commencement: full Day-1 entries (lease recognition, SD, IDC, incentives) + recurring.
      // Transition (opening balances supplied): skip Day-1 — user has already booked those — show recurring only.
      const tbody = document.getElementById('rp-journal');
      if (firstRow) {
        const isTransition = sch.transitionMonth != null;
        const int1    = Engine.r2(firstRow.interest);
        const dep1    = Engine.r2(dep);
        const hasSd   = sdAmt > 0 && sch.secDep;
        const sd      = hasSd ? sch.secDep : null;
        const prepaid = sd ? sd.notionalDiscount : 0;
        const idc        = Engine.r2(sch.idc || 0);
        const incentives = Engine.r2(sch.incentives || 0);
        const varRent    = Engine.r2(sch.variableRentMonthly || 0);
        // Theoretical lease liability at commencement (PV of payments) — used for Day-1 entries.
        const liabPortion = Engine.r2(sch.computedInitialLiability || liability);
        // Gross ROU = liability + SD discount + IDC (before incentives are netted off).
        const grossROU = Engine.r2(liabPortion + prepaid + idc);
        // First-month SD unwinding (interest income)
        const sdInt1  = hasSd && sd.rows.length ? Engine.r2(sd.rows[0].interest) : 0;

        const row = (acc, dr, cr, indent, dim) => {
          const drCell = dr ? `<td style="text-align:right;padding:2px 0;color:${dim?'#94a3b8':'#1a56db'}">${fmt(dr)}</td>` : '<td></td>';
          const crCell = cr ? `<td style="text-align:right;padding:2px 0;color:#64748b">${fmt(cr)}</td>` : '<td></td>';
          return `<tr><td style="padding:2px 0;color:${dim?'#94a3b8':'#334155'};${indent?'padding-left:10px':''}">${acc}</td>${drCell}${crCell}</tr>`;
        };
        const divider = `<tr><td style="padding:2px 0;border-top:1px dashed #e2e8f0" colspan="3"></td></tr>`;
        const sectionHead = (label) => `<tr><td colspan="3" style="padding:4px 0 2px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--navy)">${label}</td></tr>`;

        let html = '';

        if (!isTransition) {
          // ── Commencement Day 1 ──────────────────────────────────
          html += sectionHead('On Commencement — Day 1');
          // Lease recognition (gross ROU before netting incentives)
          html += row('ROU Asset', grossROU, 0);
          html += row('Lease Liability', 0, liabPortion, true);
          if (prepaid > 0) html += row('Prepaid Rent (SD Discount)', 0, prepaid, true);
          if (idc > 0)     html += row('Bank (Initial Direct Costs)', 0, idc, true);
          // Lease incentive (Para 24b) — netted off ROU
          if (incentives > 0) {
            html += divider;
            html += row('Bank (Lease Incentive Received)', incentives, 0);
            html += row('ROU Asset', 0, incentives, true);
          }
          // SD payment
          if (hasSd) {
            html += divider;
            html += row('Sec Dep Asset (Ind AS PV)', sd.initialIndAS, 0);
            html += row('Prepaid Rent / Unamortised Disc.', prepaid, 0);
            html += row('Bank / Security Deposit Payable', 0, sdAmt, true);
          }
          html += divider;
        } else {
          html += sectionHead('Transition — Opening Balances Already Booked');
          html += row('ROU Asset (carrying)', Engine.r2(firstRow.openROU), 0, false, true);
          html += row('Lease Liability (carrying)', 0, Engine.r2(firstRow.openLiab), true, true);
          html += divider;
        }

        html += sectionHead(isTransition ? 'Current Month — Recurring' : 'Month 1 — Recurring');
        // Lease interest
        html += row('Finance Cost', int1, 0);
        html += row('Lease Liability', 0, int1, true);
        // SD unwinding (interest income)
        if (hasSd && sdInt1 > 0) {
          html += divider;
          html += row('Sec Dep Asset', sdInt1, 0);
          html += row('Interest Income (SD Unwinding)', 0, sdInt1, true);
        }
        // Depreciation
        html += divider;
        html += row('Depreciation', dep1, 0);
        html += row('Accum. Depreciation', 0, dep1, true);
        // Variable lease payment (Para 38) — disclosed separately, expensed as incurred
        if (varRent > 0) {
          html += divider;
          html += row('Variable Lease Expense (Para 38)', varRent, 0);
          html += row('Bank / Accrual', 0, varRent, true);
        }

        tbody.innerHTML = html;
      }

      document.getElementById('rp-empty').style.display = 'none';
      document.getElementById('rp-content').style.display = '';
    } catch(e) {
      document.getElementById('rp-empty').style.display = '';
      document.getElementById('rp-content').style.display = 'none';
    }
  }
};
