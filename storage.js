export const STORAGE_KEYS = {
  jobs: 'jobProfiles',
  shifts: 'shiftHistory',
  ongoingShift: 'ongoingShift'
};

export function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    console.warn('Invalid localStorage', key, error);
    return fallback;
  }
}

export function saveJobsToStorage(jobs) {
  try {
    localStorage.setItem(STORAGE_KEYS.jobs, JSON.stringify(jobs));
  } catch (error) {
    alert('לא ניתן לשמור נתונים. ייתכן שהאחסון במכשיר מלא או חסום.');
    console.error(error);
  }
}

export function saveShiftsToStorage(shifts) {
  try {
    localStorage.setItem(STORAGE_KEYS.shifts, JSON.stringify(shifts));
  } catch (error) {
    alert('לא ניתן לשמור נתונים. ייתכן שהאחסון במכשיר מלא או חסום.');
    console.error(error);
  }
}

export function saveData(jobs, shifts) {
  try {
    localStorage.setItem(STORAGE_KEYS.jobs, JSON.stringify(jobs));
    localStorage.setItem(STORAGE_KEYS.shifts, JSON.stringify(shifts));
  } catch (error) {
    alert('לא ניתן לשמור נתונים. ייתכן שהאחסון במכשיר מלא או חסום.');
    console.error(error);
  }
}

export function getOngoingShift() {
  const ongoing = readStorage(STORAGE_KEYS.ongoingShift, null);
  
  if (!ongoing || !ongoing.jobId || !Number.isFinite(Number(ongoing.start))) {
    return null;
  }
  
  return {
    jobId: String(ongoing.jobId),
    start: Number(ongoing.start)
  };
}

export function setOngoingShift(shiftData) {
  localStorage.setItem(STORAGE_KEYS.ongoingShift, JSON.stringify(shiftData));
}

export function clearOngoingShift() {
  localStorage.removeItem(STORAGE_KEYS.ongoingShift);
}

// Data normalization and validation functions
export function normalizeJob(job) {
  if (!job || !job.id || !job.name) return null;
  
  const rate = Number(job.rate);
  if (!Number.isFinite(rate) || rate <= 0) return null;

  return {
    id: String(job.id),
    name: String(job.name),
    rate,
    travel: Math.max(0, toSafeNumber(job.travel, 0)),
    monthlyGoal: Math.max(0, toSafeNumber(job.monthlyGoal, 0)),
    goalName: String(job.goalName || '').trim(),
    pension: clamp(toSafeNumber(job.pension, 0), 0, 100),
    isSingle: job.isSingle !== false,
    taxCoordinationRate: clamp(toSafeNumber(job.taxCoordinationRate, 0), 0, 50),
    manualCreditPoints: job.manualCreditPoints === '' || job.manualCreditPoints === undefined 
      ? null 
      : clamp(toSafeNumber(job.manualCreditPoints, 0), 0, 20),
    tax: {
      gender: job.tax?.gender === 'female' ? 'female' : 'male',
      soldier: Boolean(job.tax?.soldier),
      resident: job.tax?.resident !== false
    }
  };
}

export function normalizeShift(shift) {
  if (!shift || !shift.id || !shift.jobId) return null;
  
  const start = Number(shift.start);
  const end = Number(shift.end);
  let hours = Number(shift.hours);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;

  if (!Number.isFinite(hours) || hours <= 0) {
    hours = (end - start) / 3600000;
  }

  if (hours <= 0 || hours > 24) return null;

  const normalized = {
    id: String(shift.id),
    jobId: String(shift.jobId),
    start,
    end,
    hours
  };

  if (Number.isFinite(Number(shift.fixedRate))) {
    normalized.fixedRate = Math.max(0, Number(shift.fixedRate));
  }
  if (Number.isFinite(Number(shift.fixedTravel))) {
    normalized.fixedTravel = Math.max(0, Number(shift.fixedTravel));
  }
  if (Number.isFinite(Number(shift.fixedPension))) {
    normalized.fixedPension = clamp(Number(shift.fixedPension), 0, 100);
  }

  return normalized;
}

export function loadData() {
  const jobsData = readStorage(STORAGE_KEYS.jobs, []);
  const shiftsData = readStorage(STORAGE_KEYS.shifts, []);

  const jobs = Array.isArray(jobsData)
    ? jobsData.map(normalizeJob).filter(Boolean)
    : [];

  let shifts = Array.isArray(shiftsData)
    ? shiftsData.map(normalizeShift).filter(Boolean)
    : [];

  // Clean broken data
  const validJobIds = new Set(jobs.map(j => j.id));
  shifts = shifts.filter(s => validJobIds.has(s.jobId));

  const ongoing = getOngoingShift();
  if (ongoing && !validJobIds.has(ongoing.jobId)) {
    clearOngoingShift();
  }

  return { jobs, shifts };
}

// Utility functions
function toSafeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function clamp(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.min(max, Math.max(min, num));
}
