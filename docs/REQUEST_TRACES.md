# NutriFridge AI — Request Traces

Step-by-step traces for 10 key request flows. Each trace starts at the browser and follows every layer down to storage.

---

## Flow 1: Dashboard Initial Load

**Trigger:** User navigates to `/dashboard`

```
Browser → GET /dashboard (Next.js App Router)
  └─ Next.js renders <DashboardPage> ("use client")
      └─ useEffect fires on mount
          └─ Promise.all([
               fetchNutritionLog(),        → FastAPI GET /nutrition-log/today
               fetchMealPlan(),            → FastAPI GET /meal-plan/today
               fetchUrgentItems(),         → FastAPI GET /inventory/urgent
               fetchGroceryList(),         → FastAPI GET /grocery-list/weekly
               fetchWasteLog(),            → FastAPI GET /waste-log
               fetchNutritionAnalysis(),   → FastAPI GET /nutrition-log/analysis/today
               fetchFamily(),              → FastAPI GET /family
               fetchFamilySchedule(),      → FastAPI GET /family/schedule
               checkBackendHealth(),       → FastAPI GET /health
             ])
```

**For `GET /nutrition-log/today`:**
```
FastAPI router/nutrition.py
  ├─ db.query(DailyLog).filter_by(date=today).first()
  │   └─ If not found → create with targets from nutrition_engine.calculate_nutrition_target(profile)
  ├─ db.query(MealLog).filter_by(daily_log_id=log.id).all()
  └─ Returns NutritionLogResponse {date, target, consumed, remaining, progress, meals, warnings}

SQLite: SELECT FROM daily_logs WHERE date=? / INSERT INTO daily_logs / SELECT FROM meal_logs WHERE daily_log_id=?
```

**For `GET /meal-plan/today`:**
```
FastAPI routers/meal_plan.py
  ├─ Load profile (db.query(User).first())
  ├─ Load all inventory (db.query(InventoryItem).all())
  ├─ Load today's daily_log (same as above)
  ├─ Call generate_meal_plan(profile, inventory, daily_log)
  │   └─ For each meal_type:
  │       ├─ Get templates for type
  │       ├─ Score each template (meal_scorer.score_meal)
  │       └─ Select top-scoring meal
  └─ Returns MealPlanResponse {meals[], total_planned}

SQLite: SELECT FROM users / SELECT FROM inventory / SELECT FROM daily_logs
```

**Total network calls from browser:** 9 parallel requests to FastAPI

---

## Flow 2: Mark Meal as Eaten

**Trigger:** User clicks "Mark as Eaten" button on a recommended meal

```
Browser UI → onClick → logMeal({ meal_type, meal_name, calories, protein_g, carbs_g, fat_g, ingredients_used })
  └─ api.ts: POST /nutrition-log/meal
      └─ Body: { meal_type: "lunch", meal_name: "Chicken Salad", calories: 420,
                 protein_g: 35, carbs_g: 20, fat_g: 18,
                 ingredients_used: [{"name": "chicken breast", "quantity": 150, "unit": "g"}] }
```

```
FastAPI routers/nutrition.py → log_meal(payload, db)
  ├─ Load or create DailyLog for today
  ├─ Create MealLog record → INSERT INTO meal_logs
  ├─ Update DailyLog consumed totals:
  │   consumed_calories += 420
  │   consumed_protein_g += 35
  │   consumed_carbs_g += 20
  │   consumed_fat_g += 18
  ├─ For each ingredient in ingredients_used:
  │   ├─ db.query(InventoryItem).filter_by(name="chicken breast").first()
  │   ├─ unit_converter.deduct_quantity(item.quantity, item.unit, 150, "g")
  │   │   → Returns (item.quantity - 150, None)  [if units match or both mass]
  │   └─ item.quantity = new_quantity → UPDATE inventory SET quantity=?
  └─ Returns updated NutritionLogResponse

SQLite: INSERT meal_logs / UPDATE daily_logs / SELECT inventory / UPDATE inventory
```

**Frontend after success:**
```
setNutritionLog(response)   → progress bars update
setMarkMsg("Lunch logged!")
setMarkMsgId(response.meals[last].id)   → shows Undo button
```

---

## Flow 3: Undo Mark as Eaten

**Trigger:** User clicks "Undo" button (within same session, before page reload)

```
Browser UI → onClick → deleteMealLog(markMsgId)
  └─ api.ts: DELETE /nutrition-log/meal/{id}
```

```
FastAPI routers/nutrition.py → delete_meal_log(id, db)
  ├─ Load MealLog by id (404 if not found)
  ├─ Load DailyLog for same date
  ├─ Reverse macro aggregates:
  │   consumed_calories -= meal.calories
  │   consumed_protein_g -= meal.protein_g
  │   [etc.]
  ├─ DELETE FROM meal_logs WHERE id=?
  └─ Returns updated NutritionLogResponse

IMPORTANT: Inventory quantities are NOT restored.
SQLite: SELECT meal_logs / UPDATE daily_logs / DELETE meal_logs
```

---

## Flow 4: Add Inventory Item (with Food Database Auto-fill)

**Trigger:** User types "eggs" in the "Add Item" form on `/inventory`

```
Browser UI → onChange on name field → searchFoods("eggs")
  └─ api.ts: GET /foods/search?q=eggs
      └─ FastAPI routers/foods.py → food_database.search_foods("eggs")
          └─ [{"name": "Eggs", "calories_per_100g": 155, "protein_per_100g": 13, ...}]

Browser UI → user clicks "Eggs" suggestion → auto-fills nutrition fields

User fills: quantity=12, unit="count", expiration_date="2026-07-01"
User clicks "Add" → createInventoryItem({name, quantity, unit, ..., calories_per_100g})
  └─ api.ts: POST /inventory
      └─ FastAPI routers/inventory.py
          ├─ Validate with InventoryItemCreate schema (Pydantic)
          ├─ INSERT INTO inventory VALUES (...)
          └─ Returns InventoryItem {id, name, quantity, unit, expiration_date, ...}

Browser: refreshes inventory list → fetchInventory()
```

---

## Flow 5: Family Schedule Save

**Trigger:** User edits meal attendance checkboxes on `/family` and clicks "Save Schedule"

```
Browser UI → scheduleTab = "weekday"
User checks "alice" for dinner on weekday

State: schedule.weekday.dinner = ["alice", "bob"]

User clicks "Save Schedule" → saveSchedule()
  └─ updateFamilySchedule({ schedule: { weekday: { breakfast: [], lunch: ["alice"], dinner: ["alice", "bob"] },
                                        weekend_holiday: { ... } } })
      └─ api.ts: PUT /family/schedule
          └─ Body: { schedule: { weekday: {...}, weekend_holiday: {...} } }
```

```
FastAPI routers/family.py → update_schedule(payload, db)
  ├─ _get_or_create_household(db)
  ├─ For each (schedule_type, meal_type, member_keys) in payload.schedule:
  │   ├─ db.query(HouseholdMealSchedule).filter_by(household_id, schedule_type, meal_type).first()
  │   ├─ If found: UPDATE SET selected_member_keys = json.dumps(member_keys)
  │   └─ If not found: INSERT INTO household_meal_schedules (...)
  ├─ db.commit()
  └─ Returns {"message": "Schedule updated successfully"}

SQLite: SELECT household_meal_schedules / UPDATE or INSERT / COMMIT
```

---

## Flow 6: Grocery List with Family Schedule

**Trigger:** User navigates to `/grocery-list`

```
Browser → GET /grocery-list (Next.js)
  └─ useEffect on mount:
      └─ Promise.all([
           fetchGroceryList(),      → FastAPI GET /grocery-list/weekly
           fetchFamilySchedule(),   → FastAPI GET /family/schedule
         ])
```

```
FastAPI GET /family/schedule:
  ├─ SELECT FROM households / household_meal_schedules
  └─ Returns { weekday: {breakfast: [], lunch: ["alice"], dinner: ["alice","bob"]},
               weekend_holiday: {breakfast: ["alice","bob"], ...} }
```

**After schedule loads:**
```
Frontend:
  collectMemberKeys(schedule)  → ["alice", "bob"]
  computeDaysAtHome(schedule, holidayMode=false):
    alice in weekday? yes → 5 days
    alice in weekend? yes → +2 days  → total 7
    bob in weekday? yes → 5 days
    bob in weekend? yes → +2 days    → total 7

  → fetchFamilyGroceryList(["alice", "bob"], {alice: 7, bob: 7})
      └─ api.ts: POST /family/grocery-list/weekly
          └─ Body: { member_keys: ["alice", "bob"], days_at_home: {alice: 7, bob: 7} }

FastAPI routers/grocery_list.py:
  ├─ For each member_key: load FamilyMember, calculate weekly needs
  ├─ Aggregate combined_weekly_targets
  ├─ Collect all_excluded_foods (union of all allergens + health exclusions)
  ├─ Generate grocery items (priority-ranked)
  └─ Returns FamilyGroceryListResponse {items, household_nutrition_summary, member_specific_notes}
```

---

## Flow 7: Delete Family Member (with Schedule Cleanup)

**Trigger:** User clicks "Delete" on a family member card

```
Browser UI → confirm dialog → deleteFamilyMember(memberId)
  └─ api.ts: DELETE /family/members/{id}
```

```
FastAPI routers/family.py → delete_member(id, db)
  ├─ member = db.query(FamilyMember).filter_by(id=id).first()
  │   └─ 404 if not found
  │
  ├─ [Schedule cleanup — before delete]
  │   ├─ Load all HouseholdMealSchedule rows for this household
  │   ├─ For each slot:
  │   │   └─ keys = json.loads(slot.selected_member_keys)
  │   │       if member.member_key in keys:
  │   │           keys.remove(member.member_key)
  │   │           slot.selected_member_keys = json.dumps(keys)
  │   └─ db.flush()  (write schedule updates before member delete)
  │
  ├─ db.delete(member)
  ├─ db.commit()
  └─ Returns {"message": "Member deleted"}

SQLite: SELECT family_members / SELECT+UPDATE household_meal_schedules / DELETE family_members
```

**Frontend after success:**
```
refreshSchedule()  → fetchFamilySchedule() — verifies server-side cleanup
refreshMembers()   → fetchFamily()
```

---

## Flow 8: Food Card "Eaten" Checkbox (Family Food Plan)

**Trigger:** User checks "Eaten" on an ingredient card in the Household Food Plan

```
Browser UI → handleEaten(meal, ingredient)
  └─ logMeal({
       meal_type: meal.meal_type,
       meal_name: ingredient.name,  // single ingredient, not whole recipe
       calories: ingredient.calories,
       protein_g: ingredient.protein_g,
       carbs_g: ingredient.carbs_g,
       fat_g: ingredient.fat_g,
       ingredients_used: [{ name: ingredient.name, quantity: ingredient.quantity, unit: ingredient.unit }],
       source: "family_food_card"
     })
      └─ api.ts: POST /nutrition-log/meal
```

```
FastAPI: (same as Flow 2)
  ├─ Creates MealLog (meal_name = ingredient name, not recipe)
  ├─ Updates DailyLog macros
  ├─ Deducts ingredient from inventory
  └─ Returns NutritionLogResponse with new meal log id

Browser:
  setEatenState(key, { logId: response.meals.last.id, loading: false })
  → Shows "Undo" button on that ingredient card
```

**Undo:**
```
handleUndoEaten(key) → deleteMealLog(eatenState[key].logId)
  └─ DELETE /nutrition-log/meal/{id}
  └─ Clears eatenState[key]
  Note: inventory NOT restored (same limitation as Flow 3)
```

---

## Flow 9: Nutrition Analysis

**Trigger:** Dashboard or analysis component calls `fetchNutritionAnalysis()`

```
api.ts: GET /nutrition-log/analysis/today
```

```
FastAPI routers/nutrition.py → get_analysis(db)
  ├─ Load profile
  ├─ Load today's DailyLog + MealLogs
  ├─ Calculate target via nutrition_engine.calculate_nutrition_target(profile)
  ├─ Compute remaining macros
  ├─ Check health constraint warnings:
  │   for each health condition:
  │       check if consumed macro exceeds condition-specific threshold
  │       → generate warning string if over
  └─ Returns NutritionAnalysisResponse:
      {
        consumed: {calories, protein_g, carbs_g, fat_g},
        target: {calories, protein_g, carbs_g, fat_g},
        remaining: {...},
        macro_status: {calories: "ON_TRACK", protein_g: "UNDER", ...},
        health_warnings: ["Carb intake exceeds diabetic threshold"],
        recommendation: "Consider reducing carbohydrates at dinner",
        disclaimer: "This is not medical advice. Consult a registered dietitian."
      }
```

**`macro_status` values:** `UNDER` / `ON_TRACK` / `OVER`

---

## Flow 10: Java Async Meal Plan Job (Not Active — Architecture Demo)

**Status:** Implemented and tested; not called from frontend or FastAPI in production

```
Hypothetical client → POST /api/v1/meal-plans/jobs   (Spring Boot :8080)
  Body: { profile: {...}, baseTarget: {...}, consumed: {...} }
```

```
Java MealPlanController:
  ├─ MealPlanService.submitJob(request)
  │   ├─ Create MealPlanJob in PostgreSQL (status=PENDING)
  │   ├─ Submit Runnable to mealPlanExecutor (ThreadPoolTaskExecutor, 4–8 threads)
  │   └─ Return jobId immediately
  └─ HTTP 202 Accepted
      Body: { jobId: "uuid", status: "PENDING", ... }
      Location: /api/v1/meal-plans/jobs/{jobId}

Background thread (mealPlanExecutor):
  ├─ UPDATE meal_plan_jobs SET status='RUNNING'
  ├─ FastApiNutritionClient.getInventoryItems()
  │   └─ WebClient GET http://localhost:8000/inventory
  │       └─ Retry up to 3× with exponential backoff on transient errors
  │       └─ onErrorReturn(List.of()) — graceful degradation if FastAPI down
  ├─ HealthConstraintService.adjustTargets(baseTarget, profile)
  │   └─ Applies all matching @Component policies
  ├─ Build meal suggestions
  ├─ UPDATE meal_plan_jobs SET status='SUCCEEDED', result_json='...'
  └─ Commit

Client polls: GET /api/v1/meal-plans/jobs/{jobId}   (Spring Boot :8080)
  ├─ MealPlanJobRepository.findById(jobId)
  └─ Returns { jobId, status: "SUCCEEDED", result: {...} }
```

**Concurrency failure scenario:**
```
Two threads attempt to deduct same inventory item simultaneously:

Thread A: findByIdForUpdate(itemId)  → acquires PESSIMISTIC_WRITE lock
Thread B: findByIdForUpdate(itemId)  → BLOCKED until Thread A releases

Thread A: item.quantity -= 100
Thread A: saveAndFlush() → @Version = 2 → COMMIT → releases lock

Thread B: unblocked → reads item (quantity already reduced by Thread A)
Thread B: item.quantity -= 50
Thread B: saveAndFlush() → @Version check: DB has version=2, entity has version=1
  → ObjectOptimisticLockingFailureException
  → Caught → throw InventoryConflictException
  → GlobalExceptionHandler → HTTP 409 Conflict
  → Client retries
```
