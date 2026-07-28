window.BulkImport = {
  data: [],
  
  prepare() {
    document.getElementById('bulk-import-preview').style.display = 'none';
    document.getElementById('bulk-import-file').value = '';
  },
  
  downloadTemplate() {
    // Header row + 2 sample rows. New optional columns are appended at the end so older templates still import cleanly.
    const csv = 'Branch Name,Party Name,Start Date,End Date,Monthly Rent,IBR %,Security Deposit,Address,Payment Timing,Initial Direct Costs,Lease Incentives,Variable Rent\n' +
      'Mumbai Office,ABC Properties,01/04/2024,31/03/2029,100000,9,200000,"123 Main St, Mumbai",advance,0,0,0\n' +
      'Delhi Branch,XYZ Realty,15/06/2024,14/06/2029,150000,8.5,300000,"456 Park Ave, Delhi",advance,25000,0,5000';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ROU_Import_Template.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast('Template downloaded! Use DD/MM/YYYY for dates. Payment Timing = "advance" or "arrears"', 'success');
  },
  
  handleFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        this.parseCSV(text);
      } catch (err) {
        toast('Error reading file: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  },
  
  parseCSV(text) {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) {
      toast('File is empty or invalid', 'error');
      return;
    }
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const rows = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
      const obj = {};
      headers.forEach((h, i) => obj[h] = values[i] || '');
      return obj;
    });
    
    this.data = rows;
    this.showPreview(headers, rows);
  },
  
  showPreview(headers, rows) {
    document.getElementById('bulk-preview-count').textContent = rows.length;

    // Build thead safely using textContent
    const thead = document.getElementById('bulk-preview-thead');
    thead.innerHTML = '';
    const hRow = document.createElement('tr');
    headers.forEach(h => { const th = document.createElement('th'); th.textContent = h; hRow.appendChild(th); });
    thead.appendChild(hRow);

    // Build tbody safely using textContent
    const tbody = document.getElementById('bulk-preview-tbody');
    tbody.innerHTML = '';
    rows.slice(0, 10).forEach((r, i) => {
      const tr = document.createElement('tr');
      if (i % 2 === 1) tr.style.background = 'var(--light)';
      headers.forEach(h => { const td = document.createElement('td'); td.textContent = r[h] || ''; tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    if (rows.length > 10) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = headers.length;
      td.style.cssText = 'text-align:center;color:var(--text3);font-style:italic';
      td.textContent = `... and ${rows.length - 10} more rows`;
      tr.appendChild(td); tbody.appendChild(tr);
    }

    document.getElementById('bulk-import-preview').style.display = 'block';
  },
  
  import() {
    const rous = DB.get('rous_' + App.currentClient.id) || [];
    let imported = 0;
    
    this.data.forEach(row => {
      try {
        // Parse payment timing — accept advance/arrears (case-insensitive), default advance.
        let payTiming = String(row['Payment Timing'] || row['payment_timing'] || row['timing'] || 'advance').toLowerCase().trim();
        if (payTiming !== 'arrears' && payTiming !== 'advance') payTiming = 'advance';

        const rou = {
          id: Utils.uid(),
          clientId: App.currentClient.id,
          branchName: row['Branch Name'] || row['branch'] || '',
          partyName: row['Party Name'] || row['party'] || '',
          address: row['Address'] || row['address'] || '',
          status: 'Active',
          leaseType: 'full',
          startDate: this.parseDate(row['Start Date'] || row['start']),
          endDate: this.parseDate(row['End Date'] || row['end']),
          tenureMonths: null,
          baseRent: parseFloat(row['Monthly Rent'] || row['rent'] || 0),
          paymentTiming: payTiming,
          escalationType: 'none',
          escalationPct: 0,
          escalationFreqMonths: 12,
          customSteps: [],
          ibr: parseFloat(row['IBR %'] || row['ibr'] || 9),
          // Para 24 & 38 additional adjustments — default 0 if absent (preserves old templates)
          initialDirectCosts: parseFloat(row['Initial Direct Costs'] || row['idc'] || 0),
          leaseIncentives: parseFloat(row['Lease Incentives'] || row['incentives'] || 0),
          variableRentMonthly: parseFloat(row['Variable Rent'] || row['variable_rent'] || 0),
          secDepAmount: parseFloat(row['Security Deposit'] || row['deposit'] || 0),
          secDepIBR: parseFloat(row['IBR %'] || row['ibr'] || 9),
          secDepPaidDate: this.parseDate(row['Start Date'] || row['start']),
          secDepMaturityDate: this.parseDate(row['End Date'] || row['end']),
          secDepUnwindStart: (String(row['SD Unwind From'] || row['sd_unwind'] || 'month_start').toLowerCase().includes('end') ? 'month_end' : 'month_start'),
          hasMidLeaseOpening: false,
          hasReassessment: false,
          reassessments: [],
          hasOptions: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        rous.push(rou);
        imported++;
      } catch (err) {
        console.error('Error importing row:', row, err);
      }
    });
    
    DB.set('rous_' + App.currentClient.id, rous);
    toast(`Successfully imported ${imported} ROUs!`, 'success');
    this.prepare();
    App.renderAllROUs();
    App.renderDashboard();
    App.showPage('rous');
  },
  
  parseDate(str) {
    if (!str) return '';
    // Try DD/MM/YYYY or DD-MM-YYYY format
    let parts = str.split('/');
    if (parts.length !== 3) {
      parts = str.split('-');
    }
    if (parts.length === 3) {
      // Check if it's already in YYYY-MM-DD format
      if (parts[0].length === 4) {
        return str; // Already in correct format
      }
      // Convert DD/MM/YYYY or DD-MM-YYYY to YYYY-MM-DD
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return str;
  },
  
  cancel() {
    this.prepare();
  }
};

// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
// AUDIT LOG — records every create, edit, delete, duplicate
