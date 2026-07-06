# NutriFridge AI — Core Algorithms

All algorithm implementations live in `backend/app/services/`. This document covers every non-trivial computation with inputs, outputs, rules, and known limitations.

---

## 1. Nutrition Target Calculation (Mifflin-St Jeor)

**File:** `backend/app/services/nutrition_engine.py`  
**Function:** `calculate_nutrition_target(profile)`

### Inputs
- `profile`: `User` ORM object with `age`, `sex`, `weight_kg`, `height_cm`, `activity_level`, `goal`, `health_conditions`, `macro_strategy`, `custom_macros`

### Algorithm

**Step 1 — BMR (Basal Metabolic Rate):**
```
Male:   BMR = 10 × weight_kg + 6.25 × height_cm − 5 × age + 5
Female: BMR = 10 × weight_kg + 6.25 × height_cm − 5 × age − 161
```

**Step 2 — TDEE (Total Daily Energy Expenditure):**
```
Activity multipliers:
  sedentary:        TDEE = BMR × 1.2
  lightly_active:   TDEE = BMR × 1.375
  moderately_active: TDEE = BMR × 1.55
  very_active:      TDEE = BMR × 1.725
  extra_active:     TDEE = BMR × 1.9
```

**Step 3 — Goal adjustment:**
```
lose:     target_calories = TDEE − 500
maintain: target_calories = TDEE
gain:     target_calories = TDEE + 300
```

**Step 4 — Macro split (balanced baseline):**
```
protein_g  = target_calories × 0.30 / 4
carbs_g    = target_calories × 0.40 / 4
fat_g      = target_calories × 0.30 / 9
```

**Step 5 — Macro strategy override:**
| Strategy | Override |
|----------|---------|
| `high_protein` | `protein_g = weight_kg × 2.2` |
| `low_carb` | `carbs_g = 100` |
| `low_fat` | `fat_g = target_calories × 0.20 / 9` |
| `custom` | Use `custom_macros.{calories, protein_g, carbs_g, fat_g}` directly |

**Step 6 — Health condition adjustments:**
| Condition | Adjustment |
|-----------|-----------|
| `fatty_liver` | `target_calories = TDEE + 150` (reduced surplus), `fat_g` capped at `target_calories × 0.22 / 9` |
| `diabetes` | `carbs_g` capped at `target_calories × 0.40 / 4` |
| `kidney_disease` | `protein_g` capped at `weight_kg × 0.8` |
| `high_cholesterol` | `fat_g` capped at `target_calories × 0.22 / 9` |

### Output
```python
{
    "bmr": float,
    "tdee": float,
    "target_calories": float,
    "target_protein_g": float,
    "target_carbs_g": float,
    "target_fat_g": float
}
```

### Limitations
- Protein adjustment is not applied for kidney disease when `macro_strategy = "custom"` (custom values used as-is)
- BMR formula assumes standard adult physiology; not validated for children or extreme body compositions
- `extra_active` multiplier of 1.9 is at the upper bound of published estimates

---

## 2. Expiration Risk Engine

**File:** `backend/app/services/expiration_engine.py`  
**Function:** `calculate_expiration_risk(item)`

### Inputs
- `item`: `InventoryItem` with `expiration_date` (ISO string or null)

### Algorithm
```
if expiration_date is None:
    risk = "OK"
else:
    days_remaining = (expiration_date − today).days
    
    if days_remaining < 0:   risk = "CRITICAL"  (already expired)
    elif days_remaining == 0: risk = "CRITICAL"  (expires today)
    elif days_remaining <= 2: risk = "HIGH"
    elif days_remaining <= 7: risk = "MEDIUM"
    else:                     risk = "OK"
```

### Output
```python
"CRITICAL" | "HIGH" | "MEDIUM" | "OK"
```

**Used by:** Meal scorer (urgency component), `/inventory/urgent` endpoint, expiration badge in frontend.

### Limitations
- Risk is computed at query time from server date (`date.today()`); time zones are not considered
- "Urgent" items endpoint returns `HIGH` + `CRITICAL` items sorted by days remaining

---

## 3. Unit Converter

**File:** `backend/app/services/unit_converter.py`  
**Function:** `deduct_quantity(item_qty, item_unit, used_qty, used_unit)`

### Inputs
- `item_qty`: current inventory quantity (float)
- `item_unit`: unit of the inventory item
- `used_qty`: amount being deducted (float)
- `used_unit`: unit of the logged ingredient

### Algorithm

```
MASS_TO_GRAMS = { "g": 1.0, "kg": 1000.0, "lb": 453.592, "oz": 28.3495 }
DISCRETE_UNITS = { "count", "bag", "cup", "ml", "l", "piece", "slice" }

Case 1: item_unit == used_unit
    → result = item_qty − used_qty, warning = None

Case 2: both in MASS_TO_GRAMS
    → item_in_g = item_qty × MASS_TO_GRAMS[item_unit]
    → used_in_g = used_qty × MASS_TO_GRAMS[used_unit]
    → result_in_g = item_in_g − used_in_g
    → result = result_in_g / MASS_TO_GRAMS[item_unit]  (convert back)
    → warning = None

Case 3: units incompatible (one or both are DISCRETE, or mixed mass/discrete)
    → result = item_qty  (no deduction)
    → warning = f"Unit mismatch: cannot convert {used_unit} to {item_unit}"
```

### Output
```python
(new_quantity: float, warning: str | None)
```

### Limitations
- `ml` and `l` are in `DISCRETE_UNITS` (not cross-converted to mass units like `g`)
- `cup` is in `DISCRETE_UNITS` — no conversion to g/ml (no density lookup)
- No density database; cannot convert "1 cup of milk" to grams
- Warnings are returned to the API response but do not block the log operation

---

## 4. Meal Scoring (8-Component System)

**File:** `backend/app/services/meal_scorer.py`  
**Function:** `score_meal(template, inventory_items, profile, daily_log, meal_type)`

### Inputs
- `template`: A `MealTemplate` (name, category requirements, estimated macros, cooking_time)
- `inventory_items`: All current `InventoryItem` records
- `profile`: `User` ORM object
- `daily_log`: Today's `DailyLog` (consumed macros so far)
- `meal_type`: `"breakfast"` / `"lunch"` / `"dinner"` / `"snack"`

### Scoring Components

Total score = sum of all components (can exceed 100 with bonuses, floored at 0)

| Component | Max Points | Calculation |
|-----------|-----------|-------------|
| **1. Urgency** | +25 | CRITICAL items used → +25; HIGH → +15; MEDIUM → +8; OK → 0 |
| **2. Protein gap** | +20 | `(remaining_protein / target_protein) × 20`; capped at 20 |
| **3. Calorie fit** | +15 | 15–65% of remaining calories used → +15; else scaled proportionally |
| **4. Preference** | +25 | Cuisine match → +15; diet_style match → +10 |
| **5. Cooking time** | +8 | Meal cooking time ≤ user preference → +8; else scaled |
| **6. Variety** | +7 | Uses a category not eaten today → +7; repeat category → 0 |
| **7. Dislike penalty** | −25 | Any disliked food ingredient in template → −25 |
| **8. Health constraint** | ±30 | Allergen hard-exclude → −100; condition-relevant food → ±30 |

**Hard exclusion:** If any ingredient matches an allergen → total score set to −100 (never recommended)

### Output
```python
{
    "score": float,
    "score_breakdown": {
        "urgency": float,
        "protein_gap": float,
        "calorie_fit": float,
        "preference": float,
        "cooking_time": float,
        "variety": float,
        "dislike_penalty": float,
        "health_constraint": float
    },
    "matched_ingredients": [InventoryItem, ...],
    "reason": str  # human-readable explanation of top factors
}
```

### Limitations
- Template matching is category-based, not ingredient-specific (any item in "protein" category matches a "protein" slot)
- 20 fixed templates; users cannot add or edit templates via the UI
- Variety component only checks meal categories eaten today (not this week)
- Calorie fit uses a 15–65% utilization window (meals that are too small or too large score 0 on this component)

---

## 5. Meal Plan Generation

**File:** `backend/app/services/meal_planner.py`  
**Function:** `generate_meal_plan(profile, inventory_items, daily_log)`

### Algorithm

```
For each meal_type in [breakfast, lunch, dinner, snack]:
    candidates = get_templates_for_meal_type(meal_type)
    
    For each template in candidates:
        score_result = score_meal(template, inventory_items, profile, daily_log, meal_type)
    
    Sort candidates by score descending
    
    Select top candidate that:
        - score > 0 (not hard-excluded)
        - estimated calories ≤ remaining_calories  (fits budget)
    
    Add to plan
    Update remaining macros
```

### Meal Templates

**File:** `backend/app/services/meal_templates.py`

20 fixed templates, each specifying:
- `name`: display name
- `meal_type`: `breakfast` / `lunch` / `dinner` / `snack`
- `category_slots`: list of required item categories (e.g. `["protein", "vegetable", "grain"]`)
- `estimated_calories`: base estimate
- `estimated_protein_g`: base estimate
- `cooking_time_minutes`: for cooking-time scoring component
- `cuisine_tag`: for preference scoring
- `diet_tags`: list of diet styles this meal fits

### Output
```python
{
    "meals": [
        {
            "meal_type": str,
            "meal_name": str,
            "score": float,
            "score_breakdown": {...},
            "ingredients": [{"name": str, "quantity": float, "unit": str, "expiration_risk": str}],
            "estimated_calories": float,
            "estimated_protein_g": float,
            "estimated_carbs_g": float,
            "estimated_fat_g": float,
            "reason": str
        }
    ],
    "total_planned": {"calories": float, "protein_g": float, ...}
}
```

### Limitations
- Meal plan does not persist; regenerated on each `GET /meal-plan/today` request
- Nutrition estimates are template-based, not calculated from actual ingredient quantities
- If no template passes the calorie budget, that meal slot is omitted (no fallback)

---

## 6. Family Meal Plan Generation

**File:** `backend/app/routers/family.py`  
**Endpoint:** `POST /family/meal-plan/today`

### Algorithm

```
For each member_key in request.member_keys:
    Load FamilyMember profile
    Calculate individual nutrition target (same Mifflin-St Jeor as above)
    Generate individual meal plan (same generate_meal_plan as above)
    Apply member's health conditions and preferences

Aggregate results into per-member plan structure
Identify conflicts (e.g., one member is allergic to an ingredient another member needs)
```

### Output
```python
{
    "member_plans": {
        "alice": {
            "member_name": "Alice",
            "meals": [...]  # same structure as personal meal plan
        },
        "bob": { ... }
    },
    "shared_ingredients": [...]  # ingredients useful for multiple members
}
```

---

## 7. Family Grocery List Calculation

**File:** `backend/app/routers/grocery_list.py`  
**Endpoint:** `POST /family/grocery-list/weekly`

### Inputs
```python
{
    "member_keys": ["alice", "bob"],
    "days_at_home": {"alice": 5, "bob": 7}
}
```

**`days_at_home` computed by frontend:**
```
Normal week:  weekday_days × 5 + weekend_days × 2  (capped at 7)
Holiday week: weekend_holiday_days × 7
```
Where `weekday_days` = 1 if member appears in any weekday meal slot, `weekend_days` = 1 if in weekend slot.

### Algorithm

```
For each member:
    weekly_calories = daily_target × days_at_home[member]
    weekly_protein_g, carbs_g, fat_g = similarly scaled

Sum all members' weekly totals → combined_weekly_targets

Identify foods to exclude:
    all_excluded_foods = union of all members' allergens + hard-excluded health condition foods

Generate grocery items:
    For each recommended food category:
        Estimate weekly quantity based on member counts × serving size × days
        Cross-check current inventory (subtract what's already stocked)
        Assign priority (HIGH if inventory < 3 days, MEDIUM otherwise)
```

### Output
```python
{
    "items": [...],
    "household_nutrition_summary": {
        "combined_weekly_targets": {"calories": float, "protein_g": float, "carbs_g": float, "fat_g": float},
        "individual_weekly_needs": {
            "alice": {"name": "Alice", "days_at_home": 5, "weekly_calories": float, ...}
        },
        "all_excluded_foods": ["nuts", "dairy"]
    },
    "member_specific_notes": ["Alice: dairy-free items needed", ...]
}
```

---

## 8. Health Constraint Policy (Java Strategy Pattern)

**Interface:** `com.nutrifridge.core.constraint.HealthConstraintPolicy`  
**File:** `backend-java/src/main/java/com/nutrifridge/core/constraint/HealthConstraintPolicy.java`

### Interface Methods

```java
String conditionKey();                          // unique key, e.g. "fatty_liver"
boolean appliesTo(UserProfileDto profile);      // check if profile has this condition
MacroTotals adjustTarget(MacroTotals base, UserProfileDto profile);  // modify targets
Set<String> hardExcludedFoodFragments(UserProfileDto profile);       // foods to never show
Map<String, Double> tagPenalties();             // scoring penalties by food tag
List<String> warnings(MacroTotals consumed, MacroTotals target, UserProfileDto profile);
```

### Implementations

| Class | Condition Key | Target Adjustment | Hard Exclusions |
|-------|--------------|-------------------|-----------------|
| `FattyLiverPolicy` | `fatty_liver` | Surplus → +150 kcal; fat capped at 22% | None |
| `DiabetesPolicy` | `diabetes` | Carbs capped at 40% calories | None |
| `AllergyPolicy` | `allergy` | None | Allergen food fragments from profile |
| `HighCholesterolPolicy` | `high_cholesterol` | Fat capped at 22% calories | None |
| `LactoseIntolerancePolicy` | `lactose_intolerance` | None | Dairy-tagged foods |

### Composition (HealthConstraintService)

```java
// Spring auto-injects all @Component implementations
public HealthConstraintService(List<HealthConstraintPolicy> policies) { ... }

// Applies all matching policies in sequence
public MacroTotals adjustTargets(MacroTotals base, UserProfileDto profile) {
    for (policy : policies) {
        if (policy.appliesTo(profile)) base = policy.adjustTarget(base, profile);
    }
    return base;
}
```

**Integration status:** Implemented and tested in isolation. Not called from FastAPI (Java service not integrated into active request path).

---

## 9. Async Meal Plan Job Execution (Java)

**File:** `backend-java/src/main/java/com/nutrifridge/core/service/MealPlanService.java`

### Algorithm

```
submitJob(MealPlanJobRequest request):
    1. Create MealPlanJob record in PostgreSQL (status = PENDING)
    2. Submit Runnable to mealPlanExecutor (bounded ThreadPoolTaskExecutor)
    3. Return jobId immediately (HTTP 202 Accepted)

Background thread:
    4. Update job status → RUNNING
    5. Call FastApiNutritionClient.getInventoryItems() (WebClient, 8s timeout, 3 retries)
    6. Apply HealthConstraintService.adjustTargets()
    7. Build meal suggestions
    8. Update job status → SUCCEEDED + resultJson
    
    On any exception:
    8. Update job status → FAILED + errorMessage
```

**Thread pool config (`mealPlanExecutor`):**
- Core: 4 threads
- Max: 8 threads
- Queue: 50 jobs
- Rejection policy: `CallerRunsPolicy` (blocks submitting thread when queue full)
- Shutdown: waits up to 30s for in-flight jobs

### Limitations
- `CallerRunsPolicy` blocks the HTTP request thread if queue is full; degraded latency under load
- Java job results are not accessible from FastAPI (separate PostgreSQL store)
- Frontend does not yet poll the Java job endpoint

---

## 10. Inventory Deduction Locking (Java)

**File:** `backend-java/src/main/java/com/nutrifridge/core/service/MealLogService.java`

### Algorithm

```
@Transactional
logMeal(MealLogRequest request, UserProfileDto profile):
    
    For each ingredient in request.ingredientsUsed:
        item = inventoryItemRepo.findByIdForUpdate(itemId)
             // @Lock(PESSIMISTIC_WRITE) — exclusive row lock acquired here
        
        if item.quantity < ingredient.quantityUsed:
            throw InventoryInsufficientException → HTTP 409
        
        item.quantity -= ingredient.quantityUsed
        inventoryItemRepo.saveAndFlush(item)
             // Triggers @Version check:
             // If version mismatch → ObjectOptimisticLockingFailureException
             //                     → Caught → throw InventoryConflictException → HTTP 409
    
    Create MealLog record
    Update DailyNutritionLog consumed totals
    Commit transaction
```

**Defense layers:**
1. Pessimistic lock on read — prevents two threads from reading stale quantity simultaneously
2. Optimistic `@Version` on write — second defense if pessimistic lock somehow races

**Integration status:** Implemented and tested (Java JUnit 5). Not called from active frontend.
