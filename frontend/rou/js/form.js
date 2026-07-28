window.Form = {
  endMode: 'date',
  customStepRows: 0,
  reassessRows: 0,

  reset() {
    document.getElementById('rou-edit-id').value = '';
    document.getElementById('add-rou-title').textContent = 'Add New ROU';
    ['f-branch', 'f-party', 'f-address', 'f-start', 'f-end', 'f-tenure', 'f-rent', 'f-esc-pct', 'f-esc-freq',
     'f-secdep', 'f-secdep-paid', 'f-secdep-maturity', 'f-secdep-esc-pct', 'f-secdep-esc-freq', 'f-secdep-esc-first',
     'f-open-date', 'f-open-rou', 'f-open-accdep',
     'f-open-liab', 'f-open-sdindas', 'f-open-sdgross',
     'f-idc', 'f-incentives', 'f-var-rent'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
    document.getElementById('f-status').value = 'Active';
    document.getElementById('f-ibr').value = App.currentClient?.defaultIBR || 9;
    document.getElementById('f-secdep-ibr').value = App.currentClient?.defaultIBR || 9;
    const unwindStart = document.getElementById('f-secdep-unwind-start');
    if (unwindStart) unwindStart.value = 'month_start';
    const calcMethod = document.getElementById('f-secdep-calc-method');
    if (calcMethod) calcMethod.value = 'gross_difference';
    document.getElementById('f-esc-type').value = 'none';
    document.getElementById('f-secdep-esc-type').value = 'none';
    // Step basis defaults to the current client's admin-configured default (Settings > Date & Escalation Defaults)
    this.escStepBasis = (App.currentClient?.defaultEscStepBasis === 'period') ? 'period' : 'month';
    this.sdEscStepBasis = (App.currentClient?.defaultEscStepBasis === 'period') ? 'period' : 'month';
    // For new ROUs, clear the stored schedule basis — save path will derive it from admin default.
    this._loadedScheduleBasis = undefined;
    this._updateScheduleBasisBanner();
    const escThead = document.getElementById('custom-steps-thead');
    if (escThead) escThead.innerHTML = this.escStepBasis === 'period'
      ? '<tr><th>From Date</th><th>To Date</th><th>Monthly Rent (Rs.)</th><th></th></tr>'
      : '<tr><th>From Month</th><th>To Month</th><th>Monthly Rent (Rs.)</th><th></th></tr>';
    const sdThead = document.getElementById('secdep-custom-steps-thead');
    if (sdThead) sdThead.innerHTML = this.sdEscStepBasis === 'period'
      ? '<tr><th>From Date</th><th>To Date</th><th>SD Amount (Rs.)</th><th></th></tr>'
      : '<tr><th>From Month</th><th>To Month</th><th>SD Amount (Rs.)</th><th></th></tr>';
    const escBM = document.getElementById('f-esc-basis-month'), escBP = document.getElementById('f-esc-basis-period');
    if (escBM && escBP) { escBM.classList.toggle('active', this.escStepBasis === 'month'); escBP.classList.toggle('active', this.escStepBasis === 'period'); }
    const sdBM = document.getElementById('f-sdesc-basis-month'), sdBP = document.getElementById('f-sdesc-basis-period');
    if (sdBM && sdBP) { sdBM.classList.toggle('active', this.sdEscStepBasis === 'month'); sdBP.classList.toggle('active', this.sdEscStepBasis === 'period'); }
    document.getElementById('f-tenure-display').value = '';
    const pt = document.getElementById('f-pay-timing'); if (pt) pt.value = 'advance';
    document.getElementById('f-has-opening').checked = false;
    document.getElementById('f-has-reassess').checked = false;
    document.getElementById('f-has-options').checked = false;
    const lt = document.getElementById('f-lease-type'); if (lt) lt.value = 'full';
    const ot = document.getElementById('f-option-type'); if (ot) ot.value = 'renewal';
    const oc = document.getElementById('f-option-certainty'); if (oc) oc.value = 'not-included';
    const or_ = document.getElementById('f-option-rationale'); if (or_) or_.value = '';
    document.getElementById('custom-steps-tbody').innerHTML = '';
    document.getElementById('secdep-custom-steps-tbody').innerHTML = '';
    document.getElementById('reassess-list').innerHTML = '';
    
    // Clear computed initial liability
    this.clearComputedLiability();
    
    this.setEndMode('date');
    this.onEscChange(); this.onSecDepChange(); this.onSDEscChange(); this.toggleOpening(); this.toggleReassess(); this.toggleOptions(); this.toggleAdjustments(); this.onLeaseTypeChange();
    ['f-branch-err','f-start-err','f-rent-err','f-ibr-err'].forEach(id => { const e=document.getElementById(id); if(e) e.textContent=''; });
  },

  // Clear the computed initial liability field
  clearComputedLiability() {
    const computedField = document.getElementById('f-computed-init-liab');
    if (computedField) {
      computedField.value = '';
      delete computedField.dataset.computedValue;
    }
  },

  setEndMode(mode) {
    this.endMode = mode;
    document.getElementById('f-endmode-date').classList.toggle('active', mode === 'date');
    document.getElementById('f-endmode-tenure').classList.toggle('active', mode === 'tenure');
    document.getElementById('f-enddate-wrap').style.display = mode === 'date' ? '' : 'none';
    document.getElementById('f-tenure-wrap').style.display = mode === 'tenure' ? '' : 'none';
  },
  syncTenure() {
    const s = document.getElementById('f-start').value, e = document.getElementById('f-end').value;
    if (s && e) {
      const n = Engine.monthsBetween(new Date(s), new Date(e)) + 1;
      document.getElementById('f-tenure-display').value = n > 0 ? `${n} months (${(n/12).toFixed(1)} yrs)` : '-';
    }
    this.clearComputedLiability();
  },
  syncEndDate() {
    const s = document.getElementById('f-start').value, t = parseInt(document.getElementById('f-tenure').value);
    if (s && t) {
      const end = Engine.addMonths(new Date(s), t - 1);
      document.getElementById('f-end').value = end.toISOString().split('T')[0];
      document.getElementById('f-tenure-display').value = `${t} months (${(t/12).toFixed(1)} yrs)`;
    }
    this.clearComputedLiability();
  },
  onLeaseTypeChange() {
    const t = document.getElementById('f-lease-type').value;
    const hint = document.getElementById('f-lease-type-hint');
    const fullSections = ['f-section-options'];
    if (t === 'full') {
      hint.style.display = 'none';
      fullSections.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = ''; });
    } else {
      hint.style.display = '';
      hint.textContent = t === 'short-term'
        ? 'Para 5(a): Lease payments expensed straight-line. No ROU asset or lease liability recognised.'
        : 'Para 5(b): Lease payments expensed straight-line. No ROU asset or lease liability recognised.';
      fullSections.forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    }
  },
  toggleOptions() {
    document.getElementById('f-options-block').hidden = !document.getElementById('f-has-options').checked;
  },
  toggleAdjustments() {
    document.getElementById('f-adjustments-block').hidden = !document.getElementById('f-has-adjustments').checked;
  },
  onEscChange() {
    const t = document.getElementById('f-esc-type').value;
    // New layout: fixed params shown inline in f-esc-fixed-row; f-esc-fixed kept as compat dummy
    const fixedRow = document.getElementById('f-esc-fixed-row');
    if (fixedRow) fixedRow.style.display = t === 'fixed' ? '' : 'none';
    const fixedEl = document.getElementById('f-esc-fixed'); if (fixedEl) fixedEl.hidden = true;
    document.getElementById('f-esc-custom').hidden = t !== 'custom';
    if (t === 'custom' && !document.getElementById('custom-steps-tbody').children.length) this.addCustomStep();
    this.clearComputedLiability();
  },
  // Switch the Rent custom-steps table between Month-Number basis (current/default) and
  // Calendar-Period basis. Re-renders the table header and existing rows in the new format.
  // Existing data for the basis NOT in use is preserved on the rou object until saved.
  escStepBasis: 'month',
  // Tracks the ROU's stored scheduleBasis ('month' or 'calendar' or undefined). Set on load() of
  // existing ROUs; reset to undefined on reset() for new ROUs. Calendar scheduling is admin-driven:
  // for new ROUs the value is derived at save time from the client's defaultEscStepBasis; for
  // existing ROUs the saved value is preserved (so editing an old month-mode ROU does NOT
  // silently switch it to calendar even if the user toggles the form's step-format selector).
  _loadedScheduleBasis: undefined,
  // Resolves the schedule basis to save with a ROU. Editing an existing ROU preserves whatever
  // was stored (or 'month' for legacy data with no field). New ROUs inherit the client's
  // admin-configured default ('calendar' when admin picked Calendar Period, else 'month'),
  // so calendar scheduling activates ONLY by admin selection and never instantly via the form.
  // Show/hide the calendar-mode banner in the Add/Edit ROU form based on what will be saved.
  // Called whenever the resolved schedule basis could change (reset, load).
  // Note: the banner reflects the EFFECTIVE basis (admin's current setting), since admin is
  // the master control — flipping admin to Default will revert this ROU to default behaviour
  // even if it was originally saved with calendar basis.
  _updateScheduleBasisBanner() {
    const banner = document.getElementById('schedule-basis-banner');
    if (!banner) return;
    const adminBasis = App.currentClient?.defaultEscStepBasis === 'period' ? 'calendar' : 'month';
    banner.style.display = adminBasis === 'calendar' ? '' : 'none';
  },
  _resolveScheduleBasis() {
    if (this._loadedScheduleBasis !== undefined) {
      // Editing an existing ROU — preserve what was saved (including legacy '' / undefined which
      // means month-mode behaviour). Re-saving an old ROU never silently flips it to calendar.
      return this._loadedScheduleBasis || 'month';
    }
    // New ROU — driven purely by admin's "Date & Escalation Defaults" setting.
    return (App.currentClient?.defaultEscStepBasis === 'period') ? 'calendar' : 'month';
  },
  setEscStepBasis(basis) {
    if (this.escStepBasis === basis) return;
    this.escStepBasis = basis;
    document.getElementById('f-esc-basis-month').classList.toggle('active', basis === 'month');
    document.getElementById('f-esc-basis-period').classList.toggle('active', basis === 'period');
    const thead = document.getElementById('custom-steps-thead');
    thead.innerHTML = basis === 'period'
      ? '<tr><th>From Date</th><th>To Date</th><th>Monthly Rent (Rs.)</th><th></th></tr>'
      : '<tr><th>From Month</th><th>To Month</th><th>Monthly Rent (Rs.)</th><th></th></tr>';
    document.getElementById('custom-steps-tbody').innerHTML = '';
    this.addCustomStep();
    this.updateCustomStepsPreview();
  },

  // Live preview: shows how Calendar-Period date ranges resolve to month numbers,
  // so the user can SEE the conversion is working. Only visible in 'period' basis mode.
  updateCustomStepsPreview() {
    const box = document.getElementById('custom-steps-preview');
    if (!box) return;
    if (this.escStepBasis !== 'period') { box.style.display = 'none'; return; }
    const start = document.getElementById('f-start').value;
    if (!start) {
      box.style.display = 'block';
      box.innerHTML = '<strong>Preview:</strong> Set the lease Start Date above to see how period dates convert to month numbers.';
      return;
    }
    const rows = [...document.querySelectorAll('#custom-steps-tbody tr')];
    const lines = rows.map((tr, i) => {
      const fd = tr.querySelector('.cs-from-date')?.value;
      const td = tr.querySelector('.cs-to-date')?.value;
      const rent = tr.querySelector('.cs-rent')?.value;
      if (!fd || !td) return `Step ${i+1}: <em>enter both dates</em>`;
      const fm = Engine.dateToMonthIndex(start, fd);
      const tm = Engine.dateToMonthIndex(start, td);
      const rentTxt = rent ? ` @ Rs.${Number(rent).toLocaleString('en-IN')}` : '';
      return `Step ${i+1}: ${Utils.fmtDate(fd)} → ${Utils.fmtDate(td)} = <strong>Months ${Math.max(1,fm)}–${Math.max(1,tm)}</strong>${rentTxt}`;
    });
    box.style.display = 'block';
    box.innerHTML = '<strong>Live preview (date → month conversion):</strong><br>' + (lines.length ? lines.join('<br>') : '<em>add a step to see preview</em>');
  },
  onSecDepChange() {
    // New layout shows all SD fields always; no hide/show needed
    const v = parseFloat(document.getElementById('f-secdep').value) || 0;
    // keep f-secdep-dates hidden (compat) — actual fields are always visible
    const legacy = document.getElementById('f-secdep-dates'); if (legacy) legacy.style.display = 'none';
    if (v > 0) {
      const paid = document.getElementById('f-secdep-paid');
      const mat = document.getElementById('f-secdep-maturity');
      if (paid && !paid.value) paid.value = document.getElementById('f-start').value || '';
      if (mat  && !mat.value)  mat.value  = document.getElementById('f-end').value   || '';
    }
  },
  onSDEscChange() {
    const t = document.getElementById('f-secdep-esc-type').value;
    document.getElementById('f-secdep-esc-fixed-block').hidden = t !== 'fixed';
    document.getElementById('f-secdep-esc-custom-block').hidden = t !== 'custom';
    if (t === 'custom' && !document.getElementById('secdep-custom-steps-tbody').children.length) {
      this.addSDCustomStep();
    }
  },
  // Switch the SD custom-steps table between Month-Number basis (current/default) and
  // Calendar-Period basis — mirrors setEscStepBasis for the rent escalation table.
  sdEscStepBasis: 'month',
  setSDEscStepBasis(basis) {
    if (this.sdEscStepBasis === basis) return;
    this.sdEscStepBasis = basis;
    document.getElementById('f-sdesc-basis-month').classList.toggle('active', basis === 'month');
    document.getElementById('f-sdesc-basis-period').classList.toggle('active', basis === 'period');
    const thead = document.getElementById('secdep-custom-steps-thead');
    thead.innerHTML = basis === 'period'
      ? '<tr><th>From Date</th><th>To Date</th><th>SD Amount (Rs.)</th><th></th></tr>'
      : '<tr><th>From Month</th><th>To Month</th><th>SD Amount (Rs.)</th><th></th></tr>';
    document.getElementById('secdep-custom-steps-tbody').innerHTML = '';
    this.addSDCustomStep();
    this.updateSDCustomStepsPreview();
  },

  // Live preview for Security Deposit custom steps when in Calendar-Period basis mode.
  updateSDCustomStepsPreview() {
    const box = document.getElementById('secdep-custom-steps-preview');
    if (!box) return;
    if (this.sdEscStepBasis !== 'period') { box.style.display = 'none'; return; }
    const start = document.getElementById('f-start').value;
    if (!start) {
      box.style.display = 'block';
      box.innerHTML = '<strong>Preview:</strong> Set the lease Start Date above to see how period dates convert to month numbers.';
      return;
    }
    const rows = [...document.querySelectorAll('#secdep-custom-steps-tbody tr')];
    const lines = rows.map((tr, i) => {
      const fd = tr.querySelector('.sdcs-from-date')?.value;
      const td = tr.querySelector('.sdcs-to-date')?.value;
      const amt = tr.querySelector('.sdcs-amount')?.value;
      if (!fd || !td) return `Step ${i+1}: <em>enter both dates</em>`;
      const fm = Engine.dateToMonthIndex(start, fd);
      const tm = Engine.dateToMonthIndex(start, td);
      const amtTxt = amt ? ` @ Rs.${Number(amt).toLocaleString('en-IN')}` : '';
      return `Step ${i+1}: ${Utils.fmtDate(fd)} → ${Utils.fmtDate(td)} = <strong>Months ${Math.max(1,fm)}–${Math.max(1,tm)}</strong>${amtTxt}`;
    });
    box.style.display = 'block';
    box.innerHTML = '<strong>Live preview (date → month conversion):</strong><br>' + (lines.length ? lines.join('<br>') : '<em>add a step to see preview</em>');
  },
  addSDCustomStep(data) {
    const tb = document.getElementById('secdep-custom-steps-tbody');
    const tr = document.createElement('tr');
    if (this.sdEscStepBasis === 'period') {
      tr.innerHTML = `<td><input type="date" class="sdcs-from-date" value="${data?.fromDate ?? ''}" oninput="Form.updateSDCustomStepsPreview()"></td>
      <td><input type="date" class="sdcs-to-date" value="${data?.toDate ?? ''}" oninput="Form.updateSDCustomStepsPreview()"></td>
      <td><input type="number" min="0" step="0.01" class="sdcs-amount" value="${data?.amount ?? ''}" placeholder="200000" oninput="Form.updateSDCustomStepsPreview()"></td>
      <td><button class="row-del" onclick="this.closest('tr').remove();Form.updateSDCustomStepsPreview()">✕</button></td>`;
    } else {
      tr.innerHTML = `<td><input type="number" min="1" class="sdcs-from" value="${data?.fromMonth ?? ''}" placeholder="1"></td>
      <td><input type="number" min="1" class="sdcs-to" value="${data?.toMonth ?? ''}" placeholder="12"></td>
      <td><input type="number" min="0" step="0.01" class="sdcs-amount" value="${data?.amount ?? ''}" placeholder="200000"></td>
      <td><button class="row-del" onclick="this.closest('tr').remove()">✕</button></td>`;
    }
    tb.appendChild(tr);
    this.updateSDCustomStepsPreview();
  },
  toggleOpening() { document.getElementById('f-opening-block').hidden = !document.getElementById('f-has-opening').checked; },

  // Auto-compute initial lease liability (PV of all payments at IBR discount rate)
  autoComputeInitialLiability() {
    const rou = this._collectForPreview();
    if (!rou) {
      alert('Please fill in the basic lease details first (Start, End, Rent, IBR).');
      return;
    }
    
    const N = Engine.tenureOriginalOf(rou);
    if (!N || N < 1) {
      alert('Invalid tenure. Please check start and end dates.');
      return;
    }
    
    const rentSched = Engine.buildRentSchedule(rou, N, { applyReassessments: false });
    const baseRate = parseFloat(rou.ibr) || 9;
    const baseR = baseRate / 12 / 100;
    const isAdvance = rou.paymentTiming === 'advance';
    
    let pv = 0;
    for (let m = 1; m <= N; m++) {
      const exp = isAdvance ? (m - 1) : m;
      pv += rentSched[m] / Math.pow(1 + baseR, exp);
    }
    
    const initialLiab = Engine.r2(pv);
    
    // Display the computed value
    const displayField = document.getElementById('f-computed-init-liab');
    displayField.value = initialLiab.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    
    // Store the numeric value for Goal Seek to use
    displayField.dataset.computedValue = initialLiab;
    
    console.log('Initial Lease Liability computed:', initialLiab, 'for tenure:', N, 'months at IBR:', baseRate + '%');
    
    UI.toast(`Initial Lease Liability: ₹${initialLiab.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`, 'success');
  },

  // Auto-calculate opening lease liability from PV of remaining lease payments at opening date
  autoCalcOpeningLiability() {
    const openDate = document.getElementById('f-open-date').value;
    if (!openDate) {
      alert('Please enter the Opening Date first.');
      return;
    }
    
    // Collect current form data for calculation
    const rou = this._collectForPreview();
    if (!rou) {
      alert('Please fill in the basic lease details first (Branch, Start, End/Tenure, Rent, IBR).');
      return;
    }
    
    // Set the opening date and recalculate
    rou.openingDate = openDate;
    rou.hasOpening = true;
    
    // Compute the full schedule
    const sch = Engine.compute(rou);
    if (sch.error) {
      alert('Error computing schedule: ' + sch.error);
      return;
    }
    
    // Find the opening balance at the opening date
    // Sum PV of all remaining payments from opening date onwards
    const od = new Date(openDate);
    const pvRate = (parseFloat(rou.ibr) || 0) / 100 / 12;  // monthly discount rate
    
    let openingLiab = 0;
    let foundOpeningRow = false;
    
    // Find the exact row matching or just after opening date
    for (let i = 0; i < sch.rows.length; i++) {
      const row = sch.rows[i];
      const rowDate = new Date(row.date);
      
      // Use opening liability from the row at or just before opening date
      if (rowDate <= od) {
        openingLiab = row.openLiab;
        foundOpeningRow = true;
      } else if (foundOpeningRow) {
        // We've found the opening row and now moved past it
        break;
      }
    }
    
    if (!foundOpeningRow || openingLiab === 0) {
      // Alternative: sum PV of remaining payments
      let pvSum = 0;
      let monthsFromOpening = 0;
      
      sch.rows.forEach(row => {
        const rowDate = new Date(row.date);
        if (rowDate >= od && row.payment > 0) {
          monthsFromOpening++;
          // Calculate PV of this payment from opening date
          const pv = row.payment / Math.pow(1 + pvRate, monthsFromOpening);
          pvSum += pv;
        }
      });
      
      openingLiab = Engine.r2(pvSum);
    }
    
    // Update the field
    document.getElementById('f-open-liab').value = openingLiab.toFixed(2);
    
    // Show success message
    UI.toast(`Opening Lease Liability calculated: ₹${openingLiab.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`, 'success');
  },
  // Goal Seek: compute and fill the lease interest (unwind) rate automatically
  applyGoalSeekLease() {
    const cb  = document.getElementById('f-interest-ibr-auto');
    const inp = document.getElementById('f-interest-ibr');
    if (!cb || !inp) return;
    if (!cb.checked) {
      inp.value = '';
      inp.readOnly = false;
      inp.style.cssText = '';
      return;
    }
    
    const rou = this._collectForPreview();
    if (!rou) { cb.checked = false; return; }
    
    // Debug: log what we collected
    console.log('Collected ROU data:', {
      startDate: rou.startDate,
      endDate: rou.endDate,
      tenureMonths: rou.tenureMonths,
      baseRent: rou.baseRent,
      escalationType: rou.escalationType,
      customSteps: rou.customSteps
    });
    
    const rate = Engine.goalSeekLeaseRate(rou);
    if (rate == null || isNaN(rate)) {
      cb.checked = false;
      alert('Could not compute interest rate.\nPlease verify your lease parameters and try again.');
      return;
    }
    
    inp.value = rate.toFixed(12);
    inp.readOnly = true;
    inp.style.background = '#f0fdf4';
    inp.style.color = '#065f46';
    inp.style.fontWeight = '600';
    
    // Show toast if UI exists
    if (typeof UI !== 'undefined' && UI.toast) {
      UI.toast(`Interest rate: ${rate.toFixed(12)}% p.a. (amortizes liability to zero)`, 'success');
    }
    
    if (typeof Form.refreshLivePreview === 'function') Form.refreshLivePreview();
  },

  // Goal Seek: compute and fill the SD unwinding rate automatically
  applyGoalSeekSD() {
    const cb  = document.getElementById('f-secdep-interest-ibr-auto');
    const inp = document.getElementById('f-secdep-interest-ibr');
    if (!cb || !inp) return;
    if (!cb.checked) {
      inp.value = '';
      inp.readOnly = false;
      inp.style.cssText = '';
      return;
    }
    const rou = this._collectForPreview();
    if (!rou) { cb.checked = false; return; }
    const rate = Engine.goalSeekSDRate(rou);
    if (rate == null || isNaN(rate)) {
      cb.checked = false;
      alert('Could not compute — please check Deposit Amount, Discount Rate and Dates first.');
      return;
    }
    inp.value = rate.toFixed(12);
    inp.readOnly = true;
    inp.style.background = '#f0fdf4';
    inp.style.color = '#065f46';
    inp.style.fontWeight = '600';
    if (typeof Form.refreshLivePreview === 'function') Form.refreshLivePreview();
  },
  toggleReassess() {
    const on = document.getElementById('f-has-reassess').checked;
    document.getElementById('f-reassess-block').hidden = !on;
    if (on && !document.getElementById('reassess-list').children.length) this.addReassessment();
  },
  addCustomStep(data) {
    const tb = document.getElementById('custom-steps-tbody');
    const tr = document.createElement('tr');
    if (this.escStepBasis === 'period') {
      tr.innerHTML = `<td><input type="date" class="cs-from-date" value="${data?.fromDate ?? ''}" oninput="Form.updateCustomStepsPreview()"></td>
      <td><input type="date" class="cs-to-date" value="${data?.toDate ?? ''}" oninput="Form.updateCustomStepsPreview()"></td>
      <td><input type="number" min="0" step="0.01" class="cs-rent" value="${data?.rent ?? ''}" placeholder="100000" oninput="Form.updateCustomStepsPreview()"></td>
      <td><button class="row-del" onclick="this.closest('tr').remove();Form.updateCustomStepsPreview()">✕</button></td>`;
    } else {
      tr.innerHTML = `<td><input type="number" min="1" class="cs-from" value="${data?.fromMonth ?? ''}" placeholder="1"></td>
      <td><input type="number" min="1" class="cs-to" value="${data?.toMonth ?? ''}" placeholder="12"></td>
      <td><input type="number" min="0" step="0.01" class="cs-rent" value="${data?.rent ?? ''}" placeholder="100000"></td>
      <td><button class="row-del" onclick="this.closest('tr').remove()">✕</button></td>`;
    }
    tb.appendChild(tr);
    this.updateCustomStepsPreview();
  },
  addReassessment(data) {
    const list = document.getElementById('reassess-list');
    const idx  = list.children.length + 1;
    const div  = document.createElement('div');
    div.className = 'rc2';

    const typeOpts = [
      ['modification', 'Lease modification — Para 46(c)  (term, rent or IBR change)'],
      ['revision',     'Rent / IBR revision only'],
      ['termination',  'Partial or early termination']
    ].map(([v,l]) => `<option value="${v}"${(data?.type||'modification')===v?' selected':''}>${l}</option>`).join('');

    div.innerHTML = `
      <div class="rc2-hdr">
        <span class="rc2-num">Modification Event ${idx}</span>
        <button class="rc2-del" onclick="this.closest('.rc2').remove();Form.refreshReassessmentComputeds()">Remove</button>
      </div>

      <div class="g4" style="margin-bottom:12px">
        <div class="form-row" style="margin-bottom:0">
          <label class="form-label">Modification Date <span class="req">*</span></label>
          <input class="form-input ra-date" type="date" value="${data?.date||''}" oninput="Form.refreshReassessmentComputeds()">
          <div class="form-hint">Date the lease is modified</div>
        </div>
        <div class="form-row" style="margin-bottom:0">
          <label class="form-label">New Monthly Rent (Rs.)</label>
          <input class="form-input ra-rent" type="number" step="0.01" value="${data?.newRent??''}" placeholder="Leave blank if unchanged" oninput="Form.refreshReassessmentComputeds()">
          <div class="form-hint">Revised rent from modification date</div>
        </div>
        <div class="form-row" style="margin-bottom:0">
          <label class="form-label">Revised IBR (% p.a.) <span class="req">*</span></label>
          <input class="form-input ra-ibr" type="number" step="0.01" value="${data?.newIBR??''}" placeholder="e.g. 9.5" oninput="Form.refreshReassessmentComputeds()">
          <div class="form-hint">Rate used for remeasurement</div>
        </div>
        <div class="form-row" style="margin-bottom:0">
          <label class="form-label">New Lease End Date</label>
          <input class="form-input ra-end" type="date" value="${data?.newEndDate||''}" oninput="Form.refreshReassessmentComputeds()">
          <div class="form-hint">Only if the lease term changes</div>
        </div>
      </div>

      <div class="g4" style="margin-bottom:12px">
        <div class="form-row" style="margin-bottom:0">
          <label class="form-label">Modification Type</label>
          <select class="form-select ra-type" onchange="Form.refreshReassessmentComputeds()">${typeOpts}</select>
        </div>
        <div class="form-row" style="margin-bottom:0">
          <label class="form-label">Override Pre-Mod Liability (Rs.)</label>
          <input class="form-input ra-override-liab" type="number" step="0.01" value="${data?.overrideLiab??''}" placeholder="Auto-computed if blank" oninput="Form.refreshReassessmentComputeds()">
          <div class="form-hint">Use if book value differs from schedule</div>
        </div>
        <div class="form-row" style="margin-bottom:0">
          <label class="form-label">Override Pre-Mod ROU NBV (Rs.)</label>
          <input class="form-input ra-override-rou" type="number" step="0.01" value="${data?.overrideROU??''}" placeholder="Auto-computed if blank" oninput="Form.refreshReassessmentComputeds()">
          <div class="form-hint">ROU carrying value at modification date</div>
        </div>
        <div class="form-row" style="margin-bottom:0">
          <label class="form-label">Override SD Carrying Value (Rs.)</label>
          <input class="form-input ra-override-sd" type="number" step="0.01" value="${data?.overrideSD??''}" placeholder="Auto-computed if blank" oninput="Form.refreshReassessmentComputeds()">
          <div class="form-hint">Security deposit Ind AS value at that date</div>
        </div>
      </div>

      <div class="rc2-computed">
        <div class="rc2-s">
          <div class="rc2-s-lbl">Pre-Modification Liability</div>
          <div class="rc2-s-val rc2-pre-liab" style="color:var(--text3)">—</div>
        </div>
        <div class="rc2-s">
          <div class="rc2-s-lbl">New Liability (PV)</div>
          <div class="rc2-s-val rc2-new-liab" style="color:var(--accent)">—</div>
        </div>
        <div class="rc2-s">
          <div class="rc2-s-lbl">Adjustment to ROU</div>
          <div class="rc2-s-val rc2-adj">—</div>
        </div>
        <div class="rc2-s">
          <div class="rc2-s-lbl">Gain in P&amp;L</div>
          <div class="rc2-s-val rc2-gain-val" style="color:var(--green)">—</div>
          <div style="font-size:9px;color:var(--text3);margin-top:2px">Para 46(c) — only if ROU falls below zero</div>
        </div>
      </div>

      <div class="rc2-je">
        <div class="rc2-je-t">Journal Entry at Modification Date — Ind AS 116 Para 46</div>
        <div class="rc2-je-entries"></div>
        <div class="rc2-override-note" id="rc2-override-note-${idx}">Note: Using overridden book values — amounts may differ from the amortisation schedule.</div>
      </div>`;

    list.appendChild(div);
    setTimeout(() => Form.refreshReassessmentComputeds(), 80);
  },

  // Refresh auto-computed values for all reassessment cards (called on every input change)
  refreshReassessmentComputeds() {
    const rou = this._collectForPreview();
    if (!rou) return;
    let sch;
    try { sch = Engine.compute(rou); } catch(e) { return; }

    const fmtV = n => {
      if (n == null || isNaN(n)) return '—';
      const abs = Math.abs(n);
      const s = abs >= 1e7 ? '₹' + (abs/1e7).toFixed(2) + 'Cr'
              : abs >= 1e5 ? '₹' + (abs/1e5).toFixed(2) + 'L'
              : '₹' + Math.round(abs).toLocaleString('en-IN');
      return (n < 0 ? '-' : '') + s;
    };
    const fmtFull = n => n == null ? '—' : '₹' + Math.abs(Math.round(n)).toLocaleString('en-IN');

    const cards = [...document.querySelectorAll('#reassess-list .rc2')];
    cards.forEach((card, ci) => {
      const adj = (sch.adjustments || [])[ci];

      const preLibEl  = card.querySelector('.rc2-pre-liab');
      const newLibEl  = card.querySelector('.rc2-new-liab');
      const adjEl     = card.querySelector('.rc2-adj');
      const gainEl    = card.querySelector('.rc2-gain-val');
      const jeDiv     = card.querySelector('.rc2-je-entries');

      if (!adj) {
        [preLibEl, newLibEl, adjEl, gainEl].forEach(el => { if (el) el.textContent = '—'; });
        if (jeDiv) jeDiv.innerHTML = '<div style="color:var(--text3);font-size:11px;font-style:italic">Enter modification date and IBR to compute</div>';
        return;
      }

      const hasOverrideLiab = parseFloat(card.querySelector('.ra-override-liab')?.value) > 0;
      const hasOverrideROU  = parseFloat(card.querySelector('.ra-override-rou')?.value)  > 0;
      const overrideNote    = card.querySelector('[id^="rc2-override-note-"]');
      if (overrideNote) overrideNote.style.display = (hasOverrideLiab || hasOverrideROU) ? 'block' : 'none';

      const preL = adj.preRaLiab, newL = adj.newLiab, adjAmt = adj.amount;
      const preR = adj.preRaROU, gain  = adj.gainOnMod || 0;

      if (preLibEl) preLibEl.textContent = fmtV(preL);
      if (newLibEl) newLibEl.textContent = fmtV(newL);
      if (adjEl) {
        const sign = adjAmt >= 0 ? '▲ +' : '▼ ';
        adjEl.textContent = sign + fmtV(adjAmt);
        adjEl.style.color = adjAmt >= 0 ? 'var(--accent)' : 'var(--orange)';
      }
      if (gainEl) {
        gainEl.textContent = gain > 0 ? fmtV(gain) : 'Nil';
        gainEl.style.color = gain > 0 ? 'var(--green2)' : 'var(--text3)';
      }

      // Build journal entries
      if (jeDiv) {
        const drRow = (acc, amt, indent) =>
          `<div class="rc2-row${indent?' rc2-ind':''}"><span>${acc}</span><span class="rc2-dr">${fmtFull(amt)}</span><span></span></div>`;
        const crRow = (acc, amt) =>
          `<div class="rc2-row rc2-ind"><span style="padding-left:10px">${acc}</span><span></span><span class="rc2-cr">${fmtFull(amt)}</span></div>`;
        const div = (label) =>
          `<div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.4px;color:var(--text3);padding:5px 0 2px;margin-top:3px;border-top:1px dashed var(--border)">${label}</div>`;

        let je = '';

        if (adjAmt > 0) {
          // ── UPWARD MODIFICATION (Para 46(c)) ──
          // Liability increases → ROU asset increases correspondingly
          je += div('On remeasurement (upward)');
          je += drRow('ROU Asset (Right-of-Use)', adjAmt);
          je += crRow('Lease Liability', adjAmt);
        } else if (adjAmt < 0) {
          const liabReduction = Math.abs(adjAmt);
          // ── DOWNWARD MODIFICATION (Para 46(b)/(c)) ──
          je += div('On remeasurement (downward)');
          je += drRow('Lease Liability', liabReduction);
          if (gain > 0) {
            // ROU reduces to 0 and remainder is gain (Para 46(c))
            je += crRow('ROU Asset', Math.abs(adjAmt) - gain);
            je += crRow('Gain on Lease Modification (P&L)', gain);
            je += `<div style="font-size:10px;color:var(--green2);margin-top:4px;padding:4px 8px;background:rgba(0,135,90,0.08);border-radius:4px">✓ ROU reduced to zero — excess ₹${Math.round(gain).toLocaleString('en-IN')} recognised as gain per Para 46(c)</div>`;
          } else {
            je += crRow('ROU Asset', liabReduction);
          }
        }

        // Security deposit impact if present
        const rou = Form._collectForPreview();
        if (rou && (parseFloat(rou.secDepAmount) || parseFloat(card.querySelector('.ra-override-sd')?.value))) {
          je += div('Security deposit carrying value (if SD terms unchanged)');
          je += `<div class="rc2-row rc2-ind" style="font-style:italic;color:var(--text3);font-size:10.5px"><span>SD continues to accrue at original IBR — no adjustment unless SD terms modified</span><span></span><span></span></div>`;
        }

        jeDiv.innerHTML = je || '<div style="color:var(--text3);font-size:11px">No entry generated</div>';
      }
    });
  },


    // Collect a minimal ROU object for preview/reassessment refresh (no save)
  _collectForPreview() {
    try {
      const start = document.getElementById('f-start').value;
      const end   = document.getElementById('f-end').value;
      const rent  = parseFloat(document.getElementById('f-rent').value) || 0;
      const ibr   = parseFloat(document.getElementById('f-ibr').value) || 0;
      if (!start || !end || !rent || !ibr) return null;
      const reassessments = [...document.querySelectorAll('#reassess-list .rc2')].map(c => ({
        date: c.querySelector('.ra-date').value,
        newRent: parseFloat(c.querySelector('.ra-rent').value) || rent,
        newEndDate: c.querySelector('.ra-end').value,
        newIBR: parseFloat(c.querySelector('.ra-ibr').value) || ibr,
        type: c.querySelector('.ra-type').value
      })).filter(r => r.date);
      
      // Calculate tenure from form - do NOT use any cached tenureMonths
      const calculatedTenure = Engine.monthsBetween(new Date(start), new Date(end)) + 1;
      
      return {
        startDate: start, 
        endDate: end, 
        tenureMonths: calculatedTenure,  // Explicitly set from form dates
        baseRent: rent, 
        ibr,
        interestIBR: parseFloat(document.getElementById('f-interest-ibr')?.value) || 0,
        paymentTiming: document.getElementById('f-pay-timing')?.value || 'advance',
        escalationType: document.getElementById('f-esc-type').value,
        escalationPct: parseFloat(document.getElementById('f-esc-pct')?.value) || 0,
        escalationFreqMonths: parseInt(document.getElementById('f-esc-freq')?.value) || 12,
        customSteps: this.escStepBasis === 'period' ? [] : this._collectCustomSteps(),
        customStepsPeriod: this.escStepBasis === 'period' ? this._collectCustomSteps() : [],
        escStepBasis: this.escStepBasis,
        // Schedule basis is admin-controlled (see _resolveScheduleBasis) — NOT derived from
        // the per-ROU step-format toggle. This guarantees existing ROUs keep their behaviour
        // and new ROUs follow whatever was set in Admin Panel > Date & Escalation Defaults.
        scheduleBasis: this._resolveScheduleBasis(),
        initialDirectCosts: parseFloat(document.getElementById('f-idc')?.value) || 0,
        leaseIncentives: parseFloat(document.getElementById('f-incentives')?.value) || 0,
        variableRentMonthly: parseFloat(document.getElementById('f-var-rent')?.value) || 0,
        hasMidLeaseOpening: document.getElementById('f-has-opening')?.checked || false,
        openingDate: document.getElementById('f-open-date')?.value || '',
        openingROUnbv: parseFloat(document.getElementById('f-open-rou')?.value) || 0,
        openingAccDep: parseFloat(document.getElementById('f-open-accdep')?.value) || 0,
        openingLeaseLiab: parseFloat(document.getElementById('f-open-liab')?.value) || 0,
        hasReassessment: document.getElementById('f-has-reassess')?.checked && reassessments.length > 0,
        reassessments,
        secDepAmount: parseFloat(document.getElementById('f-secdep')?.value) || 0,
        secDepIBR: parseFloat(document.getElementById('f-secdep-ibr')?.value) || ibr,
        secDepInterestIBR: parseFloat(document.getElementById('f-secdep-interest-ibr')?.value) || 0,
        secDepPaidDate: document.getElementById('f-secdep-paid')?.value || '',
        secDepMaturityDate: document.getElementById('f-secdep-maturity')?.value || '',
        secDepUnwindStart: document.getElementById('f-secdep-unwind-start')?.value || 'month_start',
        secDepCalcMethod: document.getElementById('f-secdep-calc-method')?.value || 'gross_difference',
        secDepEscalationType: document.getElementById('f-secdep-esc-type')?.value || 'none',
        secDepEscalationPct: parseFloat(document.getElementById('f-secdep-esc-pct')?.value) || 0,
        secDepEscalationFreq: parseInt(document.getElementById('f-secdep-esc-freq')?.value) || 12,
        secDepEscalationFirst: parseInt(document.getElementById('f-secdep-esc-first')?.value) || 12,
        secDepCustomSteps: this.sdEscStepBasis === 'period' ? [] : this._collectSDCustomSteps(),
        secDepCustomStepsPeriod: this.sdEscStepBasis === 'period' ? this._collectSDCustomSteps() : [],
        sdEscStepBasis: this.sdEscStepBasis
      };
    } catch(e) { return null; }
  },

  _collectCustomSteps() {
    const rows = [...document.querySelectorAll('#custom-steps-tbody tr')];
    if (this.escStepBasis === 'period') {
      return rows.map(tr => {
        const fd = tr.querySelector('.cs-from-date');
        const td = tr.querySelector('.cs-to-date');
        const rt = tr.querySelector('.cs-rent');
        return {
          fromDate: fd ? fd.value : '',
          toDate: td ? td.value : '',
          rent: rt ? parseFloat(rt.value) : NaN
        };
      }).filter(s => s.fromDate && s.toDate);
    }
    return rows.map(tr => {
      const fm = tr.querySelector('.cs-from');
      const tm = tr.querySelector('.cs-to');
      const rt = tr.querySelector('.cs-rent');
      return {
        fromMonth: fm ? parseInt(fm.value) : NaN,
        toMonth: tm ? parseInt(tm.value) : NaN,
        rent: rt ? parseFloat(rt.value) : NaN
      };
    }).filter(s => s.fromMonth && s.toMonth);
  },
  _collectSDCustomSteps() {
    const rows = [...document.querySelectorAll('#secdep-custom-steps-tbody tr')];
    if (this.sdEscStepBasis === 'period') {
      return rows.map(tr => {
        const fd = tr.querySelector('.sdcs-from-date');
        const td = tr.querySelector('.sdcs-to-date');
        const am = tr.querySelector('.sdcs-amount');
        return {
          fromDate: fd ? fd.value : '',
          toDate: td ? td.value : '',
          amount: am ? parseFloat(am.value) : NaN
        };
      }).filter(s => s.fromDate && s.toDate && s.amount);
    }
    return rows.map(tr => {
      const fm = tr.querySelector('.sdcs-from');
      const tm = tr.querySelector('.sdcs-to');
      const am = tr.querySelector('.sdcs-amount');
      return {
        fromMonth: fm ? parseInt(fm.value) : NaN,
        toMonth: tm ? parseInt(tm.value) : NaN,
        amount: am ? parseFloat(am.value) : NaN
      };
    }).filter(s => s.fromMonth && s.toMonth && s.amount);
  },
  collect() {
    const id = document.getElementById('rou-edit-id').value;
    const start = document.getElementById('f-start').value;
    let end = document.getElementById('f-end').value;
    let tenure = parseInt(document.getElementById('f-tenure').value) || null;
    if (this.endMode === 'tenure' && start && tenure) end = Engine.addMonths(new Date(start), tenure - 1).toISOString().split('T')[0];
    if (this.endMode === 'date' && start && end) tenure = Engine.monthsBetween(new Date(start), new Date(end)) + 1;

    const customStepsRaw = this._collectCustomSteps();
    const customSteps = this.escStepBasis === 'period' ? [] : customStepsRaw;
    const customStepsPeriod = this.escStepBasis === 'period' ? customStepsRaw : [];

    const reassessments = [...document.querySelectorAll('#reassess-list .rc2')].map(c => ({
      date: c.querySelector('.ra-date').value,
      newRent: parseFloat(c.querySelector('.ra-rent').value) || 0,
      newEndDate: c.querySelector('.ra-end').value,
      newIBR: parseFloat(c.querySelector('.ra-ibr').value) || 0,
      type: c.querySelector('.ra-type').value,
      overrideLiab: parseFloat(c.querySelector('.ra-override-liab')?.value) || 0,
      overrideROU: parseFloat(c.querySelector('.ra-override-rou')?.value) || 0,
      overrideSD: parseFloat(c.querySelector('.ra-override-sd')?.value) || 0
    })).filter(r => r.date);

    return {
      id: id || Utils.uid(),
      clientId: App.currentClient.id,
      branchName: document.getElementById('f-branch').value.trim(),
      partyName: document.getElementById('f-party').value.trim(),
      address: document.getElementById('f-address').value.trim(),
      status: document.getElementById('f-status').value,
      leaseType: document.getElementById('f-lease-type')?.value || 'full',
      startDate: start, endDate: end, tenureMonths: tenure,
      baseRent: parseFloat(document.getElementById('f-rent').value) || 0,
      paymentTiming: document.getElementById('f-pay-timing')?.value || 'advance',
      escalationType: document.getElementById('f-esc-type').value,
      escalationPct: parseFloat(document.getElementById('f-esc-pct').value) || 0,
      escalationFreqMonths: parseInt(document.getElementById('f-esc-freq').value) || 12,
      customSteps,
      customStepsPeriod,
      escStepBasis: this.escStepBasis,
      scheduleBasis: this._resolveScheduleBasis(),
      ibr: parseFloat(document.getElementById('f-ibr').value) || 0,
      interestIBR: parseFloat(document.getElementById('f-interest-ibr').value) || 0,
      initialDirectCosts: parseFloat(document.getElementById('f-idc')?.value) || 0,
      leaseIncentives: parseFloat(document.getElementById('f-incentives')?.value) || 0,
      variableRentMonthly: parseFloat(document.getElementById('f-var-rent')?.value) || 0,
      secDepAmount: parseFloat(document.getElementById('f-secdep').value) || 0,
      secDepIBR: parseFloat(document.getElementById('f-secdep-ibr').value) || 0,
      secDepInterestIBR: parseFloat(document.getElementById('f-secdep-interest-ibr').value) || 0,
      secDepPaidDate: document.getElementById('f-secdep-paid').value,
      secDepMaturityDate: document.getElementById('f-secdep-maturity').value,
      secDepUnwindStart: document.getElementById('f-secdep-unwind-start')?.value || 'month_start',
      secDepCalcMethod: document.getElementById('f-secdep-calc-method')?.value || 'gross_difference',
      secDepEscalationType: document.getElementById('f-secdep-esc-type')?.value || 'none',
      secDepEscalationPct: parseFloat(document.getElementById('f-secdep-esc-pct')?.value) || 0,
      secDepEscalationFreq: parseInt(document.getElementById('f-secdep-esc-freq')?.value) || 12,
      secDepEscalationFirst: parseInt(document.getElementById('f-secdep-esc-first')?.value) || 12,
      secDepCustomSteps: this.sdEscStepBasis === 'period' ? [] : this._collectSDCustomSteps(),
      secDepCustomStepsPeriod: this.sdEscStepBasis === 'period' ? this._collectSDCustomSteps() : [],
      sdEscStepBasis: this.sdEscStepBasis,
      hasMidLeaseOpening: document.getElementById('f-has-opening').checked,
      openingDate: document.getElementById('f-open-date').value,
      openingROUnbv: parseFloat(document.getElementById('f-open-rou').value) || 0,
      openingAccDep: parseFloat(document.getElementById('f-open-accdep').value) || 0,
      openingLeaseLiab: parseFloat(document.getElementById('f-open-liab').value) || 0,
      openingSecDepIndAS: parseFloat(document.getElementById('f-open-sdindas').value) || 0,
      openingSecDepGross: parseFloat(document.getElementById('f-open-sdgross').value) || 0,
      hasReassessment: document.getElementById('f-has-reassess').checked,
      reassessments,
      hasOptions: document.getElementById('f-has-options').checked,
      optionType: document.getElementById('f-option-type')?.value || '',
      optionCertainty: document.getElementById('f-option-certainty')?.value || 'not-included',
      optionRationale: document.getElementById('f-option-rationale')?.value.trim() || '',
      updatedAt: new Date().toISOString()
    };
  },

  save() {
    const branch = document.getElementById('f-branch').value.trim();
    const start = document.getElementById('f-start').value;
    const rent = parseFloat(document.getElementById('f-rent').value);
    const ibr = document.getElementById('f-ibr').value;
    let ok = true;
    const setErr = (id, msg) => { document.getElementById(id).textContent = msg; if (msg) ok = false; };
    setErr('f-branch-err', branch ? '' : 'Branch name is required');
    setErr('f-start-err', start ? '' : 'Commencement date is required');
    setErr('f-rent-err', rent > 0 ? '' : 'Monthly rent must be greater than 0');
    setErr('f-ibr-err', ibr !== '' && parseFloat(ibr) >= 0 ? '' : 'IBR is required');
    const endVal = this.endMode === 'date' ? document.getElementById('f-end').value : document.getElementById('f-tenure').value;
    if (!endVal) { toast('Please set lease end date or tenure', 'error'); ok = false; }
    if (!ok) { toast('Please fix the highlighted fields', 'error'); return; }

    const rou = this.collect();
    if (!rou.tenureMonths || rou.tenureMonths < 1) { toast('Lease tenure invalid - check dates', 'error'); return; }
    if (rou.escalationType === 'custom') {
      const stepsToCheck = rou.escStepBasis === 'period' ? (rou.customStepsPeriod || []) : (rou.customSteps || []);
      // Count raw rows in the table to distinguish "no rows" from "rows present but incomplete"
      const rawRowCount = document.querySelectorAll('#custom-steps-tbody tr').length;
      if (rawRowCount === 0) {
        toast('Add at least one custom step row', 'error');
        return;
      }
      if (!stepsToCheck.length) {
        // Rows exist but data is incomplete — tell the user clearly what's missing
        const missing = rou.escStepBasis === 'period'
          ? 'From Date, To Date, and Monthly Rent'
          : 'From Month, To Month, and Monthly Rent';
        toast(`Custom step row(s) incomplete — please fill in ${missing}`, 'error');
        return;
      }
    }

    // Auto-derive status based on period boundaries
    // Active: lease is running at period end (endDate > period OR no endDate)
    // Mid-Expired: lease ended during the period (periodStart <= endDate <= period)
    // Expired: lease ended before period start (endDate < periodStart)
    // Reassessed/Renewed: special statuses that override the above
    const hasReassess = rou.hasReassessment && rou.reassessments && rou.reassessments.length > 0;
    const s = DB.get('settings') || {};
    const period = s.period || new Date().toISOString().split('T')[0];
    const periodStart = s.periodStart || '';
    const dropdownStatus = document.getElementById('f-status').value;
    
    if (hasReassess) {
      rou.status = 'Reassessed';
    } else if (dropdownStatus === 'Renewed') {
      rou.status = 'Renewed';
    } else if (dropdownStatus === 'Expired') {
      // User manually set to Expired (early termination) — honour it
      rou.status = 'Expired';
    } else if (rou.endDate) {
      // Has an end date - determine status based on period
      if (periodStart && rou.endDate < periodStart) {
        // Ended before period start = pre-expired
        rou.status = 'Expired';
      } else if (rou.endDate > period) {
        // Ends after period end = active
        rou.status = 'Active';
      } else {
        // Ends during or at period end = mid-expired (but still show as Active in UI)
        // This is because it's still active during part of the period
        rou.status = 'Active';
      }
    } else {
      // No end date = perpetual lease = active
      rou.status = 'Active';
    }

    const editId = document.getElementById('rou-edit-id').value;
    const isNew = !editId;
    let rous = DB.get('rous_' + App.currentClient.id) || [];
    const oldROU = editId ? rous.find(r => r.id === editId) : null;

    if (editId) {
      const i = rous.findIndex(r => r.id === editId);
      if (i >= 0) { rou.createdAt = rous[i].createdAt; rous[i] = rou; }
    } else { rou.createdAt = new Date().toISOString(); rous.push(rou); }
    DB.set('rous_' + App.currentClient.id, rous);

    // Write audit log entry
    AuditLog.record(
      App.currentClient.id,
      isNew ? 'CREATE' : 'EDIT',
      rou,
      oldROU
    );

    toast(editId ? 'ROU updated!' : 'ROU saved!', 'success');
    this.reset();
    App.renderDashboard();
    App.showPage('rous');
  },

  load(rou) {
    this.reset();
    // Preserve the ROU's stored schedule basis — calendar mode is admin-controlled and must
    // NOT change just because the user toggles the per-ROU step-format selector during an edit.
    // Legacy ROUs with no field were computed in month mode, so they MUST stay in month mode
    // on re-save (even if the client's admin default is now Calendar Period).
    this._loadedScheduleBasis = rou.scheduleBasis || 'month';
    this._updateScheduleBasisBanner();
    document.getElementById('rou-edit-id').value = rou.id;
    document.getElementById('add-rou-title').textContent = 'Edit ROU - ' + (rou.branchName || '');
    document.getElementById('f-branch').value = rou.branchName || '';
    document.getElementById('f-party').value = rou.partyName || '';
    document.getElementById('f-address').value = rou.address || '';
    document.getElementById('f-status').value = rou.status || 'Active';
    document.getElementById('f-start').value = Utils.fmtDateInput(rou.startDate);
    document.getElementById('f-end').value = Utils.fmtDateInput(rou.endDate);
    document.getElementById('f-tenure').value = rou.tenureMonths || '';
    document.getElementById('f-rent').value = rou.baseRent || '';
    document.getElementById('f-ibr').value = rou.ibr || '';
    const _ibrAutoEl = document.getElementById('f-interest-ibr-auto');
    const _ibrInp = document.getElementById('f-interest-ibr');
    if (_ibrAutoEl) _ibrAutoEl.checked = false;
    if (_ibrInp) { _ibrInp.disabled = false; _ibrInp.style.background = ''; _ibrInp.style.color = ''; }
    _ibrInp && (_ibrInp.value = rou.interestIBR || '');
    // Payment timing — fall back to 'arrears' for legacy ROUs created before this field existed.
    const pt = document.getElementById('f-pay-timing');
    if (pt) pt.value = rou.paymentTiming || 'arrears';
    // Additional adjustments (Para 24/38)
    const idcEl = document.getElementById('f-idc');           if (idcEl) idcEl.value = rou.initialDirectCosts || '';
    const incEl = document.getElementById('f-incentives');    if (incEl) incEl.value = rou.leaseIncentives || '';
    const vrEl  = document.getElementById('f-var-rent');      if (vrEl)  vrEl.value  = rou.variableRentMonthly || '';
    // Show adjustments section if any adjustment values exist
    const hasAdj = (rou.initialDirectCosts || rou.leaseIncentives || rou.variableRentMonthly);
    const adjCheck = document.getElementById('f-has-adjustments');
    if (adjCheck) adjCheck.checked = !!hasAdj;
    this.toggleAdjustments();
    
    document.getElementById('f-esc-type').value = rou.escalationType || 'none';
    document.getElementById('f-esc-pct').value = rou.escalationPct || '';
    document.getElementById('f-esc-freq').value = rou.escalationFreqMonths || '';
    // Restore step basis (Month Number vs Calendar Period) — defaults to 'month' for legacy ROUs
    this.escStepBasis = rou.escStepBasis === 'period' ? 'period' : 'month';
    document.getElementById('f-esc-basis-month').classList.toggle('active', this.escStepBasis === 'month');
    document.getElementById('f-esc-basis-period').classList.toggle('active', this.escStepBasis === 'period');
    const escThead = document.getElementById('custom-steps-thead');
    escThead.innerHTML = this.escStepBasis === 'period'
      ? '<tr><th>From Date</th><th>To Date</th><th>Monthly Rent (Rs.)</th><th></th></tr>'
      : '<tr><th>From Month</th><th>To Month</th><th>Monthly Rent (Rs.)</th><th></th></tr>';
    this.onEscChange();
    if (rou.escalationType === 'custom') {
      document.getElementById('custom-steps-tbody').innerHTML = '';
      const steps = this.escStepBasis === 'period' ? (rou.customStepsPeriod || []) : (rou.customSteps || []);
      if (steps.length) steps.forEach(s => this.addCustomStep(s)); else this.addCustomStep();
    }
    document.getElementById('f-secdep').value = rou.secDepAmount || '';
    document.getElementById('f-secdep-ibr').value = rou.secDepIBR || '';
    const _sdAutoEl = document.getElementById('f-secdep-interest-ibr-auto');
    const _sdInp = document.getElementById('f-secdep-interest-ibr');
    if (_sdAutoEl) _sdAutoEl.checked = false;
    if (_sdInp) { _sdInp.disabled = false; _sdInp.style.background = ''; _sdInp.style.color = ''; }
    _sdInp && (_sdInp.value = rou.secDepInterestIBR || '');
    document.getElementById('f-secdep-paid').value = Utils.fmtDateInput(rou.secDepPaidDate);
    document.getElementById('f-secdep-maturity').value = Utils.fmtDateInput(rou.secDepMaturityDate);
    const unwindEl = document.getElementById('f-secdep-unwind-start');
    if (unwindEl) unwindEl.value = rou.secDepUnwindStart === 'month_end' ? 'month_end' : 'month_start';
    // Load SD calculation method
    const calcMethodEl = document.getElementById('f-secdep-calc-method');
    if (calcMethodEl) calcMethodEl.value = rou.secDepCalcMethod || 'pv_difference';
    // Load SD escalation
    const sdEscType = document.getElementById('f-secdep-esc-type');
    if (sdEscType) sdEscType.value = rou.secDepEscalationType || 'none';
    const sdEscPct = document.getElementById('f-secdep-esc-pct');
    if (sdEscPct) sdEscPct.value = rou.secDepEscalationPct || '';
    const sdEscFreq = document.getElementById('f-secdep-esc-freq');
    if (sdEscFreq) sdEscFreq.value = rou.secDepEscalationFreq || '';
    const sdEscFirst = document.getElementById('f-secdep-esc-first');
    if (sdEscFirst) sdEscFirst.value = rou.secDepEscalationFirst || '';
    this.onSDEscChange();
    // Restore SD step basis (Month Number vs Calendar Period) — defaults to 'month' for legacy ROUs
    this.sdEscStepBasis = rou.sdEscStepBasis === 'period' ? 'period' : 'month';
    document.getElementById('f-sdesc-basis-month').classList.toggle('active', this.sdEscStepBasis === 'month');
    document.getElementById('f-sdesc-basis-period').classList.toggle('active', this.sdEscStepBasis === 'period');
    const sdThead = document.getElementById('secdep-custom-steps-thead');
    sdThead.innerHTML = this.sdEscStepBasis === 'period'
      ? '<tr><th>From Date</th><th>To Date</th><th>SD Amount (Rs.)</th><th></th></tr>'
      : '<tr><th>From Month</th><th>To Month</th><th>SD Amount (Rs.)</th><th></th></tr>';
    if (rou.secDepEscalationType === 'custom') {
      document.getElementById('secdep-custom-steps-tbody').innerHTML = '';
      const sdSteps = this.sdEscStepBasis === 'period' ? (rou.secDepCustomStepsPeriod || []) : (rou.secDepCustomSteps || []);
      if (sdSteps.length) sdSteps.forEach(s => this.addSDCustomStep(s)); else this.addSDCustomStep();
    }
    this.onSecDepChange();
    document.getElementById('f-has-opening').checked = !!rou.hasMidLeaseOpening;
    document.getElementById('f-open-date').value = Utils.fmtDateInput(rou.openingDate);
    document.getElementById('f-open-rou').value = rou.openingROUnbv || '';
    document.getElementById('f-open-accdep').value = rou.openingAccDep || '';
    document.getElementById('f-open-liab').value = rou.openingLeaseLiab || '';
    document.getElementById('f-open-sdindas').value = rou.openingSecDepIndAS || '';
    document.getElementById('f-open-sdgross').value = rou.openingSecDepGross || '';
    this.toggleOpening();
    document.getElementById('f-has-reassess').checked = !!rou.hasReassessment;
    if (rou.hasReassessment && rou.reassessments) {
      document.getElementById('reassess-list').innerHTML = '';
      rou.reassessments.forEach(r => this.addReassessment(r));
    }
    this.toggleReassess();
    const lt = document.getElementById('f-lease-type'); if (lt) lt.value = rou.leaseType || 'full';
    this.onLeaseTypeChange();
    document.getElementById('f-has-options').checked = !!rou.hasOptions;
    if (rou.hasOptions) {
      const ot = document.getElementById('f-option-type'); if (ot) ot.value = rou.optionType || 'renewal';
      const oc = document.getElementById('f-option-certainty'); if (oc) oc.value = rou.optionCertainty || 'not-included';
      const or_ = document.getElementById('f-option-rationale'); if (or_) or_.value = rou.optionRationale || '';
    }
    this.toggleOptions();
    this.syncTenure();
  }
};

// ════════════════════════════════════════════════════════════
// SCHEDULE VIEW
