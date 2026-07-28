window.ReassessOverride = {
  KEY: 'reassess_override_',
  _pendingOverride: null,

  _load(clientId) {
    if (!clientId) return [];
    const data = DB.get(this.KEY + clientId);
    return Array.isArray(data) ? data : [];
  },

  _save(clientId, overrides) {
    if (!clientId) return;
    DB.set(this.KEY + clientId, overrides);
  },

  // Get all overrides for a specific ROU
  getForROU(clientId, rouId) {
    const all = this._load(clientId);
    return all.filter(o => o.rouId === rouId);
  },

  // Get overrides within a date range (for a specific ROU)
  getForPeriod(clientId, rouId, periodStart, periodEnd) {
    const all = this.getForROU(clientId, rouId);
    const ps = new Date(periodStart);
    const pe = new Date(periodEnd);
    return all.filter(o => {
      const od = new Date(o.reassessDate);
      return od >= ps && od <= pe;
    });
  },

  // Calculate total differential for a ROU at a specific date
  getDifferentialAtDate(clientId, rouId, asOfDate) {
    const all = this.getForROU(clientId, rouId);
    const targetDate = new Date(asOfDate);
    
    let totalRouDiff = 0, totalLiabDiff = 0, totalSDDiff = 0;
    
    all.forEach(o => {
      const od = new Date(o.reassessDate);
      if (od <= targetDate) {
        totalRouDiff += o.diff.rou || 0;
        totalLiabDiff += o.diff.liab || 0;
        totalSDDiff += o.diff.sd || 0;
      }
    });

    return {
      rou: Engine.r2(totalRouDiff),
      liab: Engine.r2(totalLiabDiff),
      sd: Engine.r2(totalSDDiff)
    };
  },

  prepare() {
    if (!App.currentClient) return;
    
    // Populate location dropdown with correct key
    const rous = DB.get('rous_' + App.currentClient.id) || [];
    const select = document.getElementById('ro-location');
    
    select.innerHTML = '<option value="">— Select a location —</option>';
    
    // Sort by branch name for easier finding
    rous.sort((a, b) => (a.branchName || '').localeCompare(b.branchName || ''));
    
    rous.forEach(rou => {
      const option = document.createElement('option');
      option.value = rou.id;
      option.textContent = `${rou.branchName} (${rou.partyName || 'No party'})`;
      
      // Check if this ROU has overrides - add indicator
      const hasOverride = this.getForROU(App.currentClient.id, rou.id).length > 0;
      if (hasOverride) {
        option.textContent += ' ⚡';
        option.style.fontWeight = '600';
      }
      
      select.appendChild(option);
    });

    // Attach search filter to the location input (if user types)
    this._attachSearchFilter();

    this.renderTable();
    this.reset();
  },

  _attachSearchFilter() {
    const select = document.getElementById('ro-location');
    const searchInput = document.getElementById('ro-location-search');
    
    if (!searchInput) return;
    
    // Store original options
    if (!this._allOptions) {
      this._allOptions = Array.from(select.options).slice(1); // Skip first "Select" option
    }
    
    searchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      
      // Clear current options except first
      select.innerHTML = '<option value="">— Select a location —</option>';
      
      // Filter and re-add matching options
      this._allOptions.forEach(opt => {
        if (opt.textContent.toLowerCase().includes(searchTerm)) {
          select.appendChild(opt.cloneNode(true));
        }
      });
    });
  },
  reset() {
    document.getElementById('ro-location').value = '';
    document.getElementById('ro-date').value = '';
    document.getElementById('ro-post-rou').value = '';
    document.getElementById('ro-post-liab').value = '';
    document.getElementById('ro-post-sd').value = '';
    document.getElementById('ro-post-rou-sd').value = '';
    document.getElementById('ro-post-sd-gross').value = '';
    document.getElementById('ro-pre-values').hidden = true;
    this._preValues = null;
    this._pendingOverride = null;
    this._editingId = null;
    
    // Reset button text to "Calculate and Override"
    const calcBtn = document.querySelector('#page-reassess-override .btn-primary');
    if (calcBtn) {
      calcBtn.textContent = 'Calculate and Override';
      calcBtn.style.background = '';
    }
  },

  onLocationChange() {
    const rouId = document.getElementById('ro-location').value;
    const date = document.getElementById('ro-date').value;
    
    if (!rouId || !date) {
      document.getElementById('ro-pre-values').hidden = true;
      return;
    }

    this.computePreValues();
  },

  computePreValues() {
    const rouId = document.getElementById('ro-location').value;
    const date = document.getElementById('ro-date').value;
    
    if (!rouId || !date || !App.currentClient) {
      document.getElementById('ro-pre-values').hidden = true;
      return;
    }

    const rous = DB.get('rous_' + App.currentClient.id) || [];
    const rou = rous.find(r => r.id === rouId);
    if (!rou) {
      toast('ROU not found', 'error');
      return;
    }

    // Validate date is within lease term
    if (date < rou.startDate || date > rou.endDate) {
      toast('Reassessment date must fall within lease term (' + Utils.fmtDate(rou.startDate) + ' to ' + Utils.fmtDate(rou.endDate) + ')', 'error');
      document.getElementById('ro-pre-values').hidden = true;
      return;
    }

    // Build schedule
    const sch = Engine.compute(rou);
    if (sch.error) {
      toast('Error computing schedule: ' + sch.error, 'error');
      return;
    }

    console.log('Schedule computed, total rows:', sch.rows.length);
    console.log('Looking for date:', date);

    // Convert reassessment date to comparable format (YYYY-MM-DD)
    const targetDate = new Date(date + 'T00:00:00'); // Ensure it's treated as local date
    const targetYear = targetDate.getFullYear();
    const targetMonth = targetDate.getMonth();
    const targetDay = targetDate.getDate();

    console.log('Target date components:', { targetYear, targetMonth, targetDay });

    // Find the row that matches the reassessment date EXACTLY
    // The schedule rows have dates that should match the month-end or lease date
    let rowAtDate = null;
    let closestRow = null;
    let minDiff = Infinity;

    for (let i = 0; i < sch.rows.length; i++) {
      const row = sch.rows[i];
      const rowDate = new Date(row.date);
      const rowYear = rowDate.getFullYear();
      const rowMonth = rowDate.getMonth();
      const rowDay = rowDate.getDate();

      // Exact match on year, month, day
      if (rowYear === targetYear && rowMonth === targetMonth && rowDay === targetDay) {
        rowAtDate = row;
        console.log('Found EXACT match at row', i, ':', Utils.fmtDate(row.date));
        break;
      }

      // Track closest row (on or after target date) as fallback
      const diff = rowDate - targetDate;
      if (diff >= 0 && diff < minDiff) {
        minDiff = diff;
        closestRow = row;
      }
    }

    // If no exact match, use closest row on or after the date
    if (!rowAtDate && closestRow) {
      rowAtDate = closestRow;
      console.log('No exact match, using closest row:', Utils.fmtDate(closestRow.date));
    }

    if (!rowAtDate) {
      console.error('No suitable row found in schedule');
      toast('Could not find schedule data for the selected date. The date may be before the lease starts or after it ends.', 'error');
      document.getElementById('ro-pre-values').hidden = true;
      return;
    }

    console.log('Selected row:', {
      date: Utils.fmtDate(rowAtDate.date),
      openROU: rowAtDate.openROU,
      openLiab: rowAtDate.openLiab,
      closeROU: rowAtDate.closeROU,
      closeLiab: rowAtDate.closeLiab
    });

    // Pre-reassessment values (engine computed)
    // Use OPENING balances from the selected row - these are the values at the START of that date
    const preROU = Engine.r2(rowAtDate.openROU || 0);
    const preLiab = Engine.r2(rowAtDate.openLiab || 0);
    
    // SD value - find matching date in SD schedule and use OPENING balance
    let preSD = 0;
    if (sch.secDep && sch.secDep.rows && sch.secDep.rows.length > 0) {
      console.log('Looking for SD value...');
      
      // Try to find SD row with matching date
      let sdRow = null;
      let closestSDRow = null;
      let minSDDiff = Infinity;

      for (let i = 0; i < sch.secDep.rows.length; i++) {
        const sdr = sch.secDep.rows[i];
        const sdrDate = new Date(sdr.date);
        const sdrYear = sdrDate.getFullYear();
        const sdrMonth = sdrDate.getMonth();
        const sdrDay = sdrDate.getDate();

        // Exact match
        if (sdrYear === targetYear && sdrMonth === targetMonth && sdrDay === targetDay) {
          sdRow = sdr;
          console.log('Found EXACT SD match:', Utils.fmtDate(sdr.date));
          break;
        }

        // Closest on or after
        const diff = sdrDate - targetDate;
        if (diff >= 0 && diff < minSDDiff) {
          minSDDiff = diff;
          closestSDRow = sdr;
        }
      }

      if (!sdRow && closestSDRow) {
        sdRow = closestSDRow;
        console.log('Using closest SD row:', Utils.fmtDate(closestSDRow.date));
      }

      if (sdRow) {
        // Use OPENING balance for SD (value at start of the date)
        preSD = Engine.r2(sdRow.open || sdRow.openIndAS || 0);
        console.log('SD opening value:', preSD);
      } else {
        console.log('No SD row found, using 0');
      }
    } else {
      console.log('No security deposit schedule available');
    }

    console.log('Final pre-values (OPENING balances):', { preROU, preLiab, preSD });

    // Calculate ROU SD (notional/discounted SD) - this is the discount on SD
    let preRouSD = 0;
    if (sch.secDep && sch.secDep.rows && sch.secDep.rows.length > 0) {
      console.log('Looking for ROU SD (discount) at reassessment date...');
      
      // Find the SD row for the reassessment date
      let sdRowForRouSD = null;
      let closestSDRowForRouSD = null;
      let minSDDiffForRouSD = Infinity;

      for (let i = 0; i < sch.secDep.rows.length; i++) {
        const sdr = sch.secDep.rows[i];
        const sdrDate = new Date(sdr.date);
        const sdrYear = sdrDate.getFullYear();
        const sdrMonth = sdrDate.getMonth();
        const sdrDay = sdrDate.getDate();

        // Exact match
        if (sdrYear === targetYear && sdrMonth === targetMonth && sdrDay === targetDay) {
          sdRowForRouSD = sdr;
          console.log('Found EXACT ROU SD match:', Utils.fmtDate(sdr.date));
          break;
        }

        // Closest on or after
        const diff = sdrDate - targetDate;
        if (diff >= 0 && diff < minSDDiffForRouSD) {
          minSDDiffForRouSD = diff;
          closestSDRowForRouSD = sdr;
        }
      }

      if (!sdRowForRouSD && closestSDRowForRouSD) {
        sdRowForRouSD = closestSDRowForRouSD;
        console.log('Using closest ROU SD row:', Utils.fmtDate(closestSDRowForRouSD.date));
      }

      if (sdRowForRouSD) {
        // Use OPENING balance for ROU SD (discount opening balance)
        preRouSD = Engine.r2(sdRowForRouSD.discountOpen || 0);
        console.log('ROU SD opening value (discount):', preRouSD);
      } else {
        console.log('No ROU SD row found, using 0');
      }
    } else {
      console.log('No security deposit schedule available for ROU SD');
    }

    console.log('Final pre-values including ROU SD (OPENING balances):', { preROU, preLiab, preSD, preRouSD });

    // Display
    document.getElementById('ro-pre-rou').textContent = '₹' + preROU.toLocaleString('en-IN');
    document.getElementById('ro-pre-liab').textContent = '₹' + preLiab.toLocaleString('en-IN');
    document.getElementById('ro-pre-sd').textContent = '₹' + preSD.toLocaleString('en-IN');
    document.getElementById('ro-pre-rou-sd').textContent = '₹' + preRouSD.toLocaleString('en-IN');
    document.getElementById('ro-pre-values').hidden = false;

    // Store for later
    this._preValues = { rou: preROU, liab: preLiab, sd: preSD, rouSD: preRouSD };
    
    console.log('Pre-values stored successfully');
  },

  save() {
    console.log('=== SAVE FUNCTION CALLED ===');
    
    if (!App.currentClient) {
      console.error('No client selected');
      toast('No client selected', 'error');
      return;
    }
    
    console.log('Current client:', App.currentClient);

    const rouId = document.getElementById('ro-location').value;
    const date = document.getElementById('ro-date').value;
    const postROUInput = document.getElementById('ro-post-rou');
    const postLiabInput = document.getElementById('ro-post-liab');
    const postSDInput = document.getElementById('ro-post-sd');
    const postRouSDInput = document.getElementById('ro-post-rou-sd');
    const postSDGrossInput = document.getElementById('ro-post-sd-gross');
    
    console.log('Input elements:', { 
      postROUInput, 
      postLiabInput, 
      postSDInput,
      postRouSDInput,
      postSDGrossInput 
    });
    
    const postROU = parseFloat(postROUInput ? postROUInput.value : '');
    const postLiab = parseFloat(postLiabInput ? postLiabInput.value : '');
    const postSD = parseFloat(postSDInput ? postSDInput.value : '');
    const postRouSD = parseFloat(postRouSDInput ? postRouSDInput.value : '');
    const postSDGross = parseFloat(postSDGrossInput ? postSDGrossInput.value : '') || 0;

    console.log('Save called with:', { rouId, date, postROU, postLiab, postSD, postRouSD, postSDGross });

    // Validation
    if (!rouId) {
      console.error('No location selected');
      toast('Please select a location', 'error');
      return;
    }
    
    if (!date) {
      console.error('No date selected');
      toast('Please select a reassessment date', 'error');
      return;
    }

    if (isNaN(postROU) || isNaN(postLiab) || isNaN(postSD) || isNaN(postRouSD)) {
      console.error('Invalid numeric values:', { postROU, postLiab, postSD, postRouSD });
      toast('Please fill all required post-reassessment figures (ROU, Liability, SD, ROU SD)', 'error');
      return;
    }

    // Compute pre-values if not already done
    if (!this._preValues) {
      console.log('Pre-values not computed, computing now...');
      this.computePreValues();
      if (!this._preValues) {
        console.error('Failed to compute pre-values');
        toast('Unable to compute pre-reassessment values. Please check the date and try again.', 'error');
        return;
      }
    }

    console.log('Pre-values:', this._preValues);

    // Get ROU details
    const rous = DB.get('rous_' + App.currentClient.id) || [];
    console.log('Found ROUs:', rous.length);
    const rou = rous.find(r => r.id === rouId);
    if (!rou) {
      console.error('ROU not found for id:', rouId);
      toast('ROU not found', 'error');
      return;
    }
    
    console.log('Found ROU:', rou);

    // Calculate differentials
    const diffROU = Engine.r2(postROU - this._preValues.rou);
    const diffLiab = Engine.r2(postLiab - this._preValues.liab);
    const diffSD = Engine.r2(postSD - this._preValues.sd);
    const diffRouSD = Engine.r2(postRouSD - this._preValues.rouSD);

    console.log('Differentials:', { diffROU, diffLiab, diffSD, diffRouSD });

    // Gain/Loss on modification (optional)
    const gainLoss = Engine.r2(diffLiab - diffROU);

    // Store pending override for confirmation
    this._pendingOverride = {
      id: 'ro_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      rouId: rouId,
      rouName: rou.branchName,
      rouParty: rou.partyName || '',
      reassessDate: date,
      pre: { ...this._preValues },
      post: {
        rou: Engine.r2(postROU),
        liab: Engine.r2(postLiab),
        sd: Engine.r2(postSD),
        rouSD: Engine.r2(postRouSD),
        sdGross: Engine.r2(postSDGross)
      },
      diff: {
        rou: diffROU,
        liab: diffLiab,
        sd: diffSD,
        rouSD: diffRouSD
      },
      gainLoss: gainLoss,
      createdAt: new Date().toISOString(),
      createdBy: 'User'
    };

    console.log('Pending override created:', this._pendingOverride);

    // Show confirmation modal
    console.log('Calling showConfirmation...');
    this.showConfirmation();
  },

  showConfirmation() {
    if (!this._pendingOverride) return;

    const o = this._pendingOverride;
    
    document.getElementById('ro-confirm-location').textContent = `${o.rouName} ${o.rouParty ? '(' + o.rouParty + ')' : ''}`;
    document.getElementById('ro-confirm-date').textContent = Utils.fmtDate(o.reassessDate);

    // Build table
    const rows = [
      { label: 'ROU NBV', pre: o.pre.rou, post: o.post.rou, diff: o.diff.rou },
      { label: 'Lease Liability', pre: o.pre.liab, post: o.post.liab, diff: o.diff.liab },
      { label: 'SD Ind AS', pre: o.pre.sd, post: o.post.sd, diff: o.diff.sd },
      { label: 'ROU SD', pre: o.pre.rouSD, post: o.post.rouSD, diff: o.diff.rouSD }
    ];

    const tbody = document.getElementById('ro-confirm-tbody');
    tbody.innerHTML = rows.map(r => {
      const diffColor = r.diff > 0 ? '#065f46' : (r.diff < 0 ? '#991b1b' : 'var(--text3)');
      const diffSign = r.diff > 0 ? '+' : '';
      return `
        <tr style="border-bottom:1px solid var(--border)">
          <td style="padding:8px 8px 8px 0;font-family:'Poppins',sans-serif;font-weight:500">${r.label}</td>
          <td style="padding:8px;text-align:right">₹${r.pre.toLocaleString('en-IN')}</td>
          <td style="padding:8px;text-align:right">₹${r.post.toLocaleString('en-IN')}</td>
          <td style="padding:8px;text-align:right;color:${diffColor};font-weight:700">${diffSign}₹${Math.abs(r.diff).toLocaleString('en-IN')}</td>
        </tr>
      `;
    }).join('');

    // Show gain/loss if applicable
    if (Math.abs(o.gainLoss) > 0.01) {
      document.getElementById('ro-confirm-gain-loss').style.display = '';
      const glSign = o.gainLoss > 0 ? 'Gain: +' : 'Loss: ';
      document.getElementById('ro-confirm-gl-amount').textContent = glSign + '₹' + Math.abs(o.gainLoss).toLocaleString('en-IN');
    } else {
      document.getElementById('ro-confirm-gain-loss').style.display = 'none';
    }

    Modal.open('modal-ro-confirm');
  },

  confirmSave() {
    if (!this._pendingOverride || !App.currentClient) return;

    const overrides = this._load(App.currentClient.id);
    
    // Check if we're editing an existing override
    if (this._editingId) {
      // Update existing override
      const index = overrides.findIndex(o => o.id === this._editingId);
      if (index !== -1) {
        // Keep the original ID
        this._pendingOverride.id = this._editingId;
        overrides[index] = this._pendingOverride;
        toast('Reassessment override updated successfully', 'success');
      } else {
        // ID not found, add as new
        overrides.push(this._pendingOverride);
        toast('Reassessment override saved successfully', 'success');
      }
      this._editingId = null;
    } else {
      // Create new override
      overrides.push(this._pendingOverride);
      toast('Reassessment override saved successfully', 'success');
    }
    
    this._save(App.currentClient.id, overrides);

    Modal.close('modal-ro-confirm');

    this.renderTable();
    this.reset();
    this.prepare(); // Refresh location dropdown to show indicator
  },

  renderTable() {
    if (!App.currentClient) return;

    const overrides = this._load(App.currentClient.id);
    const tbody = document.getElementById('ro-tbody');
    const badge = document.getElementById('ro-count-badge');

    badge.textContent = `${overrides.length} override${overrides.length !== 1 ? 's' : ''}`;

    if (!overrides.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text3)">No reassessment overrides yet</td></tr>';
      return;
    }

    // Sort by date desc
    overrides.sort((a, b) => new Date(b.reassessDate) - new Date(a.reassessDate));

    tbody.innerHTML = overrides.map(o => {
      const diffColor = val => val > 0 ? 'color:#065f46' : (val < 0 ? 'color:#991b1b' : 'color:var(--text3)');
      const diffSign = val => val > 0 ? '+' : '';
      const fmt = val => diffSign(val) + '₹' + Math.abs(val).toLocaleString('en-IN');

      return `
        <tr>
          <td style="font-weight:600">${o.rouName}<br><span style="font-size:10px;color:var(--text3);font-weight:400">${o.rouParty || ''}</span></td>
          <td class="mono">${Utils.fmtDate(o.reassessDate)}</td>
          <td class="mono" style="${diffColor(o.diff.rou)}">${fmt(o.diff.rou)}</td>
          <td class="mono" style="${diffColor(o.diff.liab)}">${fmt(o.diff.liab)}</td>
          <td class="mono" style="${diffColor(o.diff.sd)}">${fmt(o.diff.sd)}</td>
          <td class="mono" style="${diffColor(o.diff.rouSD || 0)}">${fmt(o.diff.rouSD || 0)}</td>
          <td class="td-actions">
            <button class="btn btn-ghost btn-sm" onclick="ReassessOverride.edit('${o.id}')" style="color:var(--primary);border-color:var(--primary);margin-right:6px">Edit</button>
            <button class="btn btn-ghost btn-sm" onclick="ReassessOverride.delete('${o.id}')" style="color:var(--red);border-color:var(--red)">Delete</button>
          </td>
        </tr>
      `;
    }).join('');
  },

  edit(overrideId) {
    if (!App.currentClient) return;

    const overrides = this._load(App.currentClient.id);
    const override = overrides.find(o => o.id === overrideId);
    
    if (!override) {
      toast('Override not found', 'error');
      return;
    }

    // Store the override ID for updating
    this._editingId = overrideId;

    // Populate the form with existing data
    document.getElementById('ro-location').value = override.rouId;
    document.getElementById('ro-date').value = override.reassessDate;
    document.getElementById('ro-post-rou').value = override.post.rou;
    document.getElementById('ro-post-liab').value = override.post.liab;
    document.getElementById('ro-post-sd').value = override.post.sd;
    document.getElementById('ro-post-rou-sd').value = override.post.rouSD || 0;
    document.getElementById('ro-post-sd-gross').value = override.post.sdGross || 0;

    // Show pre-values
    document.getElementById('ro-pre-rou').textContent = '₹' + override.pre.rou.toLocaleString('en-IN');
    document.getElementById('ro-pre-liab').textContent = '₹' + override.pre.liab.toLocaleString('en-IN');
    document.getElementById('ro-pre-sd').textContent = '₹' + override.pre.sd.toLocaleString('en-IN');
    document.getElementById('ro-pre-rou-sd').textContent = '₹' + (override.pre.rouSD || 0).toLocaleString('en-IN');
    document.getElementById('ro-pre-values').hidden = false;

    // Store pre-values
    this._preValues = override.pre;

    // Change button text to "Update"
    const calcBtn = document.querySelector('#page-reassess-override .btn-primary');
    if (calcBtn) {
      calcBtn.textContent = 'Update Override';
      calcBtn.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    toast('Editing override - Update the values and click "Update Override"', 'info', 4000);
  },

  delete(overrideId) {
    if (!App.currentClient) return;
    if (!confirm('Delete this reassessment override? This cannot be undone.')) return;

    const overrides = this._load(App.currentClient.id);
    const filtered = overrides.filter(o => o.id !== overrideId);
    this._save(App.currentClient.id, filtered);

    toast('Override deleted', 'info');
    this.renderTable();
    this.prepare(); // Refresh location dropdown
  }
};

// ════════════════════════════════════════════════════════════
// LIVE PREVIEW (right panel on Add ROU page)
