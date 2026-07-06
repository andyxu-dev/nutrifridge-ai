# NutriFridge AI — Frontend Map

**Framework:** Next.js 14 (App Router)  
**Language:** TypeScript  
**Styling:** TailwindCSS  
**API Client:** Native `fetch` (no axios)

---

## Route Map

| Route | File | Description | Integration Status |
|-------|------|-------------|-------------------|
| `/` | `src/app/page.tsx` | Server-side redirect to `/dashboard` | Active |
| `/dashboard` | `src/app/dashboard/page.tsx` | Main hub: nutrition, meal plan, urgent items, attendance | Active |
| `/profile` | `src/app/profile/page.tsx` | User profile form (body metrics, preferences, nutrition targets) | Active |
| `/inventory` | `src/app/inventory/page.tsx` | Inventory management (add/edit/delete/discard items) | Active |
| `/grocery-list` | `src/app/grocery-list/page.tsx` | Weekly shopping recommendations (personal + family) | Active |
| `/family` | `src/app/family/page.tsx` | Household members, meal schedule editor, household food plan | Active |

---

## Page-by-Page Data Flow

### `/dashboard` — Dashboard

**File:** `frontend/src/app/dashboard/page.tsx`

**State:**
- `nutritionLog` — daily macro totals + meals logged today
- `mealPlan` — today's recommended meals
- `urgentItems` — inventory items expiring soon
- `groceryList` — weekly grocery recommendations
- `wasteLog` — recent discards
- `markMsg` — feedback message after marking a meal eaten
- `schedule` — household meal schedule (2×3 grid)
- `todayOverride` — ephemeral per-session attendance override

**Data fetched on mount (parallel):**
```
fetchNutritionLog()       → GET /nutrition-log/today
fetchMealPlan()           → GET /meal-plan/today
fetchUrgentItems()        → GET /inventory/urgent
fetchGroceryList()        → GET /grocery-list/weekly
fetchWasteLog()           → GET /waste-log
fetchNutritionAnalysis()  → GET /nutrition-log/analysis/today
fetchFamily()             → GET /family
fetchFamilySchedule()     → GET /family/schedule
checkBackendHealth()      → GET /health
```

**User interactions:**
- "Mark as Eaten" button → `logMeal()` → `POST /nutrition-log/meal` → refreshes nutrition log
- "Undo" button → `deleteMealLog(id)` → `DELETE /nutrition-log/meal/{id}` → refreshes
- "Log Manual Meal" → `logManualMeal()` → `POST /nutrition-log/manual`
- Today's Attendance checkboxes → ephemeral `todayOverride` (no API call; session-only)
- "Reset" link → clears `todayOverride`, falls back to schedule-derived defaults

**Helpers:**
- `todayScheduleType()` → `"weekday"` (Mon–Fri) or `"weekend_holiday"` (Sat–Sun)
- `defaultTodayMembers()` → union of all member keys across all meals for today's schedule type
- `todayMembers` → `todayOverride ?? defaultTodayMembers()`
- `toggleTodayMember(key)` → adds/removes from `todayOverride`

---

### `/profile` — Profile

**File:** `frontend/src/app/profile/page.tsx`

**Data fetched on mount:**
```
fetchProfile()  → GET /profile
```

**Form fields:** age, sex, weight (kg), height (cm), activity level, goal, health conditions (multi-select), food preferences, disliked foods, allergies, cuisine preference, diet style, macro strategy, custom macros (if strategy = "custom")

**Submit:** `createProfile()` (POST) or `updateProfile()` (PUT) → `POST|PUT /profile`

---

### `/inventory` — Inventory

**File:** `frontend/src/app/inventory/page.tsx`

**Data fetched on mount:**
```
fetchInventory()  → GET /inventory
fetchLocationsTree()  → GET /locations/tree
```

**User interactions:**
- Add item form → `createInventoryItem()` → `POST /inventory`
- Edit item → `updateInventoryItem(id, data)` → `PUT /inventory/{id}`
- Delete item → `deleteInventoryItem(id)` → `DELETE /inventory/{id}`
- Discard item → `discardInventoryItem(id, reason, qty)` → `POST /inventory/{id}/discard`
- Search/filter by location → `searchInventory(q, locationId)` → `GET /inventory/search`

**Display:** Cards or table view; expiration badge (expired/high/medium/ok); location label

---

### `/grocery-list` — Grocery List

**File:** `frontend/src/app/grocery-list/page.tsx`

**State:**
- `personalList` — personal weekly grocery list
- `familyList` — family grocery list (auto-fetched when schedule loads)
- `schedule` — household meal schedule
- `holidayMode` — Normal Week (weekday×5 + weekend×2) vs Holiday Week (all 7 weekend)

**Data fetched on mount:**
```
fetchGroceryList()      → GET /grocery-list/weekly
fetchFamilySchedule()   → GET /family/schedule
```

**Auto-trigger (on schedule load):**
```
fetchFamilyGroceryList(memberKeys, daysAtHome)  → POST /family/grocery-list/weekly
```

**Helpers:**
- `computeDaysAtHome(schedule, holidayMode)` → `Record<string, number>` (days per member)
  - Normal week: 5 weekday days + 2 weekend days (capped at 7)
  - Holiday week: 7 weekend_holiday days per member
- `collectMemberKeys(schedule)` → unique member keys across all schedule slots

**Renders:**
- Normal/Holiday Week toggle
- Family grocery list (when schedule has members):
  - Combined macro cards (weekly totals)
  - Per-member breakdown rows
  - Excluded foods pill badges
- Personal grocery list (always shown as secondary section)
- Footer link: "Edit Meal Schedule →" → `/family`

---

### `/family` — Family

**File:** `frontend/src/app/family/page.tsx`

**State:**
- `household` — household name and members list
- `members` — family member array
- `scheduleTab` — `"weekday"` | `"weekend_holiday"` (active tab in schedule editor)
- `schedule` — 2×3 grid (`Record<string, Record<string, string[]>>`)
- `familyPlan` — today's household food plan (per-member meal suggestions)
- `eatenState` — `{[key: string]: {logId?: number; loading: boolean}}`
- `expandedAlloc` — ingredient allocation expand/collapse state

**Data fetched on mount (parallel):**
```
fetchFamily()          → GET /family
fetchFamilySchedule()  → GET /family/schedule
```

**Meal schedule editor:**
- Two tabs: Weekday / Weekend & Holiday (Today badge marks current day type)
- Three rows: Breakfast / Lunch / Dinner
- Member checkboxes per cell
- Save → `updateFamilySchedule(schedule)` → `PUT /family/schedule`

**Household food plan:**
- Auto-generated on load if today has scheduled members
- `collectTodayMembers(schedule)` → union of member keys for today's slots
- `fetchFamilyMealPlan(memberKeys)` → `POST /family/meal-plan/today`
- Renders food-item cards (per ingredient, not per recipe)

**Food-item card interactions:**
- "Eaten" checkbox → `handleEaten(meal, ingredient)` → `logMeal({...singleIngredient})` → `POST /nutrition-log/meal`; stores `logId` for undo
- "Undo" → `handleUndoEaten(key)` → `deleteMealLog(logId)` → `DELETE /nutrition-log/meal/{id}`
- Expand allocation → shows per-member portion

**Member management:**
- Add member form → `createFamilyMember(data)` → `POST /family/members`
- Edit member → `updateFamilyMember(id, data)` → `PUT /family/members/{id}`
- Delete member → `deleteFamilyMember(id)` → `DELETE /family/members/{id}`; also refreshes schedule (deleted member removed from slots server-side)

---

## API Client Library

**File:** `frontend/src/lib/api.ts`

**Base URL resolution:**
```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
```

**All exported functions:**

| Function | HTTP | Path |
|----------|------|------|
| `checkBackendHealth()` | GET | `/health` |
| `fetchProfile()` | GET | `/profile` |
| `createProfile(data)` | POST | `/profile` |
| `updateProfile(data)` | PUT | `/profile` |
| `fetchInventory()` | GET | `/inventory` |
| `fetchUrgentItems()` | GET | `/inventory/urgent` |
| `createInventoryItem(data)` | POST | `/inventory` |
| `updateInventoryItem(id, data)` | PUT | `/inventory/{id}` |
| `deleteInventoryItem(id)` | DELETE | `/inventory/{id}` |
| `discardInventoryItem(id, reason, qty?)` | POST | `/inventory/{id}/discard` |
| `searchInventory(q, locationId?)` | GET | `/inventory/search` |
| `fetchNutritionLog()` | GET | `/nutrition-log/today` |
| `logMeal(data)` | POST | `/nutrition-log/meal` |
| `deleteMealLog(id)` | DELETE | `/nutrition-log/meal/{id}` |
| `logManualMeal(data)` | POST | `/nutrition-log/manual` |
| `fetchNutritionAnalysis()` | GET | `/nutrition-log/analysis/today` |
| `fetchMealPlan()` | GET | `/meal-plan/today` |
| `searchFoods(query)` | GET | `/foods/search?q=` |
| `fetchAllFoods()` | GET | `/foods` |
| `fetchGroceryList()` | GET | `/grocery-list/weekly` |
| `fetchWasteLog()` | GET | `/waste-log` |
| `fetchFamily()` | GET | `/family` |
| `fetchFamilyMembers()` | GET | `/family/members` |
| `createFamilyMember(data)` | POST | `/family/members` |
| `updateFamilyMember(id, data)` | PUT | `/family/members/{id}` |
| `deleteFamilyMember(id)` | DELETE | `/family/members/{id}` |
| `fetchFamilyMealPlan(memberKeys)` | POST | `/family/meal-plan/today` |
| `fetchFamilyGroceryList(keys, days)` | POST | `/family/grocery-list/weekly` |
| `fetchFamilySchedule()` | GET | `/family/schedule` |
| `updateFamilySchedule(data)` | PUT | `/family/schedule` |
| `fetchLocations()` | GET | `/locations` |
| `fetchLocationsTree()` | GET | `/locations/tree` |
| `createLocation(data)` | POST | `/locations` |
| `updateLocation(id, data)` | PUT | `/locations/{id}` |
| `deleteLocation(id)` | DELETE | `/locations/{id}` |

**Error handling pattern:** All `fetch*` functions wrap in try/catch and return `null` or `[]` on failure. Mutation functions (`create*`, `update*`, `delete*`) propagate errors for caller handling.

---

## Reusable Components

**Directory:** `frontend/src/components/`

| Component | File | Description |
|-----------|------|-------------|
| Navbar | `Navbar.tsx` | Sticky header with 5 nav links, active link detection via `usePathname()` |
| StatCard | `StatCard.tsx` | Single-metric display card (label, value, unit) |
| ProgressBar | `ProgressBar.tsx` | Labeled progress bar with percentage (e.g., 45/150g protein) |
| Badge | `Badge.tsx` | Colored pill badge (expired=red, high=orange, medium=yellow, ok=green) |
| SectionCard | `SectionCard.tsx` | Section wrapper with header and optional action button |
| AlertBanner | `AlertBanner.tsx` | Dismissible error/warning/success notification |
| EmptyState | `EmptyState.tsx` | Empty state display with icon and message |

**Navbar links (in order):** Dashboard · Profile · Inventory · Grocery List · Family

---

## TypeScript Key Types (Dashboard)

```typescript
type Macros = { calories: number; protein_g: number; carbs_g: number; fat_g: number };
type NutritionLog = { date: string; target: Macros & { bmr: number; tdee: number }; consumed: Macros; remaining: Macros; progress: { calories_pct: number; protein_pct: number; carbs_pct: number; fat_pct: number }; meals: LoggedMeal[]; warnings: string[] };
type MealPlan = { meals: PlanMeal[]; total_planned: Macros };
type PlanMeal = { meal_type: string; meal_name: string; score: number; score_breakdown: Record<string, number>; ingredients: PlanIngredient[]; estimated_calories: number; estimated_protein_g: number; estimated_carbs_g: number; estimated_fat_g: number; reason: string };
type Schedule = Record<string, Record<string, string[]>>;  // schedule_type → meal_type → member_keys
```

---

## Build Output (Next.js)

9 compiled pages (static + server components):
- `/(root)` — redirect
- `/dashboard`
- `/profile`
- `/inventory`
- `/grocery-list`
- `/family`
- Plus internal Next.js routes

TypeScript errors: 0  
Build: clean
