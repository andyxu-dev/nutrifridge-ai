# NutriFridge AI — Data Model

---

## FastAPI / SQLite Database (`nutrifridge.db`)

All models live in `backend/app/models/`. Tables are created automatically via `Base.metadata.create_all()` on app startup. No migration files — schema changes require dropping the DB in development.

---

### `users` table

**Model file:** `backend/app/models/user.py`  
**ORM class:** `User`

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | Auto-increment |
| `age` | Integer | Years |
| `sex` | String | `"male"` / `"female"` |
| `weight_kg` | Float | Body weight in kilograms |
| `height_cm` | Float | Height in centimetres |
| `activity_level` | String | `sedentary` / `lightly_active` / `moderately_active` / `very_active` / `extra_active` |
| `goal` | String | `lose` / `maintain` / `gain` |
| `health_conditions` | Text | JSON array, e.g. `["fatty_liver", "diabetes"]` |
| `food_preferences` | Text | JSON array of preferred food names |
| `disliked_foods` | Text | JSON array of disliked food names |
| `allergies` | Text | JSON array of allergen names |
| `cuisine_preference` | String | e.g. `"Asian"` / `"Mediterranean"` |
| `diet_style` | String | e.g. `"high_protein"` / `"vegetarian"` |
| `macro_strategy` | String | `"balanced"` / `"high_protein"` / `"low_carb"` / `"low_fat"` / `"custom"` |
| `custom_macros` | Text | JSON object `{calories, protein_g, carbs_g, fat_g}` — used when `macro_strategy = "custom"` |

**Assumptions:** Single-row table (one user). Multi-user requires authentication layer.

---

### `inventory` table

**Model file:** `backend/app/models/inventory.py`  
**ORM class:** `InventoryItem`

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `name` | String | Item name, e.g. `"chicken breast"` |
| `quantity` | Float | Current quantity |
| `unit` | String | `g` / `kg` / `lb` / `oz` / `count` / `bag` / `cup` / `ml` / `l` |
| `expiration_date` | String | ISO date string `"YYYY-MM-DD"` or null |
| `calories_per_100g` | Float | Null if unknown |
| `protein_per_100g` | Float | |
| `carbs_per_100g` | Float | |
| `fat_per_100g` | Float | |
| `category` | String | e.g. `"protein"` / `"vegetable"` / `"grain"` / `"dairy"` |
| `storage_type` | String | `"fridge"` / `"freezer"` / `"pantry"` |
| `location_id` | Integer FK | → `storage_locations.id` (nullable) |
| `added_at` | String | ISO timestamp |
| `updated_at` | String | ISO timestamp |

**Computed (not stored):** `expiration_risk` — derived by `expiration_engine.py` at query time:
- `OK` — more than 7 days remaining
- `MEDIUM` — 3–7 days remaining
- `HIGH` — 1–2 days remaining
- `CRITICAL` — expired or today

---

### `daily_logs` table

**Model file:** `backend/app/models/nutrition_log.py`  
**ORM class:** `DailyLog`

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `date` | String | ISO date `"YYYY-MM-DD"` (unique per day) |
| `target_calories` | Float | Calculated from profile via `nutrition_engine` |
| `target_protein_g` | Float | |
| `target_carbs_g` | Float | |
| `target_fat_g` | Float | |
| `consumed_calories` | Float | Running sum of logged meals |
| `consumed_protein_g` | Float | |
| `consumed_carbs_g` | Float | |
| `consumed_fat_g` | Float | |
| `bmr` | Float | Mifflin-St Jeor BMR |
| `tdee` | Float | BMR × activity multiplier |

**Behavior:** Auto-created on first meal log of the day. Targets are recalculated from current profile each time a log is fetched.

---

### `meal_logs` table

**Model file:** `backend/app/models/nutrition_log.py`  
**ORM class:** `MealLog`

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `daily_log_id` | Integer FK | → `daily_logs.id` |
| `meal_type` | String | `"breakfast"` / `"lunch"` / `"dinner"` / `"snack"` |
| `meal_name` | String | Display name |
| `calories` | Float | |
| `protein_g` | Float | |
| `carbs_g` | Float | |
| `fat_g` | Float | |
| `ingredients_used` | Text | JSON array of `{name, quantity, unit}` objects |
| `source` | String | `"meal_plan"` / `"manual"` / `"family_food_card"` |
| `notes` | String | Optional free text |
| `created_at` | String | ISO timestamp |

**Deletion behavior:** Deleting a `MealLog` reverses macro totals in `daily_logs` but does NOT restore inventory quantities.

---

### `waste_logs` table

**Model file:** `backend/app/models/waste_log.py`  
**ORM class:** `WasteLog`

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `item_name` | String | Name of discarded item |
| `quantity` | Float | Amount discarded |
| `unit` | String | Unit of measure |
| `reason` | String | `"expired"` / `"spoiled"` / `"unwanted"` / `"used"` |
| `estimated_calories_wasted` | Float | Based on `calories_per_100g` × quantity |
| `discarded_at` | String | ISO timestamp |

**Created by:** `POST /inventory/{id}/discard` — also hard-deletes the inventory row.

---

### `households` table

**Model file:** `backend/app/models/household.py`  
**ORM class:** `Household`

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `name` | String | Household display name |
| `created_at` | String | ISO timestamp |

**Behavior:** Auto-created via `_get_or_create_household(db)` on first family API call.

---

### `family_members` table

**Model file:** `backend/app/models/household.py`  
**ORM class:** `FamilyMember`

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `household_id` | Integer FK | → `households.id` CASCADE DELETE |
| `name` | String | Display name |
| `member_key` | String | URL-safe unique key (e.g. `"alice_smith"`) |
| `age` | Integer | |
| `sex` | String | `"male"` / `"female"` |
| `weight_kg` | Float | |
| `height_cm` | Float | |
| `activity_level` | String | Same values as `users.activity_level` |
| `goal` | String | `"lose"` / `"maintain"` / `"gain"` |
| `health_conditions` | Text | JSON array |
| `food_preferences` | Text | JSON array |
| `disliked_foods` | Text | JSON array |
| `allergies` | Text | JSON array |
| `diet_style` | String | |
| `created_at` | String | ISO timestamp |

**Used by:** Family meal plan, family grocery list, meal schedule.

---

### `household_meal_schedules` table

**Model file:** `backend/app/models/household.py`  
**ORM class:** `HouseholdMealSchedule`  
**Added:** Week 6

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `household_id` | Integer FK | → `households.id` CASCADE DELETE |
| `schedule_type` | String | `"weekday"` or `"weekend_holiday"` |
| `meal_type` | String | `"breakfast"` / `"lunch"` / `"dinner"` |
| `selected_member_keys` | Text | JSON array of member key strings, e.g. `["alice", "bob"]` |
| `created_at` | String | ISO timestamp |
| `updated_at` | String | ISO timestamp |

**Valid combinations:** 2 schedule types × 3 meal types = 6 possible rows per household.

**Behavior:**
- `PUT /family/schedule` upserts rows; unknown `schedule_type` / `meal_type` values are ignored
- When a member is deleted, their key is removed from `selected_member_keys` in all rows (server-side, before deleting the member)

---

### `storage_locations` table

**Model file:** `backend/app/models/location.py`  
**ORM class:** `StorageLocation`

| Column | Type | Notes |
|--------|------|-------|
| `id` | Integer PK | |
| `name` | String | Display name, e.g. `"Fridge Door"` |
| `location_type` | String | `"fridge"` / `"freezer"` / `"pantry"` / `"shelf"` / `"custom"` |
| `parent_id` | Integer FK | → `storage_locations.id` (nullable) — adjacency list |
| `description` | String | Optional |
| `created_at` | String | ISO timestamp |

**Hierarchy pattern (adjacency list):**
```
Fridge (id=1, parent=None)
├── Fridge Door (id=2, parent=1)
├── Top Shelf (id=3, parent=1)
└── Crisper (id=4, parent=1)

Pantry (id=5, parent=None)
└── Canned Goods (id=6, parent=5)
```

**Tree endpoint:** `GET /locations/tree` recursively builds nested `LocationNode` objects.

---

## Relationships Summary

```
Household (1)
  ├─── (n) FamilyMember
  └─── (n) HouseholdMealSchedule

DailyLog (1)
  └─── (n) MealLog

StorageLocation (1)  [self-referential via parent_id]
  └─── (n) InventoryItem [via location_id, nullable]

User (1) [standalone — no FK relationships]
WasteLog (standalone — no FK to inventory after discard)
```

---

## JSON Columns Detail

Several columns store JSON as TEXT (SQLite has no native JSON type):

| Table | Column | JSON Shape |
|-------|--------|-----------|
| `users` | `health_conditions` | `["fatty_liver", "diabetes"]` |
| `users` | `food_preferences` | `["chicken", "broccoli"]` |
| `users` | `disliked_foods` | `["liver", "brussels_sprouts"]` |
| `users` | `allergies` | `["nuts", "shellfish"]` |
| `users` | `custom_macros` | `{"calories": 2000, "protein_g": 150, "carbs_g": 200, "fat_g": 67}` |
| `family_members` | `health_conditions` | `["diabetes"]` |
| `family_members` | `food_preferences` | `["fish", "salad"]` |
| `family_members` | `disliked_foods` | `[]` |
| `family_members` | `allergies` | `["gluten"]` |
| `meal_logs` | `ingredients_used` | `[{"name": "eggs", "quantity": 2, "unit": "count"}]` |
| `household_meal_schedules` | `selected_member_keys` | `["alice", "bob"]` |

**Parsing:** All JSON columns parsed via `json.loads()` in service/router code before use.

---

## Spring Boot / PostgreSQL Database (Java)

**Managed by:** Flyway (V1–V4 migration files)  
**Config:** `backend-java/src/main/resources/application.yml`

### `inventory_items` table

**JPA Entity:** `com.nutrifridge.core.domain.InventoryItem`

| Column | Type | Notes |
|--------|------|-------|
| `id` | BIGINT PK | Auto-increment |
| `name` | VARCHAR | |
| `quantity` | DOUBLE | |
| `unit` | VARCHAR | |
| `expiration_date` | DATE | |
| `calories_per_100g` | DOUBLE | |
| `protein_per_100g` | DOUBLE | |
| `carbs_per_100g` | DOUBLE | |
| `fat_per_100g` | DOUBLE | |
| `category` | VARCHAR | |
| `storage_type` | VARCHAR | |
| `version` | INTEGER | **Optimistic lock field** (`@Version`) — auto-incremented by JPA on each update |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | Updated via `@PreUpdate` lifecycle callback |

**Locking strategy:**
- `@Lock(PESSIMISTIC_WRITE)` on read (`findByIdForUpdate`) — exclusive row lock
- `@Version` on entity — detects lost updates; raises `ObjectOptimisticLockingFailureException` → HTTP 409

### `meal_plan_jobs` table

**JPA Entity:** `com.nutrifridge.core.domain.MealPlanJob`

| Column | Type | Notes |
|--------|------|-------|
| `id` | VARCHAR PK | UUID string (set in `@PrePersist`) |
| `status` | VARCHAR | `PENDING` / `RUNNING` / `SUCCEEDED` / `FAILED` |
| `result_json` | TEXT | Serialised meal plan result (populated on SUCCEEDED) |
| `error_message` | TEXT | Error detail (populated on FAILED) |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | Updated via `@PreUpdate` |

**Job lifecycle:** PENDING → RUNNING → SUCCEEDED or FAILED  
**Persistence:** Survives JVM restarts (PostgreSQL-backed)

### `daily_nutrition_logs` table

**JPA Entity:** `com.nutrifridge.core.domain.DailyNutritionLog`  
(Same logical structure as FastAPI's `daily_logs`; separate store)

### `meal_logs` table (Java)

**JPA Entity:** `com.nutrifridge.core.domain.MealLog`  
(Same logical structure as FastAPI's `meal_logs`; FK to `daily_nutrition_logs`)

### Flyway Migrations

| Version | File | Content |
|---------|------|---------|
| V1 | `V1__create_inventory_items.sql` | Creates `inventory_items` with indexes |
| V2 | `V2__create_daily_nutrition_logs.sql` | Creates `daily_nutrition_logs` |
| V3 | `V3__create_meal_logs.sql` | Creates `meal_logs` with FK |
| V4 | `V4__create_meal_plan_jobs.sql` | Creates `meal_plan_jobs` |

**Test DB:** H2 in-memory with PostgreSQL compatibility mode (`src/test/resources/application.properties`)
