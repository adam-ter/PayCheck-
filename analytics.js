import { calculateTax, calculateShiftGross } from './tax-calculations.js';

export function filterCurrentMonthShifts(shifts) {
  const now = new Date();
  return shifts.filter(shift => {
    const shiftDate = new Date(shift.start);
    return shiftDate.getMonth() === now.getMonth() && 
           shiftDate.getFullYear() === now.getFullYear();
  });
}

export function filterCurrentWeekShifts(shifts, jobId = null) {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  return shifts
    .filter(shift => {
      const shiftDate = new Date(shift.start);
      return shiftDate >= startOfWeek && (!jobId || shift.jobId === jobId);
    });
}

export function calculateWeeklySummary(job, shifts) {
  const weeklyShifts = filterCurrentWeekShifts(shifts, job.id);
  const hours = weeklyShifts.reduce((sum, s) => sum + Number(s.hours || 0), 0);
  
  let weeklyGross = 0;
  weeklyShifts.forEach(shift => {
    weeklyGross += calculateShiftGross(job, shift);
  });

  const taxInfo = calculateTax(weeklyGross, job);
  const weeklyNet = taxInfo.net;
  const avgHourly = hours ? weeklyNet / hours : 0;

  return {
    shifts: weeklyShifts,
    count: weeklyShifts.length,
    hours,
    gross: weeklyGross,
    net: weeklyNet,
    forecast: weeklyShifts.length > 0 ? weeklyNet * 1.4 : 0,
    avgHourly
  };
}

export function calculateDailyBreakdown(job, shifts) {
  const grouped = {};
  
  shifts.forEach(shift => {
    const day = new Date(shift.start).getDate();
    const gross = calculateShiftGross(job, shift);
    grouped[day] = (grouped[day] || 0) + gross;
  });

  return grouped;
}

export function getMonthlyChartData(shifts) {
  const grouped = {};
  
  shifts.forEach(shift => {
    const day = new Date(shift.start).getDate();
    grouped[day] = (grouped[day] || 0) + 1; // count of shifts per day
  });

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const chartData = [];

  for (let day = 1; day <= daysInMonth; day++) {
    chartData.push({
      day,
      count: grouped[day] || 0
    });
  }

  return chartData;
}

export function getIncomeChartData(job, shifts) {
  if (!shifts.length) return { max: 0, bars: [] };

  const dailyIncome = calculateDailyBreakdown(job, shifts);
  const max = Math.max(...Object.values(dailyIncome), 1);
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const bars = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const amount = dailyIncome[day] || 0;
    bars.push({
      day,
      amount,
      height: Math.max(amount / max * 100, 4),
      percentage: (amount / max * 100).toFixed(1)
    });
  }

  return { max, bars };
}

export function getBestDay(job, shifts) {
  if (!shifts.length) return null;

  const grouped = {};
  
  shifts.forEach(shift => {
    const key = new Date(shift.start).toLocaleDateString('he-IL');
    const gross = calculateShiftGross(job, shift);
    grouped[key] = (grouped[key] || 0) + gross;
  });

  const entries = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
  
  if (!entries.length) return null;

  return {
    date: entries[0][0],
    amount: entries[0][1]
  };
}

export function calculateMonthlyForecast(totals, monthlyShifts) {
  if (!monthlyShifts.length) return 0;

  const now = new Date();
  const day = Math.max(now.getDate(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  return totals.net / day * daysInMonth;
}

export function generateMonthlyInsight(shifts, monthlyShifts, totals, avgHourly) {
  if (!monthlyShifts.length) {
    return 'אין מספיק נתונים עדיין.';
  }

  let message = '';
  
  if (monthlyShifts.length >= 20) {
    message = 'החודש הזה נראה חזק במיוחד 🔥 ';
  } else if (monthlyShifts.length >= 10) {
    message = 'אתה בקצב עבודה טוב מאוד. ';
  }

  message += `עבדת ${monthlyShifts.length} משמרות עם ממוצע של ₪${avgHourly.toFixed(2)} לשעה. `;

  return message;
}

export function calculateMonthlyStats(job, shifts) {
  const monthlyShifts = filterCurrentMonthShifts(shifts.filter(s => s.jobId === job.id));
  
  let totalGross = 0;
  monthlyShifts.forEach(shift => {
    totalGross += calculateShiftGross(job, shift);
  });

  const taxInfo = calculateTax(totalGross, job);
  const totalNet = taxInfo.net;
  const totalHours = monthlyShifts.reduce((sum, s) => sum + Number(s.hours || 0), 0);
  const avgHourly = totalHours ? totalNet / totalHours : 0;

  const travelTotal = Number(job.travel || 0) * monthlyShifts.length;
  const netTotal = totalNet + travelTotal;

  const totals = {
    gross: totalGross,
    net: netTotal,
    travel: travelTotal,
    hours: totalHours,
    shifts: monthlyShifts.length,
    avgShift: monthlyShifts.length ? netTotal / monthlyShifts.length : 0,
    avgHourly
  };

  return {
    totals,
    shifts: monthlyShifts,
    bestDay: getBestDay(job, monthlyShifts),
    incomeChartData: getIncomeChartData(job, monthlyShifts),
    forecast: calculateMonthlyForecast(totals, monthlyShifts),
    insight: generateMonthlyInsight(shifts, monthlyShifts, totals, avgHourly)
  };
}
