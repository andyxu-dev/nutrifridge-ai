# NutriFridge AI — Backend Map (FastAPI)

**Runtime:** Python 3.11+  
**Framework:** FastAPI + Uvicorn  
**ORM:** SQLAlchemy 2.0  
**Validation:** Pydantic v2  
**Database:** SQLite (`nutrifridge.db`)  
**Entry point:** `backend/app/main.py`

---

## Startup Behavior

`backend/app/main.py`:
1. Imports all SQLAlchemy model modules to register metadata
2. Calls `Base.metadata.create_all(bind=engine)` — creates any missing tables (idempotent)
3. Registers CORS middleware (allow all origins, headers, methods — dev setting)
4. Registers 10 routers at their prefixes
5. Serves via Uvicorn on port 8000

**Start command:**
```bash
cd backend && source ../venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

---

## Router Registry

| Router module | Prefix | Tag |
|--------------|--------|-----|
| `routers/profile.py` | (none / root) | profile |
| `routers/inventory.py` | `/inventory` | inventory |
| `routers/nutrition.py` | `/nutrition-log` | nutrition |
| `routers/meal_plan.py` | `/meal-plan` | meal_plan |
| `routers/foods.py` | `/foods` | foods |
| `routers/grocery_list.py` | `/grocery-list` | grocery_list |
| `routers/waste_log.py` | `/waste-log` | waste_log |
| `routers/family.py` | `/family` | family |
| `routers/locations.py` | `/locations` | locations |
| (main.py) | `/health` | — |

---

## All Endpoints

### Health

| Method | Path | Status | Response |
|--------|------|--------|----------|
| GET | `/health` | 200 | `{status: "ok", message: "..."}` |

---

### Profile (`routers/profile.py`)

| Method | Path | Status | Request Body | Response |
|--------|------|--------|--------------|----------|
| GET | `/profile` | 200/404 | — | `UserProfile` or 404 |
| POST | `/profile` | 201 | `UserProfileCreate` | `UserProfile` |
| PUT | `/profile` | 200 | `UserProfileUpdate` | `UserProfile` |

**Notes:**
- Single-user app; only one profile row is assumed
- `health_conditions`, `food_preferences`, `disliked_foods`, `allergies` stored as JSON arrays in TEXT columns
- `custom_macros` stored as JSON object in TEXT column (used when `macro_strategy = "custom"`)

---

### Inventory (`routers/inventory.py`)

| Method | Path | Status | Request Body | Response |
|--------|------|--------|--------------|----------|
| GET | `/inventory` | 200 | — | `InventoryItem[]` |
| POST | `/inventory` | 201 | `InventoryItemCreate` | `InventoryItem` |
| GET | `/inventory/urgent` | 200 | — | `UrgentItem[]` (sorted by expiration risk) |
| GET | `/inventory/{id}` | 200/404 | — | `InventoryItem` |
| PUT | `/inventory/{id}` | 200/404 | `InventoryItemUpdate` | `InventoryItem` |
| DELETE | `/inventory/{id}` | 200/404 | — | `{message: "..."}` |
| POST | `/inventory/{id}/discard` | 200/404 | `{reason, quantity?}` | `{message, waste_log_id}` |
| GET | `/inventory/search` | 200 | query params: `q`, `location_id?` | `InventoryItem[]` |

**Notes:**
- `discard` creates a `WasteLog` entry and hard-deletes the inventory row
- `urgent` items are those with `expiration_risk` = HIGH or CRITICAL (calculated by `expiration_engine`)
- `search` filters by item name (substring) and optional location

---

### Nutrition Log (`routers/nutrition.py` / `routers/nutrition_log.py`)

| Method | Path | Status | Request Body | Response |
|--------|------|--------|--------------|----------|
| GET | `/nutrition-log/today` | 200 | — | `NutritionLogResponse` |
| POST | `/nutrition-log/meal` | 200 | `MealLogCreate` | `NutritionLogResponse` |
| DELETE | `/nutrition-log/meal/{id}` | 200/404 | — | `NutritionLogResponse` |
| POST | `/nutrition-log/manual` | 200 | `ManualMealLog` | `NutritionLogResponse` |
| GET | `/nutrition-log/analysis/today` | 200 | — | `NutritionAnalysisResponse` |

**`NutritionLogResponse` shape:**
```json
{
  "date": "2026-06-21",
  "target": {"calories": 2000, "protein_g": 150, "carbs_g": 250, "fat_g": 67, "bmr": 1600, "tdee": 2000},
  "consumed": {"calories": 800, ...},
  "remaining": {"calories": 1200, ...},
  "progress": {"calories_pct": 40.0, "protein_pct": 35.0, ...},
  "meals": [...],
  "warnings": []
}
```

**`MealLogCreate` fields:** `meal_type`, `meal_name`, `calories`, `protein_g`, `carbs_g`, `fat_g`, `ingredients_used[]`, `source?`, `notes?`

**Notes:**
- `logMeal` deducts inventory quantities per `ingredients_used`; uses `unit_converter` for mass conversions
- `deleteMealLog` reverses macro aggregates but does NOT restore inventory quantities
- Daily log auto-creates if it doesn't exist (uses today's date server-side)

---

### Meal Plan (`routers/meal_plan.py`)

| Method | Path | Status | Request Body | Response |
|--------|------|--------|--------------|----------|
| GET | `/meal-plan/today` | 200/404 | — | `MealPlanResponse` |

**`MealPlanResponse` shape:**
```json
{
  "meals": [
    {
      "meal_type": "breakfast",
      "meal_name": "Scrambled Eggs",
      "score": 87.5,
      "score_breakdown": {"urgency": 25, "protein_gap": 18, ...},
      "ingredients": [{"name": "eggs", "quantity": 2, "unit": "count"}],
      "estimated_calories": 350,
      "estimated_protein_g": 28,
      "reason": "Uses expiring eggs; high protein"
    }
  ],
  "total_planned": {"calories": 1800, "protein_g": 120, ...}
}
```

**Notes:**
- Requires profile to be set; returns 404 if no profile
- Calls `generate_meal_plan()` from `services/meal_planner.py`
- Selects top-scoring meal per slot (breakfast, lunch, dinner, snack)

---

### Foods (`routers/foods.py`)

| Method | Path | Status | Request Body | Response |
|--------|------|--------|--------------|----------|
| GET | `/foods` | 200 | — | `FoodItem[]` (all 40+ entries) |
| GET | `/foods/search` | 200 | query: `q` | `FoodItem[]` (fuzzy match) |

**Notes:**
- Food database is hard-coded in `services/food_database.py` (40+ entries)
- Fuzzy search uses substring matching on item name
- Returns nutrition per 100g; frontend assumes 150g serving

---

### Grocery List (`routers/grocery_list.py`)

| Method | Path | Status | Request Body | Response |
|--------|------|--------|--------------|----------|
| GET | `/grocery-list/weekly` | 200/404 | — | `GroceryListResponse` |
| POST | `/family/grocery-list/weekly` | 200 | `{member_keys, days_at_home}` | `FamilyGroceryListResponse` |

**`GroceryListResponse` shape:**
```json
{
  "items": [
    {"name": "chicken breast", "priority": "high", "reason": "running low; used in 3 meals", "estimated_weekly_qty": 600, "unit": "g"}
  ],
  "week_summary": "...",
  "generated_at": "2026-06-21"
}
```

**`FamilyGroceryListResponse` shape:**
```json
{
  "items": [...],
  "household_nutrition_summary": {
    "combined_weekly_targets": {"calories": 14000, "protein_g": 700, ...},
    "individual_weekly_needs": {
      "member_key_1": {"name": "Alice", "days_at_home": 5, "weekly_calories": 10000, ...}
    },
    "all_excluded_foods": ["dairy", "nuts"]
  },
  "member_specific_notes": ["Alice needs dairy-free options", "..."]
}
```

---

### Waste Log (`routers/waste_log.py`)

| Method | Path | Status | Request Body | Response |
|--------|------|--------|--------------|----------|
| GET | `/waste-log` | 200 | — | `WasteLogEntry[]` |

**Notes:**
- Entries created by `POST /inventory/{id}/discard`
- Each entry includes: `item_name`, `quantity`, `unit`, `reason`, `estimated_calories_wasted`, `discarded_at`

---

### Family (`routers/family.py`)

| Method | Path | Status | Request Body | Response |
|--------|------|--------|--------------|----------|
| GET | `/family` | 200 | — | `HouseholdResponse` (household + members) |
| GET | `/family/members` | 200 | — | `FamilyMember[]` |
| POST | `/family/members` | 201 | `FamilyMemberCreate` | `FamilyMember` |
| PUT | `/family/members/{id}` | 200/404 | `FamilyMemberUpdate` | `FamilyMember` |
| DELETE | `/family/members/{id}` | 200/404 | — | `{message}` |
| POST | `/family/meal-plan/today` | 200 | `{member_keys: string[]}` | `FamilyMealPlanResponse` |
| POST | `/family/grocery-list/weekly` | 200 | `{member_keys, days_at_home}` | `FamilyGroceryListResponse` |
| GET | `/family/schedule` | 200 | — | `Schedule` (2×3 grid) |
| PUT | `/family/schedule` | 200 | `ScheduleUpdateRequest` | `{message}` |

**`Schedule` shape:**
```json
{
  "weekday":         {"breakfast": ["alice","bob"], "lunch": ["alice"], "dinner": ["alice","bob"]},
  "weekend_holiday": {"breakfast": ["alice","bob"], "lunch": ["alice","bob"], "dinner": ["alice","bob"]}
}
```

**Notes:**
- `DELETE /family/members/{id}` also removes deleted member's key from all schedule slots before deleting
- `PUT /family/schedule` upserts (insert or update) per slot; ignores unknown schedule/meal types
- `_get_or_create_household(db)` ensures a household row exists before any family operation

---

### Locations (`routers/locations.py`)

| Method | Path | Status | Request Body | Response |
|--------|------|--------|--------------|----------|
| GET | `/locations` | 200 | — | `StorageLocation[]` (flat list) |
| GET | `/locations/tree` | 200 | — | `LocationNode[]` (nested tree) |
| POST | `/locations` | 201 | `LocationCreate` | `StorageLocation` |
| PUT | `/locations/{id}` | 200/404 | `LocationUpdate` | `StorageLocation` |
| DELETE | `/locations/{id}` | 200/404 | — | `{message}` |

**Notes:**
- Locations form a hierarchy via `parent_id` (adjacency list)
- Tree endpoint recursively builds the nested structure
- Examples: Fridge → Fridge Door, Fridge → Top Shelf; Pantry → Canned Goods

---

## Domain Services

All services live in `backend/app/services/`.

| Service | File | Responsibility |
|---------|------|---------------|
| Nutrition Engine | `nutrition_engine.py` | BMR/TDEE calculation, macro targets, health condition adjustments |
| Expiration Engine | `expiration_engine.py` | Expiration risk scoring (OK/MEDIUM/HIGH/CRITICAL) |
| Health Constraint Engine | `health_constraint_engine.py` | Constraint checking against profile conditions |
| Meal Planner | `meal_planner.py` | Orchestrates meal plan generation |
| Meal Scorer | `meal_scorer.py` | 8-component scoring (0–100 scale) |
| Meal Templates | `meal_templates.py` | 20 fixed meal template definitions |
| Food Database | `food_database.py` | 40+ food entries with per-100g nutrition data |
| Unit Converter | `unit_converter.py` | Mass unit conversion; blocks discrete unit conversion |

---

## Schemas (Pydantic v2)

**Directory:** `backend/app/schemas/`

| Schema file | Key models |
|-------------|-----------|
| `user.py` | `UserProfileCreate`, `UserProfileUpdate`, `UserProfile` |
| `inventory.py` | `InventoryItemCreate`, `InventoryItemUpdate`, `InventoryItem`, `UrgentItem` |
| `nutrition_log.py` | `MealLogCreate`, `ManualMealLog`, `NutritionLogResponse`, `NutritionAnalysisResponse` |
| `household.py` | `FamilyMemberCreate`, `FamilyMemberUpdate`, `FamilyMember`, `HouseholdResponse`, `ScheduleUpdateRequest` |
| `location.py` | `LocationCreate`, `LocationUpdate`, `StorageLocation`, `LocationNode` |

---

## QA Script

**File:** `backend/qa_check.py`  
**Run command:** `cd backend && source ../venv/bin/activate && python qa_check.py`  
**Requires:** FastAPI server running on port 8000

**38 test sections, 231 assertions total (Week 6):**

| Section | Topic | Assertions |
|---------|-------|-----------|
| 1 | Health check | ~2 |
| 2 | Profile CRUD | ~8 |
| 3 | Food database search | ~6 |
| 4 | Inventory CRUD + urgent sorting | ~12 |
| 5 | Calorie math (Mifflin-St Jeor) | ~6 |
| 6 | Meal plan generation | ~8 |
| 7 | Mark-as-eaten macro update | ~6 |
| 8 | lb → g inventory deduction | ~6 |
| 9 | Unit converter | ~8 |
| 10 | Preference fields persisted | ~6 |
| 11 | Meal scoring (score + breakdown) | ~8 |
| 12 | Grocery list structure + priority | ~6 |
| 13 | Discard flow + waste log | ~8 |
| 14–34 | Family, locations, household planning | ~97 |
| 35 | GET /family/schedule structure | 6 |
| 36 | PUT /family/schedule + persistence | 8 |
| 37 | DELETE member removes from schedule | 4 |
| 38 | Family grocery days_at_home + nutrition summary | 6 |

**Result:** All 231/231 assertions pass on a clean server start.

---

## Seed Script

**File:** `backend/seed.py`  
**Run command:** `cd backend && source ../venv/bin/activate && python seed.py`  

Populates the database with:
- Sample user profile
- ~15 inventory items (various expiration dates, units, and categories)
- Sample family members
- Sample storage locations

Use after first run to have demo-ready data.
