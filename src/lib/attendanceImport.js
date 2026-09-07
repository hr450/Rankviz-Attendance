import * as XLSX from "xlsx";

/* Attendance import — sheet parsing.
   Lifted straight out of the standalone uploader (rankviz-attendance-uploader.html)
   so the hard-won bits come across intact: the several sheet layouts HR has
   used over the years, the many spellings of the same status, the per-sheet
   late rule read out of a COUNTIF formula, and the rule that a blank weekday
   is left blank rather than guessed at as an absence.

   Nothing here touches the network or the DOM — it turns a workbook into rows,
   and rows into API payloads. The view does the rest. */

/* ---------------- STEP 2: upload + auto-detect + parse ----------------
   Works on any attendance sheet layout automatically — no manual column
   mapping screen. It scans every sheet in the workbook, normalizes each
   header cell, and matches columns using the alias list below (so
   "Employee Name", "Name", "Emp Name" etc. all resolve to the same
   field). If a workbook truly has no recognizable Name/Date columns
   anywhere, it just reports that clearly instead of asking you to map. */
const COLUMN_ALIASES = {
  name:       ['employeename','name','empname','employee'],
  empId:      ['empid','id','employeeid','zkuserid','zkid','empno','employeeno'],
  day:        ['day'],
  date:       ['date'],
  clockIn:    ['clockin','checkin','timein','intime','in'],
  clockOut:   ['clockout','checkout','timeout','outtime','out'],
  // Both wordings are in use across our sheet versions: "WFH Clock In"
  // (older) and "Clock In WFH" / "WFH ( Clock in )" (newer). normHeader
  // strips brackets and spaces, so both collapse to one of these.
  wfhIn:      ['wfhclockin','clockinwfh','wfhin','wfhcheckin','clockinwfh'],
  wfhOut:     ['wfhclockout','clockoutwfh','wfhout','wfhcheckout'],
  status:     ['status','attendancestatus','daystatus'],
  notes:      ['notes','note','remarks','comments','comment'],
  leaveType:  ['leavetype','leave'],
  shortLeave: ['shortleave','short'],
  // Newer sheets carry a per-row 0/1 "Late Arrival" column computed by
  // the sheet's own formula — when it's there, it's the truth and no
  // threshold guessing is needed.
  lateArrival:['latearrival','lateflag'],
};
/* Names that are spelled one way in the attendance sheets and another way
   in the Employees table. The employee records are the correct spelling —
   these are just the variants HR has typed into the sheets over the months,
   mapped back to the right person so their days aren't dropped.
   Left = as written in the sheet, right = as written in Employees.
   Matching ignores case, spaces and punctuation, so only real spelling
   differences need listing here.
   NOT the same person, deliberately kept apart: "Haider Ali" (content
   writer) and "Ali Haider" (manager). */
const SHEET_NAME_ALIASES = {
  'usman kayani':          'Usman kiyani',
  'zunaira ahtishan':      'Zunaira Ahtisham',
  'm wasif':               'Wasif Yaseen',
  'hussnian zaheer ahmad': 'Hussnain',
  'umar yousaf':           'Umer Yousaf',
  'ameer moavia':          'Ameer',
};

function normHeader(v){ return String(v==null?'':v).trim().toLowerCase().replace(/[^a-z0-9]/g,''); }

/* ---------- one shared status vocabulary ----------
   Our sheets have been written by different people over time, so the
   same day gets spelled several ways: "Half Day" / "HD", "Short Leave"
   / "SL", "WFH" / "W.F.H", "Extra Day" / "Alternate day". Everything is
   stripped down to letters and matched here ONCE, so every sheet format
   downstream ends up speaking the same language.
   Returns '' when the text isn't a recognised status — the caller then
   falls back to working the day out from the punch times, and Step 3
   reports anything it couldn't place instead of silently dropping it. */
const STATUS_WORDS = {
  present:     ['present','p','onsite','office'],
  late:        ['late','latearrival','latearrivals','latecoming'],
  wfh:         ['wfh','workfromhome','remote','home'],
  halfday:     ['halfday','half','hd'],
  shortleave:  ['shortleave','short','sl2'],
  leave:       ['leave','onleave','cl','sl','al','casualleave','sickleave','annualleave'],
  holiday:     ['holiday','h','publicholiday','offday','weeklyoff','off'],
  absent:      ['absent','a','noshow'],
  extraday:    ['extraday','alternateday','alternate','extra'],
  left:        ['left','resigned','terminated','exemployee'],
};
const STATUS_LOOKUP = (() => {
  const m = {};
  Object.keys(STATUS_WORDS).forEach(key => STATUS_WORDS[key].forEach(w => { if (!(w in m)) m[w] = key; }));
  return m;
})();
/* Names are typed by hand in both places, so "M.wasif", "M. Wasif" and
   "m wasif" all have to land on the same employee. Everything except
   letters is stripped before comparing. */
function nameKey(v){ return String(v==null?'':v).toLowerCase().replace(/[^a-z]/g,''); }

function normStatus(v){
  const k = String(v == null ? '' : v).trim().toLowerCase().replace(/[^a-z]/g, '');
  if (!k) return '';
  return STATUS_LOOKUP[k] || '';
}

function guessColumnMap(headerRowCells){
  const norm = (headerRowCells||[]).map(normHeader);
  const map = {};
  Object.keys(COLUMN_ALIASES).forEach(key => {
    let found = -1;
    for (const alias of COLUMN_ALIASES[key]) {
      const i = norm.indexOf(alias);
      if (i !== -1) { found = i; break; }
    }
    map[key] = found;
  });
  return map;
}

function findHeaderRow(grid, maxScan){
  const scan = Math.min(grid.length, maxScan || 40);
  for (let r = 0; r < scan; r++) {
    const norm = (grid[r]||[]).map(normHeader);
    const hasName = COLUMN_ALIASES.name.some(a => norm.includes(a));
    const hasDate = COLUMN_ALIASES.date.some(a => norm.includes(a));
    if (hasName && hasDate) return r;
  }
  return -1;
}

function buildRowsFromColumnMap(grid, headerIdx, colMap){
  const rows = [];
  const get = (row, key) => {
    const i = colMap[key];
    return (i === undefined || i === -1) ? '' : (row[i] == null ? '' : String(row[i]).trim());
  };
  for (let r = headerIdx + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.every(c => c === '' || c == null)) continue;
    const name = get(row, 'name');
    if (!name) continue;
    rows.push({
      name, empId: get(row, 'empId'),
      day: get(row, 'day'), date: get(row, 'date'),
      clockIn: get(row, 'clockIn'), clockOut: get(row, 'clockOut'),
      wfhIn: get(row, 'wfhIn'), wfhOut: get(row, 'wfhOut'),
      status: get(row, 'status'), notes: get(row, 'notes'),
      leaveType: get(row, 'leaveType'),
      shortLeave: Number(get(row, 'shortLeave') || 0) > 0,
    });
  }
  return rows;
}

/* ---------- day-sheet format: one tab per DATE ----------
   Used by the May-2026 style workbook: every sheet tab is a date
   ("01-May", "02-May", …) and each row inside is one employee for that
   day — Employee Name | Emp ID | Designation | Clock In | Clock Out |
   Clock In WFH | Clock Out WFH | Status | Notes.
   There is no Date COLUMN anywhere, which is why this shape used to be
   rejected outright: the date lives in the tab name. The tab carries no
   year either, so it's taken from the file name (e.g.
   "Rankviz_Attendance_May2026.xlsx"), falling back to the current year. */
const DAY_SHEET_MONTHS = {
  jan:0, january:0, feb:1, february:1, mar:2, march:2, apr:3, april:3,
  may:4, jun:5, june:5, jul:6, july:6, aug:7, august:7, sep:8, sept:8,
  september:8, oct:9, october:9, nov:10, november:10, dec:11, december:11,
};
function parseSheetTabDate(tabName, year){
  const t = String(tabName || '').trim();
  // "01-May", "1 May", "May-01", "01/05" — day and month in either order.
  const m = t.match(/^(\d{1,2})\s*[-_/. ]\s*([A-Za-z]+)/) || t.match(/^([A-Za-z]+)\s*[-_/. ]\s*(\d{1,2})/);
  if (!m) return null;
  const dayPart = /^\d/.test(m[1]) ? m[1] : m[2];
  const monPart = /^\d/.test(m[1]) ? m[2] : m[1];
  const mo = DAY_SHEET_MONTHS[String(monPart).toLowerCase()];
  if (mo === undefined) return null;
  const d = parseInt(dayPart, 10);
  if (!(d >= 1 && d <= 31)) return null;
  return { y: year, mo, d };
}
function findDaySheetHeaderRow(grid, maxScan){
  const scan = Math.min(grid.length, maxScan || 40);
  for (let r = 0; r < scan; r++) {
    const norm = (grid[r]||[]).map(normHeader);
    const hasName = COLUMN_ALIASES.name.some(a => norm.includes(a));
    const hasDate = COLUMN_ALIASES.date.some(a => norm.includes(a));
    const hasClock = COLUMN_ALIASES.clockIn.some(a => norm.includes(a))
                  || COLUMN_ALIASES.clockOut.some(a => norm.includes(a))
                  || COLUMN_ALIASES.status.some(a => norm.includes(a));
    // Name + punch/status columns, but NO date column — the date is the
    // tab name. (With a date column it's the ordinary "daily" format.)
    if (hasName && hasClock && !hasDate) return r;
  }
  return -1;
}
function buildRowsFromDaySheet(sheetName, grid, headerIdx, colMap, dateParts){
  const rows = [];
  const pad = n => String(n).padStart(2, '0');
  const dateStr = `${pad(dateParts.d)}-${PUNCH_MONTHS[dateParts.mo]}-${dateParts.y}`;
  const get = (row, key) => {
    const i = colMap[key];
    return (i === undefined || i === -1) ? '' : (row[i] == null ? '' : String(row[i]).trim());
  };
  for (let r = headerIdx + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.every(c => c === '' || c == null)) continue;
    const name = get(row, 'name');
    if (!name) continue;
    rows.push({
      name, empId: get(row, 'empId'),
      day: '', date: dateStr,
      clockIn: get(row, 'clockIn'), clockOut: get(row, 'clockOut'),
      wfhIn: get(row, 'wfhIn'), wfhOut: get(row, 'wfhOut'),
      status: get(row, 'status'), notes: get(row, 'notes'),
      leaveType: '',
      shortLeave: false,
      lateArrival: get(row, 'lateArrival'),
    });
  }
  return rows;
}
function buildRowsFromDaySheets(sheets){
  let all = [];
  sheets.forEach(s => { all = all.concat(buildRowsFromDaySheet(s.sheetName, s.grid, s.headerIdx, s.colMap, s.dateParts)); });
  return all;
}

function autoDetectWorkbook(wb, { fileYear } = {}){
  // Scan every sheet: prefer a "daily sheet" match (one row per employee
  // per day, explicit Clock In/Out columns). If none of the sheets look
  // like that, fall back to checking for a "punch log" — a raw
  // biometric-device export where every row is a single scan (Name +
  // Emp No. + a combined Date/Time column) and each employee/day needs
  // its scans grouped into one clock-in/clock-out row.
  for (const sheetName of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header:1, raw:false, defval:'' });
    const headerIdx = findHeaderRow(grid);
    if (headerIdx !== -1) {
      return { ok:true, type:'daily', sheetName, grid, headerIdx, colMap: guessColumnMap(grid[headerIdx]) };
    }
  }
  for (const sheetName of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header:1, raw:false, defval:'' });
    const headerIdx = findPunchLogHeaderRow(grid);
    if (headerIdx !== -1) {
      return { ok:true, type:'punch', sheetName, grid, headerIdx, colMap: guessPunchColumnMap(grid[headerIdx]) };
    }
  }
  // One tab per DATE (tab name "01-May"), employees as rows inside.
  const daySheets = [];
  for (const sheetName of wb.SheetNames) {
    const dateParts = parseSheetTabDate(sheetName, fileYear);
    if (!dateParts) continue; // e.g. a "Monthly Summary" tab
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header:1, raw:false, defval:'' });
    const headerIdx = findDaySheetHeaderRow(grid);
    if (headerIdx !== -1) {
      daySheets.push({ sheetName, grid, headerIdx, colMap: guessColumnMap(grid[headerIdx]), dateParts });
    }
  }
  if (daySheets.length) {
    return { ok:true, type:'daySheets', sheets: daySheets };
  }
  // Third fallback: one sheet per employee (sheet tab = employee name),
  // Name/Position in a header block, no per-row Name column. Every
  // matching sheet in the workbook is collected and merged — raw:true is
  // used here so date/time cells come back as Excel serial numbers,
  // which excelSerialToDateParts/TimeParts() convert reliably regardless
  // of how each sheet's cells happen to be number-formatted.
  const employeeSheets = [];
  for (const sheetName of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header:1, raw:true, defval:'' });
    const headerIdx = findEmployeeDateHeaderRow(grid);
    if (headerIdx !== -1) {
      employeeSheets.push({
        sheetName, grid, headerIdx,
        colMap: guessColumnMap(grid[headerIdx]),
        lateRule: readLateRuleFromSheet(wb.Sheets[sheetName]),
      });
    }
  }
  if (employeeSheets.length) {
    return { ok:true, type:'employeeSheets', sheets: employeeSheets };
  }
  return { ok:false };
}

/* ---------- punch-log format: one row per scan, not per day ----------
   Typical export (e.g. eTimeTrackLite / ZK "InOutData" report):
   Department | Name | No. | Date/Time | Location ID | ID Number | VerifyCode | CardNo
   Every fingerprint/card scan is its own row. We group all scans for
   the same employee + calendar day, then use the earliest scan as
   clock-in and the latest as clock-out — producing rows in exactly the
   shape buildRowsFromColumnMap() produces, so mapRows() and everything
   downstream (Step 3, 3B, 4) works completely unchanged. */
const PUNCH_ALIASES = {
  name:     ['name','employeename','employee'],
  empId:    ['no','empid','id','employeeid','zkuserid','zkid','idnumber'],
  datetime: ['datetime','timestamp','punchtime','checktime','attendancetime'],
};

function guessPunchColumnMap(headerRowCells){
  const norm = (headerRowCells||[]).map(normHeader);
  const map = {};
  Object.keys(PUNCH_ALIASES).forEach(key => {
    let found = -1;
    for (const alias of PUNCH_ALIASES[key]) {
      const i = norm.indexOf(alias);
      if (i !== -1) { found = i; break; }
    }
    map[key] = found;
  });
  return map;
}

function findPunchLogHeaderRow(grid, maxScan){
  const scan = Math.min(grid.length, maxScan || 40);
  for (let r = 0; r < scan; r++) {
    const norm = (grid[r]||[]).map(normHeader);
    const hasName = PUNCH_ALIASES.name.some(a => norm.includes(a));
    const hasDatetime = PUNCH_ALIASES.datetime.some(a => norm.includes(a));
    if (hasName && hasDatetime) return r;
  }
  return -1;
}

const PUNCH_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function parsePunchDateTime(raw){
  if (raw instanceof Date && !isNaN(raw)) {
    return { y: raw.getFullYear(), mo: raw.getMonth(), d: raw.getDate(), h: raw.getHours(), mi: raw.getMinutes() };
  }
  const str = String(raw == null ? '' : raw).trim();
  if (!str) return null;
  let m = str.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (m) {
    const mo = PUNCH_MONTHS.findIndex(x => x.toLowerCase() === m[2].toLowerCase());
    let h = parseInt(m[4],10); const ap = (m[7]||'').toUpperCase();
    if (ap === 'PM' && h !== 12) h += 12; if (ap === 'AM' && h === 12) h = 0;
    if (mo !== -1) return { y: parseInt(m[3],10), mo, d: parseInt(m[1],10), h, mi: parseInt(m[5],10) };
  }
  m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (m) {
    let h = parseInt(m[4],10); const ap = (m[7]||'').toUpperCase();
    if (ap === 'PM' && h !== 12) h += 12; if (ap === 'AM' && h === 12) h = 0;
    return { y: parseInt(m[3],10), mo: parseInt(m[1],10)-1, d: parseInt(m[2],10), h, mi: parseInt(m[5],10) };
  }
  m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (m) {
    let h = parseInt(m[4],10); const ap = (m[7]||'').toUpperCase();
    if (ap === 'PM' && h !== 12) h += 12; if (ap === 'AM' && h === 12) h = 0;
    return { y: parseInt(m[1],10), mo: parseInt(m[2],10)-1, d: parseInt(m[3],10), h, mi: parseInt(m[5],10) };
  }
  const dt = new Date(str);
  if (!isNaN(dt.getTime())) return { y: dt.getFullYear(), mo: dt.getMonth(), d: dt.getDate(), h: dt.getHours(), mi: dt.getMinutes() };
  return null;
}

function buildRowsFromPunchLog(grid, headerIdx, colMap){
  const groups = {};
  for (let r = headerIdx + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.every(c => c === '' || c == null)) continue;
    const name = colMap.name !== -1 ? String(row[colMap.name] || '').trim() : '';
    if (!name) continue;
    const empId = colMap.empId !== -1 ? String(row[colMap.empId] || '').trim() : '';
    const dt = colMap.datetime !== -1 ? parsePunchDateTime(row[colMap.datetime]) : null;
    if (!dt) continue;
    const key = (empId || name.toLowerCase()) + '|' + dt.y + '-' + dt.mo + '-' + dt.d;
    if (!groups[key]) groups[key] = { name, empId, y: dt.y, mo: dt.mo, d: dt.d, times: [] };
    groups[key].times.push({ h: dt.h, mi: dt.mi });
  }
  const pad = n => String(n).padStart(2,'0');
  const rows = [];
  Object.values(groups).forEach(g => {
    g.times.sort((a,b) => (a.h*60+a.mi) - (b.h*60+b.mi));
    const first = g.times[0], last = g.times[g.times.length-1];
    const fmtT = t => `${pad(t.h)}:${pad(t.mi)}`;
    rows.push({
      name: g.name, empId: g.empId, day: '', date: `${pad(g.d)}-${PUNCH_MONTHS[g.mo]}-${g.y}`,
      clockIn: fmtT(first), clockOut: g.times.length > 1 ? fmtT(last) : '',
      wfhIn: '', wfhOut: '', status: '', notes: '', leaveType: '', shortLeave: false,
    });
  });
  return rows;
}

/* ---------- per-employee monthly sheet format ----------
   Some exports look like this uploaded workbook: ONE SHEET PER EMPLOYEE
   (sheet tab = employee name), with a small header block at the top
   ("Name: ...", "Position: ...") and a day-by-day calendar below it —
   Day | DAYS | DATE | Clock In | Clock Out | Late hours/mints |
   [Clock In(WFH) | Clock Out(WFH) | Late hours/mints] | [Total Working
   Hours] | Status. There is no per-row Name column (the whole sheet is
   one person). The sheet DOES carry a per-row "status" column (Present /
   WFH / Short Leave / Half Day / Leave / Holiday) and that is the most
   reliable signal there is — HR fills it in by hand, and the counter
   columns further right (Late Arrival / Short Leave / Half Day / Absent
   / WFH) are just COUNTIF formulas over it. So the status column is read
   first and wins; the Clock In / Clock Out cells are only used to work
   out the day when status is blank:
     - a real time in Clock In            -> present (app infers late/etc.)
     - text in Clock In/Out with NEITHER side holding a real punch time
       (e.g. "Kashmir Day Holiday", "CL", "Alternate Kashmir day") ->
       holiday, or leave if the text says CL/SL/leave
     - text on ONE side (e.g. "no check out") while the OTHER side has a
       real punch time -> NOT a holiday; the real punch is kept and the
       text becomes a note, so the app can still infer Present/Late and
       flag the missing punch as No-checkout/No-checkin
     - both blank on a Saturday/Sunday     -> weekly off, row skipped
     - both blank on any other day         -> absent
   Every sheet in the workbook is scanned; every sheet that matches this
   shape is parsed and merged into one row set (one employee's rows per
   sheet), so a whole month's roster across many sheets is picked up in
   one go. */
/* Each per-employee sheet carries its own late rule inside the summary
   formula it uses to count late arrivals, e.g.
     =COUNTIFS(D:D, ">=10:16 AM", G:G, "<>Short Leave", ...)
   Staff work different shifts, so this cutoff differs from sheet to
   sheet (8:16, 9:16, 10:16, 11:16 …). Reading it straight out of the
   formula means the app marks exactly the same days late as the sheet
   does, without anyone having to retype anything. Returns minutes from
   midnight, or null when the sheet has no such formula. */
function readLateRuleFromSheet(ws){
  if (!ws) return null;
  for (const addr in ws) {
    if (addr[0] === '!') continue;
    const f = ws[addr] && ws[addr].f;
    if (!f || f.indexOf('COUNTIF') === -1) continue;
    const m = /"?>=\s*(\d{1,2}):(\d{2})\s*(AM|PM)?"?/i.exec(f);
    if (!m) continue;
    let h = parseInt(m[1], 10);
    const mins = parseInt(m[2], 10);
    const ap = (m[3] || '').toUpperCase();
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    // The same formula also lists the days it refuses to count, as
    // "<>Short Leave", "<>Rain delay", "<>No Late" and so on. Which ones
    // appear differs per person, so they're read from the formula too
    // rather than hard-coded.
    const exclude = [];
    const re = /"<>([^"]+)"/g;
    let x;
    while ((x = re.exec(f)) !== null) exclude.push(nameKey(x[1]));
    return { cutoffMins: h * 60 + mins, exclude };
  }
  return null;
}

function findEmployeeDateHeaderRow(grid, maxScan){
  const scan = Math.min(grid.length, maxScan || 15);
  for (let r = 0; r < scan; r++) {
    const norm = (grid[r]||[]).map(normHeader);
    const hasDate = COLUMN_ALIASES.date.some(a => norm.includes(a));
    const hasName = COLUMN_ALIASES.name.some(a => norm.includes(a));
    const hasClock = COLUMN_ALIASES.clockIn.some(a => norm.includes(a)) || COLUMN_ALIASES.clockOut.some(a => norm.includes(a));
    // Needs Date + Clock In/Out columns, but must NOT have a per-row
    // Name column — that's what distinguishes this from the "daily
    // sheet with everyone in it" format handled above.
    if (hasDate && hasClock && !hasName) return r;
  }
  return -1;
}

function extractEmployeeNameFromSheetTop(grid, headerIdx){
  const scan = Math.min(headerIdx, 10);
  for (let r = 0; r < scan; r++) {
    const row = grid[r] || [];
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (cell != null && String(cell).trim().toLowerCase() === 'name') {
        for (let c2 = c + 1; c2 < row.length; c2++) {
          const v = row[c2];
          if (v != null && String(v).trim() !== '') {
            return String(v).replace(/\s+/g, ' ').trim();
          }
        }
      }
    }
  }
  return '';
}

function excelSerialToDateParts(serial){
  const utcDays = Math.floor(serial) - 25569; // days between 1899-12-30 and 1970-01-01
  const d = new Date(utcDays * 86400000);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate() };
}
function excelSerialToTimeParts(serial){
  const frac = serial - Math.floor(serial);
  const totalMin = Math.round(frac * 24 * 60);
  return { h: Math.floor(totalMin / 60) % 24, mi: totalMin % 60 };
}
const EMP_SHEET_LEAVE_RE = /\b(cl|sl|leave)\b/i;

function buildRowsFromEmployeeSheet(sheetName, grid, headerIdx, colMap, lateRule){
  const employeeName = extractEmployeeNameFromSheetTop(grid, headerIdx) || sheetName;
  const rows = [];
  const pad = n => String(n).padStart(2, '0');
  const get = (row, key) => {
    const i = colMap[key];
    return (i === undefined || i === -1) ? undefined : row[i];
  };
  const fmtCell = (cell) => {
    if (typeof cell === 'number') { const t = excelSerialToTimeParts(cell); return `${pad(t.h)}:${pad(t.mi)}`; }
    return '';
  };
  for (let r = headerIdx + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.every(c => c === '' || c == null)) continue;
    const dateCell = get(row, 'date');
    let dp = null;
    if (typeof dateCell === 'number') {
      // Sheets carry a summary block underneath the daily rows (Present /
      // Absent / Late Arrival counts). Those counters are small numbers,
      // and read as Excel serials they come out as dates in 1900 — so
      // anything that isn't a plausible calendar date is a summary row,
      // not a day worked.
      if (dateCell < 20000) continue;
      dp = excelSerialToDateParts(dateCell);
    } else if (typeof dateCell === 'string' && dateCell.trim()) {
      // Some months are typed as text instead of real dates ("01-Jun"),
      // with no year on them — the year comes from the file name, same
      // as it does for day-per-tab workbooks.
      dp = parseSheetTabDate(dateCell.trim(), state.fileYear);
      if (!dp) continue; // a heading or summary label, not a day
    } else {
      continue; // blank or something that isn't a date at all
    }
    const weekday = new Date(dp.y, dp.mo, dp.d).getDay(); // 0=Sun..6=Sat
    const dateStr = `${pad(dp.d)}-${PUNCH_MONTHS[dp.mo]}-${dp.y}`;

    const ciCell = get(row, 'clockIn'), coCell = get(row, 'clockOut');
    const ciIsTime = typeof ciCell === 'number';
    const coIsTime = typeof coCell === 'number';
    const ciIsText = typeof ciCell === 'string' && ciCell.trim() !== '';
    const coIsText = typeof coCell === 'string' && coCell.trim() !== '';
    const ciEmpty = ciCell == null || ciCell === '';
    const coEmpty = coCell == null || coCell === '';

    let status = '', notes = '', leaveType = '';
    let shortLeave = false;
    let clockIn = fmtCell(ciCell), clockOut = fmtCell(coCell);
    const wfhIn = fmtCell(get(row, 'wfhIn')), wfhOut = fmtCell(get(row, 'wfhOut'));

    // HR's own per-day status column, e.g. "Present", "WFH", "Short
    // Leave", "Half Day", "Leave", "Holiday". This is hand-maintained
    // and is what the sheet's own summary counters are built from, so
    // it's trusted over anything inferred from the punch times.
    const statusCell = get(row, 'status');
    const sheetStatus = String(statusCell == null ? '' : statusCell).trim();
    const sKey = normStatus(sheetStatus);
    const noteCell = get(row, 'notes');
    const noteText = String(noteCell == null ? '' : noteCell).trim();

    if (sheetStatus) {
      // Pass the sheet's own wording straight through — including wording
      // we don't recognise, so mapRows() can flag it and leave that day
      // alone instead of silently treating it as an ordinary one.
      status = sheetStatus;
      if (sKey === 'shortleave') shortLeave = true;
      if (sKey === 'leave') {
        // Which kind of leave (SL / CL) is written either in Notes or,
        // on the older sheets that have no Notes column, in the Clock In
        // cell itself. The "Leave Type" column is a 0/1 counter, not
        // text, so it is never used here.
        const inlineText = ciIsText ? String(ciCell).trim() : (coIsText ? String(coCell).trim() : '');
        leaveType = noteText || inlineText || 'Leave';
      }
    }
    if (noteText) notes = noteText;

    if (!status && !ciIsTime && !coIsTime && (ciIsText || coIsText)) {
      // Neither side has a real punch time, so this text describes the
      // WHOLE day (e.g. "Independence Day", "CL") — a genuine
      // holiday/leave declaration.
      const txt = String(ciIsText ? ciCell : coCell).trim();
      notes = txt;
      if (EMP_SHEET_LEAVE_RE.test(txt)) { status = 'leave'; leaveType = txt; }
      else { status = 'holiday'; }
    } else if (ciIsTime || coIsTime) {
      // At least one side has a genuine punch time. Text on the OTHER
      // side (e.g. "no check out", "no check in") is a missing-punch
      // NOTE, not a holiday/leave declaration for the whole day — it
      // must never wipe the real punch time or force Holiday.
      //
      // This was the bug: a real check-in like 8:21am with "no check
      // out" in the Clock Out cell was being read as "text present",
      // which discarded the 8:21am check-in and turned the whole day
      // into Holiday. clockIn/clockOut above already come from fmtCell()
      // (which only returns a value for real time cells), so the real
      // punch is preserved automatically — we just leave status '' here
      // so the app's own Present/Late/No-checkout/No-checkin logic takes
      // over from whichever punch time is actually real.
      const noteBits = [];
      if (ciIsText) noteBits.push(String(ciCell).trim());
      if (coIsText) noteBits.push(String(coCell).trim());
      if (noteBits.length) notes = notes ? (notes + ' | ' + noteBits.join(' | ')) : noteBits.join(' | ');
    } else if (ciEmpty && coEmpty) {
      // A blank weekend row is the weekly off day — skip it, unless HR
      // marked something other than Holiday against it. A blank weekday
      // with no status of its own is a genuine absence, but a status
      // HR already wrote (Leave, Half Day, WFH…) must never be
      // overwritten with "absent".
      if ((weekday === 0 || weekday === 6) && (!status || status === 'holiday')) continue;
      if (!status) status = 'absent';
    }
    // else: real clock in/out times — leave status '' so the app infers
    // Present / Late / No-checkout itself.

    rows.push({
      name: employeeName, empId: '',
      day: '', date: dateStr,
      clockIn, clockOut, wfhIn, wfhOut,
      status, notes, leaveType, shortLeave,
      lateArrival: get(row, 'lateArrival'),
      lateRule: lateRule || null,
    });
  }
  return rows;
}

function buildRowsFromEmployeeSheets(sheets){
  let all = [];
  sheets.forEach(s => { all = all.concat(buildRowsFromEmployeeSheet(s.sheetName, s.grid, s.headerIdx, s.colMap, s.lateRule)); });
  return all;
}
/* ---------------- mapping: excel row -> API payload ---------------- */
const MONTHS = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
function parseDate(str){
  // expects dd-mmm-yyyy e.g. 01-Jul-2026
  const m = str.match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})/);
  if (!m) return null;
  const mon = MONTHS[m[2].toLowerCase()];
  if (mon === undefined) return null;
  return { y: parseInt(m[3],10), mo: mon, d: parseInt(m[1],10) };
}
function parseTime(str){
  if (!str || /no check/i.test(str)) return null;
  const m = str.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!m) return null;
  let h = parseInt(m[1],10); const mi = parseInt(m[2],10); const ap = (m[3]||'').toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return { h, mi };
}
function isoLocal(dateParts, timeParts){
  if (!dateParts || !timeParts) return null;
  const pad = n => String(n).padStart(2,'0');
  return `${dateParts.y}-${pad(dateParts.mo+1)}-${pad(dateParts.d)}T${pad(timeParts.h)}:${pad(timeParts.mi)}:00+05:00`;
}
function isoDateStr(dateParts){
  const pad = n => String(n).padStart(2,'0');
  return `${dateParts.y}-${pad(dateParts.mo+1)}-${pad(dateParts.d)}`;
}

/* rows -> API payloads.
   ctx carries what used to live on the standalone page's `state`:
     zkMap        device id  -> employee id
     nameMap      lower name -> employee id
     nameKeyMap   letters-only name -> employee id (or '__AMBIGUOUS__')
     lateAfter    optional "HH:MM" override for the late cutoff
     fileYear     year the workbook belongs to */
function mapRows(rows, state){
  const today = new Date();
  // If this workbook writes "Late Arrival" into the Status column, then
  // the sheet is deciding lateness itself — and a blank status on a day
  // with a punch means Present, not "work it out from the shift". Without
  // this, the app would re-derive late from its own shift/grace and
  // disagree with the sheet on employees whose shift differs.
  const sheetMarksLate = rows.some(r => normStatus(r.status) === 'late');
  return rows.map(row => {
    const dateParts = parseDate(row.date);
    const out = { ...row, skip:false, skipReason:'', payload:null, employeeId:null, matchType:null };
    if (!dateParts) { out.skip = true; out.skipReason = 'Unparseable date'; return out; }
    if (dateParts.y < 2000) { out.skip = true; out.skipReason = 'Not a real date (summary row)'; return out; }
    const rowDate = new Date(dateParts.y, dateParts.mo, dateParts.d);
    if (rowDate > today) { out.skip = true; out.skipReason = 'Future date'; return out; }

    const status = row.status.toLowerCase();
    const hasAnyData = row.clockIn || row.clockOut || row.wfhIn || row.wfhOut || status || row.notes;
    if (!hasAnyData) { out.skip = true; out.skipReason = 'No data for this day'; return out; }

    // employee match: Emp ID -> zkUserId, fallback to name
    let employeeId = null, matchType = null;
    if (row.empId && state.zkMap[row.empId] !== undefined) { employeeId = state.zkMap[row.empId]; matchType = 'zkUserId'; }
    else if (state.nameMap[row.name.toLowerCase()] !== undefined) { employeeId = state.nameMap[row.name.toLowerCase()]; matchType = 'name'; }
    else {
      // Same name, different punctuation/case ("M.wasif" vs "M. Wasif").
      const k = nameKey(row.name);
      const hit = k ? state.nameKeyMap[k] : undefined;
      if (hit !== undefined && hit !== '__AMBIGUOUS__') { employeeId = hit; matchType = 'name'; }
      else if (k) {
        // Sheet has a shorter or longer version of the same name
        // ("Ali Shafqat" vs "Muhammad Ali Shafqat"). Only accept it when
        // exactly ONE employee could be meant — never guess between two.
        const cands = Object.keys(state.nameKeyMap).filter(ek =>
          state.nameKeyMap[ek] !== '__AMBIGUOUS__' && ek.length >= 6 && k.length >= 6 &&
          (ek.indexOf(k) !== -1 || k.indexOf(ek) !== -1));
        const ids = [...new Set(cands.map(ek => state.nameKeyMap[ek]))];
        if (ids.length === 1) { employeeId = ids[0]; matchType = 'name~'; }
      }
    }
    out.employeeId = employeeId; out.matchType = matchType;
    if (!employeeId) { out.skip = true; out.skipReason = 'No matching employee (check Emp ID / zkUserId)'; return out; }

    const clockIn = parseTime(row.clockIn), clockOut = parseTime(row.clockOut);
    const wfhIn = parseTime(row.wfhIn), wfhOut = parseTime(row.wfhOut);

    const rec = {
      checkIn: isoLocal(dateParts, clockIn),
      checkOut: isoLocal(dateParts, clockOut),
      wfhCheckIn: isoLocal(dateParts, wfhIn),
      wfhCheckOut: isoLocal(dateParts, wfhOut),
      type: 'office',
      manualStatus: '',
      leaveReason: null,
      notes: row.notes || null,
      alternateDay: false,
    };

    // One shared vocabulary for every sheet version — see normStatus().
    const statusKey = normStatus(row.status);
    if (statusKey === 'left') {
      // "left" marks someone who has since resigned; the row is a
      // placeholder, not a day worked.
      out.skip = true; out.skipReason = 'Marked "left" (ex-employee)'; return out;
    }
    if (statusKey === 'leave') {
      rec.type = 'leave';
      rec.leaveReason = row.leaveType || row.notes || 'Leave';
    } else if (statusKey === 'holiday') {
      rec.manualStatus = 'holiday';
    } else if (statusKey === 'halfday') {
      rec.manualStatus = 'half';
    } else if (statusKey === 'shortleave') {
      rec.manualStatus = 'short_leave';
    } else if (statusKey === 'absent') {
      rec.manualStatus = 'absent';
    } else if (statusKey === 'wfh') {
      rec.manualStatus = 'wfh';
    } else if (statusKey === 'extraday') {
      rec.manualStatus = 'extra_day';
    } else if (statusKey === 'late') {
      rec.manualStatus = 'late';
    }
    // "present" (or blank with punches) -> leave manualStatus '' so the app
    // computes Present / Late / No-checkout itself from checkIn/checkOut.

    // Flag anything written in the Status cell that we couldn't place, so
    // it shows up in the preview instead of quietly importing as Present.
    if (String(row.status || '').trim() && !statusKey) {
      out.unknownStatus = String(row.status).trim();
    }

    // Put the leave type (CL / SL / AL) into Notes as well when the sheet
    // didn't write one there itself. The Monthly Report shows Notes but
    // not the leave reason, so without this a leave day reads as a bare
    // "Leave" on screen even though the type is stored.
    if (rec.type === 'leave' && !rec.notes && rec.leaveReason && rec.leaveReason !== 'Leave') {
      rec.notes = rec.leaveReason;
    }

    // The "My summary" / Monthly Report tallies count short leave by
    // reading Notes, not the status field, so a short-leave day imported
    // with an empty Notes cell shows on the day list but never reaches
    // the counter. Writing it here keeps the two in agreement.
    if (rec.manualStatus === 'short_leave' && !rec.notes) {
      rec.notes = 'Short Leave';
    }
    // Same story for extra/alternate days: those counters read the
    // alternateDay flag rather than the status.
    if (rec.manualStatus === 'extra_day') {
      rec.alternateDay = true;
    }

    if (row.shortLeave && !rec.manualStatus && rec.type !== 'leave') {
      rec.manualStatus = 'short_leave';
    }

    // Late/Present decided here rather than by the app, so the numbers
    // match the sheet exactly. A per-row "Late Arrival" column (newer
    // sheets) wins; otherwise the cutoff typed in Step 3 is used.
    // Only ordinary working days are touched — never Leave, Half Day,
    // Short Leave, Holiday, Absent or WFH.
    if (!rec.manualStatus && rec.type !== 'leave' && rec.checkIn) {
      const flag = String(row.lateArrival == null ? '' : row.lateArrival).trim();
      if (flag === '1' || flag.toLowerCase() === 'yes' || flag.toLowerCase() === 'true') {
        rec.manualStatus = 'late';
      } else if (flag === '0') {
        rec.manualStatus = 'present';
      } else if (row.lateRule) {
        // This employee's own rule, lifted from their sheet: their cutoff
        // and the statuses their formula refuses to count.
        const st = nameKey(row.status);
        if (st && row.lateRule.exclude.indexOf(st) !== -1) {
          rec.manualStatus = 'present';
        } else {
          const t = String(rec.checkIn).slice(11,16).split(':');
          const inMins = parseInt(t[0],10) * 60 + parseInt(t[1],10);
          rec.manualStatus = inMins >= row.lateRule.cutoffMins ? 'late' : 'present';
        }
      } else if (sheetMarksLate) {
        rec.manualStatus = 'present';
      } else if (state.lateAfter) {
        const cut = String(state.lateAfter).match(/^(\d{1,2}):(\d{2})$/);
        if (cut) {
          const cutMins = parseInt(cut[1],10) * 60 + parseInt(cut[2],10);
          const t = String(rec.checkIn).slice(11,16).split(':');
          const inMins = parseInt(t[0],10) * 60 + parseInt(t[1],10);
          rec.manualStatus = inMins > cutMins ? 'late' : 'present';
        }
      }
    }

    out.payload = { employeeId, date: isoDateStr(dateParts), rec, source: 'excel-import' };
    return out;
  });
}


/* One call that does the whole job: work out the layout, build the rows,
   map them to API payloads, and report what couldn't be matched.
   The standalone page did these four steps inline in its UI code; pulling
   them together here means the view has nothing to get wrong. */
export function parseWorkbook(wb, ctx = {}) {
  const fileYear = ctx.fileYear || new Date().getFullYear();
  const detected = autoDetectWorkbook(wb, { fileYear });
  if (!detected || !detected.ok) {
    return { ok: false, error: "Couldn't find a recognisable Employee Name + Date header (or a Name + Date/Time punch log) on any sheet in this file." };
  }

  let rows;
  if (detected.type === 'punch') {
    rows = buildRowsFromPunchLog(detected.grid, detected.headerIdx, detected.colMap);
  } else if (detected.type === 'daySheets') {
    rows = buildRowsFromDaySheets(detected.sheets);
  } else if (detected.type === 'employeeSheets') {
    rows = buildRowsFromEmployeeSheets(detected.sheets);
  } else {
    rows = buildRowsFromColumnMap(detected.grid, detected.headerIdx, detected.colMap);
  }
  if (!rows.length) {
    return { ok: false, error: "Found the headers, but no usable data rows underneath them." };
  }

  const mapped = mapRows(rows, { ...ctx, fileYear });

  // A row whose name matched nobody is skipped rather than guessed at —
  // writing someone's day onto the wrong employee is worse than not
  // writing it, and the view lists the names so they can be fixed.
  const payloads = [];
  const unmatchedSet = new Set();
  for (const m of mapped) {
    if (m.payload && m.payload.employeeId) payloads.push({ ...m.payload, name: m.name });
    else if (m.name) unmatchedSet.add(m.name);
  }

  const unknownStatuses = [...new Set(mapped.filter(m => m.unknownStatus).map(m => m.unknownStatus))];

  return {
    ok: true,
    format: detected.type,
    sheetCount: detected.sheets ? detected.sheets.length : 1,
    rows,
    payloads,
    unmatched: [...unmatchedSet],
    unknownStatuses,
  };
}

export {
  autoDetectWorkbook,
  mapRows,
  normStatus,
  nameKey,
  STATUS_WORDS,
  SHEET_NAME_ALIASES,
};
