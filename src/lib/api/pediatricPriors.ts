/**
 * Age-based body-size priors for the existing XGBoost feature vector.
 * The model was trained with Height/Weight/BMI columns. Sending adult
 * defaults (165 cm / 65 kg) for a preschooler distorts those features.
 * These are mixed-sex WHO/CDC median approximations, not measurements.
 */
export function pediatricModelPriors(ageMonths: number): {
  Age: number;
  Height: number;
  Weight: number;
  BMI: number;
} {
  const ageYears = Math.max(1, Math.round(ageMonths / 12));
  const clampedYears = Math.min(18, Math.max(3, ageMonths / 12));
  const heightCm = 90 + 5.5 * (clampedYears - 2);
  const bmi = clampedYears < 6 ? 16 : clampedYears < 10 ? 16.5 : clampedYears < 14 ? 18 : 20;
  const heightM = heightCm / 100;
  const weightKg = bmi * heightM * heightM;

  return {
    Age: ageYears,
    Height: Math.round(heightCm * 10) / 10,
    Weight: Math.round(weightKg * 10) / 10,
    BMI: Math.round(bmi * 10) / 10,
  };
}
