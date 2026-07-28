window.Exporter = {
  applySheetView(ws) {
    ws.views = [{ state: 'normal', showGridLines: false }];
  },

  colToNum(col) {
    var n = 0;
    for (var i = 0; i < col.length; i++) n = n * 26 + (col.charCodeAt(i) - 64);
    return n;
  },

  styleRowAcross(ws, rowNo, colEnd, style) {
    var end = this.colToNum(colEnd || 'Q');
    for (var c = 1; c <= end; c++) {
      var cell = ws.getCell(rowNo, c);
      if (style.font) cell.font = style.font;
      if (style.fill) cell.fill = style.fill;
      if (style.alignment) cell.alignment = style.alignment;
      if (style.border) cell.border = style.border;
    }
  },

  prepare() {
    document.getElementById('export-company-name').textContent = App.currentClient?.name || '-';
    const s = DB.get('settings') || {};
    document.getElementById('export-period').textContent = s.periodLabel || Utils.fmtDate(s.period || '');
    const s2 = DB.get('settings') || {};
    const allROUs = DB.get('rous_' + App.currentClient.id) || [];
    let inPeriod = 0, preCount = 0;
    if (s2.periodStart && s2.period) {
      allROUs.forEach(r => {
        if (!r.startDate || r.startDate > s2.period) return;
        const end = r.endDate || s2.period;
        if (end < s2.periodStart) { preCount++; } else { inPeriod++; }
      });
    } else { inPeriod = allROUs.length; }
    const countLabel = (s2.periodStart && s2.period)
      ? inPeriod + ' in period' + (preCount ? ', ' + preCount + ' pre-period' : '')
      : allROUs.length + ' total';
    document.getElementById('export-rou-count').textContent = countLabel;
    document.getElementById('download-link-box').classList.remove('show');
  },

  styleHeader(row, numCols) {
    // Determine column count: use explicit numCols, or count cells that have values, minimum 2
    var count = numCols || 0;
    if (!count) { row.eachCell(function(c) { if (c.col > count) count = c.col; }); }
    if (count < 1) count = 2;
    row.height = 32;
    for (var _c = 1; _c <= count; _c++) {
      var _cell = row.getCell(_c);
      _cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Calibri' };
      _cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F1F3D' } };
      _cell.alignment = { vertical: 'middle', horizontal: _c === 1 ? 'left' : 'center', wrapText: false };
      _cell.border = {
        top:    { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        left:   { style: 'thin', color: { argb: 'FF000000' } },
        right:  { style: 'thin', color: { argb: 'FF000000' } }
      };
    }
  },

  styleDataRow(row, numCols, opts) {
    opts = opts || {};
    row.height = opts.height || 22;
    for (var _c = 1; _c <= numCols; _c++) {
      var _cell = row.getCell(_c);
      if (opts.alignment) {
        _cell.alignment = opts.alignment(_c);
      } else {
        _cell.alignment = { vertical: 'middle', horizontal: _c === 1 ? 'left' : 'right' };
      }
      _cell.border = {
        top:    { style: 'thin', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        left:   { style: 'thin', color: { argb: 'FFD1D5DB' } },
        right:  { style: 'thin', color: { argb: 'FFD1D5DB' } }
      };
    }
  },

  styleSectionTitle(ws, row, numCols) {
    row.height = 26;
    for (var _c = 1; _c <= numCols; _c++) {
      var _cell = row.getCell(_c);
      _cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3060' } };
      _cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
      _cell.alignment = { vertical: 'middle', horizontal: 'left' };
      _cell.border = {
        top:    { style: 'medium', color: { argb: 'FF0F1F3D' } },
        bottom: { style: 'medium', color: { argb: 'FF0F1F3D' } },
        left:   { style: 'thin',   color: { argb: 'FF0F1F3D' } },
        right:  { style: 'thin',   color: { argb: 'FF0F1F3D' } }
      };
    }
    try { ws.mergeCells('A' + row.number + ':' + ws.getColumn(numCols).letter + row.number); } catch(e) {}
  },

  styleTotalRow(row, numCols) {
    row.height = 24;
    for (var _c = 1; _c <= numCols; _c++) {
      var _cell = row.getCell(_c);
      _cell.font  = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
      _cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3060' } };
      _cell.alignment = { vertical: 'middle', horizontal: _c === 1 ? 'left' : 'right' };
      _cell.border = {
        top:    { style: 'medium', color: { argb: 'FF000000' } },
        bottom: { style: 'medium', color: { argb: 'FF000000' } },
        left:   { style: 'thin',   color: { argb: 'FF000000' } },
        right:  { style: 'thin',   color: { argb: 'FF000000' } }
      };
    }
  },

  CUR: '₹#,##0',
  CUR2: '₹#,##0.00',

  // Writes a professional detail block at the top of a worksheet.
  // Returns the row number where data headers should begin.
  addSheetHeader(ws, opts) {
    var colEnd = opts.colEnd || 'Q';
    var colCount = this.colToNum(colEnd);
    var r = 1;

    // Shared fills
    var FILL_NAVY  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F1F3D' } };
    var FILL_BLUE  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
    var FILL_LIGHT = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F6F9' } };
    var FILL_WHITE = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };

    // Helper: paint background across entire row (no text, just fill)
    function paintRow(rowNum, height, fill) {
      var row = ws.getRow(rowNum);
      row.height = height;
      for (var _c = 1; _c <= colCount; _c++) row.getCell(_c).fill = fill;
    }

    // Helper: put a label in col A and value starting col C (no wrapping, col A stays narrow)
    function labelValue(rowNum, label, value, labelFont, valueFont, fill, height) {
      paintRow(rowNum, height, fill);
      var lCell = ws.getCell('A' + rowNum);
      lCell.value = label;
      lCell.font = labelFont;
      lCell.alignment = { horizontal: 'left', vertical: 'middle' };
      var vCell = ws.getCell('C' + rowNum);
      vCell.value = value;
      vCell.font = valueFont;
      vCell.alignment = { horizontal: 'left', vertical: 'middle' };
    }

    // ── ROW 1: Title bar (dark navy, full width, text in A) ──────────
    paintRow(r, 26, FILL_NAVY);
    var titleCell = ws.getCell('A' + r);
    titleCell.value = opts.title;
    titleCell.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
    titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
    r++;

    // ── ROW 2: Client name (label "Company:" in A, name in C) ────────
    labelValue(r, 'Company:', opts.client || '',
      { size: 9, bold: true, color: { argb: 'FF1E3A5F' }, name: 'Calibri' },
      { size: 11, bold: true, color: { argb: 'FF0F1F3D' }, name: 'Calibri' },
      FILL_BLUE, 20);
    r++;

    // ── ROW 3: Address (label in A, address text in C) ───────────────
    labelValue(r, 'Address:', opts.address || '—',
      { size: 9, bold: true, color: { argb: 'FF475569' }, name: 'Calibri' },
      { size: 9, color: { argb: 'FF334155' }, name: 'Calibri' },
      FILL_LIGHT, 16);
    ws.getRow(r).getCell(colCount).border = { bottom: { style: 'hair', color: { argb: 'FFCBD5E1' } } };
    r++;

    // ── ROW 4: Period + Description on same row (two pairs) ──────────
    paintRow(r, 16, FILL_LIGHT);
    ws.getCell('A' + r).value = 'Period:';
    ws.getCell('A' + r).font = { size: 9, bold: true, color: { argb: 'FF475569' }, name: 'Calibri' };
    ws.getCell('A' + r).alignment = { horizontal: 'left', vertical: 'middle' };
    ws.getCell('C' + r).value = opts.period || '';
    ws.getCell('C' + r).font = { size: 9, italic: true, color: { argb: 'FF334155' }, name: 'Calibri' };
    ws.getCell('C' + r).alignment = { horizontal: 'left', vertical: 'middle' };
    // Description on same row, after midpoint
    var midD = Math.max(5, Math.floor(colCount / 2));
    ws.getCell(ws.getColumn(midD).letter + r).value = opts.sheetDesc || '';
    ws.getCell(ws.getColumn(midD).letter + r).font = { size: 9, color: { argb: 'FF64748B' }, name: 'Calibri' };
    ws.getCell(ws.getColumn(midD).letter + r).alignment = { horizontal: 'left', vertical: 'middle' };
    r++;

    // ── EXTRA DETAIL ROWS (label in col A, value in col C, right pair at midpoint) ──
    if (opts.extraRows && opts.extraRows.length) {
      var mid = Math.max(5, Math.floor(colCount / 2));
      var midLetter = ws.getColumn(mid).letter;
      var midValLetter = ws.getColumn(mid + 2).letter;
      var half = Math.ceil(opts.extraRows.length / 2);
      for (var i = 0; i < half; i++) {
        var eL = opts.extraRows[i * 2];
        var eR = opts.extraRows[i * 2 + 1];
        paintRow(r, 16, FILL_WHITE);
        if (eL) {
          ws.getCell('A' + r).value = eL.label + ':';
          ws.getCell('A' + r).font = { size: 9, bold: true, color: { argb: 'FF475569' }, name: 'Calibri' };
          ws.getCell('A' + r).alignment = { horizontal: 'left', vertical: 'middle' };
          ws.getCell('C' + r).value = '' + eL.value;
          ws.getCell('C' + r).font = { size: 9, color: { argb: 'FF0F1F3D' }, name: 'Calibri' };
          ws.getCell('C' + r).alignment = { horizontal: 'left', vertical: 'middle' };
        }
        if (eR) {
          ws.getCell(midLetter + r).value = eR.label + ':';
          ws.getCell(midLetter + r).font = { size: 9, bold: true, color: { argb: 'FF475569' }, name: 'Calibri' };
          ws.getCell(midLetter + r).alignment = { horizontal: 'left', vertical: 'middle' };
          ws.getCell(midValLetter + r).value = '' + eR.value;
          ws.getCell(midValLetter + r).font = { size: 9, color: { argb: 'FF0F1F3D' }, name: 'Calibri' };
          ws.getCell(midValLetter + r).alignment = { horizontal: 'left', vertical: 'middle' };
        }
        r++;
      }
    }

    // ── Thin accent line separating header from table ────────────────
    var divRow = ws.getRow(r);
    divRow.height = 3;
    for (var _c = 1; _c <= colCount; _c++) {
      divRow.getCell(_c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3060' } };
    }
    r++;

    // Small gap before column headers
    ws.getRow(r).height = 4;
    r++;

    return r; // column header row goes here
  },

  async run() {
    var btn = document.getElementById('export-btn');
    var txt = document.getElementById('export-btn-text');
    btn.disabled = true;
    txt.innerHTML = '<span class="spinner"></span> Generating…';
    try {
      await new Promise(function(res) { setTimeout(res, 50); });
      var blob = await this.build();
      var client = App.currentClient;
      var period = (DB.get('settings')?.period || '').replace(/-/g, '');
      var fname = (client.code || 'ROU') + '_ROU_' + (period || 'export') + '.xlsx';
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = fname;
      document.body.appendChild(a); a.click(); a.remove();
      var link = document.getElementById('download-link');
      link.href = url; link.download = fname;
      document.getElementById('download-link-name').textContent = 'Download ' + fname;
      document.getElementById('download-link-box').classList.add('show');
      toast('Excel workbook generated!', 'success');
    } catch(e) {
      console.error(e);
      toast('Export failed: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      txt.textContent = 'Generate & Download Excel';
    }
  },

  async build() {
    var wb = new ExcelJS.Workbook();
    wb.creator = 'EbixCash ROU Master | Ind AS 116'; wb.created = new Date();
    wb.calcProperties.fullCalcOnLoad = true;
    var client = App.currentClient;
    var s = DB.get('settings') || {};
    var period = s.period || '';           // period end date  e.g. 2026-03-31
    var periodStart = s.periodStart || ''; // period start date e.g. 2025-04-01
    var rous = DB.get('rous_' + client.id) || [];

    // Classify ROUs into 3 groups:
    //  preExpired  — ended BEFORE periodStart: show in Branch Details only, zeroed positions
    //  midExpired  — ended DURING the period (>= periodStart, <= period): compute up to their endDate
    //  active      — still running at period end: compute to period end
    var preExpired = [], midExpired = [], active = [];
    rous.forEach(function(r) {
      if (!r.startDate || r.startDate > period) return; // not yet started — skip entirely
      if (r.leaseType === 'short-term' || r.leaseType === 'low-value') return; // exempt — only in disclosures
      var end = r.endDate || period;
      if (periodStart && end < periodStart) {
        preExpired.push(r);
      } else if (period && end >= (periodStart || '0000') && end <= period) {
        midExpired.push(r);
      } else {
        active.push(r);
      }
    });

    // Active and mid-expired go into summary/financial sheets
    // preExpired go into Branch Details sheet only (no computation)
    var summaryROUs = active.concat(midExpired);
    var summaryPositions = summaryROUs.map(function(r) {
      // For mid-expired: compute position at their actual end date (full lease run)
      var computeAt = (r.endDate && r.endDate <= period) ? r.endDate : period;
      return { rou: r, pos: Engine.positionAt(r, computeAt, periodStart), sch: Engine.compute(r) };
    });
    var allPositions = preExpired.map(function(r) {
      return { rou: r, pos: null, sch: Engine.compute(r), preExpired: true };
    }).concat(summaryPositions.map(function(p) { return Object.assign({}, p, { preExpired: false }); }));

    var periodDisplay = s.periodLabel || Utils.fmtDate(period);
    this._client = client.name;
    this._period = period;
    this._periodStart = periodStart;
    this._periodDisplay = periodDisplay;

    // PASS 1: Pre-compute branch metadata (sheet names, row offsets) WITHOUT creating sheets.
    // This lets summary/P&L sheets reference branch sheets by formula even though those
    // sheets are created afterwards (Excel resolves cross-sheet refs at open time, not write time).
    this._branchMeta = {};
    var usedNamesPass1 = new Set(['branch details','summary','p&l impact (fy-wise)','balance sheet','journal entries','maturity profile','disclosures (para 52-60)']);
    allPositions.forEach(function(p) {
      if (p.sch.error) return;
      var sn = Exporter.safeSheetName(p.rou.branchName, usedNamesPass1);
      // EXACT replication of addSheetHeader's row count:
      //   5 fixed rows (title, company, address, period, description)
      // + ceil(extraRows/2) extra detail rows
      // + 1 spacer row
      // addSheetHeader returns the NEXT free row, which sheetSchedules uses as paramRow.
      // extras count must match what sheetSchedules will actually push into the extras array.
      // Mismatches here misalign paramRow and break every SUMIFS formula. Keep the conditions in sync.
      var _idc = parseFloat(p.rou.initialDirectCosts) || 0;
      var _inc = parseFloat(p.rou.leaseIncentives) || 0;
      var _vr  = parseFloat(p.rou.variableRentMonthly) || 0;
      var _isTrans = p.sch.transitionMonth != null;
      var extrasCount = 10
        + 1                                    // Payment Timing — always present
        + (p.sch.secDep ? 2 : 0)               // SD gross + SD Ind AS
        + (_idc > 0 ? 1 : 0)
        + (_inc > 0 ? 1 : 0)
        + (_vr  > 0 ? 1 : 0)
        + (_isTrans ? 1 : 0);                  // Opening Date row for transition leases
      var paramRow    = 4 + Math.ceil(extrasCount / 2) + 2 + 1;  // = addSheetHeader return value (4 fixed + extras + divider + gap + next)
      var colHdrRow   = paramRow + 1;
      var dataStart   = colHdrRow + 1;
      var lastData    = dataStart + p.sch.N - 1;
      Exporter._branchMeta[p.rou.id] = {
        sheetName : sn,
        paramRow  : paramRow,
        dataStart : dataStart,
        lastData  : lastData,
        N         : p.sch.N,
        pStartCell: 'U' + paramRow,   // period start (real date) in PARAMS
        pEndCell  : 'V' + paramRow,   // period end (real date) in PARAMS
        dateCol   : 'V'               // hidden date-key column for SUMIFS (col 22)
      };
    });

    // PASS 2: Create sheets in user-friendly order — summary sheets first, branch schedules last
    this.sheetSummary(wb, client, periodDisplay, summaryPositions, allPositions, periodStart);  // Create Summary first to get total row
    this.sheetBranchDetails(wb, client, periodDisplay, summaryPositions, allPositions, periodStart);  // Create Branch Details
    this.sheetReassessment(wb, client, periodDisplay, period, summaryPositions);  // NEW REASSESSMENT SHEET - must be BEFORE Main Summary
    this.sheetMainSummary(wb, client, periodDisplay, period, periodStart, summaryPositions);  // NEW MAIN SUMMARY - uses Reassessment data range
    this.sheetPL(wb, client, summaryPositions);
    this.sheetBalanceSheet(wb, client, periodDisplay, summaryPositions);
    this.sheetJournal(wb, client, period, summaryPositions);
    this.sheetMaturity(wb, client, period, summaryPositions);
    this.sheetDisclosures(wb, client, periodDisplay, period, summaryPositions, rous);
    this.sheetSchedules(wb, client, allPositions);   // branch sheets last in workbook
    
    // Reorder sheets: Move Main Summary to first position
    var mainSummarySheet = wb.getWorksheet('Main Summary');
    if (mainSummarySheet) {
      mainSummarySheet.orderNo = 0;  // Set to first position
    }
    
    // Set Reassessment sheet order to 2 (after Main Summary)
    var reassessSheet = wb.getWorksheet('Reassessment');
    if (reassessSheet) {
      reassessSheet.orderNo = 2;
    }
    
    // Hide P&L Impact, Balance Sheet, and Disclosures sheets
    var plSheet = wb.getWorksheet('P&L Impact (FY-wise)');
    if (plSheet) plSheet.state = 'hidden';
    var bsSheet = wb.getWorksheet('Balance Sheet');
    if (bsSheet) bsSheet.state = 'hidden';
    var discSheet = wb.getWorksheet('Disclosures (Para 52-60)');
    if (discSheet) discSheet.state = 'hidden';
    
    wb.worksheets.forEach((ws) => this.applySheetView(ws));
    var buf = await wb.xlsx.writeBuffer();
    return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  },

  safeSheetName(name, usedNames) {
    var s = (name || 'Sheet').replace(/[:\\\/\?\*\[\]]/g, '').trim().slice(0, 31);
    if (!s) s = 'ROU';
    var candidate = s;
    var counter = 2;
    while (usedNames.has(candidate.toLowerCase())) {
      candidate = s.slice(0, 28) + '_' + counter;
      counter++;
    }
    usedNames.add(candidate.toLowerCase());
    return candidate;
  },

  sheetMainSummary(wb, client, periodDisplay, periodEnd, periodStart, positions) {
    var ws = wb.addWorksheet('Main Summary');
    this.applySheetView(ws);
    var self = this;
    var CUR = this.CUR;
    
    // Get reassessment data range (set by sheetReassessment)
    var reassessRange = this._reassessmentDataRange || { empty: true };
    var reassessFormula = function(col) {
      if (reassessRange.empty || !reassessRange.start) {
        return 0;
      }
      return { formula: 'IFERROR(SUM(Reassessment!' + col + reassessRange.start + ':' + col + reassessRange.end + '),0)' };
    };
    
    var ds = this.addSheetHeader(ws, {
      title: 'EbixCash - Main Summary (Ind AS 116)',
      client: client.name,
      address: client.address || '',
      period: periodDisplay,
      sheetDesc: 'Consolidated summary of ROU Assets, Lease Liabilities, and Security Deposits',
      colEnd: 'I',
      extraRows: [
        { label: 'Period Start', value: Utils.fmtDate(periodStart) },
        { label: 'Period End', value: Utils.fmtDate(periodEnd) },
        { label: 'Standard', value: 'Ind AS 116 - Leases' },
        { label: 'Currency', value: 'INR (₹)' }
      ]
    });
    
    var summarySheet = "'Summary'";
    var totalRow = self._summaryTotalRow;
    
    // SECTION 1: RIGHT OF USE ASSETS
    ws.addRow([]);
    var rouTitleRow = ws.addRow(['Right of Use Assets']);
    rouTitleRow.height = 25;
    rouTitleRow.getCell(1).font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
    rouTitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3060' } };
    rouTitleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    ws.mergeCells('A' + rouTitleRow.number + ':G' + rouTitleRow.number);
    
    var rouHeader = ws.addRow(['Particulars', 'Opening RoU as on ' + Utils.fmtDate(periodStart), 'Additions', 'RoU Derecognize', 'Reassessment', 'Depreciation', 'Balance on ' + Utils.fmtDate(periodEnd)]);
    this.styleHeader(rouHeader, 7);
    
    var rouNormalRow = ws.addRow([
      'RoU Normal',
      { formula: summarySheet + '!D' + totalRow + '+' + (reassessRange.empty ? '0' : 'IFERROR(SUM(Reassessment!E' + reassessRange.start + ':E' + reassessRange.end + '),0)') },
      { formula: summarySheet + '!E' + totalRow },
      0,
      reassessFormula('E'),
      { formula: summarySheet + '!F' + totalRow },
      { formula: summarySheet + '!G' + totalRow }
    ]);
    
    var rouSDRow = ws.addRow([
      'RoU Security Deposit',
      { formula: summarySheet + '!W' + totalRow + '+' + (reassessRange.empty ? '0' : 'IFERROR(SUM(Reassessment!N' + reassessRange.start + ':N' + reassessRange.end + '),0)') },
      0,
      0,
      reassessFormula('N'),  // ROU SD Reassessment differential
      { formula: summarySheet + '!X' + totalRow },  // Depreciation from Summary (column X)
      { formula: summarySheet + '!Y' + totalRow }   // Closing from Summary (column Y)
    ]);
    
    var netRoURow = ws.addRow([
      'Net RoU',
      { formula: 'B' + rouNormalRow.number + '+B' + rouSDRow.number },
      { formula: 'C' + rouNormalRow.number + '+C' + rouSDRow.number },
      { formula: 'D' + rouNormalRow.number + '+D' + rouSDRow.number },
      { formula: 'E' + rouNormalRow.number + '+E' + rouSDRow.number },
      { formula: 'F' + rouNormalRow.number + '+F' + rouSDRow.number },
      { formula: 'G' + rouNormalRow.number + '+G' + rouSDRow.number }
    ]);
    
    [rouNormalRow, rouSDRow, netRoURow].forEach(function(row) {
      row.height = 22;
      for (var c = 1; c <= 7; c++) {
        var cell = row.getCell(c);
        if (c > 1) cell.numFmt = CUR;
        cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'left' : 'right' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
        };
      }
    });
    netRoURow.eachCell(function(c) { c.font = { bold: true }; });
    
    // SECTION 2: LEASE LIABILITIES
    ws.addRow([]);
    ws.addRow([]);
    var liabTitleRow = ws.addRow(['Lease Liabilities']);
    liabTitleRow.height = 25;
    liabTitleRow.getCell(1).font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
    liabTitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3060' } };
    liabTitleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    ws.mergeCells('A' + liabTitleRow.number + ':H' + liabTitleRow.number);
    
    var liabHeader = ws.addRow(['Particulars', 'Opening Lease Liab as on ' + Utils.fmtDate(periodStart), 'Additions', 'Derecognised', 'Reassessment', 'Interest', 'Payment', 'Balance on ' + Utils.fmtDate(periodEnd)]);
    this.styleHeader(liabHeader, 8);
    
    var leaseLiabRow = ws.addRow([
      'Lease Liab',
      { formula: summarySheet + '!I' + totalRow + '+' + (reassessRange.empty ? '0' : 'IFERROR(SUM(Reassessment!H' + reassessRange.start + ':H' + reassessRange.end + '),0)') },
      { formula: summarySheet + '!J' + totalRow },  // Additions Lease Liab from Summary column J
      0,
      reassessFormula('H'),
      { formula: summarySheet + '!K' + totalRow },  // Interest from Summary column K
      { formula: summarySheet + '!L' + totalRow },  // Payments from Summary column L
      { formula: summarySheet + '!M' + totalRow }  // Closing from Summary column M
    ]);
    leaseLiabRow.height = 22;
    for (var c = 1; c <= 8; c++) {
      var cell = leaseLiabRow.getCell(c);
      if (c > 1) cell.numFmt = CUR;
      cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'left' : 'right' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
      };
    }
    
    ws.addRow([]);
    var currentTitle = ws.addRow(['Current']);
    currentTitle.height = 20;
    currentTitle.getCell(1).font = { bold: true, size: 11, color: { argb: 'FF1A3060' } };
    currentTitle.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    
    var mat0to1Row = ws.addRow(['Maturity 0-1 Yr (Current)', { formula: summarySheet + '!N' + totalRow }]);
    mat0to1Row.height = 22;
    mat0to1Row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    mat0to1Row.getCell(2).numFmt = CUR;
    mat0to1Row.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
    [1,2].forEach(function(c) {
      mat0to1Row.getCell(c).border = {
        top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
      };
    });
    
    var nonCurrentRow = ws.addRow(['Non Current', { formula: summarySheet + '!M' + totalRow + '-' + summarySheet + '!N' + totalRow }]);
    nonCurrentRow.height = 22;
    nonCurrentRow.getCell(1).font = { bold: true };
    nonCurrentRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    nonCurrentRow.getCell(2).numFmt = CUR;
    nonCurrentRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
    [1,2].forEach(function(c) {
      nonCurrentRow.getCell(c).border = {
        top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
      };
    });
    
    ws.addRow([]);
    var ncTitle = ws.addRow(['Non Current']);
    ncTitle.height = 20;
    ncTitle.getCell(1).font = { bold: true, size: 11, color: { argb: 'FF1A3060' } };
    ncTitle.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    
    var mat1to2Row = ws.addRow(['Maturity 1-2 Yr', { formula: summarySheet + '!P' + totalRow }]);
    mat1to2Row.height = 22;
    mat1to2Row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    mat1to2Row.getCell(2).numFmt = CUR;
    mat1to2Row.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
    [1,2].forEach(function(c) {
      mat1to2Row.getCell(c).border = {
        top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
      };
    });
    
    var mat2to5Row = ws.addRow(['Maturity 2-5 Yr', { formula: summarySheet + '!Q' + totalRow }]);
    mat2to5Row.height = 22;
    mat2to5Row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    mat2to5Row.getCell(2).numFmt = CUR;
    mat2to5Row.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
    [1,2].forEach(function(c) {
      mat2to5Row.getCell(c).border = {
        top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
      };
    });
    
    var matOver5Row = ws.addRow(['Maturity More than 5 Yr', { formula: summarySheet + '!R' + totalRow }]);
    matOver5Row.height = 22;
    matOver5Row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    matOver5Row.getCell(2).numFmt = CUR;
    matOver5Row.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
    [1,2].forEach(function(c) {
      matOver5Row.getCell(c).border = {
        top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
      };
    });
    
    // Add verification row to ensure maturity buckets = non-current
    var matVerifyRow = ws.addRow(['Total (Verify)', { formula: 'B' + mat1to2Row.number + '+B' + mat2to5Row.number + '+B' + matOver5Row.number }]);
    matVerifyRow.height = 22;
    matVerifyRow.getCell(1).font = { bold: true, italic: true };
    matVerifyRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    matVerifyRow.getCell(2).numFmt = CUR;
    matVerifyRow.getCell(2).font = { bold: true };
    matVerifyRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
    [1,2].forEach(function(c) {
      matVerifyRow.getCell(c).border = {
        top: { style: 'medium', color: { argb: 'FF000000' } },
        bottom: { style: 'medium', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
      };
      matVerifyRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F9FF' } };
    });
    
    // SECTION 3: SECURITY DEPOSIT
    ws.addRow([]);
    ws.addRow([]);
    var sdTitleRow = ws.addRow(['Security Deposit']);
    sdTitleRow.height = 25;
    sdTitleRow.getCell(1).font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
    sdTitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3060' } };
    sdTitleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    ws.mergeCells('A' + sdTitleRow.number + ':G' + sdTitleRow.number);
    
    var sdHeader = ws.addRow(['Particulars', 'Opening security deposit as on ' + Utils.fmtDate(periodStart), 'Additions', 'Derecognized/Refund', 'Reassessment', 'Interest', 'Balance on ' + Utils.fmtDate(periodEnd)]);
    this.styleHeader(sdHeader, 7);
    
    var sdRow = ws.addRow([
      'Security Deposit Ind As',
      { formula: summarySheet + '!S' + totalRow + '+' + (reassessRange.empty ? '0' : 'IFERROR(SUM(Reassessment!K' + reassessRange.start + ':K' + reassessRange.end + '),0)') },
      { formula: summarySheet + '!T' + totalRow },  // SD Additions from Summary column T
      0,  // Derecognized/Refund (not currently tracked - TODO: add if needed)
      reassessFormula('K'),  // Reassessment from Reassessment sheet column K
      { formula: summarySheet + '!U' + totalRow },  // Interest from Summary column U
      { formula: summarySheet + '!V' + totalRow }  // Closing from Summary column V (already calculated by engine)
    ]);
    sdRow.height = 22;
    for (var c = 1; c <= 7; c++) {
      var cell = sdRow.getCell(c);
      if (c > 1) cell.numFmt = CUR;
      cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'left' : 'right' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
      };
    }
    
    // Column widths
    ws.getColumn(1).width = 40;
    ws.getColumn(2).width = 22;
    ws.getColumn(3).width = 16;
    ws.getColumn(4).width = 18;
    ws.getColumn(5).width = 16;
    ws.getColumn(6).width = 16;
    ws.getColumn(7).width = 22;
    ws.getColumn(8).width = 22;
  },

  sheetBranchDetails(wb, client, period, positions, allPositions, periodStart) {
    var allPos = allPositions || positions;
    var periodDisplay = this._periodDisplay || Utils.fmtDate(period);
    // ═══════════════════════════════════════════════════════════
    // SHEET 1: Branch Details
    // ═══════════════════════════════════════════════════════════
    var wsBranch = wb.addWorksheet('Branch Details');
    this.applySheetView(wsBranch);
    var dsBranch = this.addSheetHeader(wsBranch, {
      title: 'EbixCash - Branch Details Lease Information (Ind AS 116)',
      client: client.name, address: client.address,
      period: periodDisplay,
      sheetDesc: 'Detailed information for each branch lease including party, tenure, rent and security deposit',
      colEnd: 'J',
      extraRows: [
        { label: 'Total ROUs', value: allPos.length + ' (' + positions.length + ' in period)' },
        { label: 'Period Start', value: Utils.fmtDate(periodStart) },
        { label: 'Period End', value: Utils.fmtDate(period) },
        { label: 'Standard', value: 'Ind AS 116 - Leases' },
        { label: 'Currency', value: 'INR (₹)' }
      ]
    });

    var detHdr = wsBranch.addRow(['Sr#', 'Branch', 'Party', 'IBR %', 'Sec Deposit', 'Monthly Rent', 'PV of Lease Payments', 'Tenure (Mo)', 'From', 'To']);
    this.styleHeader(detHdr, 10);

    var self = this;
    var detStartRow = dsBranch + 1;
    allPos.forEach(function(p, i) {
      var tenure = p.sch.rows ? p.sch.rows.length : 0;
      var row = wsBranch.addRow([
        i + 1, p.rou.branchName || '', p.rou.partyName || '',
        p.rou.ibr || 0, p.rou.secDepAmount || 0, p.rou.baseRent || 0,
        p.sch.computedInitialLiability || p.sch.initialLiability,
        tenure, Utils.fmtDate(p.rou.startDate), Utils.fmtDate(p.rou.endDate)
      ]);
      row.height = 22;
      row.getCell(4).numFmt = '0.00"%"';
      row.getCell(5).numFmt = self.CUR;
      row.getCell(6).numFmt = self.CUR;
      row.getCell(7).numFmt = self.CUR;
      for (var _dc = 1; _dc <= 10; _dc++) {
        var _dcell = row.getCell(_dc);
        _dcell.alignment = { vertical: 'middle', horizontal: _dc <= 3 ? 'left' : 'right' };
        _dcell.border = {
          top:    { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left:   { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right:  { style: 'thin', color: { argb: 'FFD1D5DB' } }
        };
        if (p.preExpired) {
          _dcell.font = { color: { argb: 'FF94A3B8' }, italic: true, name: 'Calibri' };
          _dcell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        } else if (i % 2 === 1) {
          _dcell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } };
        }
      }
    });

    var widthsBranch = [5, 28, 28, 12, 16, 16, 20, 14, 14, 14];
    wsBranch.columns.forEach(function(c, i) { c.width = widthsBranch[i] || 14; });

  },

  sheetReassessment(wb, client, periodDisplay, periodEnd, positions) {
    var ws = wb.addWorksheet('Reassessment');
    this.applySheetView(ws);
    var self = this;
    
    // Get all reassessment overrides for this client
    var overrides = ReassessOverride._load(client.id) || [];
    
    // Filter overrides that fall within the reporting period
    var periodStart = this._periodStart || '';
    var period = periodEnd; // Use periodEnd parameter for compatibility
    var ps = new Date(periodStart);
    var pe = new Date(periodEnd);
    
    var relevantOverrides = overrides.filter(function(o) {
      var od = new Date(o.reassessDate);
      return od >= ps && od <= pe;
    });

    var ds = this.addSheetHeader(ws, {
      title: 'Reassessment Override - Differential Analysis',
      client: client.name,
      address: client.address || '',
      period: periodDisplay,
      sheetDesc: 'Audited post-reassessment figures vs. engine-computed pre-reassessment values',
      colEnd: 'O',
      extraRows: [
        { label: 'Total Overrides', value: relevantOverrides.length },
        { label: 'Period Start', value: Utils.fmtDate(periodStart) },
        { label: 'Period End', value: Utils.fmtDate(periodEnd) },
        { label: 'Standard', value: 'Ind AS 116 - Para 44-46' },
        { label: 'Currency', value: 'INR (₹)' }
      ]
    });

    if (!relevantOverrides.length) {
      // Empty state
      var emptyRow = ws.addRow(['No reassessment overrides recorded for this period']);
      emptyRow.height = 30;
      emptyRow.getCell(1).font = { size: 12, color: { argb: 'FF7A8FA8' }, italic: true };
      emptyRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
      ws.mergeCells('A' + emptyRow.number + ':O' + emptyRow.number);
      ws.columns.forEach(function(c) { c.width = 14; });
      
      // Store empty range for Main Summary formulas
      self._reassessmentDataRange = { start: 0, end: 0, empty: true };
      return;
    }

    // Header row
    var hdr = ws.addRow([
      'Location / Branch',
      'Reassessment Date',
      'Pre: ROU NBV',
      'Post: ROU NBV',
      'Δ ROU',
      'Pre: Liab',
      'Post: Liab',
      'Δ Liab',
      'Pre: SD',
      'Post: SD',
      'Δ SD',
      'Pre: ROU SD',
      'Post: ROU SD',
      'Δ ROU SD',
      'Gain/Loss'
    ]);
    self.styleHeader(hdr, 15);
    
    // Color code header sections for easy identification
    // Location & Date - Dark Blue (default)
    ['A','B'].forEach(function(col) {
      hdr.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3060' } };
    });
    
    // ROU Section (C, D, E) - Green
    ['C','D','E'].forEach(function(col) {
      hdr.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A5C3A' } };
      hdr.getCell(col).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    });
    
    // Liability Section (F, G, H) - Dark Red/Maroon
    ['F','G','H'].forEach(function(col) {
      hdr.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B1A1A' } };
      hdr.getCell(col).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    });
    
    // SD Ind AS Section (I, J, K) - Orange
    ['I','J','K'].forEach(function(col) {
      hdr.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC65D00' } };
      hdr.getCell(col).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    });
    
    // ROU SD Section (L, M, N) - Teal/Cyan
    ['L','M','N'].forEach(function(col) {
      hdr.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E7490' } };
      hdr.getCell(col).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    });
    
    // Gain/Loss (O) - Purple
    hdr.getCell('O').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6B21A8' } };
    hdr.getCell('O').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };

    var startRow = hdr.number + 1;
    var lastDataRow = startRow + relevantOverrides.length - 1;
    
    // STORE the data range for use in Main Summary formulas
    self._reassessmentDataRange = { start: startRow, end: lastDataRow, empty: false };

    // Data rows
    relevantOverrides.forEach(function(o, i) {
      var row = ws.addRow([
        o.rouName + (o.rouParty ? ' (' + o.rouParty + ')' : ''),
        Utils.fmtDate(o.reassessDate),
        o.pre.rou,
        o.post.rou,
        o.diff.rou,
        o.pre.liab,
        o.post.liab,
        o.diff.liab,
        o.pre.sd,
        o.post.sd,
        o.diff.sd,
        o.pre.rouSD || 0,
        o.post.rouSD || 0,
        o.diff.rouSD || 0,
        o.gainLoss
      ]);

      row.height = 22;

      // Format currency columns
      for (var c = 3; c <= 15; c++) {
        row.getCell(c).numFmt = self.CUR;
      }

      // Style differential columns with color
      [5, 8, 11, 14, 15].forEach(function(colIdx) {
        var cell = row.getCell(colIdx);
        var val = cell.value || 0;
        if (val > 0) {
          cell.font = { color: { argb: 'FF065f46' }, bold: true };
        } else if (val < 0) {
          cell.font = { color: { argb: 'FF991b1b' }, bold: true };
        }
      });

      // Alignment and borders
      for (var c = 1; c <= 15; c++) {
        var cell = row.getCell(c);
        cell.alignment = { vertical: 'middle', horizontal: c <= 2 ? 'left' : 'right' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
        };
        
        // Alternating row colors
        if (i % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } };
        }
      }
    });

    // Total row
    var lastDataRow = self._reassessmentDataRange.end;
    var startRow = self._reassessmentDataRange.start;
    var totRow = ws.addRow([
      '',
      'TOTAL DIFFERENTIAL',
      '', '', { formula: 'SUM(E' + startRow + ':E' + lastDataRow + ')' },
      '', '', { formula: 'SUM(H' + startRow + ':H' + lastDataRow + ')' },
      '', '', { formula: 'SUM(K' + startRow + ':K' + lastDataRow + ')' },
      '', '', { formula: 'SUM(N' + startRow + ':N' + lastDataRow + ')' },
      { formula: 'SUM(O' + startRow + ':O' + lastDataRow + ')' }
    ]);

    totRow.height = 26;
    totRow.eachCell(function(c) {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3060' } };
      c.alignment = { vertical: 'middle', horizontal: c.col <= 2 ? 'left' : 'right' };
      c.border = {
        top: { style: 'medium', color: { argb: 'FF000000' } },
        bottom: { style: 'medium', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
    });

    // Format total row currency cells
    [5, 8, 11, 14, 15].forEach(function(colIdx) {
      totRow.getCell(colIdx).numFmt = self.CUR;
    });

    // Column widths
    var widths = [30, 16, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14, 14];
    ws.columns.forEach(function(c, i) { c.width = widths[i] || 14; });
  },

  sheetSummary(wb, client, periodDisplay, positions, allPos, periodStart) {
    // ── sheetSummary: branch sheets exist (or will exist) — cross-sheet formulas work ──
    // SHEET 2: Summary Schedule
    var ws = wb.addWorksheet('Summary');
    this.applySheetView(ws);
    var self = this; // Define self early
    var period = this._period || ''; // Use stored period end date
    var ds = this.addSheetHeader(ws, {
      title: 'EbixCash ROU Master — Summary Schedule (Ind AS 116)',
      client: client.name, address: client.address,
      period: periodDisplay,
      sheetDesc: 'Consolidated summary with cross-sheet formulas from branch schedules',
      colEnd: 'AC',
      extraRows: [
        { label: 'Total ROUs', value: positions.length },
        { label: 'Period Start', value: Utils.fmtDate(periodStart) },
        { label: 'Period End', value: Utils.fmtDate(period) },
        { label: 'Standard', value: 'Ind AS 116 - Leases' },
        { label: 'Currency', value: 'INR (₹)' }
      ]
    });

    var sumHdr = ws.addRow(['Sr','Branch','Rent/mo','Open ROU','Additions','Depreciation','ROU NBV','Acc Dep',
      'Open Liab','Additions Liab','Interest','Payments','Close Liab','Current','Non-Current',
      'Mat 1-2Y','Mat 2-5Y','Mat >5Y',
      'SD Open','SD Additions','SD Interest','SD Close','SD Current','SD Non-Current','ROU SD Open','ROU SD Dep','ROU SD Close',
      'Reassess Δ ROU','Reassess Δ Liab']);
    self.styleHeader(sumHdr, 29);  // Updated from 27 to 29 columns
    
    // Color code header sections for easy identification
    // Sr#, Branch, Rent - Dark Blue (default)
    ['A','B','C'].forEach(function(col) {
      sumHdr.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3060' } };
    });
    
    // ROU Section (D-H: Open ROU, Additions, Depreciation, ROU NBV, Acc Dep) - Green
    ['D','E','F','G','H'].forEach(function(col) {
      sumHdr.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A5C3A' } };
      sumHdr.getCell(col).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    });
    
    // Liability Section (I-N: Open Liab, Additions Liab, Interest, Payments, Close Liab, Current, Non-Current) - Dark Red/Maroon
    ['I','J','K','L','M','N','O'].forEach(function(col) {
      sumHdr.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B1A1A' } };
      sumHdr.getCell(col).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    });
    
    // Maturity Section (P-R: Mat 1-2Y, Mat 2-5Y, Mat >5Y) - Purple
    ['P','Q','R'].forEach(function(col) {
      sumHdr.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6B21A8' } };
      sumHdr.getCell(col).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    });
    
    // SD Ind AS Section (S-X: SD Open, SD Additions, SD Interest, SD Close, SD Current, SD Non-Current) - Orange
    ['S','T','U','V','W','X'].forEach(function(col) {
      sumHdr.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC65D00' } };
      sumHdr.getCell(col).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    });
    
    // ROU SD Section (Y-AA: ROU SD Open, ROU SD Dep, ROU SD Close) - Teal/Cyan
    ['Y','Z','AA'].forEach(function(col) {
      sumHdr.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E7490' } };
      sumHdr.getCell(col).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    });
    
    // Reassessment Section (AB-AC: Reassess Δ ROU, Reassess Δ Liab) - Gold/Yellow
    ['AB','AC'].forEach(function(col) {
      sumHdr.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD97706' } };
      sumHdr.getCell(col).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    });
    
    var sumStartRow = sumHdr.number + 1;

    positions.forEach(function(p, i) {
      var rIdx = sumStartRow + i;
      var meta = self._branchMeta ? self._branchMeta[p.rou.id] : null;
      var sn   = meta ? "'" + meta.sheetName + "'" : null;
      var DS   = meta ? meta.dataStart : null;
      var LD   = meta ? meta.lastData  : null;

      // Find the first and last row that falls within the period for simple SUM formulas
      var periodStartDate = new Date(self._periodStart);
      var periodEndDate = new Date(self._period);
      var firstPeriodRow = null;
      var lastPeriodRow = null;
      
      if (p.sch && p.sch.rows) {
        for (var j = 0; j < p.sch.rows.length; j++) {
          var rowDate = new Date(p.sch.rows[j].date);
          if (rowDate >= periodStartDate && rowDate <= periodEndDate) {
            if (firstPeriodRow === null) firstPeriodRow = DS + j;
            lastPeriodRow = DS + j;
          }
        }
      }

      // Simple SUM formula based on period row range
      function sumPeriod(valCol) {
        if (!sn || firstPeriodRow === null || lastPeriodRow === null) return 0;
        if (firstPeriodRow === lastPeriodRow) {
          return { formula: sn + '!' + valCol + firstPeriodRow };
        }
        return { formula: 'SUM(' + sn + '!' + valCol + firstPeriodRow + ':' + valCol + lastPeriodRow + ')' };
      }
      
      // Closing balance-sheet value: last row of the branch sheet
      function lastRowVal(col) {
        if (!sn || !LD) return p.pos ? 0 : 0;
        return { formula: sn + '!' + col + LD };
      }

      // Opening values - use simple direct cell references
      // Logic: If additions exist, opening = 0. If no additions, opening = closing from the row before period start
      var openROU, openLiab, sdOpen;
      var additions = p.pos ? Engine.r2(p.pos.additions) : 0;
      
      if (meta && sn && DS && additions === 0) {
        // EXISTING lease - find the row just before period start and reference its closing values
        var periodStartDate = new Date(self._periodStart);
        var lastRowBeforePeriod = null;
        
        // Find the last row in schedule that's before period start
        for (var j = 0; j < p.sch.rows.length; j++) {
          var rowDate = new Date(p.sch.rows[j].date);
          if (rowDate < periodStartDate) {
            lastRowBeforePeriod = DS + j;  // This row index in Excel sheet
          } else {
            break;  // Stop when we reach period start
          }
        }
        
        if (lastRowBeforePeriod) {
          // Simple formulas: ='BranchSheet'!K{row}
          openROU = { formula: sn + '!K' + lastRowBeforePeriod };   // Closing ROU from previous row
          openLiab = { formula: sn + '!H' + lastRowBeforePeriod };  // Closing Liab from previous row
          sdOpen = { formula: sn + '!P' + lastRowBeforePeriod };    // SD Closing from previous row
        } else {
          // No row before period start - use opening from first row
          openROU = { formula: sn + '!I' + DS };   // Opening ROU from first row
          openLiab = { formula: sn + '!E' + DS };  // Opening Liab from first row  
          sdOpen = { formula: sn + '!N' + DS };    // SD Opening from first row
        }
      } else {
        // NEW lease (additions > 0) - opening balances are 0
        openROU = 0;
        openLiab = 0;
        sdOpen = 0;
      }
      
      // All values below will be converted to formulas where possible
      // Keep engine values as fallback for validation/debugging
      var additionsEngine = p.pos ? Engine.r2(p.pos.additions) : 0;
      var sdCloseEngine = p.pos ? Engine.r2(p.pos.sdClose || 0) : 0;
      var curSplitEngine = p.pos ? Engine.r2(p.pos.split.current) : 0;
      
      // Track metadata for formula generation
      var sdAdditionsEngine = 0;
      var firstPeriodRowIdx = null;
      var lastPeriodRowIdx = null;
      
      if (additions > 0 && p.sch.secDep) {
        sdAdditionsEngine = Engine.r2(p.sch.secDep.initialIndAS || 0);
      }

      // Find first and last SD rows in period for formula references
      var sdOpenRowIdx = null;
      var sdCloseRowIdx = null;
      var rouSDOpenRowIdx = null;
      var rouSDCloseRowIdx = null;
      
      if (p.sch.secDep && p.sch.secDep.rows && p.sch.secDep.rows.length > 0) {
        var sdRows = p.sch.secDep.rows;
        var pStart = new Date(self._periodStart);
        var pEnd = new Date(self._period);
        
        // Find opening: first row with date >= period start
        for (var j = 0; j < sdRows.length; j++) {
          if (sdRows[j].date >= pStart) {
            sdOpenRowIdx = j;
            rouSDOpenRowIdx = j;
            break;
          }
        }
        
        // Find closing: last row with date <= period end
        for (var j = sdRows.length - 1; j >= 0; j--) {
          if (sdRows[j].date <= pEnd) {
            sdCloseRowIdx = j;
            rouSDCloseRowIdx = j;
            break;
          }
        }
      }

      // Calculate maturity profile indices for formula generation
      var mat1to2RowIdx = null, mat2to5RowIdx = null, matOver5RowIdx = null;
      if (p.sch && p.sch.rows && p.sch.rows.length > 0) {
        var pEnd = new Date(self._period);
        
        // Find last row in period
        for (var j = p.sch.rows.length - 1; j >= 0; j--) {
          if (new Date(p.sch.rows[j].date) <= pEnd) {
            lastPeriodRowIdx = j;
            break;
          }
        }
        
        if (lastPeriodRowIdx !== null) {
          // 1-2 years: row 12-23 from last period row
          mat1to2RowIdx = lastPeriodRowIdx + 12;
          // 2-5 years: row 24-59 from last period row
          mat2to5RowIdx = lastPeriodRowIdx + 24;
          // >5 years: row 60+ from last period row
          matOver5RowIdx = lastPeriodRowIdx + 60;
        }
      }
      
      // Keep engine values for validation
      var mat1to2Engine = 0, mat2to5Engine = 0, matOver5Engine = 0;
      if (p.rou && period) {
        var mp = Engine.maturityProfile(p.rou, period);
        mat1to2Engine = Engine.r2(mp.y12pv || 0);
        mat2to5Engine = Engine.r2(mp.y25pv || 0);
        matOver5Engine = Engine.r2(mp.y5pv || 0);
      }

      var row = ws.addRow([
        i + 1,                      // A: Sr#
        p.rou.branchName || '',     // B: Branch
        p.rou.baseRent || 0,        // C: Rent/mo
        openROU,                    // D: Opening ROU (formula or 0)
        null,                       // E: Additions ROU - FORMULA (first row ROU cost if new)
        sumPeriod('J'),             // F: Depreciation in period — SUM col J for period rows
        null,                       // G: ROU NBV — formula D+E-F
        lastRowVal('L'),            // H: Acc Dep — last row col L (formula)
        openLiab,                   // I: Opening Liab (formula or 0)
        null,                       // J: Additions Lease Liab - FORMULA (same as E for new leases)
        sumPeriod('F'),             // K: Interest in period — SUM col F for period rows
        sumPeriod('G'),             // L: Payments in period — SUM col G for period rows
        null,                       // M: Closing Liab — formula I+J+K-L
        null,                       // N: Current — FORMULA based on branch schedule
        null,                       // O: Non-Current — formula M-N
        null,                       // P: Maturity 1-2 years - FORMULA based on branch schedule
        null,                       // Q: Maturity 2-5 years - FORMULA based on branch schedule
        null,                       // R: Maturity >5 years - FORMULA based on branch schedule
        sdOpen,                     // S: SD Opening (formula or 0)
        null,                       // T: SD Additions - FORMULA (initial SD if new)
        sumPeriod('O'),             // U: SD Interest Income — SUM col O for period rows
        null,                       // V: SD Closing - FORMULA (last row SD close or 0 if expired)
        null,                       // W: SD Current - FORMULA (SD Close if expires ≤12 months, else 0)
        null,                       // X: SD Non-Current - FORMULA (SD Close if expires >12 months, else 0)
        null,                       // Y: ROU SD Opening - FORMULA (first row discount open)
        sumPeriod('S'),             // Z: ROU SD Depreciation - SUM from branch schedule (formula)
        null,                       // AA: ROU SD Closing - FORMULA (last row discount close or 0 if expired)
        null,                       // AB: Reassess Δ ROU
        null                        // AC: Reassess Δ Liab
      ]);

      // Calculate reassessment differential for this ROU in this period
      var reassessDiffROU = 0;
      var reassessDiffLiab = 0;
      if (client && client.id) {
        var periodEndDate = self._period || '';
        var overrideDiff = ReassessOverride.getDifferentialAtDate(client.id, p.rou.id, periodEndDate);
        reassessDiffROU = overrideDiff.rou || 0;
        reassessDiffLiab = overrideDiff.liab || 0;
      }
      
      // Add reassessment differential columns
      row.getCell(28).value = reassessDiffROU;    // AB: Reassess Δ ROU
      row.getCell(29).value = reassessDiffLiab;   // AC: Reassess Δ Liab

      // ══════════════════════════════════════════════════════════════
      // FORMULA ASSIGNMENTS - All columns now use formulas where possible
      // ══════════════════════════════════════════════════════════════
      
      // E: Additions ROU
      // For new leases: reference first row's ROU cost (col I) from branch schedule
      // For existing leases: 0
      if (additionsEngine > 0 && sn && DS) {
        row.getCell(5).value = { formula: sn + '!I' + DS };
      } else {
        row.getCell(5).value = 0;
      }
      
      // J: Additions Lease Liability
      // Same as E (ROU additions) for new leases
      if (additionsEngine > 0 && sn && DS) {
        row.getCell(10).value = { formula: 'E' + rIdx };
      } else {
        row.getCell(10).value = 0;
      }
      
      // G: ROU NBV = D + E - F
      row.getCell(7).value = { formula: 'D'+rIdx+'+E'+rIdx+'-F'+rIdx };
      
      // M: Closing Liab = I + J + K - L (Opening + Additions + Interest - Payments)
      row.getCell(13).value = { formula: 'I'+rIdx+'+J'+rIdx+'+K'+rIdx+'-L'+rIdx };
      
      // N: Current Liability - FORMULA based on branch schedule
      // Current = MAX(0, Closing Liability - Liability 12 months ahead)
      if (sn && LD && lastPeriodRowIdx !== null) {
        var row12MonthsAhead = lastPeriodRowIdx + 12;
        if (row12MonthsAhead < p.sch.rows.length) {
          // Reference the closing liability 12 months ahead
          var liab12AheadRow = DS + row12MonthsAhead;
          row.getCell(14).value = { formula: 'MAX(0,M'+rIdx+'-' + sn + '!H' + liab12AheadRow + ')' };
        } else {
          // Less than 12 months remaining - all liability is current
          row.getCell(14).value = { formula: 'M'+rIdx };
        }
      } else {
        // Fallback to engine value if no branch schedule available
        row.getCell(14).value = curSplitEngine;
      }
      
      // O: Non-Current = MAX(0, M - N)
      row.getCell(15).value = { formula: 'MAX(0,M'+rIdx+'-N'+rIdx+')' };
      
      // P: Maturity 1-2 years PV
      // = Liability at month 12 - Liability at month 24
      if (sn && DS && lastPeriodRowIdx !== null && mat1to2RowIdx !== null) {
        var row12 = DS + Math.min(lastPeriodRowIdx + 11, p.sch.rows.length - 1);
        var row24 = DS + Math.min(lastPeriodRowIdx + 23, p.sch.rows.length - 1);
        if (lastPeriodRowIdx + 11 < p.sch.rows.length) {
          if (lastPeriodRowIdx + 23 < p.sch.rows.length) {
            row.getCell(16).value = { formula: 'MAX(0,' + sn + '!H' + row12 + '-' + sn + '!H' + row24 + ')' };
          } else {
            // Only 12-24 months data available
            row.getCell(16).value = { formula: sn + '!H' + row12 };
          }
        } else {
          row.getCell(16).value = 0;
        }
      } else {
        row.getCell(16).value = mat1to2Engine;
      }
      
      // Q: Maturity 2-5 years PV
      // = Liability at month 24 - Liability at month 60
      if (sn && DS && lastPeriodRowIdx !== null && mat2to5RowIdx !== null) {
        var row24 = DS + Math.min(lastPeriodRowIdx + 23, p.sch.rows.length - 1);
        var row60 = DS + Math.min(lastPeriodRowIdx + 59, p.sch.rows.length - 1);
        if (lastPeriodRowIdx + 23 < p.sch.rows.length) {
          if (lastPeriodRowIdx + 59 < p.sch.rows.length) {
            row.getCell(17).value = { formula: 'MAX(0,' + sn + '!H' + row24 + '-' + sn + '!H' + row60 + ')' };
          } else {
            // Only 24-60 months data available
            row.getCell(17).value = { formula: sn + '!H' + row24 };
          }
        } else {
          row.getCell(17).value = 0;
        }
      } else {
        row.getCell(17).value = mat2to5Engine;
      }
      
      // R: Maturity >5 years PV
      // = Liability at month 60
      if (sn && DS && lastPeriodRowIdx !== null && matOver5RowIdx !== null) {
        var row60 = DS + Math.min(lastPeriodRowIdx + 59, p.sch.rows.length - 1);
        if (lastPeriodRowIdx + 59 < p.sch.rows.length) {
          row.getCell(18).value = { formula: sn + '!H' + row60 };
        } else {
          row.getCell(18).value = 0;
        }
      } else {
        row.getCell(18).value = matOver5Engine;
      }
      
      // T: SD Additions
      // For new leases: reference first SD row's opening value (col N) from branch schedule
      // For existing leases: 0
      if (sdAdditionsEngine > 0 && sn && DS) {
        row.getCell(20).value = { formula: sn + '!N' + DS };
      } else {
        row.getCell(20).value = 0;
      }
      
      // V: SD Closing
      // If lease expires within the selected period, SD closing should be 0
      // Otherwise, reference last SD row's closing value (col P) from branch schedule
      var leaseExpired = false;
      var leaseExpires12Months = false;
      
      if (p.rou && p.rou.endDate) {
        var leaseEndDate = new Date(p.rou.endDate);
        var periodEndDate = new Date(self._period);
        var date12MonthsAhead = new Date(periodEndDate);
        date12MonthsAhead.setMonth(date12MonthsAhead.getMonth() + 12);
        
        // If lease end date is on or before the period end date, the lease has expired
        if (leaseEndDate <= periodEndDate) {
          leaseExpired = true;
        }
        // If lease expires within 12 months from period end (but not yet expired)
        else if (leaseEndDate <= date12MonthsAhead) {
          leaseExpires12Months = true;
        }
      }
      
      if (leaseExpired) {
        // Lease expired within this period - SD closing is 0
        row.getCell(22).value = 0;
      } else if (sn && LD && sdCloseRowIdx !== null) {
        // Lease still active - reference last SD row's closing value
        var sdCloseRow = DS + sdCloseRowIdx;
        row.getCell(22).value = { formula: sn + '!P' + sdCloseRow };
      } else {
        row.getCell(22).value = sdCloseEngine;
      }
      
      // W: SD Current (Current Asset)
      // If lease expires within 12 months from period end (or already expired), SD is Current
      // Logic: If endDate <= periodEnd + 12 months, then Current = SD Close, else 0
      if (leaseExpired || leaseExpires12Months) {
        // Lease expires within 12 months - SD is current asset
        row.getCell(23).value = { formula: 'V' + rIdx };
      } else {
        // Lease expires after 12 months - SD is non-current
        row.getCell(23).value = 0;
      }
      
      // X: SD Non-Current (Non-Current Asset)
      // If lease expires after 12 months, SD is Non-Current
      // Logic: Non-Current = SD Close - SD Current
      row.getCell(24).value = { formula: 'V' + rIdx + '-W' + rIdx };
      
      // Y: ROU SD Opening (Notional Discount Opening)
      // Reference first SD row in period's discount open (col R) from branch schedule
      if (sn && DS && rouSDOpenRowIdx !== null) {
        var rouSDOpenRow = DS + rouSDOpenRowIdx;
        row.getCell(25).value = { formula: sn + '!R' + rouSDOpenRow };
      } else {
        row.getCell(25).value = 0;
      }
      
      // AA: ROU SD Closing (Notional Discount Closing)
      // If lease expired, this should also be 0
      // Otherwise, reference last SD row in period's discount close (col T) from branch schedule
      if (leaseExpired) {
        // Lease expired within this period - ROU SD closing is 0
        row.getCell(27).value = 0;
      } else if (sn && DS && rouSDCloseRowIdx !== null) {
        var rouSDCloseRow = DS + rouSDCloseRowIdx;
        row.getCell(27).value = { formula: sn + '!T' + rouSDCloseRow };
      } else {
        row.getCell(27).value = 0;
      }

      row.height = 22;
      for (var _sc = 3; _sc <= 29; _sc++) row.getCell(_sc).numFmt = self.CUR;
      for (var _sc = 1; _sc <= 29; _sc++) {
        var _scell = row.getCell(_sc);
        _scell.alignment = { vertical: 'middle', horizontal: _sc <= 2 ? 'left' : 'right' };
        _scell.border = {
          top:    { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left:   { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right:  { style: 'thin', color: { argb: 'FFD1D5DB' } }
        };
        if (i % 2 === 1) _scell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } };
      }
    });

    var lastDataRow = sumStartRow + positions.length - 1;
    var totRow = ws.addRow(['','GRAND TOTAL']);
    totRow.height = 26;
    self._summaryTotalRow = totRow.number;  // Store for Main Summary sheet
    ['C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','AA','AB','AC'].forEach(function(L) {
      totRow.getCell(L).value = { formula: 'SUM('+L+sumStartRow+':'+L+lastDataRow+')' };
      totRow.getCell(L).numFmt = self.CUR;
    });
    totRow.eachCell(function(c){
      c.font={bold:true,color:{argb:'FFFFFFFF'},size:11};
      c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1A3060'}};
      c.alignment = { vertical: 'middle', horizontal: c.col <= 2 ? 'left' : 'right' };
      c.border = {
        top: { style: 'medium', color: { argb: 'FF000000' } },
        bottom: { style: 'medium', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
    });

    var widths=[5,24,14,14,12,14,14,13,14,14,13,14,13,15,13,13,13,14,14,14,14,14,13,13,14,14,14,14,14];
    ws.columns.forEach(function(c,i){ c.width=widths[i]||13; });
  },

  sheetPL(wb, client, positions) {
    var ws = wb.addWorksheet('P&L Impact (FY-wise)');
    this.applySheetView(ws);
    var ds = this.addSheetHeader(ws, {
      title: 'EbixCash - P&L Impact - Depreciation & Interest by FY (Ind AS 116)',
      client: client.name,
      address: client.address || '',
      period: this._periodDisplay || Utils.fmtDate(this._period || ''),
      sheetDesc: 'Depreciation (Para 49) and Finance Cost (Para 50) shown separately as required by Ind AS 116',
      colEnd: 'H',
      extraRows: [
        { label: 'Branches', value: positions.length },
        { label: 'Standard', value: 'Ind AS 116 - Leases' },
        { label: 'Currency', value: 'INR (₹)' },
        { label: 'Prepared by', value: (App.currentClient && App.currentClient.preparedBy) || 'EbixCash ROU Master' }
      ]
    });

    var fySet = new Set();
    positions.forEach(function(p) {
      if (!p.sch.error) p.sch.rows.forEach(function(r) { fySet.add(r.fy); });
    });
    var fys = Array.from(fySet).sort();
    var self = this;
    var CUR = this.CUR;

    // Two sub-tables: Depreciation | Finance Cost | Total
    // Header row 1: branch names across
    var depHeader = ['Financial Year — DEPRECIATION (Para 49)'].concat(positions.map(function(p) { return p.rou.branchName; })).concat(['Total']);
    var intHeader = ['Financial Year — FINANCE COST / INTEREST (Para 50)'].concat(positions.map(function(p) { return p.rou.branchName; })).concat(['Total']);
    var totHeader = ['Financial Year — COMBINED P&L IMPACT'].concat(positions.map(function(p) { return p.rou.branchName; })).concat(['Total']);

    var numCols = positions.length + 2;

    function buildSection(header, valueExtractor, sectionLabel) {
      ws.addRow([]).height = 6;
      var labelRow = ws.addRow([sectionLabel]);
      self.styleSectionTitle(ws, labelRow, numCols);

      var hr = ws.addRow(header); self.styleHeader(hr, header.length);
      var firstRow = ws.rowCount + 1;

      fys.forEach(function(fy, ri) {
        var vals = positions.map(function(p) {
          if (p.sch.error) return 0;
          var meta = self._branchMeta ? self._branchMeta[p.rou.id] : null;
          if (meta) {
            var sn = "'" + meta.sheetName + "'";
            var DS = meta.dataStart, LD = meta.lastData;
            var depCol = valueExtractor === 'dep' ? 'J' : 'F';
            return { formula: 'SUMIF(' + sn + '!C' + DS + ':C' + LD + ',"' + fy + '",' + sn + '!' + depCol + DS + ':' + depCol + LD + ')' };
          }
          var s = 0;
          p.sch.rows.forEach(function(r) {
            if (r.fy === fy) s += (valueExtractor === 'dep' ? r.dep : r.interest);
          });
          return Engine.r2(s);
        });
        var rowNum = ws.rowCount + 1;
        var row = ws.addRow([fy].concat(vals).concat([null]));
        var startCol = ws.getColumn(2).letter;
        var endCol = ws.getColumn(positions.length + 1).letter;
        row.getCell(positions.length + 2).value = { formula: 'SUM(' + startCol + rowNum + ':' + endCol + rowNum + ')' };
        for (var c = 2; c <= numCols; c++) row.getCell(c).numFmt = CUR;
        // borders + height on every data row
        self.styleDataRow(row, numCols, {
          alignment: function(c) { return { vertical: 'middle', horizontal: c === 1 ? 'left' : 'right' }; }
        });
        if (ri % 2 === 1) {
          for (var c = 1; c <= numCols; c++) {
            var cell = row.getCell(c);
            if (!cell.fill || !cell.fill.fgColor || cell.fill.fgColor.argb === 'FFFFFFFF')
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } };
          }
        }
        // Bold the Total column
        row.getCell(numCols).font = { bold: true };
      });

      var lastRow = ws.rowCount;
      var grand = ws.addRow(['GRAND TOTAL']);
      for (var c = 2; c <= numCols; c++) {
        var L = ws.getColumn(c).letter;
        grand.getCell(c).value = { formula: 'SUM(' + L + firstRow + ':' + L + lastRow + ')' };
        grand.getCell(c).numFmt = CUR;
      }
      self.styleTotalRow(grand, numCols);
    }

    buildSection(depHeader, 'dep', 'DEPRECIATION ON ROU ASSETS (Para 49 — Operating Expenses)');
    buildSection(intHeader, 'int', 'FINANCE COST ON LEASE LIABILITY (Para 50 — Finance Charges)');

    ws.getColumn(1).width = 30;
    for (var c = 2; c <= positions.length + 2; c++) ws.getColumn(c).width = 18;
  },

  sheetBalanceSheet(wb, client, period, positions) {
    var ws = wb.addWorksheet('Balance Sheet');
    this.applySheetView(ws);
    var ds = this.addSheetHeader(ws, {
      title: 'EbixCash - Balance Sheet Position (Ind AS 116)',
      client: client.name, address: client.address,
      period: Utils.fmtDate(period),
      sheetDesc: 'ROU Assets (Net Block), Lease Liabilities (Current + Non-Current) and Security Deposits as at the reporting date',
      colEnd: 'D',
      extraRows: [
        { label: 'Standard', value: 'Ind AS 116 - Leases' },
        { label: 'Currency', value: 'INR (₹)' },
        { label: 'Branches', value: positions.length },
        { label: 'Prepared by', value: (App.currentClient && App.currentClient.preparedBy) || 'EbixCash ROU Master' }
      ]
    });

    var hr = ws.addRow(['Particulars', 'Amount (₹)', 'Notes']); this.styleHeader(hr, 3);

    var grossROU = positions.reduce(function(s, p) { return s + (p.pos ? p.pos.closingROU + p.pos.accDep : 0); }, 0);
    var accDep   = positions.reduce(function(s, p) { return s + (p.pos ? p.pos.accDep : 0); }, 0);
    var cur      = positions.reduce(function(s, p) { return s + (p.pos ? p.pos.split.current : 0); }, 0);
    var nc       = positions.reduce(function(s, p) { return s + (p.pos ? p.pos.split.nonCurrent : 0); }, 0);
    var sdGross  = positions.reduce(function(s, p) { return s + (p.pos ? p.pos.sdGross : 0); }, 0);
    var sdIndAS  = positions.reduce(function(s, p) { return s + (p.pos ? p.pos.sdIndAS : 0); }, 0);
    
    // Calculate SD Current and Non-Current based on lease end dates
    var sdCurrent = 0;
    var sdNonCurrent = 0;
    var periodDate = new Date(period);
    var date12MonthsAhead = new Date(periodDate);
    date12MonthsAhead.setMonth(date12MonthsAhead.getMonth() + 12);
    
    positions.forEach(function(p) {
      if (p.pos && p.pos.sdIndAS && p.rou && p.rou.endDate) {
        var leaseEndDate = new Date(p.rou.endDate);
        // If lease expires within 12 months from period end, SD is current
        if (leaseEndDate <= date12MonthsAhead) {
          sdCurrent += p.pos.sdIndAS;
        } else {
          // Otherwise SD is non-current
          sdNonCurrent += p.pos.sdIndAS;
        }
      }
    });

    var self = this;
    var CUR = this.CUR;

    function section(title) {
      ws.addRow([]).height = 6;
      var r = ws.addRow([title]);
      self.styleSectionTitle(ws, r, 3);
    }
    function line(label, val, note, isBold) {
      var r = ws.addRow([label, val, note || '']);
      r.height = 22;
      r.getCell(2).numFmt = CUR;
      r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      r.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
      r.getCell(3).alignment = { vertical: 'middle', horizontal: 'left' };
      r.getCell(3).font = { italic: true, color: { argb: 'FF64748B' }, size: 9 };
      if (isBold) {
        r.getCell(1).font = { bold: true, color: { argb: 'FF0F1F3D' } };
        r.getCell(2).font = { bold: true, color: { argb: 'FF0F1F3D' } };
      }
      for (var _c = 1; _c <= 3; _c++) {
        r.getCell(_c).border = {
          top:    { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left:   { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right:  { style: 'thin', color: { argb: 'FFD1D5DB' } }
        };
      }
      return r.number;
    }

    section('ASSETS — Right of Use Asset');
    var rGross = line('  ROU Asset — Gross Block', grossROU, 'Cost of right-of-use asset at commencement');
    var rAcc   = line('  Less: Accumulated Depreciation', accDep, 'Straight-line dep over lease term');
    var rNet   = ws.addRow(['  ROU Asset — Net Block', 0, 'Gross − Acc Dep']);
    rNet.getCell(2).value = { formula: 'B' + rGross + '-B' + rAcc };
    rNet.getCell(2).numFmt = CUR;
    rNet.height = 22;
    rNet.getCell(1).font = { bold: true, color: { argb: 'FF0F1F3D' } };
    rNet.getCell(2).font = { bold: true, color: { argb: 'FF0F1F3D' } };
    rNet.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    rNet.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
    rNet.getCell(3).alignment = { vertical: 'middle', horizontal: 'left' };
    rNet.getCell(3).font = { italic: true, color: { argb: 'FF64748B' }, size: 9 };
    for (var _c = 1; _c <= 3; _c++) rNet.getCell(_c).border = { top: { style: 'medium', color: { argb: 'FF000000' } }, bottom: { style: 'medium', color: { argb: 'FF000000' } }, left: { style: 'thin', color: { argb: 'FFD1D5DB' } }, right: { style: 'thin', color: { argb: 'FFD1D5DB' } } };

    section('LIABILITIES — Lease Liability');
    var rCur = line('  Lease Liability — Current (≤ 1 year)', cur, 'Due within 12 months');
    var rNc  = line('  Lease Liability — Non-Current (> 1 year)', nc, 'Due after 12 months');
    var rTot = ws.addRow(['  Lease Liability — Total', 0, 'Current + Non-Current']);
    rTot.getCell(2).value = { formula: 'B' + rCur + '+B' + rNc };
    rTot.getCell(2).numFmt = CUR;
    rTot.height = 22;
    rTot.getCell(1).font = { bold: true, color: { argb: 'FF0F1F3D' } };
    rTot.getCell(2).font = { bold: true, color: { argb: 'FF0F1F3D' } };
    rTot.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    rTot.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
    rTot.getCell(3).alignment = { vertical: 'middle', horizontal: 'left' };
    rTot.getCell(3).font = { italic: true, color: { argb: 'FF64748B' }, size: 9 };
    for (var _c = 1; _c <= 3; _c++) rTot.getCell(_c).border = { top: { style: 'medium', color: { argb: 'FF000000' } }, bottom: { style: 'medium', color: { argb: 'FF000000' } }, left: { style: 'thin', color: { argb: 'FFD1D5DB' } }, right: { style: 'thin', color: { argb: 'FFD1D5DB' } } };

    section('SECURITY DEPOSIT');
    line('  Security Deposit — Gross', sdGross, 'Contractual deposit paid to lessor');
    var rSDIndAS = line('  Security Deposit — Ind AS Carrying Value', sdIndAS, 'PV at IBR; unwound over lease term');
    var rSDCur = line('    • Current (≤ 1 year)', sdCurrent, 'Recoverable within 12 months');
    var rSDNC = line('    • Non-Current (> 1 year)', sdNonCurrent, 'Recoverable after 12 months');
    var rDiff = ws.addRow(['  Notional Discount (Deferred Asset)', sdGross - sdIndAS, 'Gross − Ind AS (prepaid rent treatment)']);
    rDiff.getCell(2).numFmt = CUR;
    rDiff.height = 22;
    rDiff.getCell(1).font = { bold: true, color: { argb: 'FF0F1F3D' } };
    rDiff.getCell(2).font = { bold: true, color: { argb: 'FF0F1F3D' } };
    rDiff.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
    rDiff.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
    rDiff.getCell(3).alignment = { vertical: 'middle', horizontal: 'left' };
    rDiff.getCell(3).font = { italic: true, color: { argb: 'FF64748B' }, size: 9 };
    for (var _c = 1; _c <= 3; _c++) rDiff.getCell(_c).border = { top: { style: 'medium', color: { argb: 'FF000000' } }, bottom: { style: 'medium', color: { argb: 'FF000000' } }, left: { style: 'thin', color: { argb: 'FFD1D5DB' } }, right: { style: 'thin', color: { argb: 'FFD1D5DB' } } };

    ws.getColumn(1).width = 42; ws.getColumn(2).width = 20; ws.getColumn(3).width = 38;
  },

  sheetJournal(wb, client, period, positions) {
    var ws = wb.addWorksheet('Journal Entries');
    this.applySheetView(ws);
    var ds = this.addSheetHeader(ws, {
      title: 'EbixCash - Journal Entries - Lease Accounting (Ind AS 116)',
      client: client.name,
      address: client.address || '',
      period: Utils.fmtDate(period),
      sheetDesc: 'Dr/Cr entries for the reporting FY: Depreciation, Interest accrual, Lease payments, Security deposit unwinding',
      colEnd: 'E',
      extraRows: [
        { label: 'Standard', value: 'Ind AS 116 - Leases' },
        { label: 'Currency', value: 'INR (₹)' },
        { label: 'Branches', value: positions.length },
        { label: 'Prepared by', value: (App.currentClient && App.currentClient.preparedBy) || 'EbixCash ROU Master' }
      ]
    });

    var hr = ws.addRow(['Particulars', 'Account', 'Debit (₹)', 'Credit (₹)']); this.styleHeader(hr, 4);
    var firstRow = ds + 1;
    var CUR = this.CUR;
    var self = this;

    // Aggregate totals across all branches
    var totals = {
      fyDep: 0,
      fyInt: 0,
      fyPay: 0,
      sdInterest: 0,
      variableRent: 0
    };

    positions.forEach(function(p) {
      if (!p.pos) return;
      totals.fyDep += p.pos.fyDep || 0;
      totals.fyInt += p.pos.fyInt || 0;
      totals.fyPay += p.pos.fyPay || 0;
      totals.sdInterest += p.pos.sdInterest || 0;
      
      // Variable lease payments (Para 38) — expensed as incurred, NOT in liability.
      var vr = parseFloat(p.rou.variableRentMonthly) || 0;
      if (vr > 0) {
        var _s = DB.get('settings') || {};
        var _pStart = _s.periodStart || '', _pEnd = period || '';
        if (p.rou.startDate && p.rou.startDate <= _pEnd) {
          var lS = p.rou.startDate > _pStart ? p.rou.startDate : _pStart;
          var lE = p.rou.endDate && p.rou.endDate < _pEnd ? p.rou.endDate : _pEnd;
          if (lS <= lE) {
            var months = Engine.monthsBetween(new Date(lS), new Date(lE)) + 1;
            totals.variableRent += Engine.r2(months * vr);
          }
        }
      }
    });

    // Add consolidated journal entries
    function add(part, acc, dr, cr) {
      var r = ws.addRow([part, acc, dr || null, cr || null]);
      r.height = 20;
      r.getCell(3).numFmt = CUR; r.getCell(4).numFmt = CUR;
      r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
      r.getCell(2).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      r.getCell(3).alignment = { vertical: 'middle', horizontal: 'right' };
      r.getCell(4).alignment = { vertical: 'middle', horizontal: 'right' };
      // Dr rows have debit filled, Cr rows are indented
      var isDr = (dr !== null && dr !== undefined);
      if (!isDr) {
        r.getCell(2).font = { italic: true, color: { argb: 'FF475569' } };
      }
      for (var _c = 1; _c <= 4; _c++) {
        r.getCell(_c).border = {
          top:    { style: 'hair', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'hair', color: { argb: 'FFD1D5DB' } },
          left:   { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right:  { style: 'thin', color: { argb: 'FFD1D5DB' } }
        };
      }
    }

    if (totals.fyDep > 0) { 
      add('Depreciation (FY)', 'Dr Depreciation Expense', totals.fyDep, null); 
      add('', 'Cr Accumulated Depreciation - ROU', null, totals.fyDep); 
    }
    if (totals.fyInt > 0) { 
      add('Interest on lease liability (FY)', 'Dr Finance Cost', totals.fyInt, null); 
      add('', 'Cr Lease Liability', null, totals.fyInt); 
    }
    if (totals.fyPay > 0) { 
      add('Lease payments (FY)', 'Dr Lease Liability', totals.fyPay, null); 
      add('', 'Cr Bank', null, totals.fyPay); 
    }
    if (totals.sdInterest > 0) { 
      add('Security deposit unwinding (FY)', 'Dr Security Deposit (Ind AS)', totals.sdInterest, null); 
      add('', 'Cr Interest Income', null, totals.sdInterest); 
    }
    if (totals.variableRent > 0) {
      add('Variable lease payments (Para 38, FY)', 'Dr Variable Lease Expense', totals.variableRent, null);
      add('', 'Cr Bank / Accrual', null, totals.variableRent);
    }

    var lastRow = ws.rowCount;
    var tot = ws.addRow(['', 'TOTAL', 0, 0]);
    tot.getCell(3).value = { formula: 'SUM(C' + firstRow + ':C' + lastRow + ')' };
    tot.getCell(4).value = { formula: 'SUM(D' + firstRow + ':D' + lastRow + ')' };
    tot.getCell(3).numFmt = CUR; tot.getCell(4).numFmt = CUR;
    self.styleTotalRow(tot, 4);
    ws.getColumn(1).width = 36; ws.getColumn(2).width = 36;
    ws.getColumn(3).width = 18; ws.getColumn(4).width = 18;
  },

  sheetMaturity(wb, client, period, positions) {
    var ws = wb.addWorksheet('Maturity Profile');
    this.applySheetView(ws);
    var ds = this.addSheetHeader(ws, {
      title: 'EbixCash - Maturity Profile (Ind AS 116)',
      client: client.name || this._client || '',
      address: client.address || '',
      period: Utils.fmtDate(period),
      sheetDesc: 'Undiscounted future minimum lease payments bucketed by maturity band, as at the reporting date',
      colEnd: 'F',
      extraRows: [
        { label: 'Standard', value: 'Ind AS 116 - Leases' },
        { label: 'Currency', value: 'INR (₹)' },
        { label: 'Branches', value: positions.length },
        { label: 'Prepared by', value: (App.currentClient && App.currentClient.preparedBy) || 'EbixCash ROU Master' }
      ]
    });

    var hr = ws.addRow(['Branch / Location', 'Not later than 1 year', '1 – 5 years', 'Later than 5 years', 'Total (Undiscounted)']); this.styleHeader(hr, 5);
    var firstRow = ds + 1;
    var CUR = this.CUR;
    var self = this;

    positions.forEach(function(p, i) {
      var mp = Engine.maturityProfile(p.rou, period);
      var row = ws.addRow([p.rou.branchName, mp.y1, mp.y15, mp.y5, 0]);
      row.getCell(5).value = { formula: 'SUM(B' + (firstRow + i) + ':D' + (firstRow + i) + ')' };
      for (var c = 2; c <= 5; c++) row.getCell(c).numFmt = CUR;
      self.styleDataRow(row, 5);
      row.getCell(5).font = { bold: true };
      if (i % 2 === 1) {
        for (var c = 1; c <= 5; c++) {
          var cell = row.getCell(c);
          if (!cell.fill || !cell.fill.fgColor || cell.fill.fgColor.argb === 'FFFFFFFF')
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } };
        }
      }
    });

    var lastRow = firstRow + positions.length - 1;
    var tot = ws.addRow(['TOTAL', 0, 0, 0, 0]);
    var letters = ['B', 'C', 'D', 'E'];
    letters.forEach(function(L) {
      tot.getCell(L).value = { formula: 'SUM(' + L + firstRow + ':' + L + lastRow + ')' };
      tot.getCell(L).numFmt = CUR;
    });
    self.styleTotalRow(tot, 5);
    ws.getColumn(1).width = 30;
    ws.getColumn(2).width = 24; ws.getColumn(3).width = 22;
    ws.getColumn(4).width = 22; ws.getColumn(5).width = 24;
  },

  sheetDisclosures(wb, client, periodDisplay, period, positions, allRous) {
    var ws = wb.addWorksheet('Disclosures (Para 52-60)');
    this.applySheetView(ws);
    var CUR = this.CUR;
    var self = this;

    var ds = this.addSheetHeader(ws, {
      title: 'EbixCash - Ind AS 116 Disclosures (Para 52–60)',
      client: client.name, address: client.address || '',
      period: Utils.fmtDate(period),
      sheetDesc: 'Quantitative and qualitative disclosures as required by Ind AS 116 paragraphs 52–60',
      colEnd: 'D',
      extraRows: [
        { label: 'Standard', value: 'Ind AS 116 - Leases' },
        { label: 'Currency', value: 'INR (₹)' },
        { label: 'Prepared by', value: (App.currentClient && App.currentClient.preparedBy) || 'EbixCash ROU Master' }
      ]
    });

    var self = this;

    function section(title) {
      ws.addRow([]).height = 6;
      var r = ws.addRow([title]);
      self.styleSectionTitle(ws, r, 4);
    }
    function line(label, val, note) {
      var r = ws.addRow([label, val, '', note || '']);
      r.height = 22;
      if (val !== null && val !== undefined && typeof val === 'number') r.getCell(2).numFmt = CUR;
      r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: false };
      r.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
      r.getCell(4).alignment = { vertical: 'middle', horizontal: 'left', wrapText: false };
      r.getCell(4).font = { italic: true, color: { argb: 'FF64748B' }, size: 9 };
      for (var _c = 1; _c <= 4; _c++) {
        r.getCell(_c).border = {
          top:    { style: 'hair', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'hair', color: { argb: 'FFD1D5DB' } },
          left:   { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right:  { style: 'thin', color: { argb: 'FFD1D5DB' } }
        };
      }
      return r;
    }
    function text(label, val) {
      var r = ws.addRow([label, val]);
      r.height = 20;
      r.getCell(1).font = { italic: true, color: { argb: 'FF475569' } };
      r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: false };
    }

    // ── A. WEIGHTED AVERAGE IBR (Para 58(b)) ─────────────────────────
    section('A. Weighted-average IBR — Para 58(b)');
    var totalLiab = 0, ibrWeightSum = 0;
    positions.forEach(function(p) {
      if (!p.pos) return;
      var liab = p.pos.closingLiab || 0;
      totalLiab += liab;
      ibrWeightSum += liab * (parseFloat(p.rou.ibr) || 0);
    });
    var wtAvgIBR = totalLiab > 0 ? Engine.r2(ibrWeightSum / totalLiab) : 0;
    line('Weighted-average IBR applied to lease liabilities', null, 'Weighted by closing liability balance');
    var ibrRow = ws.addRow(['', wtAvgIBR.toFixed(2) + '%', '', 'As at reporting date']);
    ibrRow.getCell(2).font = { bold: true, size: 13, color: { argb: 'FF1A3060' } };

    // Individual IBRs
    ws.addRow(['Branch', 'IBR %', 'Closing Liability (₹)', 'IBR × Liability (weight)']);
    positions.forEach(function(p) {
      if (!p.pos) return;
      var r = ws.addRow([p.rou.branchName, (p.rou.ibr || 0) + '%',
        p.pos.closingLiab || 0,
        Engine.r2(((parseFloat(p.rou.ibr)||0) * (p.pos.closingLiab||0)))
      ]);
      r.getCell(3).numFmt = CUR; r.getCell(4).numFmt = CUR;
    });

    // ── B. AMOUNTS RECOGNISED IN P&L (Para 53) ───────────────────────
    section('B. Amounts recognised in profit or loss — Para 53');
    var fyDep = 0, fyInt = 0, exemptExpense = 0;
    positions.forEach(function(p) { if (p.pos) { fyDep += p.pos.fyDep; fyInt += p.pos.fyInt; } });

    // Exempt leases — sum rent payments as straight-line expense
    var s = DB.get('settings') || {};
    var pStart = s.periodStart || '', pEnd = period || '';
    allRous.forEach(function(r) {
      if ((r.leaseType === 'short-term' || r.leaseType === 'low-value') && r.startDate <= pEnd) {
        // count months of this lease falling in the FY
        var lStart = r.startDate > pStart ? r.startDate : pStart;
        var lEnd = r.endDate && r.endDate < pEnd ? r.endDate : pEnd;
        if (lStart <= lEnd) {
          var months = Engine.monthsBetween(new Date(lStart), new Date(lEnd)) + 1;
          exemptExpense += months * (parseFloat(r.baseRent) || 0);
        }
      }
    });

    // Variable lease payments expensed in period (Para 38)
    // Variable rent is excluded from lease liability and expensed as incurred. For period totals,
    // count it across months of each lease that fall within the reporting window.
    var variableExpense = 0;
    allRous.forEach(function(r) {
      var vr = parseFloat(r.variableRentMonthly) || 0;
      if (!vr || !r.startDate || r.startDate > pEnd) return;
      var lStart = r.startDate > pStart ? r.startDate : pStart;
      var lEnd = r.endDate && r.endDate < pEnd ? r.endDate : pEnd;
      if (lStart <= lEnd) {
        var months = Engine.monthsBetween(new Date(lStart), new Date(lEnd)) + 1;
        variableExpense += months * vr;
      }
    });

    line('Depreciation charge on right-of-use assets', Engine.r2(fyDep));
    line('Interest expense on lease liabilities', Engine.r2(fyInt));
    line('Short-term lease expense (Para 55(a))', Engine.r2(exemptExpense) || null, exemptExpense ? '' : 'Nil — no short-term/low-value leases recognised');
    line('Low-value asset lease expense (Para 55(b))', null, 'Included in short-term expense above if applicable');
    line('Variable lease payments (Para 53(e) / Para 38)', Engine.r2(variableExpense) || null, variableExpense ? 'Expensed as incurred — not included in lease liability' : 'Nil — no variable lease components');
    line('Total P&L impact', Engine.r2(fyDep + fyInt + exemptExpense + variableExpense));

    // ── C. MATURITY ANALYSIS (Para 58(a)) ────────────────────────────
    section('C. Maturity analysis of undiscounted lease payments — Para 58(a)');
    ws.addRow(['Band', 'Undiscounted Payments (₹)']);
    var y1=0,y15=0,y5=0;
    positions.forEach(function(p) {
      var mp = Engine.maturityProfile(p.rou, period);
      y1 += mp.y1; y15 += mp.y15; y5 += mp.y5;
    });
    var m1 = ws.addRow(['Not later than 1 year', Engine.r2(y1)]); m1.getCell(2).numFmt = CUR;
    var m2 = ws.addRow(['1 – 5 years', Engine.r2(y15)]); m2.getCell(2).numFmt = CUR;
    var m3 = ws.addRow(['Later than 5 years', Engine.r2(y5)]); m3.getCell(2).numFmt = CUR;
    var mt = ws.addRow(['Total', Engine.r2(y1+y15+y5)]); mt.getCell(2).numFmt = CUR;
    mt.getCell(1).font = { bold: true }; mt.getCell(2).font = { bold: true };

    // ── D. LEASE TERM JUDGEMENTS (Para 59) ───────────────────────────
    section('D. Significant judgements — lease term & options (Para 59)');
    var optLeases = allRous.filter(function(r) { return r.hasOptions; });
    if (optLeases.length === 0) {
      text('', 'No leases with material renewal or termination options identified for this period.');
    } else {
      ws.addRow(['Branch', 'Option Type', 'Exercise Judgement', 'Rationale']);
      optLeases.forEach(function(r) {
        var certainty = r.optionCertainty === 'included' ? 'Reasonably certain — included in lease term' : 'Not reasonably certain — not included in lease term';
        ws.addRow([r.branchName, r.optionType || 'renewal', certainty, r.optionRationale || 'No rationale provided']);
      });
    }

    // ── E. EXEMPT LEASES REGISTER (Para 55) ──────────────────────────
    section('E. Short-term & low-value lease register — Para 55');
    var exemptList = allRous.filter(function(r) { return r.leaseType === 'short-term' || r.leaseType === 'low-value'; });
    if (exemptList.length === 0) {
      text('', 'No short-term or low-value asset lease exemptions applied for this period. All leases recognised under the full ROU model.');
    } else {
      ws.addRow(['Branch', 'Exemption', 'Start Date', 'End Date', 'Monthly Rent (₹)']);
      exemptList.forEach(function(r) {
        var row = ws.addRow([
          r.branchName,
          r.leaseType === 'short-term' ? 'Short-term (Para 5a)' : 'Low-value (Para 5b)',
          Utils.fmtDate(r.startDate), Utils.fmtDate(r.endDate),
          parseFloat(r.baseRent) || 0
        ]);
        row.getCell(5).numFmt = CUR;
      });
    }

    // ── F. ROU COST ADJUSTMENTS (Para 24) ────────────────────────────
    section('F. Right-of-use asset cost adjustments — Para 24');
    var totalIDC = 0, totalIncentives = 0;
    var adjList = [];
    allRous.forEach(function(r) {
      var ridc = parseFloat(r.initialDirectCosts) || 0;
      var rinc = parseFloat(r.leaseIncentives) || 0;
      if (ridc > 0 || rinc > 0) {
        adjList.push({ branch: r.branchName, idc: ridc, inc: rinc });
        totalIDC += ridc;
        totalIncentives += rinc;
      }
    });
    if (adjList.length === 0) {
      text('', 'No initial direct costs or lease incentives recognised across the portfolio.');
    } else {
      ws.addRow(['Branch', 'Initial Direct Costs (Para 24c)', 'Lease Incentives (Para 24b)', 'Net ROU Adjustment']);
      adjList.forEach(function(a) {
        var row = ws.addRow([a.branch, a.idc, a.inc, Engine.r2(a.idc - a.inc)]);
        row.getCell(2).numFmt = CUR; row.getCell(3).numFmt = CUR; row.getCell(4).numFmt = CUR;
      });
      var totAdj = ws.addRow(['TOTAL', Engine.r2(totalIDC), Engine.r2(totalIncentives), Engine.r2(totalIDC - totalIncentives)]);
      totAdj.getCell(2).numFmt = CUR; totAdj.getCell(3).numFmt = CUR; totAdj.getCell(4).numFmt = CUR;
      totAdj.eachCell(function(c){
        c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3060' } };
      });
    }

    // ── G. PAYMENT TIMING ANALYSIS (Para 26) ─────────────────────────
    section('G. Payment timing — Para 26');
    var advCount = 0, arrCount = 0;
    allRous.forEach(function(r) {
      if ((r.paymentTiming || 'arrears') === 'advance') advCount++; else arrCount++;
    });
    line('Leases with payments in advance (start of period)', advCount, advCount ? 'PV uses 1/(1+r)^(m-1)' : '');
    line('Leases with payments in arrears (end of period)', arrCount, arrCount ? 'PV uses 1/(1+r)^m' : '');
    line('Total leases', advCount + arrCount);

    // Column widths
    ws.getColumn(1).width = 46;
    ws.getColumn(2).width = 24;
    ws.getColumn(3).width = 24;
    ws.getColumn(4).width = 54;
  },

  sheetSchedules(wb, client, positions) {
    var usedNames = new Set(['branch details','summary','p&l impact (fy-wise)','balance sheet','journal entries','maturity profile','disclosures (para 52-60)']);
    var self = this;
    var period = this._period || '';
    var clientName = client ? client.name : (this._client || '');
    var clientAddress = client ? (client.address || '') : '';

    positions.forEach(function(p) {
      if (p.sch.error) return;
      var meta = self._branchMeta[p.rou.id];
      if (!meta) return;
      var sheetName = meta.sheetName;
      // Register name so safeSheetName skips it (already assigned in pass 1)
      usedNames.add(sheetName.toLowerCase());

      var ws = wb.addWorksheet(sheetName);
      self.applySheetView(ws);

      var hasSD = !!p.sch.secDep;
      var sdRate = hasSD ? p.sch.secDep.rate : 0;
      var N = p.sch.N;
      // Payment timing & transition state — used by both header metadata and formula choice below.
      var isAdvance    = p.rou.paymentTiming === 'advance';
      var isTransition = p.sch.transitionMonth != null;
      var idc          = parseFloat(p.rou.initialDirectCosts) || 0;
      var inc          = parseFloat(p.rou.leaseIncentives) || 0;
      var varRent      = parseFloat(p.rou.variableRentMonthly) || 0;
      var openAccDep   = isTransition ? (parseFloat(p.rou.openingAccDep) || 0) : 0;

      // ── HEADER BLOCK ─────────────────────────────────────────
      var extras = [
        { label: 'Party / Lessor', value: p.rou.partyName || '-' },
        { label: 'IBR', value: p.rou.ibr + '% p.a.' },
        { label: 'Payment Timing', value: isAdvance ? 'In advance (Para 26)' : 'In arrears (Para 26)' },
        { label: 'Commencement', value: Utils.fmtDate(p.rou.startDate) },
        { label: 'End Date', value: Utils.fmtDate(p.rou.endDate) },
        { label: 'Tenure', value: N + ' months' },
        { label: 'Initial Lease Liability', value: '\u20b9' + Number(p.sch.initialLiability).toLocaleString('en-IN') },
        { label: 'Monthly Rent', value: '\u20b9' + Number(p.rou.baseRent).toLocaleString('en-IN') },
        { label: 'Monthly Depreciation', value: '\u20b9' + Number(p.sch.monthlyDep).toFixed(2) },
        { label: 'Status', value: p.rou.status || 'Active' },
        { label: 'Prepared by', value: (App.currentClient && App.currentClient.preparedBy) || 'EbixCash ROU Master' }
      ];
      if (hasSD) {
        extras.splice(extras.length - 2, 0,
          { label: 'Security Deposit (Gross)', value: '\u20b9' + Number(p.sch.secDep.gross).toLocaleString('en-IN') },
          { label: 'Security Deposit (Ind AS)', value: '\u20b9' + Number(p.sch.secDep.initialIndAS).toLocaleString('en-IN') }
        );
      }
      if (idc > 0) extras.push({ label: 'Initial Direct Costs (Para 24c)', value: '\u20b9' + Number(idc).toLocaleString('en-IN') });
      if (inc > 0) extras.push({ label: 'Lease Incentives (Para 24b)', value: '\u20b9' + Number(inc).toLocaleString('en-IN') });
      if (varRent > 0) extras.push({ label: 'Variable Rent / mo (Para 38)', value: '\u20b9' + Number(varRent).toLocaleString('en-IN') });
      if (isTransition) extras.push({ label: 'Opening Balance Date', value: Utils.fmtDate(p.rou.openingDate) });

      var ds = self.addSheetHeader(ws, {
        title: 'Lease Amortisation Schedule — ' + p.rou.branchName,
        client: clientName, address: clientAddress,
        period: Utils.fmtDate(period),
        sheetDesc: 'Formula-driven schedule. Col D (rent) = only seed input. All other numeric columns are live Excel formulas.',
        colEnd: 'T',
        extraRows: extras
      });

      // ── PARAMS ROW (seed inputs — all formulas reference these cells) ──
      var paramRow = ds;   // addSheetHeader returns the next available row — we use it as PARAMS
      ws.getCell('A' + paramRow).value = 'PARAMETERS';
      ws.getCell('A' + paramRow).font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 9 };
      ws.getCell('A' + paramRow).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3060' } };

      ws.getCell('B' + paramRow).value = 'Discount Rate (PV)';
      // Discount rate (IBR) - used ONLY for PV calculation at commencement
      var discountRate = parseFloat(p.rou.ibr);
      ws.getCell('C' + paramRow).value = discountRate / 12 / 100;
      ws.getCell('C' + paramRow).numFmt = '0.0000000000';

      ws.getCell('D' + paramRow).value = 'Interest Rate (Unwind)';
      // Use separate interest rate if provided, otherwise use discount rate
      var interestRate = parseFloat(p.rou.interestIBR) || parseFloat(p.rou.ibr);
      ws.getCell('E' + paramRow).value = interestRate / 12 / 100;
      ws.getCell('E' + paramRow).numFmt = '0.0000000000';

      ws.getCell('G' + paramRow).value = 'Init Liability';
      // Calculate initial liability as sum of PV of all lease payments (column W)
      // This ensures the opening liability equals the sum of discounted payments
      // Build a SUM formula for all PV payments (column W) in the data range
      var firstDataRow = paramRow + 2;  // First data row after params and headers
      var lastDataRow = firstDataRow + p.sch.rows.length - 1;  // Last data row
      ws.getCell('H' + paramRow).value = { formula: 'SUM(W' + firstDataRow + ':W' + lastDataRow + ')' };
      ws.getCell('H' + paramRow).numFmt = self.CUR;

      ws.getCell('J' + paramRow).value = 'ROU Cost';
      ws.getCell('K' + paramRow).value = p.sch.rouCost;
      ws.getCell('K' + paramRow).numFmt = self.CUR;

      ws.getCell('M' + paramRow).value = 'Base Dep/mo';
      ws.getCell('N' + paramRow).value = p.sch.monthlyDep;
      ws.getCell('N' + paramRow).numFmt = self.CUR;

      if (hasSD) {
        ws.getCell('P' + paramRow).value = 'SD Rate/mo (Unwind)';
        // Use separate SD unwinding rate if provided, otherwise use SD discount rate
        var sdUnwindRate = parseFloat(p.rou.secDepInterestIBR) || parseFloat(p.rou.secDepIBR) || parseFloat(p.rou.ibr);
        ws.getCell('Q' + paramRow).value = sdUnwindRate / 12 / 100;
        ws.getCell('Q' + paramRow).numFmt = '0.0000000000';
        ws.getCell('R' + paramRow).value = 'SD Init (PV)';
        ws.getCell('S' + paramRow).value = p.sch.secDep.initialIndAS;
        ws.getCell('S' + paramRow).numFmt = self.CUR;
      }

      // Period bounds as REAL Excel dates (used by SUMIFS date-range criteria in Summary/P&L)
      var pStartStr = self._periodStart || '';
      var pEndStr   = self._period || '';
      ws.getCell('U' + paramRow).value = pStartStr ? new Date(pStartStr) : null;
      ws.getCell('U' + paramRow).numFmt = 'dd-mmm-yyyy';
      ws.getCell('V' + paramRow).value = pEndStr ? new Date(pEndStr) : null;
      ws.getCell('V' + paramRow).numFmt = 'dd-mmm-yyyy';

      ['B','C','D','E','G','H','J','K','M','N','P','Q','R','S','U','V'].forEach(function(col) {
        var c = ws.getCell(col + paramRow);
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6EEF9' } };
        c.font = { name: 'Calibri', size: 9, color: { argb: 'FF1A3060' } };
      });

      // Cell addresses for formula references
      var DISCRATE = 'C' + paramRow;  // Discount rate for PV calculation
      var RATE  = 'E' + paramRow;     // Interest rate for unwinding
      var ILIAB = 'H' + paramRow;
      var RCOST = 'K' + paramRow;
      var BDEP  = 'N' + paramRow;
      var SDRT  = 'Q' + paramRow;
      var SDINIT= 'S' + paramRow;
      var PSTART= 'U' + paramRow;   // period start (real date)
      var PEND  = 'V' + paramRow;   // period end (real date)

      // ── COLUMN HEADERS ────────────────────────────────────────
      var GH = paramRow + 1;
      var grpRow = ws.getRow(GH);
      grpRow.values = ['#','Month','FY','Rent (₹)','Open Liab','Interest','Payment','Close Liab','Open ROU',"Dep'n",'Close ROU','Acc Dep','NBV','SD Open','SD Interest','SD Close','SD PV','Disc Open','Disc Dep','Disc Close','SD Gross','Date(key)','PV of Payment'];
      self.styleHeader(grpRow, 23);
      ['E','F','G','H'].forEach(function(c){ ws.getCell(c+GH).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1E3A5F'}}; });
      ['I','J','K','L','M'].forEach(function(c){ ws.getCell(c+GH).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1A5C3A'}}; });
      ['N','O','P','Q','R','S','T'].forEach(function(c){ ws.getCell(c+GH).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF5C1A1A'}}; });
      // PV column header colour (purple-ish to distinguish)
      ws.getCell('W'+GH).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF3B1A6E'}};
      ws.getCell('W'+GH).font={bold:true,color:{argb:'FFFFFFFF'},name:'Calibri',size:9};

      // Reassessment dep lookup: month → new monthly dep value (only at reassessment rows)
      var reassessDep = {};
      if (p.sch.adjustments && p.sch.adjustments.length) {
        p.sch.rows.forEach(function(r) {
          if (r.reassess) reassessDep[r.m] = r.dep;
        });
      }

      // ── DATA ROWS ─────────────────────────────────────────────
      var DATA_START = GH + 1;
      var rIdx = DATA_START;

      p.sch.rows.forEach(function(r, i) {
        var isFirst   = (i === 0);
        var prevR     = rIdx - 1;
        var isRe      = r.reassess;

        // E — Open Liability
        // row 1: =ILIAB (param cell = initialLiability OR opening lease liab for transition)
        // reassessment row: hard seed — new PV computed by engine (Para 45, unavoidable)
        // all other rows: =H(prev) — previous close liability
        var eVal = isFirst ? { formula: ILIAB }
                 : isRe   ? r.openLiab
                 :           { formula: 'H' + prevR };

        // I — Open ROU
        // row 1 non-transition: =RCOST (gross ROU cost from param cell)
        // row 1 transition:     hard seed = openingROUnbv (carrying NBV at opening date — NOT gross cost)
        // reassessment row:     hard seed — adjusted ROU (Para 45)
        // all other rows:       =K(prev)
        var iVal = isFirst ? (isTransition ? Engine.r2(r.openROU) : { formula: RCOST })
                 : isRe   ? r.openROU
                 :           { formula: 'K' + prevR };

        // L — Accumulated Depreciation (cumulative chain)
        // For transition leases, row 1 starts from openingAccDep + dep_1 so the running total reflects pre-opening dep already booked.
        var lVal = isFirst
                 ? (isTransition ? Engine.r2(openAccDep + r.dep) : { formula: 'J' + rIdx })
                 : { formula: 'L' + prevR + '+J' + rIdx };

        // N — SD Open
        // row 1: =SDINIT (param cell)
        // other rows: =P(prev) — previous SD close
        var nVal = !hasSD ? null
                 : isFirst ? { formula: SDINIT }
                 :            { formula: 'P' + prevR };

        var dataRow = ws.addRow([
          r.m,                    // A: month number
          Utils.fmtDate(r.date),  // B: date
          r.fy,                   // C: FY (used by SUMIF in Summary/P&L)
          r.rent,                 // D: rent — only true seed (schedule input)
          eVal,                   // E: open liability
          null,                   // F: interest — formula set below
          null,                   // G: payment — formula set below
          null,                   // H: close liability — formula
          iVal,                   // I: open ROU
          null,                   // J: depreciation — formula
          null,                   // K: close ROU — formula
          lVal,                   // L: accumulated depreciation — formula chain
          null,                   // M: NBV — formula
          hasSD ? nVal : null,    // N: SD open
          null,                   // O: SD interest — formula
          null,                   // P: SD close — formula
          null,                   // Q: SD PV — will be populated below
          null,                   // R: Discount Open — will be populated below
          null,                   // S: Discount Dep — will be populated below
          null,                   // T: Discount Close — will be populated below
          null,                   // U: SD gross — will be populated below from sdRow.gross (monthly value)
          null,                   // V: Date key — will be populated below
          null                    // W: PV of Payment — will be populated below
        ]);

        // F: interest — monthly rate (IBR/12) on opening liability for every month.
        dataRow.getCell(6).value = { formula: 'E'+rIdx+'*'+RATE };
        // G: payment = D
        dataRow.getCell(7).value  = { formula: 'D'+rIdx };
        // H: close liability — sign of payment depends on timing (both algebraically reduce to the same value when F is computed correctly).
        //   Arrears: H = E + F − G
        //   Advance: H = E − G + F
        if (isAdvance) {
          dataRow.getCell(8).value = { formula: 'E'+rIdx+'-G'+rIdx+'+F'+rIdx };
        } else {
          dataRow.getCell(8).value = { formula: 'E'+rIdx+'+F'+rIdx+'-G'+rIdx };
        }
        // J: depreciation
        //   row 1 → =BDEP (param cell)
        //   reassessment row → hard seed (dep changes after Para 45 remeasurement)
        //   all other rows → =J(prev) — dep is constant within each segment
        if (isFirst) {
          dataRow.getCell(10).value = { formula: BDEP };
        } else if (isRe) {
          dataRow.getCell(10).value = reassessDep[r.m] !== undefined ? Engine.r2(reassessDep[r.m]) : Engine.r2(r.dep);
        } else {
          dataRow.getCell(10).value = { formula: 'J'+prevR };
        }
        // K: close ROU = I − J
        dataRow.getCell(11).value = { formula: 'I'+rIdx+'-J'+rIdx };
        // M: NBV = K
        dataRow.getCell(13).value = { formula: 'K'+rIdx };

        // V (col 22): real Excel date key — used by SUMIFS date-range criteria in Summary/P&L
        dataRow.getCell(22).value = new Date(r.date);
        dataRow.getCell(22).numFmt = 'dd-mmm-yyyy';

        // W (col 23): PV of payment using DISCOUNT rate (not interest rate!) from params
        // ADVANCE payment: Month 1 is NOT discounted (paid at start), months 2+ are discounted by (month-1)
        // ARREARS payment: All months discounted by month number
        // Use DISCRATE for PV calculation, NOT RATE (which is for interest unwinding)
        if (r.isExtension) {
          dataRow.getCell(23).value = 0;
        } else {
          if (isAdvance) {
            // Advance: First month not discounted, rest discounted by (month-1)
            dataRow.getCell(23).value = { formula: 'IF(A'+rIdx+'=1,D'+rIdx+',D'+rIdx+'/((1+'+DISCRATE+')^(A'+rIdx+'-1)))' };
          } else {
            // Arrears: All months discounted by month number
            dataRow.getCell(23).value = { formula: 'D'+rIdx+'/((1+'+DISCRATE+')^A'+rIdx+')' };
          }
        }
        dataRow.getCell(23).numFmt = self.CUR;

        // SD formulas — only when N is populated (hasSD and row is within SD schedule)
        if (hasSD && nVal !== null) {
          dataRow.getCell(15).value = { formula: 'N'+rIdx+'*'+SDRT };   // O: SD interest
          dataRow.getCell(16).value = { formula: 'N'+rIdx+'+O'+rIdx };  // P: SD close
          
          // Q: SD PV - get from secDep rows
          var sdRow = p.sch.secDep.rows.find(function(sr) { 
            return sr.date.toISOString().split('T')[0] === r.date.toISOString().split('T')[0]; 
          });
          if (sdRow && sdRow.pv !== undefined) {
            dataRow.getCell(17).value = Engine.r2(sdRow.pv);
            dataRow.getCell(17).numFmt = self.CUR;
            
            // R, S, T: Discount Open, Dep, Close
            dataRow.getCell(18).value = Engine.r2(sdRow.discountOpen);
            dataRow.getCell(18).numFmt = self.CUR;
            dataRow.getCell(19).value = Engine.r2(sdRow.discountDep);
            dataRow.getCell(19).numFmt = self.CUR;
            dataRow.getCell(20).value = Engine.r2(sdRow.discountClose);
            dataRow.getCell(20).numFmt = self.CUR;
            
            // U: SD Gross - monthly value (supports escalation)
            if (sdRow.gross !== undefined) {
              dataRow.getCell(21).value = Engine.r2(sdRow.gross);
              dataRow.getCell(21).numFmt = self.CUR;
            }
          }
        }

        for (var c = 4; c <= 23; c++) dataRow.getCell(c).numFmt = self.CUR;
        dataRow.getCell(3).numFmt = '@';
        dataRow.height = 18;

        // Apply borders + fill to all 23 data columns (including V and W)
        var _schFill = isRe ? 'FFFEF3C7' : (i % 2 === 1 ? 'FFF5F7FA' : null);
        for (var _sc = 1; _sc <= 23; _sc++) {
          var _scell = dataRow.getCell(_sc);
          _scell.border = {
            top:    { style: 'hair', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } },
            left:   { style: 'thin', color: { argb: 'FFD1D5DB' } },
            right:  { style: 'thin', color: { argb: 'FFD1D5DB' } }
          };
          if (_schFill) _scell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: _schFill } };
          _scell.alignment = { vertical: 'middle', horizontal: _sc <= 3 ? 'left' : 'right' };
        }
        rIdx++;
      });

      // ── TOTALS ────────────────────────────────────────────────
      var LAST = rIdx - 1;
      var tot = ws.addRow(['','','TOTALS',
        {formula:'SUM(D'+DATA_START+':D'+LAST+')'},
        null,
        {formula:'SUM(F'+DATA_START+':F'+LAST+')'},
        {formula:'SUM(G'+DATA_START+':G'+LAST+')'},
        null,null,
        {formula:'SUM(J'+DATA_START+':J'+LAST+')'},
        null,null,null,null,
        {formula:'SUM(O'+DATA_START+':O'+LAST+')'},
        null,null,null,
        {formula:'SUM(S'+DATA_START+':S'+LAST+')'},
        null,null,
        null,  // V: Date key (empty for totals)
        {formula:'SUM(W'+DATA_START+':W'+LAST+')'}  // W: PV total
      ]);
      tot.getCell(23).numFmt = self.CUR;
      for (var c=4;c<=23;c++) tot.getCell(c).numFmt=self.CUR;  // Currency format for all numeric columns including W
      // Proper totals row formatting — matches Main Summary
      tot.height = 24;
      for (var _tc = 1; _tc <= 23; _tc++) {
        var _tcell = tot.getCell(_tc);
        _tcell.font  = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Calibri', size: 10 };
        _tcell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3060' } };
        _tcell.alignment = { vertical: 'middle', horizontal: _tc <= 3 ? 'left' : 'right' };
        _tcell.border = {
          top:    { style: 'medium', color: { argb: 'FF000000' } },
          bottom: { style: 'medium', color: { argb: 'FF000000' } },
          left:   { style: 'thin',   color: { argb: 'FF000000' } },
          right:  { style: 'thin',   color: { argb: 'FF000000' } }
        };
      }

      var widths=[5,14,11,15,16,14,15,16,16,14,16,15,15,15,15,15,15,15,15,15,14,0,16];
      ws.columns.forEach(function(c,i){ c.width=widths[i]||14; });
      ws.getColumn(22).hidden = true;   // V: date-key helper column (used by SUMIFS)
      ws.getColumn(23).hidden = false;  // W: PV of Payment column (visible)

      // ── ADJUSTMENT DISCLOSURE ─────────────────────────────────
      // If automatic adjustment was applied to ensure final liability = 0, add a disclosure note
      if (p.sch.liabilityAdjustment) {
        var adj = p.sch.liabilityAdjustment;
        ws.addRow([]);  // blank row for spacing
        var noteRow = ws.addRow(['NOTE:', 'Automatic Adjustment Applied']);
        noteRow.getCell(1).font = { bold: true, color: { argb: 'FFCC3300' }, name: 'Calibri', size: 10 };
        noteRow.getCell(2).font = { bold: true, color: { argb: 'FFCC3300' }, name: 'Calibri', size: 10 };
        
        var detailRow = ws.addRow(['', 
          'Interest in month ' + adj.month + ' (' + Utils.fmtDate(adj.date) + ') adjusted by ₹' + 
          Number(adj.adjustmentAmount).toFixed(2) + ' (from ₹' + Number(adj.originalInterest).toFixed(2) + 
          ' to ₹' + Number(adj.adjustedInterest).toFixed(2) + 
          ') to ensure final lease liability closes at exactly ₹0. Original closing balance was ₹' + 
          Number(adj.originalClosingBalance).toFixed(2) + '.'
        ]);
        detailRow.getCell(2).font = { italic: true, color: { argb: 'FF666666' }, name: 'Calibri', size: 9 };
        detailRow.getCell(2).alignment = { wrapText: true, vertical: 'top' };
        ws.mergeCells('B' + detailRow.number + ':T' + detailRow.number);
        detailRow.height = 30;
      }
    });
  }


};


// ════════════════════════════════════════════════════════════
// CLOSE MODALS ON OUTSIDE CLICK
// ════════════════════════════════════════════════════════════
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// ════════════════════════════════════════════════════════════
// BULK IMPORT MODULE
