// Battery estimate (PLAN.md section 7.4): m = P * t / (e * DoD). Indicative, first order: no cell ageing, no cold derating.

export interface BatteryEstimate {
  energy_kWh: number;
  mass_kg: number;
}

/** P in kW, t in hours, e in Wh/kg, depth of discharge 0..1. Null when t is unknown or an input is not usable. */
export function batteryEstimate(
  power_kW: number,
  darkness_h: number | null,
  specificEnergy_Wh_kg: number,
  depthOfDischarge: number,
): BatteryEstimate | null {
  if (darkness_h === null || !Number.isFinite(darkness_h) || darkness_h < 0) return null;
  if (!(power_kW >= 0) || !(specificEnergy_Wh_kg > 0) || !(depthOfDischarge > 0) || depthOfDischarge > 1) return null;
  const energy_kWh = power_kW * darkness_h;
  return {energy_kWh, mass_kg: (energy_kWh * 1000) / (specificEnergy_Wh_kg * depthOfDischarge)};
}
