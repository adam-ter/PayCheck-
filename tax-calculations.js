// Tax calculation constants based on Israeli tax law 2026
export const TAX_CONSTANTS = {
  creditPointValue: 242,
  nationalInsuranceLowCeiling: 7703,
  nationalInsuranceMonthlyCeiling: 51910,
  nationalInsuranceLowRate: 0.0427,
  nationalInsuranceHighRate: 0.1217,
  fallbackSecondJobTaxRate: 0.47,
  pensionTaxCreditRate: 0.35,
  pensionTaxCreditIncomeCap: 9700,
  maleCreditPoints: 2.25,
  femaleCreditPoints: 2.75,
  releasedSoldierCreditPoints: 2,
  monthlyBrackets: [
    { upTo: 7010, rate: 0.1 },
    { upTo: 10060, rate: 0.14 },
    { upTo: 19000, rate: 0.2 },
    { upTo: 25100, rate: 0.31 },
    { upTo: 45000, rate: 0.35 },
    { upTo: Infinity, rate: 0.47 }
  ]
};

export function calculateNationalInsurance(gross) {
  const low = TAX_CONSTANTS.nationalInsuranceLowCeiling;
  const cap = TAX_CONSTANTS.nationalInsuranceMonthlyCeiling;
  const safe = Math.min(Math.max(0, gross), cap);
  
  return safe <= low 
    ? safe * TAX_CONSTANTS.nationalInsuranceLowRate
    : low * TAX_CONSTANTS.nationalInsuranceLowRate + (safe - low) * TAX_CONSTANTS.nationalInsuranceHighRate;
}

export function calculateIncomeTaxBeforeCredits(gross, job) {
  if (!job?.isSingle) {
    const rate = Number(job?.taxCoordinationRate || 0);
    return gross * ((rate > 0 ? rate : 47) / 100);
  }

  let remainder = gross;
  let lastBracket = 0;
  let tax = 0;

  for (const bracket of TAX_CONSTANTS.monthlyBrackets) {
    const taxable = Math.max(0, Math.min(remainder, bracket.upTo - lastBracket));
    tax += taxable * bracket.rate;
    remainder -= taxable;
    lastBracket = bracket.upTo;
    
    if (remainder <= 0) break;
  }

  return tax;
}

export function calculatePensionTaxCredit(gross, pension) {
  return Math.min(
    pension,
    Math.min(gross, TAX_CONSTANTS.pensionTaxCreditIncomeCap) * 0.07
  ) * TAX_CONSTANTS.pensionTaxCreditRate;
}

export function getCreditPoints(job) {
  if (job?.manualCreditPoints !== null && job?.manualCreditPoints !== undefined) {
    return Number(job.manualCreditPoints);
  }

  if (job?.tax?.resident === false || !job?.isSingle) {
    return 0;
  }

  return (
    (job?.tax?.gender === 'female' ? TAX_CONSTANTS.femaleCreditPoints : TAX_CONSTANTS.maleCreditPoints) +
    (job?.tax?.soldier ? TAX_CONSTANTS.releasedSoldierCreditPoints : 0)
  );
}

export function calculateTax(gross, job, shift = null) {
  const safe = Math.max(0, Number(gross || 0));
  const pensionPercent = getShiftPension(job, shift);
  const pension = safe * (pensionPercent / 100);
  const nationalInsurance = calculateNationalInsurance(safe);
  const taxBeforeCredits = calculateIncomeTaxBeforeCredits(safe, job);
  const credits = getCreditPoints(job) * TAX_CONSTANTS.creditPointValue;
  const pensionCredit = calculatePensionTaxCredit(safe, pension);
  const tax = Math.max(0, taxBeforeCredits - credits - pensionCredit);

  return {
    gross: safe,
    net: safe - pension - nationalInsurance - tax,
    pension,
    bl: nationalInsurance,
    tax,
    taxBeforeCredits,
    creditPointsValue: credits,
    pensionTaxCredit: pensionCredit
  };
}

export function getShiftPension(job, shift) {
  const value = shift?.fixedPension !== undefined 
    ? Number(shift.fixedPension) 
    : Number(job?.pension || 0);
  
  return Math.min(Math.max(value, 0), 100);
}

export function getShiftRate(job, shift) {
  return shift?.fixedRate !== undefined
    ? Math.max(0, Number(shift.fixedRate))
    : Math.max(0, Number(job?.rate || 0));
}

export function getShiftTravel(job, shift) {
  return shift?.fixedTravel !== undefined
    ? Math.max(0, Number(shift.fixedTravel))
    : Math.max(0, Number(job?.travel || 0));
}

export function calculateShiftGross(job, shift) {
  return Math.max(0, Number(shift.hours || 0)) * getShiftRate(job, shift);
}

export function calculateJobTotals(job, shifts) {
  const totals = shifts.reduce((acc, shift) => {
    acc.gross += calculateShiftGross(job, shift);
    return acc;
  }, { gross: 0, travel: 0, net: 0 });

  const taxInfo = calculateTax(totals.gross, job);
  totals.net = taxInfo.net + totals.travel;

  return totals;
}
