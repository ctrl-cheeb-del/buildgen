import type { BuildingCategory } from "./classify-building";

export interface BuildingCensus {
  residential: number;
  commercial: number;
  industrial: number;
  office: number;
  civic: number;
  entertainment: number;
  luxury: number;
}

export interface BudgetAllocation {
  education: number;
  healthcare: number;
  security: number;
  infrastructure: number;
}

export interface TaxRates {
  residential: number;
  commercial: number;
  industrial: number;
  luxury: number;
}

export interface CityMetrics {
  population: number;
  taxRevenue: number;
  expenses: number;
  treasuryDelta: number;
  crimeRate: number;
  pollutionLevel: number;
  happiness: number;
  educationLevel: number;
  healthLevel: number;
}

/**
 * Base treasury income per building — generated REGARDLESS of tax rate.
 * Represents economic activity that directly benefits the city.
 * Civic buildings COST money (negative) — they're a public investment.
 */
const BASE_INCOME: Record<BuildingCategory, number> = {
  residential: 40,
  commercial: 80,
  industrial: 100,
  office: 90,
  civic: -30,
  entertainment: 50,
  luxury: 120,
};

// Liquidation value when a building is sold during bankruptcy
export const BUILDING_VALUE: Record<BuildingCategory, number> = {
  residential: 800,
  commercial: 1200,
  industrial: 1500,
  office: 1400,
  civic: 500,
  entertainment: 1000,
  luxury: 2500,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * TAX FATIGUE: High taxes reduce effective tax revenue.
 * At 20% tax → full revenue. At 40% → 80%. At 50% → 60%.
 * Simulates tax evasion and economic slowdown from overtaxation.
 */
function taxEfficiency(rate: number): number {
  if (rate <= 0.2) return 1.0;
  return Math.max(0.4, 1.0 - (rate - 0.2) * 1.3);
}

/** Pure function: compute all city metrics from current state. */
export function computeMetrics(
  census: BuildingCensus,
  budget: BudgetAllocation,
  taxRates: TaxRates,
  tickNumber: number = 0,
  treasury: number = 10000,
  prevCrimeRate: number = 0,
): CityMetrics {
  const totalBuildings = Object.values(census).reduce((a, b) => a + b, 0);

  const population =
    census.residential * 120 + census.luxury * 40 + 200;

  // ── INCOME (dual sources) ──
  // 1. Base building income — economic activity, always flows to treasury
  // Crime penalty: high crime scares away businesses (commercial/office/luxury)
  const crimePenalty = 1 - prevCrimeRate / 200; // at 100 crime → 50% revenue cut
  const crimeAffected = new Set<string>(["commercial", "office", "luxury"]);
  let baseIncome = 0;
  for (const [cat, count] of Object.entries(census)) {
    const raw = count * (BASE_INCOME[cat as BuildingCategory] ?? 0);
    baseIncome += crimeAffected.has(cat) ? raw * crimePenalty : raw;
  }

  // 2. Tax revenue — scales with population and average tax rate (with fatigue)
  const avgTaxRate = (taxRates.residential + taxRates.commercial + taxRates.industrial + taxRates.luxury) / 4;
  const citizenTaxRevenue = Math.round(population * avgTaxRate * 0.5 * taxEfficiency(avgTaxRate));

  const taxRevenue = Math.round(baseIncome) + citizenTaxRevenue;

  // ── EXPENSES ──
  // Base upkeep: citizens need basic services
  const baseUpkeep = Math.round(population * 0.15);
  // Service costs: budget allocation * population
  const budgetTotal = budget.education + budget.healthcare + budget.security + budget.infrastructure;
  const serviceCosts = Math.round(budgetTotal * population * 0.3);
  // Building maintenance: QUADRATIC — more buildings = exponentially harder to maintain
  const maintenance = Math.round(totalBuildings * 15 + totalBuildings * totalBuildings * 1.5);
  // Inflation: expenses creep up 1% every 10 ticks
  const inflationMultiplier = 1 + Math.floor(tickNumber / 10) * 0.01;
  const expenses = Math.round((baseUpkeep + serviceCosts + maintenance) * inflationMultiplier);

  const treasuryDelta = taxRevenue - expenses;

  // Treasury stress: when city is broke, can't fund services → crime rises
  const treasuryStress = Math.max(0, 1 - treasury / 5000) * 25;
  const crimeRate = clamp(
    30 + census.industrial * 8 - census.civic * 15 - budget.security * 40 + treasuryStress,
    0,
    100
  );

  const pollutionLevel = clamp(
    10 + census.industrial * 12 + census.commercial * 3 - budget.infrastructure * 20,
    0,
    100
  );

  const educationLevel = clamp(
    20 + census.civic * 10 + budget.education * 60,
    0,
    100
  );

  const healthLevel = clamp(
    20 + census.civic * 8 + budget.healthcare * 60,
    0,
    100
  );

  // High taxes reduce happiness
  const taxBurden = avgTaxRate > 0.3 ? (avgTaxRate - 0.3) * 30 : 0;

  const happiness = clamp(
    50 +
      census.entertainment * 5 -
      crimeRate * 0.3 -
      pollutionLevel * 0.2 +
      educationLevel * 0.1 +
      healthLevel * 0.15 -
      taxBurden,
    0,
    100
  );

  return {
    population,
    taxRevenue,
    expenses,
    treasuryDelta,
    crimeRate,
    pollutionLevel,
    happiness: Math.round(happiness * 10) / 10,
    educationLevel: Math.round(educationLevel * 10) / 10,
    healthLevel: Math.round(healthLevel * 10) / 10,
  };
}

/** Count buildings by category from a list. */
export function buildCensus(
  categories: (BuildingCategory | undefined | null)[]
): BuildingCensus {
  const census: BuildingCensus = {
    residential: 0,
    commercial: 0,
    industrial: 0,
    office: 0,
    civic: 0,
    entertainment: 0,
    luxury: 0,
  };
  for (const cat of categories) {
    if (cat && cat in census) census[cat]++;
  }
  return census;
}
