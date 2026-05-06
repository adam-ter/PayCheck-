import { 
  STORAGE_KEYS, 
  saveData, 
  getOngoingShift, 
  setOngoingShift, 
  clearOngoingShift, 
  loadData, 
  normalizeJob, 
  normalizeShift 
} from './storage.js';

import { calculateJobTotals, calculateShiftGross } from './tax-calculations.js';

import { 
  filterCurrentMonthShifts,
  calculateWeeklySummary,
  calculateMonthlyStats 
} from './analytics.js';

import {
  $,
  escapeHtml,
  formatMoney,
  formatNumber,
  pad2,
  toDateInputValue,
  toTimeInputValue,
  openModal,
  closeModals,
  showModalContent,
  navTo,
  showTrackerTab,
  renderJobsList,
  renderJobHistory,
  updateStats,
  resetTrackerStats,
  clearJobTrackerView,
  updateMonthlyGoalCard,
  resetTimerView,
  updateTimerDisplay,
  setMainButton,
  animateLiveShiftCard,
  showSessionSummary,
  updateAnalyticsDashboard,
  updateWeeklyDashboard,
  fillJobForm,
  fillShiftForm,
  triggerHaptic,
  showDetailedNetAnalysis
} from './ui-renderer.js';

// Constants
const DEFAULTS = {
  travel: 22.60,
  pension: 6.0,
  shiftStart: '09:00',
  shiftEnd: '17:00'
};

// Application state
const state = {
  jobs: [],
  shifts: [],
  currentJobId: null,
  currentTab: 'today',
  timerInterval: null,
  pendingJob: null,
  editingJobId: null,
  editingShiftId: null
};

// Global property for backward compatibility with HTML onclick handlers
Object.defineProperty(window, 'currentJobId', {
  get() { return state.currentJobId; },
  set(value) { state.currentJobId = value ? String(value) : null; }
});

// ==================== Data Management ====================
function loadApplicationData() {
  const { jobs, shifts } = loadData();
  state.jobs = jobs;
  state.shifts = shifts;
}

function getJob(id) {
  return state.jobs.find(j => j.id === String(id));
}

function getJobShifts(id) {
  return state.shifts.filter(s => s.jobId === String(id));
}

function getShift(id) {
  return state.shifts.find(s => s.id === String(id));
}

// ==================== Job Management ====================
function openJobEditor(jobId) {
  state.editingJobId = jobId ? String(jobId) : null;
  const job = state.editingJobId ? getJob(state.editingJobId) : null;

  if (state.editingJobId && !job) {
    return alert('לא נמצאה עבודה לעריכה');
  }

  $('jobModalTitle').textContent = job ? 'עריכת הגדרות עבודה' : 'פרופיל עבודה חדש';
  fillJobForm(job, DEFAULTS);
  $('deleteJobBtn').classList.toggle('hidden', !job);
  togglePensionUI();
  openModal('jobModal');
}

function togglePensionUI() {
  const group = $('jPenGroup');
  const checkbox = $('jPenExist');
  group.style.display = checkbox.checked ? 'flex' : 'none';
}

function toggleTaxProfile() {
  const section = $('taxProfileSection');
  const button = $('taxProfileToggle');
  const isHidden = section.classList.contains('hidden');

  section.classList.toggle('hidden');
  button.textContent = isHidden ? 'סגור ▲' : 'פתח ▼';
}

function readJobForm() {
  const hasPension = $('jPenExist').checked;

  return {
    id: state.editingJobId || createId(),
    name: $('jName').value.trim(),
    rate: Number($('jRate').value),
    travel: toSafeNumber($('jTravel').value, 0),
    monthlyGoal: Math.max(0, toSafeNumber($('jMonthlyGoal').value, 0)),
    goalName: $('jGoalName').value.trim(),
    pension: hasPension ? toSafeNumber($('jPenRate').value, 0) : 0,
    isSingle: $('jSingle').checked,
    taxCoordinationRate: clamp(toSafeNumber($('jTaxCoordinationRate').value, 0), 0, 50),
    manualCreditPoints: $('jCreditPoints').value === '' 
      ? null 
      : clamp(toSafeNumber($('jCreditPoints').value, 0), 0, 20),
    tax: {
      gender: $('jGender').value === 'female' ? 'female' : 'male',
      resident: $('jResident').checked,
      soldier: $('jSoldier').checked
    }
  };
}

function validateJob(job) {
  if (!job.name) return 'הכנס שם עסק';
  if (!Number.isFinite(job.rate) || job.rate <= 0) return 'הכנס שכר שעתי תקין';
  if (!Number.isFinite(job.travel) || job.travel < 0) return 'נסיעות לא יכולות להיות מספר שלילי';
  if (!Number.isFinite(job.monthlyGoal) || job.monthlyGoal < 0) return 'יעד חודשי לא יכול להיות מספר שלילי';
  if (!Number.isFinite(job.pension) || job.pension < 0 || job.pension > 100) return 'אחוז פנסיה לא תקין';
  if (!Number.isFinite(job.taxCoordinationRate) || job.taxCoordinationRate < 0 || job.taxCoordinationRate > 50) return 'אחוז תיאום מס לא תקין';
  if (job.manualCreditPoints !== null && (!Number.isFinite(job.manualCreditPoints) || job.manualCreditPoints < 0 || job.manualCreditPoints > 20)) return 'נקודות זיכוי לא תקינות';
  
  return null;
}

function getJobWarnings(job) {
  const warnings = [];
  const monthlyGross = Number(job.rate || 0) * 160;

  if (job.pension === 0) {
    const employerMatch = Math.round(monthlyGross * 0.065);
    const lostPerYear = employerMatch * 12;
    warnings.push({
      icon: '🏦',
      severity: 'high',
      title: 'אין הפרשה לפנסיה — זה עולה לך כסף',
      body: `כשעובד ללא פנסיה, המעסיק <strong>לא חייב</strong> להפריש עבורך לקרן. זה אומר שאתה מפסיד בסביבות <strong>${formatMoney(employerMatch)} לחודש</strong> (${formatMoney(lostPerYear)} לשנה!) שהמעסיק היה צריך להוסיף לחסכון שלך — כסף שהוא שלך לגמרי.`,
      actions: [
        '📞 פנה למעסיק ובקש להצטרף לקרן פנסיה — זכותך החוקית לאחר 6 חודשי עבודה (ולפעמים מיד)',
        '🏢 אפשר לפנות לסוכן ביטוח, לבנק, או לכל חברת ביטוח כדי לפתוח קרן',
        '💡 אחוז ההפרשה המינימלי שמקובל: 6% עובד + 6.5% מעסיק'
      ],
      note: 'החוק מחייב מעסיק להפריש לפנסיה. אם אינו עושה זאת — ניתן לתבוע.'
    });
  }

  if (!job.isSingle) {
    const taxOverpay = Math.round(monthlyGross * 0.20);
    warnings.push({
      icon: '📋',
      severity: 'medium',
      title: 'עבודה שנייה בלי תיאום מס — אתה כנראה מוציא יותר ממה שצריך',
      body: `כברירת מחדל, מעסיק שני מנכה ממך מס בשיעור <strong>47%</strong> — שיעור המס הגבוה ביותר — בלי קשר לגובה ההכנסה. בלי תיאום מס, אתה עלול לשלם <strong>יותר מדי</strong> לאורך השנה. זה יכול להסתכם ב-<strong>${formatMoney(taxOverpay)}+ בחודש</strong> שנמסרים למס הכנסה בלי צורך.`,
      actions: [
        '🌐 ניתן לבצע תיאום מס <strong>אונליין בחינם</strong> באתר רשות המסים (לחפש "בקשה לתיאום מס")',
        '🏛️ לחלופין — ניתן לגשת פיזית לפקיד שומה הקרוב לביתך',
        '📅 כדאי לעשות זאת בתחילת שנת המס — ינואר/פברואר'
      ],
      note: 'גם אם שילמת יותר מדי — ניתן לקבל החזר מס בדיווח שנתי.'
    });
  }

  return warnings;
}

function showWarningsBeforeSave(warnings, askForRetro) {
  const cards = warnings.map(warning => {
    const borderColor = warning.severity === 'high' ? 'border-red-200' : 'border-amber-200';
    const bgColor = warning.severity === 'high' ? 'from-red-50 to-orange-50' : 'from-amber-50 to-yellow-50';
    const titleColor = warning.severity === 'high' ? 'text-red-800' : 'text-amber-800';
    const noteColor = warning.severity === 'high' ? 'text-red-600' : 'text-amber-600';
    const actions = warning.actions.map(action => 
      `<li class="flex gap-2 text-slate-600 leading-relaxed"><span class="mt-0.5 flex-shrink-0">•</span><span>${action}</span></li>`
    ).join('');

    return `
      <div class="bg-gradient-to-br ${bgColor} border ${borderColor} rounded-2xl p-5 mb-4">
        <div class="flex items-center gap-3 mb-3">
          <span class="text-3xl">${warning.icon}</span>
          <h4 class="font-black ${titleColor} text-base leading-tight">${warning.title}</h4>
        </div>
        <p class="text-sm text-slate-700 leading-relaxed mb-3 font-semibold">${warning.body}</p>
        <div class="bg-white/70 rounded-xl p-3 mb-3">
          <p class="text-[11px] font-black text-slate-500 mb-2 uppercase tracking-wide">מה כדאי לעשות?</p>
          <ul class="space-y-1.5 text-[12px] font-semibold">${actions}</ul>
        </div>
        <p class="text-[11px] font-bold ${noteColor} leading-relaxed">💡 ${warning.note}</p>
      </div>
    `;
  }).join('');

  showModalContent(`
    <div class="text-center mb-5">
      <div class="w-14 h-14 bg-gradient-to-br from-teal-500 to-teal-700 rounded-2xl flex items-center justify-center mx-auto mb-3 text-2xl">🤝</div>
      <h3 class="text-xl font-black brand-text">רגע לפני שמוסיפים</h3>
      <p class="text-xs text-slate-400 font-bold mt-1">PayCheck רוצה שתדע — כי זה הכסף שלך</p>
    </div>
    ${cards}
    <button type="button" onclick="paycheck_continueJobSaveAfterWarnings(${askForRetro})" class="w-full mt-2 py-4 btn-primary">הבנתי, שמור בכל מקרה ✅</button>
    <p class="text-center text-[10px] text-slate-400 font-bold mt-3">אפשר לעדכן את ההגדרות בכל עת מ"ערוך עבודה"</p>
  `);
}

function saveJobProcess() {
  const job = readJobForm();
  const error = validateJob(job);

  if (error) {
    return alert(error);
  }

  state.pendingJob = job;

  const isExisting = isExistingJob(job.id);
  const hasShifts = getJobShifts(job.id).length > 0;
  const askForRetro = isExisting && hasShifts;
  const warnings = getJobWarnings(job);

  if (warnings.length) {
    return showWarningsBeforeSave(warnings, askForRetro);
  }

  if (askForRetro) {
    openModal('retroModal');
  } else {
    finalizeJobSave(true);
  }
}

function continueJobSaveAfterWarnings(askForRetro) {
  closeModals();
  if (askForRetro) {
    openModal('retroModal');
  } else {
    finalizeJobSave(true);
  }
}

function finalizeJobSave(retro) {
  if (!state.pendingJob) return;

  const existingIndex = state.jobs.findIndex(j => j.id === state.pendingJob.id);

  if (existingIndex > -1) {
    updateExistingJob(existingIndex, retro);
  } else {
    state.jobs.push(state.pendingJob);
  }

  const savedJobId = state.pendingJob.id;
  state.pendingJob = null;
  state.editingJobId = null;

  saveData(state.jobs, state.shifts);
  closeModals();

  refreshJobsList();

  if (state.currentJobId === savedJobId) {
    renderJobHistory(state.jobs, state.shifts, savedJobId, openShiftEditor);
    updateJobTrackerView();
  }

  navTo(state.currentJobId ? 'pageTracker' : 'pageHome');
}

function isExistingJob(jobId) {
  return state.jobs.some(j => j.id === String(jobId));
}

function updateExistingJob(jobIndex, retro) {
  const oldJob = state.jobs[jobIndex];
  const jobId = state.pendingJob.id;

  state.shifts.forEach(shift => {
    if (shift.jobId !== jobId) return;

    if (retro) {
      unlockShiftPaySettings(shift);
    } else if (shift.fixedRate === undefined) {
      lockShiftPaySettings(shift, oldJob);
    }
  });

  state.jobs[jobIndex] = state.pendingJob;
}

function lockShiftPaySettings(shift, job) {
  shift.fixedRate = job.rate;
  shift.fixedTravel = job.travel;
  shift.fixedPension = job.pension;
}

function unlockShiftPaySettings(shift) {
  delete shift.fixedRate;
  delete shift.fixedTravel;
  delete shift.fixedPension;
}

function deleteCurrentJob() {
  if (!state.editingJobId) return;

  const job = getJob(state.editingJobId);
  if (!job) return;

  const ongoing = getOngoingShift();
  if (ongoing?.jobId === state.editingJobId) {
    return alert('אי אפשר למחוק מקום עבודה בזמן שיש בו משמרת פעילה.');
  }

  const count = getJobShifts(state.editingJobId).length;
  if (!confirm(`למחוק את "${job.name}"?\nפעולה זו תמחק גם ${count} משמרות.`)) return;

  const idToDelete = state.editingJobId;
  state.jobs = state.jobs.filter(j => j.id !== idToDelete);
  state.shifts = state.shifts.filter(s => s.jobId !== idToDelete);

  state.editingJobId = null;
  state.pendingJob = null;

  saveData(state.jobs, state.shifts);
  closeModals();

  refreshJobsList();

  if (state.currentJobId === idToDelete) {
    state.currentJobId = null;
    navTo('pageHome');
  }
}

function refreshJobsList() {
  renderJobsList(state.jobs, state.shifts, openJobTracker);
}

function openJobTracker(jobId) {
  if (!getJob(jobId)) {
    return alert('מקום העבודה לא נמצא');
  }

  state.currentJobId = String(jobId);
  navTo('pageTracker');
  showTrackerTab('today');
  renderJobHistory(state.jobs, state.shifts, state.currentJobId, openShiftEditor);
  updateJobTrackerView();
  checkOngoing();
}

// ==================== Shift Management ====================
function openShiftEditor(shiftId) {
  if (!state.currentJobId || !getJob(state.currentJobId)) {
    return alert('בחר מקום עבודה קודם');
  }

  state.editingShiftId = shiftId ? String(shiftId) : null;
  const shift = state.editingShiftId ? getShift(state.editingShiftId) : null;

  if (state.editingShiftId && !shift) {
    return alert('לא נמצאה משמרת לעריכה');
  }

  if (shift && shift.jobId !== state.currentJobId) {
    return alert('המשמרת הזו לא שייכת למקום העבודה הנוכחי');
  }

  $('shiftModalTitle').textContent = shift ? 'עריכת משמרת' : 'הוספת משמרת בדיעבד';
  $('deleteShiftBtn').classList.toggle('hidden', !shift);
  fillShiftForm(shift, new Date());
  openModal('shiftModal');
}

function readShiftFormTimes() {
  const dateStr = $('sDate').value;
  const startTimeStr = $('sStart').value;
  const endTimeStr = $('sEnd').value;

  if (!dateStr || !startTimeStr || !endTimeStr) {
    alert('מלא תאריך, שעת התחלה ושעת סיום');
    return null;
  }

  const start = new Date(`${dateStr}T${startTimeStr}:00`);
  const end = getShiftEndDate(dateStr, startTimeStr, endTimeStr);
  const hours = (end - start) / 3600000;

  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || !Number.isFinite(hours) || hours <= 0 || hours > 24) {
    alert('משך משמרת לא תקין');
    return null;
  }

  return { start, end, hours };
}

function getShiftEndDate(dateStr, startTimeStr, endTimeStr) {
  const start = new Date(`${dateStr}T${startTimeStr}:00`);
  const end = new Date(`${dateStr}T${endTimeStr}:00`);

  if (end <= start) {
    end.setDate(end.getDate() + 1);
  }

  return end;
}

function saveShiftProcess() {
  const times = readShiftFormTimes();
  if (!times) return;

  if (state.editingShiftId) {
    if (!updateShift(state.editingShiftId, times.start, times.end, times.hours)) return;
  } else {
    addShift(times.start, times.end, times.hours);
  }

  state.editingShiftId = null;
  saveData(state.jobs, state.shifts);
  closeModals();
  refreshUI();
}

function addShift(start, end, hours) {
  state.shifts.push({
    id: createId(),
    jobId: state.currentJobId,
    start: start.getTime(),
    end: end.getTime(),
    hours
  });
}

function updateShift(shiftId, start, end, hours) {
  const index = state.shifts.findIndex(s => s.id === String(shiftId));
  if (index === -1) {
    return alert('לא נמצאה משמרת לעריכה'), false;
  }

  if (state.shifts[index].jobId !== state.currentJobId) {
    return alert('לא ניתן לערוך משמרת שלא שייכת למקום העבודה הנוכחי'), false;
  }

  state.shifts[index] = {
    ...state.shifts[index],
    start: start.getTime(),
    end: end.getTime(),
    hours
  };

  return true;
}

function deleteEditingShift() {
  if (!state.editingShiftId) return;

  const shift = getShift(state.editingShiftId);
  if (!shift || shift.jobId !== state.currentJobId) {
    return alert('לא ניתן למחוק משמרת שלא שייכת למקום העבודה הנוכחי');
  }

  if (!confirm('למחוק את המשמרת הזו?')) return;

  state.shifts = state.shifts.filter(s => s.id !== state.editingShiftId);
  state.editingShiftId = null;
  saveData(state.jobs, state.shifts);
  closeModals();
  refreshUI();
}

// ==================== Timer and Shift Tracking ====================
function checkOngoing() {
  const ongoing = getOngoingShift();
  stopTimer();

  if (ongoing && state.currentJobId && ongoing.jobId === state.currentJobId) {
    const job = getJob(state.currentJobId);
    setMainButton('סיים משמרת', 'w-full mt-6 py-5 rounded-2xl text-white font-black text-xl bg-red-500 shadow-xl transition-all');
    $('liveGrossBox').classList.remove('hidden');
    animateLiveShiftCard(true);
    updateTimerDisplay(ongoing.start, job);
    state.timerInterval = setInterval(() => {
      updateTimerDisplay(ongoing.start, job);
    }, 1000);
    return;
  }

  if (ongoing && state.currentJobId && ongoing.jobId !== state.currentJobId) {
    setMainButton('משמרת פעילה בעבודה אחרת', 'w-full mt-6 py-5 rounded-2xl text-white font-black text-lg bg-slate-400 shadow-xl transition-all');
    resetTimerView();
    return;
  }

  const btnClass = state.currentJobId 
    ? 'w-full mt-6 py-5 rounded-2xl text-white font-black text-xl btn-primary shadow-xl transition-all'
    : 'w-full mt-6 py-5 rounded-2xl text-white font-black text-xl bg-slate-400 shadow-xl transition-all';

  setMainButton(state.currentJobId ? 'התחל משמרת' : 'בחר עבודה', btnClass);
  resetTimerView();
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
  }
  state.timerInterval = null;
}

function handleMainButtonClick() {
  const ongoing = getOngoingShift();

  if (ongoing?.jobId && !getJob(ongoing.jobId)) {
    clearOngoingShift();
    refreshUI();
    return alert('המשמרת הפעילה הייתה שייכת למקום עבודה שנמחק ולכן אופסה.');
  }

  if (!state.currentJobId && ongoing?.jobId) {
    state.currentJobId = ongoing.jobId;
  }

  if (!state.currentJobId || !getJob(state.currentJobId)) {
    return alert('בחר מקום עבודה קודם');
  }

  if (!ongoing) {
    return startShiftTimer();
  }

  if (ongoing.jobId !== state.currentJobId) {
    state.currentJobId = ongoing.jobId;
    navTo('pageTracker');
    showTrackerTab('today');
    renderJobHistory(state.jobs, state.shifts, state.currentJobId, openShiftEditor);
    updateJobTrackerView();
    checkOngoing();
    return alert('עברת למשמרת הפעילה. לחץ שוב כדי לסיים אותה.');
  }

  finishShiftTimer(ongoing);
}

function startShiftTimer() {
  if (!getJob(state.currentJobId)) {
    return alert('בחר מקום עבודה תקין לפני התחלת משמרת');
  }

  if (getOngoingShift()) {
    return checkOngoing();
  }

  setOngoingShift({
    start: Date.now(),
    jobId: state.currentJobId
  });

  triggerHaptic();
  checkOngoing();
}

function finishShiftTimer(ongoing) {
  if (!ongoing || !ongoing.jobId) return;

  const job = getJob(ongoing.jobId);
  if (!job) {
    clearOngoingShift();
    refreshUI();
    return;
  }

  const now = Date.now();
  const duration = now - Number(ongoing.start);

  if (!Number.isFinite(duration) || duration <= 0 || duration < 1000) {
    clearOngoingShift();
    checkOngoing();
    return;
  }

  const shift = {
    id: createId(),
    jobId: ongoing.jobId,
    start: Number(ongoing.start),
    end: now,
    hours: duration / 3600000
  };

  state.shifts.push(shift);
  saveData(state.jobs, state.shifts);
  clearOngoingShift();
  showSessionSummary(job, shift);
  triggerHaptic([80, 50, 120]);
  refreshUI();
}

// ==================== UI Updates ====================
function refreshUI() {
  renderJobsList(state.jobs, state.shifts, openJobTracker);

  if (state.currentJobId && getJob(state.currentJobId)) {
    renderJobHistory(state.jobs, state.shifts, state.currentJobId, openShiftEditor);
    updateJobTrackerView();
  } else {
    clearJobTrackerView();
  }

  checkOngoing();
}

function updateJobTrackerView() {
  if (!state.currentJobId || !getJob(state.currentJobId)) {
    clearJobTrackerView();
    return;
  }

  const job = getJob(state.currentJobId);
  const allShifts = getJobShifts(state.currentJobId);
  const monthlyShifts = filterCurrentMonthShifts(allShifts);
  const totals = calculateJobTotals(job, monthlyShifts);

  if (monthlyShifts.length > 0) {
    totals.travel = Number(job.travel || 0);
    totals.net += totals.travel;
  }

  updateStats(totals, monthlyShifts);
  updateMonthlyGoalCard(job, totals.net);
  updateAnalyticsDashboard(job, state.jobs, state.shifts);
  updateWeeklyDashboard(job, state.shifts);
}

function navToHome() {
  state.currentJobId = null;
  stopTimer();
  resetTimerView();
  checkOngoing();
  navTo('pageHome');
}

function showDetailedMonthlyNetAnalysis() {
  const job = getJob(state.currentJobId);
  if (!job) {
    return alert('בחר מקום עבודה קודם');
  }

  const monthlyShifts = filterCurrentMonthShifts(getJobShifts(state.currentJobId));
  showDetailedNetAnalysis(job, state.shifts, monthlyShifts);
}

function restoreOngoingShiftView() {
  const ongoing = getOngoingShift();
  if (!ongoing) return;

  if (!getJob(ongoing.jobId)) {
    clearOngoingShift();
    return;
  }

  state.currentJobId = ongoing.jobId;
  navTo('pageTracker');
  showTrackerTab('today');
  renderJobHistory(state.jobs, state.shifts, state.currentJobId, openShiftEditor);
  updateJobTrackerView();
  checkOngoing();
}

// ==================== Utility Functions ====================
function createId() {
  if (window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toSafeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clamp(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.min(max, Math.max(min, num));
}

// ==================== Event Listeners ====================
document.addEventListener('click', (event) => {
  const btn = event.target.closest('[data-action="shift-toggle"]');
  if (!btn) return;
  event.preventDefault();
  handleMainButtonClick();
});

// ==================== Initialization ====================
function initializeApplication() {
  loadApplicationData();
  refreshJobsList();
  resetTrackerStats();
  resetTimerView();
  restoreOngoingShiftView();

  if (!getOngoingShift()) {
    checkOngoing();
  }
}

// ==================== Global API for HTML onclick handlers ====================
window.paycheck_openJobEditor = openJobEditor;
window.paycheck_navTo = navTo;
window.paycheck_showDetailedMonthlyNet = showDetailedMonthlyNetAnalysis;
window.paycheck_openShiftEditor = openShiftEditor;
window.paycheck_togglePensionUI = togglePensionUI;
window.paycheck_toggleTaxProfile = toggleTaxProfile;
window.paycheck_saveJobProcess = saveJobProcess;
window.paycheck_deleteCurrentJob = deleteCurrentJob;
window.paycheck_closeModals = closeModals;
window.paycheck_finalizeJobSave = finalizeJobSave;
window.paycheck_continueJobSaveAfterWarnings = continueJobSaveAfterWarnings;
window.paycheck_saveShiftProcess = saveShiftProcess;
window.paycheck_deleteEditingShift = deleteEditingShift;
window.paycheck_handleMainButtonClick = handleMainButtonClick;
window.paycheck_showTrackerTab = showTrackerTab;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApplication, { once: true });
} else {
  initializeApplication();
}

export { state };
