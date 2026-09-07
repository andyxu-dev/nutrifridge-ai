export type Macros = { calories: number; protein_g: number; carbs_g: number; fat_g: number };

export type NutritionLog = {
  date: string;
  target: Macros & { bmr: number; tdee: number };
  consumed: Macros;
  remaining: Macros;
  progress: { calories_pct: number; protein_pct: number; carbs_pct: number; fat_pct: number };
  meals: LoggedMeal[];
  warnings: string[];
};

export type LoggedMeal = {
  id: number;
  meal_type: string;
  meal_name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  ingredients_used: unknown[];
  source?: string;
  notes?: string;
  created_at: string | null;
};

export type NutritionAnalysis = {
  date: string;
  consumed: Macros;
  target: Macros;
  remaining: Macros;
  macro_status: { calories: string; protein: string; carbs: string; fat: string };
  health_notes: string[];
  summary: string;
  next_meal_recommendation: string;
  adjustment_reasons: string[];
  disclaimer: string;
};

export type PlanIngredient = {
  inventory_item_id: number;
  name: string;
  quantity_used: number;
  unit: string;
  reason: string;
  expiration_risk: string;
};

export type PlanMeal = {
  meal_type: string;
  name: string;
  cuisine: string;
  cooking_time_minutes: number;
  ingredients: PlanIngredient[];
  estimated_macros: Macros;
  reason: string;
  recommendation_reasons: string[];
  macro_gap_helped: string[];
  urgent_ingredients_used: string[];
  score: number;
  score_breakdown: Record<string, number>;
  instructions: string[];
  tags: string[];
};

export type MealPlan = {
  date: string;
  target: Macros & { bmr: number; tdee: number };
  consumed: Macros;
  remaining: Macros;
  meals: PlanMeal[];
  daily_estimated_total: Macros;
  recommendation_summary: string;
};

export type UrgentItem = {
  id: number;
  name: string;
  quantity: number;
  unit: string;
  zone: string;
  best_before_date: string | null;
  expiration_risk: string;
};

export type GroceryItem = {
  name: string;
  category: string;
  reason: string;
  priority: string;
};

export type GroceryList = {
  recommended_to_buy: GroceryItem[];
  avoid_buying: { name: string; reason: string }[];
  nutrition_gap_summary: {
    protein_gap_today_g: number;
    calorie_gap_today: number;
    protein_low_in_inventory: boolean;
    analysis: string;
  };
  inventory_summary: {
    total_items: number;
    urgent_count: number;
    medium_risk_count: number;
    low_stock_count: number;
    categories_present: string[];
  };
};

export type WasteEntry = {
  id: number;
  item_name: string;
  quantity: number;
  unit: string;
  item_category: string | null;
  reason: string;
  estimated_calories_wasted: number | null;
  discarded_at: string;
};

export type FamilyMemberBasic = {
  id?: number;
  member_key: string;
  name: string;
  goal?: string;
  diet_style?: string;
};

export type FamilyDataBasic = {
  primary_member: FamilyMemberBasic;
  additional_members: FamilyMemberBasic[];
};

export type Schedule = Record<string, Record<string, string[]>>;

export type QuickForm = {
  meal_type: string;
  meal_name: string;
  calories: string;
  protein_g: string;
  carbs_g: string;
  fat_g: string;
  notes: string;
};

export type QuickFormKey = keyof QuickForm;
