import { calculateTax, calculateShiftGross, getShiftRate } from './tax-calculations.js';
import { calculateMonthlyStats, calculateWeeklySummary } from './analytics.js';

// Helper functions
export function $(id) {
  return document.getElementById(id);
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function formatMoney(value) {
  const num = Number(value || 0);
  return `₪${Number.isFinite(num) ? num.toFixed(2) : '0.00'}`;
}

export function formatNumber(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return '0';
  return Number.isInteger(num) ? String(num) : num.toFixed(2);
}

export function pad2(value) {
  return String(value).padStart(2, '0');
}

export function toDateInputValue(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function toTimeInputValue(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

// Modal functions
export function openModal(id) {
  const modal = $(id);
  if (modal) modal.classList.add('active');
}

export function closeModals() {
  document.querySelectorAll('.modal').forEach(modal => modal.classList.remove('active'));
}

export function showModalContent(html) {
  $('explanationContent').innerHTML = html;
  openModal('explanationModal');
}

// Page navigation
export function navTo(pageId) {
  const page = $(pageId);
  if (!page) return;

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  page.classList.add('active');

  const showNav = pageId === 'pageTracker';
  $('bottomNav').classList.toggle('hidden', !showNav);
}

export function showTrackerTab(tab) {
  document.querySelectorAll('.app-section').forEach(s => s.classList.remove('active'));

  const tabMap = {
    today: 'tabToday',
    dashboard: 'tabDashboard',
    shifts: 'tabShifts',
    salary: 'tabSalary'
  };

  const element = $(tabMap[tab] || 'tabToday');
  if (element) element.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  const labels = {
    today: 'היום',
    dashboard: 'סיכום חודשי',
    shifts: 'משמרות',
    salary: 'שכר ונטו'
  };

  $('activeTabSubtitle').textContent = labels[tab] || 'היום';
}

// Jobs list rendering
export function renderJobsList(jobs, shifts, onJobClick) {
  const list = $('jobsList');
  list.innerHTML = '';

  if (!jobs.length) {
    list.innerHTML = '<p class="text-center text-slate-400 text-sm font-bold">עדיין אין מקומות עבודה. הוסף אחד כדי להתחיל.</p>';
    return;
  }

  jobs.forEach(job => {
    const card = createJobCard(job, shifts, onJobClick);
    list.appendChild(card);
  });
}

function createJobCard(job, shifts, onJobClick) {
  const card = document.createElement('div');
  const shiftCount = calculateJobShiftCount(job, shifts);
  
  card.className = 'card p-5 flex justify-between items-center cursor-pointer border-r-8 border-teal-500';
  card.onclick = () => onJobClick(job.id);
  card.innerHTML = `
    <div>
      <h3 class="font-bold">${escapeHtml(job.name)}</h3>
      <p class="text-xs text-teal-600">₪${formatNumber(job.rate)}/שעה · ${shiftCount} משמרות</p>
    </div>
    <span>←</span>
  `;
  
  return card;
}

function calculateJobShiftCount(job, shifts) {
  return shifts.filter(s => s.jobId === job.id).length;
}

// Shift card rendering
export function renderJobHistory(jobs, shifts, currentJobId, onEditShift) {
  const job = jobs.find(j => j.id === currentJobId);
  if (!job) {
    clearJobTrackerView();
    return;
  }

  $('activeJobTitle').textContent = job.name;

  const allShifts = shifts.filter(s => s.jobId === currentJobId).sort((a, b) => b.start - a.start);
  const container = $('jobHistory');
  container.innerHTML = '';

  if (!allShifts.length) {
    container.innerHTML = '<p class="text-center text-slate-400 text-sm font-bold">המשמרת הראשונה שלך מחכה 🚀</p>';
    return;
  }

  allShifts.forEach(shift => {
    const card = createShiftCard(job, shift, onEditShift);
    container.appendChild(card);
  });
}

function createShiftCard(job, shift, onEditShift) {
  const start = new Date(shift.start);
  const end = new Date(shift.end);
  const rate = getShiftRate(job, shift);
  const gross = calculateShiftGross(job, shift);

  const card = document.createElement('div');
  card.className = 'card p-4 mb-2';
  card.innerHTML = `
    <div class="flex justify-between items-start gap-3">
      <div>
        <p class="font-bold text-sm">${start.toLocaleDateString('he-IL')}</p>
        <p class="text-[10px] text-slate-400">${toTimeInputValue(start)}–${toTimeInputValue(end)} · ${Number(shift.hours).toFixed(2)} שעות · ₪${formatNumber(rate)}/שעה</p>
      </div>
      <div class="text-left">
        <div class="text-teal-600 font-black">${formatMoney(gross)}</div>
        <p class="text-[10px] font-bold text-slate-400">ברוטו</p>
        <button type="button" class="text-[11px] font-black text-slate-400 underline mt-1" onclick="paycheck_openShiftEditor('${shift.id}')">ערוך</button>
      </div>
    </div>
  `;

  return card;
}

// Stats updates
export function updateStats(totals, monthlyShifts) {
  const hours = monthlyShifts.reduce((sum, s) => sum + Number(s.hours || 0), 0);
  const count = monthlyShifts.length;
  const avgShift = count ? totals.net / count : 0;

  $('statGross').textContent = formatMoney(totals.gross);
  $('statNet').textContent = formatMoney(totals.net);
  $('statHours').textContent = hours.toFixed(2);
  $('statShifts').textContent = String(count);
  $('statAvgShift').textContent = formatMoney(avgShift);
}

export function resetTrackerStats() {
  $('statGross').textContent = formatMoney(0);
  $('statNet').textContent = formatMoney(0);
  $('statHours').textContent = '0.00';
  $('statShifts').textContent = '0';
  $('statAvgShift').textContent = formatMoney(0);
  $('monthlyGoalCard').classList.add('hidden');
}

export function clearJobTrackerView() {
  $('jobHistory').innerHTML = '';
  $('activeJobTitle').textContent = '';
  resetTrackerStats();
  resetTimerView();
}

// Goal card
export function updateMonthlyGoalCard(job, netAmount) {
  const goal = Number(job.monthlyGoal || 0);
  const card = $('monthlyGoalCard');

  if (!goal || goal <= 0) {
    card.classList.add('hidden');
    return;
  }

  const percent = Math.min(netAmount / goal * 100, 999);
  const visual = Math.min(percent, 100);
  const remaining = goal - netAmount;
  let color = '#94a3b8';
  let message = `נשארו לך ${formatMoney(Math.max(0, remaining))} להגיע ליעד.`;

  if (percent >= 100) {
    color = '#0d9488';
    message = `עברת את היעד ב־${formatMoney(Math.abs(remaining))} 🔥`;
  } else if (percent >= 80) {
    color = '#14b8a6';
  } else if (percent >= 40) {
    color = '#f59e0b';
  }

  $('goalNameDisplay').textContent = job.goalName || 'יעד חודשי';
  $('goalProgressText').textContent = `${formatMoney(netAmount)} / ${formatMoney(goal)}`;
  $('goalPercentText').textContent = `${Math.floor(percent)}%`;
  $('goalProgressBar').style.width = `${visual}%`;
  $('goalProgressBar').style.background = color;
  $('goalMotivationText').textContent = message;
  card.classList.remove('hidden');
}

// Timer functions
export function resetTimerView() {
  $('timerDisplay').textContent = '00:00:00';
  $('liveGrossBox').classList.add('hidden');
  $('liveGrossAmount').textContent = formatMoney(0);
  animateLiveShiftCard(false);
}

export function updateTimerDisplay(startTime, job) {
  const diff = Math.max(0, Math.floor((Date.now() - Number(startTime)) / 1000));
  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  const seconds = diff % 60;

  $('timerDisplay').textContent = `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
  updateLiveGross(diff / 3600, job);
}

function updateLiveGross(hoursDecimal, job) {
  const gross = job ? hoursDecimal * Number(job.rate || 0) : 0;
  $('liveGrossAmount').textContent = formatMoney(gross);
}

export function setMainButton(text, className) {
  $('mainBtn').textContent = text;
  $('mainBtn').className = className;
}

export function animateLiveShiftCard(active) {
  const card = $('liveShiftCard');
  if (!card) return;

  if (active) {
    card.style.animation = 'pulseGlow 2s infinite';
    card.classList.add('ring-2', 'ring-teal-200');
  } else {
    card.style.animation = '';
    card.classList.remove('ring-2', 'ring-teal-200');
  }
}

export function showSessionSummary(job, shift) {
  const gross = calculateShiftGross(job, shift);
  $('summaryHours').textContent = `${shift.hours.toFixed(2)} שעות`;
  $('summaryGross').textContent = formatMoney(gross);
  openModal('sessionSummaryModal');
}

// Analytics dashboard
export function updateAnalyticsDashboard(job, jobs, shifts) {
  const stats = calculateMonthlyStats(job, shifts);
  const { totals, bestDay, incomeChartData, forecast, insight } = stats;
  const { avgHourly } = totals;

  $('avgHourlyStat').textContent = formatMoney(avgHourly);
  
  if (bestDay) {
    $('bestDayStat').textContent = `${bestDay.date} · ${formatMoney(bestDay.amount)}`;
  } else {
    $('bestDayStat').textContent = '—';
  }

  renderIncomeChart(incomeChartData);
  $('forecastIncome').textContent = formatMoney(forecast);
  $('monthlyInsight').textContent = insight;
}

function renderIncomeChart(chartData) {
  const chart = $('incomeChart');
  chart.innerHTML = '';

  const max = chartData.max;
  $('chartMaxLabel').textContent = formatMoney(max);

  chartData.bars.forEach(bar => {
    const barEl = document.createElement('div');
    barEl.className = 'flex-1 rounded-t-xl bg-teal-500/80 min-h-[4px] transition-all';
    barEl.style.height = `${bar.height}%`;
    barEl.title = `יום ${bar.day}: ${formatMoney(bar.amount)}`;
    chart.appendChild(barEl);
  });
}

// Weekly dashboard
export function updateWeeklyDashboard(job, shifts) {
  const { hours, count, net, forecast, avgHourly } = calculateWeeklySummary(job, shifts);

  $('weeklyNet').textContent = formatMoney(net);
  $('weeklyHours').textContent = hours.toFixed(1);
  $('weeklyShifts').textContent = String(count);
  $('weeklyForecast').textContent = formatMoney(forecast);

  const avgEl = $('weeklyAvgHourly');
  if (avgEl) avgEl.textContent = formatMoney(avgHourly);
}

// Form rendering
export function fillJobForm(job, defaults) {
  if (job) {
    $('jName').value = job.name || '';
    $('jRate').value = job.rate ?? '';
    $('jTravel').value = job.travel ?? defaults.travel;
    $('jGoalName').value = job.goalName || '';
    $('jMonthlyGoal').value = job.monthlyGoal || '';
    $('jPenExist').checked = Number(job.pension) > 0;
    $('jPenRate').value = job.pension ?? defaults.pension;
    $('jGender').value = job.tax?.gender || 'male';
    $('jResident').checked = job.tax?.resident !== false;
    $('jSoldier').checked = Boolean(job.tax?.soldier);
    $('jSingle').checked = Boolean(job.isSingle);
    $('jCreditPoints').value = job.manualCreditPoints ?? '';
    $('jTaxCoordinationRate').value = job.taxCoordinationRate || '';
  } else {
    $('jName').value = '';
    $('jRate').value = '';
    $('jTravel').value = '';
    $('jGoalName').value = '';
    $('jMonthlyGoal').value = '';
    $('jPenExist').checked = false;
    $('jPenRate').value = '';
    $('jGender').value = 'male';
    $('jResident').checked = false;
    $('jSoldier').checked = false;
    $('jSingle').checked = false;
    $('jCreditPoints').value = '';
    $('jTaxCoordinationRate').value = '';
  }
}

export function fillShiftForm(shift, date) {
  if (shift) {
    const startDate = new Date(shift.start);
    const endDate = new Date(shift.end);
    $('sDate').value = toDateInputValue(startDate);
    $('sStart').value = toTimeInputValue(startDate);
    $('sEnd').value = toTimeInputValue(endDate);
  } else {
    const now = new Date(date || Date.now());
    $('sDate').value = toDateInputValue(now);
    $('sStart').value = '09:00';
    $('sEnd').value = '17:00';
  }
}

// Utility for haptic feedback
export function triggerHaptic(pattern = [40]) {
  if (navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

// Detailed net analysis modal
export function showDetailedNetAnalysis(job, shifts, monthlyShifts) {
  let totalGross = 0;
  monthlyShifts.forEach(shift => {
    totalGross += calculateShiftGross(job, shift);
  });

  const travel = Number(job.travel || 0) * monthlyShifts.length;
  const hours = monthlyShifts.reduce((sum, s) => sum + Number(s.hours || 0), 0);
  const taxInfo = calculateTax(totalGross, job);
  const finalNet = taxInfo.net + travel;
  const hourly = hours ? taxInfo.net / hours : 0;
  const deductions = taxInfo.pension + taxInfo.bl + taxInfo.tax;
  const deductionPercent = taxInfo.gross ? ((deductions / taxInfo.gross) * 100).toFixed(1) : '0.0';

  showModalContent(`
    <h3 class="text-xl font-black brand-text mb-4">ניתוח נטו משוער לחודש הנוכחי</h3>
    <div class="space-y-2 text-sm font-bold">
      <div class="flex justify-between text-slate-800">
        <span>ברוטו:</span>
        <span class="font-black">${formatMoney(taxInfo.gross)}</span>
      </div>
      <div class="flex justify-between text-red-500">
        <span>פנסיה עובד:</span>
        <span class="font-black">- ${formatMoney(taxInfo.pension)}</span>
      </div>
      <div class="flex justify-between text-red-500">
        <span>ביטוח לאומי/בריאות:</span>
        <span class="font-black">- ${formatMoney(taxInfo.bl)}</span>
      </div>
      <div class="flex justify-between text-red-500">
        <span>מס הכנסה אחרי זיכויים:</span>
        <span class="font-black">- ${formatMoney(taxInfo.tax)}</span>
      </div>
      <div class="flex justify-between text-green-600">
        <span>החזר נסיעות:</span>
        <span class="font-black">+ ${formatMoney(travel)}</span>
      </div>
      <div class="flex justify-between text-slate-600">
        <span>מס לפני זיכויים:</span>
        <span>${formatMoney(taxInfo.taxBeforeCredits)}</span>
      </div>
      <div class="flex justify-between text-slate-600">
        <span>שווי נקודות זיכוי:</span>
        <span>${formatMoney(taxInfo.creditPointsValue)}</span>
      </div>
      <div class="flex justify-between text-slate-600">
        <span>זיכוי פנסיוני:</span>
        <span>${formatMoney(taxInfo.pensionTaxCredit)}</span>
      </div>
      <div class="flex justify-between text-slate-600">
        <span>שעות החודש:</span>
        <span>${hours.toFixed(2)}</span>
      </div>
      <div class="flex justify-between text-slate-600">
        <span>נטו ממוצע לשעה (ללא נסיעות):</span>
        <span>${formatMoney(hourly)}</span>
      </div>
      <hr class="my-3">
      <div class="flex justify-between text-lg text-teal-700">
        <span>נטו סופי:</span>
        <span class="font-black">${formatMoney(finalNet)}</span>
      </div>
    </div>
    <p class="text-[11px] text-slate-400 mt-3 font-semibold">אחוז הורדות: ${deductionPercent}%</p>
    <p class="text-[11px] text-slate-400 mt-3 font-semibold">שים לב: זה חישוב מקורב בלבד ולא תלוש שכר רשמי.</p>
  `);
}
