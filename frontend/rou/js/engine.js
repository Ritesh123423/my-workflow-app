window.Engine = {
  addMonths(date, n) {
    const d = new Date(date.getTime());
    const day = d.getDate();
    d.setMonth(d.getMonth() + n);
    if (d.getDate() < day) d.setDate(0);
    return d;
  },
  endOfMonth(date) {
    const d = new Date(date.getTime());
    d.setMonth(d.getMonth() + 1, 0);
    return d;
  },
  monthsBetween(a, b) {
    return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  },
  r2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; },

  // ── Calendar-Period → Month-Index conversion (mid-period escalation support) ──
  // Given the lease start date and any calendar date, returns the 1-based "lease month
  // number" bucket that date falls into. Lease month 1 = [startDate, startDate+1month).
  // This is day-of-month aware, so a lease starting 10-Jun-2025 has month 1 spanning
  // 10-Jun-2025 to 09-Jul-2025, month 2 spanning 10-Jul-2025 to 09-Aug-2025, etc.
  // Used to translate "Period-wise" escalation steps (calendar From/To dates) into the
  // fromMonth/toMonth integers that the existing buildRentSchedule()/SD engine consume —
  // the underlying computation is UNCHANGED, only the step boundaries are derived differently.
  dateToMonthIndex(startDate, date) {
    const start = new Date(startDate);
    const d = new Date(date);
    let months = this.monthsBetween(start, d);
    // If the target day-of-month is before the start day-of-month, it belongs to the
    // PREVIOUS lease-month bucket (since that bucket runs start-day..start-day-1 of next cal month).
    if (d.getDate() < start.getDate()) months -= 1;
    return months + 1; // 1-based
  },

  // Convert an array of period-wise steps ({fromDate, toDate, rent|amount}) into
  // fromMonth/toMonth steps relative to the lease startDate. Pass-through fields
  // (rent/amount) are preserved. Steps without valid dates are skipped.
  convertPeriodStepsToMonths(startDate, steps, valueKey) {
    if (!Array.isArray(steps)) return [];
    return steps.map(s => {
      if (!s.fromDate || !s.toDate) return null;
      const fromMonth = this.dateToMonthIndex(startDate, s.fromDate);
      const toMonth = this.dateToMonthIndex(startDate, s.toDate);
      const out = { fromMonth: Math.max(1, fromMonth), toMonth: Math.max(1, toMonth) };
      out[valueKey] = s[valueKey];
      return out;
    }).filter(s => s && s.fromMonth && s.toMonth && s.fromMonth <= s.toMonth);
  },

  // Returns the effective month-numbered custom steps for rent escalation, translating
  // from period-dates if rou.escStepBasis === 'period'. Falls back to rou.customSteps
  // unchanged for 'month' basis (current behaviour — NO CHANGE).
  effectiveCustomSteps(rou) {
    if (rou.escStepBasis === 'period' && Array.isArray(rou.customStepsPeriod)) {
      return this.convertPeriodStepsToMonths(rou.startDate, rou.customStepsPeriod, 'rent');
    }
    return rou.customSteps || [];
  },

  // Same translation for Security Deposit custom escalation steps.
  effectiveSDCustomSteps(rou) {
    if (rou.sdEscStepBasis === 'period' && Array.isArray(rou.secDepCustomStepsPeriod)) {
      return this.convertPeriodStepsToMonths(rou.startDate, rou.secDepCustomStepsPeriod, 'amount');
    }
    return rou.secDepCustomSteps || [];
  },

  // ── Schedule basis resolution (admin-controlled MASTER switch) ──
  // The active client's "Date & Escalation Defaults" setting is the AUTHORITATIVE source of
  // truth for the schedule mode. Flipping the admin toggle therefore changes how ALL ROUs
  // under that client are computed and displayed — existing and new — immediately on next
  // render. The per-ROU rou.scheduleBasis field is kept as a fallback (used when the App
  // context isn't available, e.g. in backups restored on a fresh device, or in unit tests).
  _effectiveScheduleBasis(rou) {
    if (typeof App !== 'undefined' && App && App.currentClient && App.currentClient.defaultEscStepBasis !== undefined) {
      return App.currentClient.defaultEscStepBasis === 'period' ? 'calendar' : 'month';
    }
    // Fallback path: no admin context available — use whatever was stored on the ROU.
    return rou.scheduleBasis === 'calendar' ? 'calendar' : 'month';
  },

  // ── Calendar-aligned schedule helpers ──
  // When rou.scheduleBasis === 'calendar', schedule rows align with CALENDAR months
  // (1st to last day of each calendar month), with the first and/or last month possibly
  // PARTIAL and rent pro-rated by (daysInLeaseForThatMonth / daysInCalendarMonth).
  //
  // Example — lease 01-Apr-2025 to 10-Jun-2028, base rent ₹100,000:
  //   row 1: 01-Apr-2025 to 30-Apr-2025 (30/30 days, full ₹100,000)
  //   row 2: 01-May-2025 to 31-May-2025 (31/31 days, full ₹100,000)
  //   ...
  //   row 38: 01-May-2028 to 31-May-2028 (full)
  //   row 39: 01-Jun-2028 to 10-Jun-2028 (10/30 days, ₹33,333)
  //
  // Backward compat: ROUs without scheduleBasis (or with scheduleBasis === 'month')
  // keep the existing lease-month bucket behaviour unchanged.

  // Count of calendar months touched by the lease range, inclusive of partial months at
  // either end. For start=01-Apr-2025 end=10-Jun-2028 returns 39.
  calendarMonthsTouched(startDate, endDate) {
    const s = new Date(startDate);
    const e = new Date(endDate);
    return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
  },

  // 1-based calendar-month index of `date` from `startDate`, ignoring days.
  // For start=01-Apr-2025: 15-Apr-2025 → 1, 01-May-2025 → 2, 10-Jun-2028 → 39.
  dateToCalendarMonthIndex(startDate, date) {
    const s = new Date(startDate);
    const d = new Date(date);
    return (d.getFullYear() - s.getFullYear()) * 12 + (d.getMonth() - s.getMonth()) + 1;
  },

  // Convert period-wise steps to calendar-month-indexed steps (for scheduleBasis === 'calendar').
  // Period [10-Jun-2025, 09-Jun-2026] under start 01-Apr-2025 becomes calendar months 3..15.
  convertPeriodStepsToCalendarMonths(startDate, steps, valueKey) {
    if (!Array.isArray(steps)) return [];
    return steps.map(s => {
      if (!s.fromDate || !s.toDate) return null;
      const fromMonth = this.dateToCalendarMonthIndex(startDate, s.fromDate);
      const toMonth = this.dateToCalendarMonthIndex(startDate, s.toDate);
      const out = { fromMonth: Math.max(1, fromMonth), toMonth: Math.max(1, toMonth) };
      out[valueKey] = s[valueKey];
      return out;
    }).filter(s => s && s.fromMonth && s.toMonth && s.fromMonth <= s.toMonth);
  },

  // Build per-row metadata for the schedule. Returns 1-indexed array of length N+1.
  // Each entry: { from, to, date, daysInPeriod, daysInMonth, proRationFactor, isPartial }.
  // For scheduleBasis === 'month' (default): proRationFactor is always 1, date is start+m-1 months.
  // For scheduleBasis === 'calendar': calendar-aligned periods with day-based proration.
  buildPeriodMeta(rou, N) {
    const meta = new Array(N + 1).fill(null);
    const start = new Date(rou.startDate);
    const isAdvance = (rou.paymentTiming || 'advance') === 'advance';
    if (this._effectiveScheduleBasis(rou) !== 'calendar') {
      // Legacy lease-month buckets — unchanged behaviour.
      for (let m = 1; m <= N; m++) {
        const from = this.addMonths(start, m - 1);
        const to = new Date(this.addMonths(start, m).getTime() - 86400000); // 1 day before next bucket
        meta[m] = { from, to, date: from, daysInPeriod: null, daysInMonth: null, proRationFactor: 1, isPartial: false };
      }
      return meta;
    }
    // Calendar-aligned: walk calendar months from start month to end month.
    const end = rou.endDate ? new Date(rou.endDate) : this.addMonths(start, N - 1);
    let cursor = new Date(start);
    for (let m = 1; m <= N; m++) {
      const y = cursor.getFullYear();
      const mo = cursor.getMonth();
      const firstOfMonth = new Date(y, mo, 1);
      const lastOfMonth = new Date(y, mo + 1, 0); // day 0 of next month = last day of this month
      const daysInMonth = lastOfMonth.getDate();
      const periodFrom = m === 1 ? new Date(cursor) : firstOfMonth;
      const periodTo = lastOfMonth > end ? new Date(end) : lastOfMonth;
      const daysInPeriod = Math.round((periodTo - periodFrom) / 86400000) + 1; // inclusive
      const isPartial = daysInPeriod < daysInMonth;
      meta[m] = {
        from: periodFrom,
        to: periodTo,
        date: isAdvance ? periodFrom : periodTo,
        daysInPeriod, daysInMonth,
        proRationFactor: daysInPeriod / daysInMonth,
        isPartial
      };
      cursor = new Date(y, mo + 1, 1); // first of next calendar month
    }
    return meta;
  },

  // Effective custom rent steps when scheduleBasis === 'calendar': period-dated steps get
  // converted via calendar-month index (not lease-month-from-start); month-numbered steps
  // are interpreted as referring to calendar-month positions in the schedule.
  effectiveCustomStepsForSchedule(rou) {
    if (this._effectiveScheduleBasis(rou) === 'calendar' && rou.escStepBasis === 'period' && Array.isArray(rou.customStepsPeriod)) {
      return this.convertPeriodStepsToCalendarMonths(rou.startDate, rou.customStepsPeriod, 'rent');
    }
    return this.effectiveCustomSteps(rou);
  },

  // ══════════════════════════════════════════════════════════════
  // GOAL SEEK: Find interest rate that amortizes liability to ZERO
  // ══════════════════════════════════════════════════════════════
  // Given: Initial liability, payment schedule, tenure
  // Find: Annual interest rate (% p.a.) where closing balance = 0
  //
  // Advance payment: Liability(t) = (Liability(t-1) - Payment(t)) × (1 + r)
  // Arrears payment: Liability(t) = Liability(t-1) × (1 + r) - Payment(t)
  //
  // Uses Newton-Raphson method for faster, more accurate convergence
  goalSeekLeaseRate(rou) {
    const isAdvance = rou.paymentTiming === 'advance';
    const isMidLease = rou.hasMidLeaseOpening && rou.openingDate;
    
    let N, initialLiability, startMonth = 1;
    
    if (isMidLease) {
      // Mid-lease: use user-provided opening liability and remaining tenure
      const Norig = this.tenureOriginalOf(rou);
      if (!Norig || Norig < 1) return null;
      
      const start = new Date(rou.startDate);
      const openDt = new Date(rou.openingDate);
      const monthsDiff = (openDt.getFullYear() - start.getFullYear()) * 12 + (openDt.getMonth() - start.getMonth());
      const openingMonth = Math.max(1, monthsDiff + 1);
      
      N = Norig - openingMonth + 1;
      startMonth = openingMonth;
      initialLiability = parseFloat(rou.openingLeaseLiab) || 0;
      
      if (N <= 0 || initialLiability <= 0) return null;
    } else {
      // New lease: Use computed initial liability
      const computedField = document.getElementById('f-computed-init-liab');
      const computedValue = computedField ? parseFloat(computedField.dataset.computedValue) : 0;
      
      N = this.tenureOriginalOf(rou);
      if (!N || N < 1) return null;
      
      if (computedValue > 0) {
        initialLiability = computedValue;
        console.log('Goal Seek: Using computed liability:', initialLiability);
      } else {
        // Fallback: calculate from IBR
        const rentSched = this.buildRentSchedule(rou, N, { applyReassessments: false });
        const baseRate = parseFloat(rou.ibr) || 9;
        const baseR = baseRate / 12 / 100;
        let pv0 = 0;
        for (let m = 1; m <= N; m++) {
          const exp = isAdvance ? (m - 1) : m;
          pv0 += rentSched[m] / Math.pow(1 + baseR, exp);
        }
        initialLiability = this.r2(pv0);
        console.log('Goal Seek: Calculated liability at IBR', baseRate + '%:', initialLiability);
      }
      
      if (initialLiability <= 0) return null;
    }

    // Build rent schedule
    const totalMonths = isMidLease ? this.tenureOriginalOf(rou) : N;
    const rentSched = this.buildRentSchedule(rou, totalMonths, { applyReassessments: false });
    
    console.log('Goal Seek: Months:', totalMonths, 'Initial Liab:', initialLiability, 'Timing:', isAdvance ? 'Advance' : 'Arrears');
    
    // Function to calculate closing balance given an annual interest rate
    const getClosingBalance = (annualRatePct) => {
      const monthlyRate = annualRatePct / 12 / 100;
      let balance = initialLiability;
      let monthsProcessed = 0;
      
      for (let m = startMonth; m <= totalMonths; m++) {
        const payment = rentSched[m] || 0;
        
        if (isAdvance) {
          // Advance: Interest on opening balance first, then payment deducted
          const interest = balance * monthlyRate;
          balance = balance + interest - payment;
        } else {
          // Arrears: interest accrues first, then payment
          balance = balance * (1 + monthlyRate) - payment;
        }
        monthsProcessed++;
      }
      
      if (monthsProcessed !== totalMonths) {
        console.error('ERROR: Only processed', monthsProcessed, 'months, expected', totalMonths);
      }
      
      return balance;
    };
    
    // Binary search (bisection) - high precision
    let lo = -10.0;   // Lower bound: -10% p.a.
    let hi = 50.0;    // Upper bound: 50% p.a.
    let maxIter = 200; // Increased iterations for better precision
    
    const closeLo = getClosingBalance(lo);
    const closeHi = getClosingBalance(hi);
    
    console.log('Goal Seek range check: at', lo + '%:', this.r2(closeLo), '| at', hi + '%:', this.r2(closeHi));
    
    // Check if solution is in range (must have opposite signs)
    if ((closeLo > 0 && closeHi > 0) || (closeLo < 0 && closeHi < 0)) {
      console.warn('Goal Seek: Solution not in range [-10%, 50%]. Extending search...');
      if (closeLo > 0) {
        lo = -99.0;  // Try more negative
      }
      if (closeHi < 0) {
        hi = 100.0;  // Try higher positive
      }
      console.log('Extended range: at', lo + '%:', this.r2(getClosingBalance(lo)), '| at', hi + '%:', this.r2(getClosingBalance(hi)));
    }
    
    // Binary search with high precision
    for (let i = 0; i < maxIter; i++) {
      const mid = (lo + hi) / 2;
      const closeMid = getClosingBalance(mid);
      
      // Log first 25 and last 10 iterations
      if (i < 25 || i >= maxIter - 10) {
        console.log('  Iter', i + ':', 'lo=' + lo.toFixed(8) + '%', 'hi=' + hi.toFixed(8) + '%', 'mid=' + mid.toFixed(8) + '%', 'balance=' + this.r2(closeMid));
      }
      
      // Check convergence - very tight tolerance for exact result
      if (Math.abs(closeMid) < 0.001) {  // Within 0.1 paisa
        const result = Math.round(mid * 1e12) / 1e12;  // 12 decimal places
        console.log('✓ Goal Seek SUCCESS: Rate =', result.toFixed(12) + '% p.a., Final balance =', this.r2(closeMid), '(iteration', i + ')');
        return result;
      }
      
      // Bisection step - CRITICAL LOGIC (CORRECTED)
      // If closing balance is POSITIVE: liability still remains, TOO MUCH interest was charged, need LOWER rate (move hi down)
      // If closing balance is NEGATIVE: liability went negative (overpaid), NOT ENOUGH interest, need HIGHER rate (move lo up)
      if (closeMid > 0) {
        // Balance positive, need lower rate
        hi = mid;
      } else {
        // Balance negative, need higher rate
        lo = mid;
      }
      
      // Check if range is very small but keep going for precision
      if (Math.abs(hi - lo) < 1e-10 && i > 50) {
        console.log('Goal Seek: Range very small at iteration', i, '- range:', (hi - lo).toExponential(4));
        break;
      }
    }
    
    // Return best result with very high precision
    const result = Math.round((lo + hi) / 2 * 1e12) / 1e12;  // 12 decimal places
    const finalBal = getClosingBalance(result);
    console.log('Goal Seek FINAL: Rate =', result.toFixed(12) + '% p.a., Final balance =', this.r2(finalBal));
    return result;
  },

  // Goal seek for SD unwinding rate: find r such that open * (1+r)^N = gross
  // i.e. r = (gross/initialIndAS)^(1/N) - 1, annualised × 12
  goalSeekSDRate(rou) {
    const amt = parseFloat(rou.secDepAmount) || 0;
    if (!amt) return null;
    const discountRate = (parseFloat(rou.secDepIBR) || parseFloat(rou.ibr)) / 12 / 100;
    const paid = new Date(rou.secDepPaidDate || rou.startDate);
    const maturity = new Date(rou.secDepMaturityDate || rou.endDate || this.addMonths(paid, this.tenureOf(rou)));
    const unwindFrom = rou.secDepUnwindStart === 'month_end' ? 'month_end' : 'month_start';
    // In calendar mode, N must match the calendar-month count that computeSecDeposit will use,
    // otherwise the solved rate won't agree with the actual schedule.
    let N;
    if (this._effectiveScheduleBasis(rou) === 'calendar') {
      N = Math.max(1, this.calendarMonthsTouched(paid, maturity));
    } else {
      const mb = this.monthsBetween(paid, maturity);
      N = Math.max(1, maturity.getDate() > paid.getDate() ? mb + 1 : mb);
    }
    const discountPeriods = unwindFrom === 'month_end' ? N - 1 : N;
    const initialIndAS = this.r2(amt / Math.pow(1 + discountRate, discountPeriods));
    if (initialIndAS <= 0 || N <= 0) return null;
    // r_monthly = (amt / initialIndAS)^(1/N) - 1
    const rMonthly = Math.pow(amt / initialIndAS, 1 / N) - 1;
    const annualPct = rMonthly * 12 * 100;
    return Math.round(annualPct * 10000) / 10000; // 4 decimal places
  },

  fyTag(date) {
    const y = date.getFullYear(), m = date.getMonth();
    const sy = m >= 3 ? y : y - 1;
    return `FY ${sy}-${String((sy + 1) % 100).padStart(2, '0')}`;
  },
  tenureOf(rou) {
    // Determine effective lease end date: max of contractual end and any reassessment newEndDate.
    // Para 44 — if a reassessment extends the lease term, the schedule must reflect the new term.
    let effEnd = rou.endDate || null;
    if (rou.hasReassessment && Array.isArray(rou.reassessments)) {
      for (const ra of rou.reassessments) {
        if (ra && ra.newEndDate && (!effEnd || ra.newEndDate > effEnd)) effEnd = ra.newEndDate;
      }
    }
    if (rou.startDate && effEnd) {
      // For calendar-aligned schedules: N = number of distinct calendar months touched.
      // For month-bucket schedules (default): N = inclusive month count from start to end.
      const months = this._effectiveScheduleBasis(rou) === 'calendar'
        ? this.calendarMonthsTouched(rou.startDate, effEnd)
        : this.monthsBetween(new Date(rou.startDate), new Date(effEnd)) + 1;
      // If user also supplied a manual tenureMonths AND it's larger, honour it (covers tenure-entry mode)
      if (rou.tenureMonths && parseInt(rou.tenureMonths) > months) return parseInt(rou.tenureMonths);
      return months;
    }
    if (rou.tenureMonths) return parseInt(rou.tenureMonths);
    return 0;
  },

  // Original tenure — the term contractually agreed at commencement, BEFORE any reassessment extension.
  // Used for initial PV and initial straight-line dep, since neither knows about future modifications.
  tenureOriginalOf(rou) {
    if (rou.startDate && rou.endDate) {
      const months = this._effectiveScheduleBasis(rou) === 'calendar'
        ? this.calendarMonthsTouched(rou.startDate, rou.endDate)
        : this.monthsBetween(new Date(rou.startDate), new Date(rou.endDate)) + 1;
      if (rou.tenureMonths && parseInt(rou.tenureMonths) > months) return parseInt(rou.tenureMonths);
      return months;
    }
    if (rou.tenureMonths) return parseInt(rou.tenureMonths);
    return 0;
  },

  // rentSchedule[1..N], applies escalation. Honors reassessments (rebuild forward).
  // opts.applyReassessments (default true): when false, returns the original CONTRACTUAL schedule
  // ignoring any reassessment overrides — used by compute() for initial liability calculation
  // since modifications (Para 44) are by definition unknown at commencement.
  buildRentSchedule(rou, N, opts) {
    opts = opts || {};
    const applyReassessments = opts.applyReassessments !== false;
    const sched = new Array(N + 1).fill(0);
    const base = parseFloat(rou.baseRent) || 0;
    // Calendar-aligned schedules need calendar-month-indexed custom steps; month-bucket schedules
    // continue using lease-month-indexed steps as before (no change for existing ROUs).
    const customSteps = this.effectiveCustomStepsForSchedule(rou);
    if (rou.escalationType === 'custom' && customSteps && customSteps.length) {
      for (let m = 1; m <= N; m++) {
        let rent = base;
        for (const s of customSteps) {
          if (m >= s.fromMonth && m <= s.toMonth) { rent = parseFloat(s.rent) || 0; break; }
        }
        sched[m] = rent;
      }
    } else if (rou.escalationType === 'fixed' && parseFloat(rou.escalationPct) > 0) {
      const freq = parseInt(rou.escalationFreqMonths) || 12;
      const pct = parseFloat(rou.escalationPct);
      for (let m = 1; m <= N; m++) {
        const periods = Math.floor((m - 1) / freq);
        sched[m] = base * Math.pow(1 + pct / 100, periods);
      }
    } else {
      for (let m = 1; m <= N; m++) sched[m] = base;
    }
    // Apply reassessments only when requested (default). Skipping gives the ORIGINAL schedule.
    if (applyReassessments && rou.hasReassessment && rou.reassessments && rou.reassessments.length) {
      const start = new Date(rou.startDate);
      const sorted = [...rou.reassessments].filter(x => x.date).sort((a, b) => new Date(a.date) - new Date(b.date));
      for (const ra of sorted) {
        const raMonth = this.monthsBetween(start, new Date(ra.date)) + 1;
        const newRent = parseFloat(ra.newRent) || 0;
        for (let m = Math.max(1, raMonth); m <= N; m++) sched[m] = newRent;
      }
    }
    return sched;
  },

  // Main computation: returns full schedule + meta. Handles:
  //   • Payment timing (advance vs arrears) — Para 26
  //   • Reassessment IBR / rent / term changes — Para 44–46
  //   • Mid-lease opening balances (transition leases) — Ind AS 116 D7-D9
  //   • Initial direct costs added to ROU — Para 24(c)
  //   • Lease incentives received netted off ROU — Para 24(b)
  //
  // Reassessment semantics (CRITICAL — fixes a prior bug):
  // A reassessment is a MODIFICATION (Para 44) — by definition unknown at commencement.
  // Initial liability and initial straight-line depreciation therefore use the ORIGINAL
  // contractual rent schedule over the ORIGINAL term only. The new rent and any extended
  // term are recognised ONLY at the reassessment date via remeasurement.
  compute(rou) {
    const N = this.tenureOf(rou);                  // effective term (includes any extension)
    const Norig = this.tenureOriginalOf(rou);      // original contractual term
    if (!N || N < 1) return { error: 'Invalid tenure', rows: [] };
    const start = new Date(rou.startDate);

    // Two schedules: original (no reassessment overrides) and effective (with overrides).
    // Initial PV uses ORIGINAL. Actual payment loop uses EFFECTIVE.
    const originalRentSched  = this.buildRentSchedule(rou, Norig, { applyReassessments: false });
    const effectiveRentSched = this.buildRentSchedule(rou, N,     { applyReassessments: true  });

    // Build per-row metadata (dates + day-based proration factors). For scheduleBasis='month'
    // (default / existing ROUs) all factors are 1 and dates are start+m-1 months — UNCHANGED.
    // For scheduleBasis='calendar', first/last partial months get a fractional proration factor.
    const periodMeta = this.buildPeriodMeta(rou, N);
    const periodMetaOrig = Norig === N ? periodMeta : this.buildPeriodMeta(rou, Norig);
    // Apply proration in-place so PV, interest, and payment all naturally use the prorated rent.
    for (let m = 1; m <= N; m++) {
      if (periodMeta[m]) effectiveRentSched[m] = effectiveRentSched[m] * periodMeta[m].proRationFactor;
    }
    for (let m = 1; m <= Norig; m++) {
      if (periodMetaOrig[m]) originalRentSched[m] = originalRentSched[m] * periodMetaOrig[m].proRationFactor;
    }

    // Payment timing: 'arrears' (default for legacy data) or 'advance'
    const isAdvance = (rou.paymentTiming === 'advance');
    const baseRate = parseFloat(rou.ibr) / 12 / 100;  // For PV calculation (discount rate)
    const interestRate = (parseFloat(rou.interestIBR) || parseFloat(rou.ibr)) / 12 / 100;  // For monthly interest in schedule (unwind rate)

    // Reassessment events (used for remeasurement at their dates)
    const raEvents = (rou.hasReassessment && rou.reassessments) ?
      [...rou.reassessments].filter(x => x.date).sort((a, b) => new Date(a.date) - new Date(b.date))
        .map(ra => ({ month: this.monthsBetween(start, new Date(ra.date)) + 1, ibr: parseFloat(ra.newIBR) || parseFloat(rou.ibr), rent: parseFloat(ra.newRent) || 0, type: ra.type, raw: ra }))
      : [];

    // Initial liability = PV of ORIGINAL payments over ORIGINAL term at the ORIGINAL IBR.
    // For advance: factor = 1/(1+r)^(m-1). For arrears: 1/(1+r)^m.
    let initialLiability = 0;
    for (let m = 1; m <= Norig; m++) {
      const exp = isAdvance ? (m - 1) : m;
      initialLiability += originalRentSched[m] / Math.pow(1 + baseRate, exp);
    }
    initialLiability = this.r2(initialLiability);

    // ROU cost adjustments — Para 24
    const secDep = this.computeSecDeposit(rou);
    // Security deposit is tracked separately, NOT added to ROU asset
    const secDepAdj = 0;  // No adjustment to ROU
    const idc = this.r2(parseFloat(rou.initialDirectCosts) || 0);          // Para 24(c): initial direct costs
    const incentives = this.r2(parseFloat(rou.leaseIncentives) || 0);      // Para 24(b): incentives received

    const computedRouCost = this.r2(initialLiability + secDepAdj + idc - incentives);
    // Initial monthly depreciation is over the ORIGINAL term — reassessment recomputes dep going forward.
    let monthlyDep = Norig > 0 ? computedRouCost / Norig : 0;

    // ── Mid-lease opening balance handling (transition leases) ──
    // If hasMidLeaseOpening is set and openingDate falls inside [start, end],
    // we resume the schedule from openingMonth using user-supplied carrying values.
    const useOpening = !!rou.hasMidLeaseOpening && !!rou.openingDate;
    let openingMonth = 0;
    if (useOpening) {
      const od = new Date(rou.openingDate);
      if (od >= start) openingMonth = this.monthsBetween(start, od) + 1;
    }
    const validOpening = useOpening && openingMonth >= 1 && openingMonth <= N;

    let openLiab, openROU, accDep, remainingDepMonths;
    let displayInitialLiab, displayRouCost;

    if (validOpening) {
      // Resume from user-supplied book balances at the opening date.
      openLiab = this.r2(parseFloat(rou.openingLeaseLiab) || 0);
      accDep   = this.r2(parseFloat(rou.openingAccDep) || 0);
      openROU  = this.r2(parseFloat(rou.openingROUnbv) || 0);
      remainingDepMonths = N - openingMonth + 1;
      monthlyDep = remainingDepMonths > 0 ? openROU / remainingDepMonths : 0;
      // For transition cases, "initial" displays = opening balances (these are what's on the books).
      displayInitialLiab = openLiab;
      displayRouCost     = this.r2(openROU + accDep);
    } else {
      openLiab = initialLiability;
      openROU  = computedRouCost;
      accDep   = 0;
      remainingDepMonths = Norig;
      displayInitialLiab = initialLiability;
      displayRouCost     = computedRouCost;
    }

    // Snapshot the depreciation at recognition — this is what the schedule header should display
    // and what the Excel BDEP param cell must hold. Reassessment will mutate `monthlyDep` inside
    // the loop, but we keep the snapshot so downstream consumers (header, Excel param) get the
    // initial dep, not the most recent post-reassessment value.
    const initialMonthlyDep = monthlyDep;

    const rows = [];
    let curInterestRate = interestRate;  // Use interest rate for monthly interest calculations in schedule
    let curPVRate = baseRate;    // Keep PV rate separate for reassessments
    const adjustments = [];
    const startM = validOpening ? openingMonth : 1;

    for (let m = startM; m <= N; m++) {
      const monthDate = periodMeta[m] ? periodMeta[m].date : this.addMonths(start, m - 1);
      const periodInfo = periodMeta[m] || null;

      // Reassessment effective at this month: remeasure liability = PV of remaining payments at new IBR.
      const ra = raEvents.find(e => e.month === m);
      let reassessFlag = false, adjAmount = 0, gainOnMod = 0;
      if (ra) {
        const preRaLiab = openLiab;
        const preRaROU  = openROU;
        curPVRate = ra.ibr / 12 / 100;  // Update PV rate for reassessment
        curInterestRate = curPVRate;  // Also update interest rate (both change together on reassessment)
        let newLiab = 0;
        for (let k = m; k <= N; k++) {
          const exp = isAdvance ? (k - m) : (k - m + 1);
          newLiab += effectiveRentSched[k] / Math.pow(1 + curPVRate, exp);
        }
        newLiab = this.r2(newLiab);
        adjAmount = this.r2(newLiab - openLiab);
        openLiab = newLiab;
        // Ind AS 116 Para 46(c): adjust ROU by same adj; if downward mod reduces ROU below zero,
        // the excess is recognised as a gain in P&L (derecognition of over-reduced ROU).
        const proposedROU = this.r2(preRaROU + adjAmount);
        if (proposedROU < 0) {
          gainOnMod = this.r2(-proposedROU);   // positive gain = portion that can't be absorbed by ROU
          openROU = 0;
          adjAmount = this.r2(-preRaROU);       // only reduce ROU to 0 (not below)
        } else {
          openROU = proposedROU;
        }
        remainingDepMonths = N - m + 1;
        monthlyDep = remainingDepMonths > 0 ? openROU / remainingDepMonths : 0;
        reassessFlag = true;
        adjustments.push({
          month: m, date: monthDate, amount: adjAmount, type: ra.type, newIBR: ra.ibr,
          preRaLiab: this.r2(preRaLiab), newLiab: this.r2(openLiab),
          preRaROU: this.r2(preRaROU), gainOnMod: this.r2(gainOnMod)
        });
      }

      // Actual payment for this row comes from the EFFECTIVE schedule.
      const payment = effectiveRentSched[m];
      // Monthly interest = opening liability × interest rate (separate from PV discount rate)
      const interest = openLiab * curInterestRate;
      let closeLiab = isAdvance
        ? openLiab - payment + interest   // payment at start of month
        : openLiab + interest - payment; // payment at end of month
      if (Math.abs(closeLiab) < 0.01) closeLiab = 0;

      const dep = monthlyDep;
      accDep += dep;
      const closeROU = openROU - dep;
      const nbv = this.r2(closeROU);

      // PV of THIS payment, valued at commencement, using the ORIGINAL rent and base IBR.
      // For months within the original term, sum of PV column = initial lease liability.
      // For extension months (m > Norig), PV at commencement = 0 (these payments weren't contracted at day 1).
      let pvPayment = 0;
      if (m <= Norig) {
        const exp = isAdvance ? (m - 1) : m;
        pvPayment = originalRentSched[m] / Math.pow(1 + baseRate, exp);
      }

      rows.push({
        m, date: monthDate, fy: this.fyTag(monthDate),
        rent: this.r2(payment),
        pvPayment: this.r2(pvPayment),
        isExtension: m > Norig,
        openLiab: this.r2(openLiab), interest: this.r2(interest), payment: this.r2(payment), closeLiab: this.r2(closeLiab),
        openROU: this.r2(openROU), dep: this.r2(dep), closeROU: this.r2(closeROU), accDep: this.r2(accDep), nbv,
        reassess: reassessFlag, adjAmount: this.r2(adjAmount), gainOnMod: this.r2(gainOnMod),
        // Calendar-aligned scheduling metadata (null when scheduleBasis='month')
        periodFrom: periodInfo ? periodInfo.from : null,
        periodTo: periodInfo ? periodInfo.to : null,
        daysInPeriod: periodInfo ? periodInfo.daysInPeriod : null,
        daysInMonth: periodInfo ? periodInfo.daysInMonth : null,
        isPartialMonth: periodInfo ? periodInfo.isPartial : false
      });
      openLiab = closeLiab;
      openROU = closeROU;
    }

    // ── AUTOMATIC ADJUSTMENT: Ensure final closing liability is exactly 0 ──
    // Tolerance: ₹5. If final closing balance > ₹5, adjust the last row's interest
    // to force closing liability to 0. This handles rounding differences in long schedules.
    let liabilityAdjustment = null;
    if (rows.length > 0) {
      const lastRow = rows[rows.length - 1];
      const finalCloseLiab = lastRow.closeLiab;
      
      if (Math.abs(finalCloseLiab) > 5) {
        // Calculate required interest adjustment
        const adjustmentAmount = this.r2(-finalCloseLiab);
        const originalInterest = lastRow.interest;
        const adjustedInterest = this.r2(originalInterest + adjustmentAmount);
        
        // Update the last row
        lastRow.interest = adjustedInterest;
        lastRow.closeLiab = 0;
        
        // Store adjustment info for disclosure
        liabilityAdjustment = {
          month: lastRow.m,
          date: lastRow.date,
          originalInterest: originalInterest,
          adjustedInterest: adjustedInterest,
          adjustmentAmount: adjustmentAmount,
          originalClosingBalance: finalCloseLiab
        };
      }
    }

    return {
      N, Norig,
      initialLiability: displayInitialLiab, rouCost: displayRouCost, monthlyDep: initialMonthlyDep, rows, adjustments,
      secDep, secDepAdj, rentSched: effectiveRentSched, originalRentSched,
      paymentTiming: isAdvance ? 'advance' : 'arrears',
      idc, incentives,
      computedInitialLiability: initialLiability,   // pre-transition theoretical PV (= sum of pvPayment col)
      computedRouCost,                              // pre-transition theoretical ROU cost
      transitionMonth: validOpening ? openingMonth : null,
      variableRentMonthly: this.r2(parseFloat(rou.variableRentMonthly) || 0),
      liabilityAdjustment: liabilityAdjustment  // Adjustment info for disclosure
    };
  },

  computeSecDeposit(rou) {
    const baseAmt = parseFloat(rou.secDepAmount) || 0;
    if (!baseAmt) return null;
    
    // Separate rates: discount rate for PV, interest rate for monthly unwinding
    const discountRate = (parseFloat(rou.secDepIBR) || parseFloat(rou.ibr)) / 12 / 100;
    const unwindRate = (parseFloat(rou.secDepInterestIBR) || parseFloat(rou.secDepIBR) || parseFloat(rou.ibr)) / 12 / 100;
    
    const paid = new Date(rou.secDepPaidDate || rou.startDate);
    const maturity = new Date(rou.secDepMaturityDate || rou.endDate || this.addMonths(paid, this.tenureOf(rou)));
    const unwindFrom = rou.secDepUnwindStart === 'month_end' ? 'month_end' : 'month_start';
    const calcMethod = rou.secDepCalcMethod || 'pv_difference';
    
    // PV calculation anchor and accrual start depend on the selected method
    let pvAnchor, accrualStart, N;
    
    if (unwindFrom === 'month_start') {
      pvAnchor = paid;
      accrualStart = paid;
      const mb = this.monthsBetween(accrualStart, maturity);
      N = Math.max(1, maturity.getDate() > accrualStart.getDate() ? mb + 1 : mb);
    } else {
      pvAnchor = this.endOfMonth(paid);
      accrualStart = paid;
      const mb = this.monthsBetween(paid, maturity);
      N = Math.max(1, maturity.getDate() > paid.getDate() ? mb + 1 : mb);
    }

    // ── Calendar-aligned scheduling for Security Deposit ──
    // When the ROU is in calendar mode, the SD must produce row dates that match the rent rows
    // (otherwise the inline UI/export merge by date fails and SD columns appear empty).
    // We:
    //   1. Recompute N as the count of calendar months touched between accrualStart and maturity,
    //      so SD and rent always have the same number of rows and the same span.
    //   2. Build a periodMeta aligned with the SD's accrual range, using the ROU's paymentTiming
    //      (advance / arrears) so SD dates exactly mirror rent dates (e.g. 30-Apr, 31-May…).
    //   3. Capture the per-row pro-ration factor so SD discount depreciation can be pro-rated for
    //      partial first/last months — keeping the deemed rental expense consistent with the
    //      pro-rated actual rent on those same rows.
    let sdPeriodMeta = null;
    let sdProRationFactors = null;
    if (this._effectiveScheduleBasis(rou) === 'calendar') {
      N = Math.max(1, this.calendarMonthsTouched(accrualStart, maturity));
      sdPeriodMeta = this.buildPeriodMeta({
        startDate: accrualStart,
        endDate: maturity,
        paymentTiming: rou.paymentTiming || 'advance',
        scheduleBasis: 'calendar'
      }, N);
      sdProRationFactors = sdPeriodMeta.map(p => p ? p.proRationFactor : 1);
    }
    
    // Build SD amount schedule (with escalation if applicable)
    const sdAmountSched = new Array(N + 1).fill(0);
    const escType = rou.secDepEscalationType || 'none';
    
    if (escType === 'custom' && this.effectiveSDCustomSteps(rou).length) {
      const sdCustomSteps = this.effectiveSDCustomSteps(rou);
      // Custom steps: apply specific amounts for month ranges
      for (let m = 1; m <= N; m++) {
        let foundAmount = baseAmt;
        // Find the step that covers this month
        for (const step of sdCustomSteps) {
          if (m >= step.fromMonth && m <= step.toMonth) {
            foundAmount = step.amount;
            break;
          }
        }
        sdAmountSched[m] = foundAmount;
      }
    } else if (escType === 'fixed' && parseFloat(rou.secDepEscalationPct) > 0) {
      // Fixed % escalation
      const freq = parseInt(rou.secDepEscalationFreq) || 12;
      const firstEsc = parseInt(rou.secDepEscalationFirst) || 12;
      const pct = parseFloat(rou.secDepEscalationPct);
      let currentAmt = baseAmt;
      for (let m = 1; m <= N; m++) {
        if (m >= firstEsc && (m - firstEsc) % freq === 0 && m > 1) {
          currentAmt = currentAmt * (1 + pct / 100);
        }
        sdAmountSched[m] = currentAmt;
      }
    } else {
      // No escalation
      for (let m = 1; m <= N; m++) sdAmountSched[m] = baseAmt;
    }
    
    // First month gross amount and final maturity amount
    const firstMonthGross = sdAmountSched[1];
    const finalGrossAmt = sdAmountSched[N];
    
    // Calculate initial Ind AS value using discount rate
    let discountPeriods;
    if (unwindFrom === 'month_end') {
      discountPeriods = N - 1;
    } else {
      discountPeriods = N;
    }
    
    const initialIndAS = this.r2(finalGrossAmt / Math.pow(1 + discountRate, discountPeriods));
    
    // Calculate PV at first month and last month for notional discount
    // The "PV" column in the schedule shows: PV of the final gross amount at each point in time
    let firstMonthPV, lastMonthPV;
    
    if (unwindFrom === 'month_end') {
      // First month: N-1 periods remaining
      firstMonthPV = this.r2(finalGrossAmt / Math.pow(1 + discountRate, N - 1));
      // Last month: 0 periods remaining (equals gross)
      lastMonthPV = finalGrossAmt;
    } else {
      // First month: N periods remaining
      firstMonthPV = this.r2(finalGrossAmt / Math.pow(1 + discountRate, N));
      // Last month: 1 period remaining
      lastMonthPV = this.r2(finalGrossAmt / Math.pow(1 + discountRate, 1));
    }
    
    // Notional Discount calculation based on selected method
    let notionalDiscount;
    if (calcMethod === 'gross_difference') {
      // Option 2: SD Gross of FIRST month - SD PV of FIRST month
      // Uses: First Month Gross Amount - First Month PV
      // Example: If first month gross = 12,00,000 and firstMonthPV = 7,96,294
      // Then notional discount = 12,00,000 - 7,96,294 = 4,03,706
      notionalDiscount = this.r2(firstMonthGross - firstMonthPV);
    } else {
      // Option 1 (Default): Last Month PV - First Month PV
      // Uses: PV column value at last month - PV column value at first month
      // The PV column shows the theoretical PV of the final amount at each point
      // Example: If lastMonthPV = 11,94,523 and firstMonthPV = 7,96,294
      // Then notional discount = 11,94,523 - 7,96,294 = 3,98,229
      notionalDiscount = this.r2(lastMonthPV - firstMonthPV);
    }
    
    // Monthly depreciation of notional discount (straight-line over N months)
    const monthlyDiscountDep = N > 0 ? this.r2(notionalDiscount / N) : 0;
    
    // Build monthly schedule using unwind rate
    let open = initialIndAS;
    let discountOpen = notionalDiscount;
    const rows = [];
    
    for (let m = 1; m <= N; m++) {
      // In calendar mode the date comes from sdPeriodMeta (aligned with rent rows by paymentTiming);
      // in month mode it remains the legacy lease-month bucket date (unchanged behaviour).
      const monthDate = sdPeriodMeta && sdPeriodMeta[m] ? sdPeriodMeta[m].date : this.addMonths(accrualStart, m - 1);
      const periodInfo = sdPeriodMeta && sdPeriodMeta[m] ? sdPeriodMeta[m] : null;
      const proRationFactor = sdProRationFactors ? sdProRationFactors[m] : 1;
      const grossAtMonth = sdAmountSched[m];
      
      let interest = open * unwindRate;
      let close = open + interest;
      
      // Calculate PV at this month
      let pvAtMonth;
      if (unwindFrom === 'month_end') {
        const remainingPeriods = Math.max(0, N - m);
        pvAtMonth = remainingPeriods === 0 ? finalGrossAmt : this.r2(finalGrossAmt / Math.pow(1 + discountRate, remainingPeriods));
      } else {
        const remainingPeriods = N - m + 1;
        pvAtMonth = this.r2(finalGrossAmt / Math.pow(1 + discountRate, remainingPeriods));
      }
      
      // Force final month close to 0 when tenure ends (security deposit is refunded)
      // Opening + Interest should equal the gross deposit amount
      if (m === N) {
        interest = this.r2(finalGrossAmt - open);
        close = 0; // Closing balance is 0 as the deposit is refunded at tenure end
      }
      
      // Notional discount depreciation (straight-line)
      const discountDep = monthlyDiscountDep;
      const discountClose = this.r2(discountOpen - discountDep);
      
      rows.push({ 
        m, 
        date: monthDate, 
        fy: this.fyTag(monthDate), 
        open: this.r2(open), 
        interest: this.r2(interest), 
        close: this.r2(close),
        gross: this.r2(grossAtMonth),
        pv: pvAtMonth,
        discountOpen: this.r2(discountOpen),
        discountDep: this.r2(discountDep),
        discountClose: this.r2(discountClose),
        // Calendar-aligned metadata (null in month mode)
        periodFrom: periodInfo ? periodInfo.from : null,
        periodTo: periodInfo ? periodInfo.to : null,
        daysInPeriod: periodInfo ? periodInfo.daysInPeriod : null,
        daysInMonth: periodInfo ? periodInfo.daysInMonth : null,
        isPartialMonth: periodInfo ? periodInfo.isPartial : false
      });
      open = close;
      discountOpen = discountClose;
    }
    
    return { 
      N, 
      gross: finalGrossAmt,
      baseGross: baseAmt,
      firstMonthGross: firstMonthGross,
      initialIndAS, 
      notionalDiscount,
      calcMethod,
      rows, 
      discountRate, 
      unwindRate,
      paid, 
      pvAnchor,
      accrualStart, 
      unwindFrom,
      hasEscalation: escType !== 'none',
      escalationType: escType
    };
  },

  // Position & P&L at a reporting date
  positionAt(rou, reportingDate, periodStartDate) {
    const sch = this.compute(rou);
    if (sch.error) return null;
    const rd = new Date(reportingDate);
    const repFY = this.fyTag(rd);

    // Reporting-period window. If periodStartDate is supplied, use it (supports
    // partial periods of any length — 5 months, 6 months, etc). Otherwise fall
    // back to the financial year containing the reporting date.
    let periodStart;
    if (periodStartDate) {
      periodStart = new Date(periodStartDate);
    } else {
      const y = rd.getMonth() >= 3 ? rd.getFullYear() : rd.getFullYear() - 1;
      periodStart = new Date(y, 3, 1);
    }

    // rows up to and including reporting date
    const pastRows = sch.rows.filter(r => r.date <= rd);
    const futureRows = sch.rows.filter(r => r.date > rd);
    const lastPast = pastRows[pastRows.length - 1] || null;

    const closingLiab = lastPast ? lastPast.closeLiab : sch.initialLiability;
    const closingROU = lastPast ? lastPast.closeROU : sch.rouCost;
    const accDep = lastPast ? lastPast.accDep : 0;

    // current/non-current from future rows
    const split = this.splitCurrentNonCurrent(futureRows, closingLiab);

    // Period P&L: sum depreciation + interest + payment for rows whose date falls
    // strictly within [periodStart, reportingDate] — NOT the whole financial year.
    let fyDep = 0, fyInt = 0, fyPay = 0;
    sch.rows.forEach(r => {
      if (r.date >= periodStart && r.date <= rd) { fyDep += r.dep; fyInt += r.interest; fyPay += r.payment; }
    });

    // Opening position = closing balance of the row immediately before periodStart
    const beforePeriod = sch.rows.filter(r => r.date < periodStart);
    const lastBeforePeriod = beforePeriod[beforePeriod.length - 1] || null;
    const isTrans = sch.transitionMonth != null;
    const firstRowInPeriod = sch.rows.length && sch.rows[0].date >= periodStart;
    
    // additions = initial recognition within the reporting period.
    // Transition leases are NOT newly-recognised — they were booked in a prior period; the user just
    // resumed them at the opening date. Treat additions as zero for transition cases.
    const recognisedInPeriod = sch.rows.length && sch.rows[0].date >= periodStart && sch.rows[0].date <= rd;
    const additions = (recognisedInPeriod && !isTrans) ? sch.rouCost : 0;
    
    // For a transition lease where the schedule resumes from periodStart, the opening ROU is the
    // carrying NBV (sch.rows[0].openROU = openingROUnbv) — NOT sch.rouCost (which is the gross cost
    // = NBV + accumulated dep). Same logic doesn't apply to liability because sch.initialLiability
    // is already the opening liability for transition (not gross).
    // FIXED: If lease is recognized IN the period (not transition), opening should be 0, not rouCost
    // to avoid double-counting with additions.
    const openingLiab = lastBeforePeriod ? lastBeforePeriod.closeLiab : (firstRowInPeriod && isTrans ? sch.initialLiability : 0);
    const openingROU  = lastBeforePeriod ? lastBeforePeriod.closeROU
                        : (firstRowInPeriod && isTrans ? sch.rows[0].openROU : 0);

    let sdOpen = 0, sdClose = 0, sdInt = 0;
    if (sch.secDep) {
      const sdPast = sch.secDep.rows.filter(r => r.date <= rd);
      const sdBeforePeriod = sch.secDep.rows.filter(r => r.date < periodStart);
      const lastSDBeforePeriod = sdBeforePeriod[sdBeforePeriod.length - 1] || null;
      
      // SD Opening = closing balance just before period start
      sdOpen = lastSDBeforePeriod ? lastSDBeforePeriod.close : sch.secDep.initialIndAS;
      
      // SD Closing = closing balance at reporting date
      sdClose = sdPast.length ? sdPast[sdPast.length - 1].close : sch.secDep.initialIndAS;
      
      // SD Interest = sum of interest within the period
      sch.secDep.rows.forEach(r => { if (r.date >= periodStart && r.date <= rd) sdInt += r.interest; });
    }

    return {
      sch, repFY, periodStart, closingLiab, closingROU, accDep, split,
      fyDep: this.r2(fyDep), fyInt: this.r2(fyInt), fyPay: this.r2(fyPay),
      openingLiab, openingROU, additions,
      sdGross: sch.secDep ? sch.secDep.gross : 0,
      sdOpen: this.r2(sdOpen),
      sdClose: this.r2(sdClose),
      sdInterest: this.r2(sdInt),
      sdIndAS: sdClose, // Legacy field for compatibility
      sdNotional: sch.secDep ? sch.secDep.notionalDiscount : 0
    };
  },

  splitCurrentNonCurrent(futureRows, closingLiab) {
    if (!futureRows.length) return { current: 0, nc12: 0, nc25: 0, nc5: 0, total: 0, nonCurrent: 0 };
    const at = i => futureRows[i] ? futureRows[i].closeLiab : 0;
    const r2 = this.r2;
    // Ensure current is never negative (can happen when lease has < 12 months remaining)
    const current = Math.max(0, r2(closingLiab - at(11)));
    const nc12 = Math.max(0, r2((futureRows[11] ? futureRows[11].closeLiab : 0) - at(23)));
    const nc25 = Math.max(0, r2((futureRows[23] ? futureRows[23].closeLiab : 0) - at(59)));
    const nc5 = Math.max(0, r2(futureRows[59] ? futureRows[59].closeLiab : 0));
    const nonCurrent = r2(nc12 + nc25 + nc5);
    return { current, nc12, nc25, nc5, total: r2(closingLiab), nonCurrent: isNaN(nonCurrent) ? 0 : nonCurrent };
  },

  // Maturity profile: PV of liabilities by bucket from reporting date.
  // Para 58(b): bands are < 1 year / 1–2 years / 2–5 years / > 5 years
  // Uses same logic as splitCurrentNonCurrent for consistency
  maturityProfile(rou, reportingDate) {
    const sch = this.compute(rou);
    if (sch.error) return { y1: 0, y12: 0, y25: 0, y5: 0, y1pv: 0, y12pv: 0, y25pv: 0, y5pv: 0, total: 0 };
    const rd = new Date(reportingDate);
    const oneYearOut = this.addMonths(rd, 12);
    const twoYearsOut = this.addMonths(rd, 24);
    const fiveYearsOut = this.addMonths(rd, 60);
    
    // Find all future rows after reporting date
    const futureRows = sch.rows.filter(r => r.date > rd);
    
    if (!futureRows.length) {
      return { y1: 0, y12: 0, y25: 0, y5: 0, y1pv: 0, y12pv: 0, y25pv: 0, y5pv: 0, total: 0 };
    }
    
    // Get closing liability at reporting date
    let closingLiab = 0;
    sch.rows.forEach(r => {
      if (r.date <= rd) {
        closingLiab = r.closeLiab;
      }
    });
    
    // Calculate undiscounted payments by bucket
    let y1 = 0, y12 = 0, y25 = 0, y5 = 0;
    futureRows.forEach(r => {
      if (r.date <= oneYearOut) {
        y1 += r.payment;
      } else if (r.date <= twoYearsOut) {
        y12 += r.payment;
      } else if (r.date <= fiveYearsOut) {
        y25 += r.payment;
      } else {
        y5 += r.payment;
      }
    });
    
    // Calculate PV buckets using index-based method like splitCurrentNonCurrent
    const r2 = this.r2;
    let y1pv = 0, y12pv = 0, y25pv = 0, y5pv = 0;
    
    // Safe accessor for future rows
    const getLiabAt = (index) => {
      if (futureRows[index] && typeof futureRows[index].closeLiab === 'number') {
        return futureRows[index].closeLiab;
      }
      return 0;
    };
    
    // Calculate PV for each bucket
    const liab11 = getLiabAt(11);
    const liab23 = getLiabAt(23);
    const liab59 = getLiabAt(59);
    
    y1pv = r2(closingLiab - liab11);
    y12pv = r2(liab11 - liab23);
    y25pv = r2(liab23 - liab59);
    y5pv = r2(liab59);
    
    // Ensure no negative values
    y1pv = Math.max(0, y1pv);
    y12pv = Math.max(0, y12pv);
    y25pv = Math.max(0, y25pv);
    y5pv = Math.max(0, y5pv);
    
    return { 
      y1: r2(y1), 
      y12: r2(y12), 
      y25: r2(y25), 
      y5: r2(y5), 
      y1pv: y1pv,
      y12pv: y12pv,
      y25pv: y25pv,
      y5pv: y5pv,
      total: r2(y1 + y12 + y25 + y5) 
    };
  }
};

// ════════════════════════════════════════════════════════════
// FORM (Add / Edit ROU)
