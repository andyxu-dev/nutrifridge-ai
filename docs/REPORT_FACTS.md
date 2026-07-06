# NutriFridge AI — Presentation Fact Sheet

Verified facts for technical presentations, portfolio demos, and resume claims. Each fact includes its source location. Caveats are explicitly labeled.

---

## System At a Glance

| Fact | Value | Source |
|------|-------|--------|
| Backend language (Python) | Python 3.11+ | `backend/app/main.py` |
| Backend framework | FastAPI + Uvicorn | `backend/requirements.txt` |
| ORM | SQLAlchemy 2.0 | model files |
| Validation library | Pydantic v2 | schema files |
| Database (Python) | SQLite (`nutrifridge.db`) | `backend/app/database.py` |
| Backend language (Java) | Java 17 | `backend-java/pom.xml` |
| Java framework | Spring Boot 3.2.5 | `backend-java/pom.xml` |
| Java database | PostgreSQL | `backend-java/src/main/resources/application.yml` |
| Frontend framework | Next.js 14 (App Router) | `frontend/package.json` |
| Frontend language | TypeScript | project config |
| Frontend styling | TailwindCSS | `frontend/tailwind.config.ts` |
| Python port | 8000 | startup command |
| Java port | 8080 | `application.yml` |
| Frontend port | 3000 | Next.js default |

---

## Endpoint & Route Counts

| Metric | Count | Source |
|--------|-------|--------|
| FastAPI routers | 10 | `backend/app/main.py` router registrations |
| FastAPI endpoints (total) | ~37 | `backend/app/routers/*.py` |
| Frontend pages (routes) | 6 | `frontend/src/app/*/page.tsx` |
| API client functions | 35 | `frontend/src/lib/api.ts` |
| Java REST endpoints | 3 | `MealPlanController`, `MealLogController`, `NutritionAnalysisController` |

**FastAPI endpoint breakdown by router:**
- `/health`: 1
- Profile: 3 (GET, POST, PUT `/profile`)
- Inventory: 8 (list, create, urgent, get, update, delete, discard, search)
- Nutrition log: 5 (today, log meal, delete meal, manual, analysis)
- Meal plan: 1 (`/meal-plan/today`)
- Foods: 2 (list, search)
- Grocery list: 2 (personal weekly, family weekly)
- Waste log: 1
- Family: 9 (household, members CRUD ×4, family meal plan, family grocery, schedule GET/PUT)
- Locations: 5 (list, tree, create, update, delete)

---

## QA & Testing

| Metric | Value | Source |
|--------|-------|--------|
| Python QA assertions | 231 | `backend/qa_check.py` |
| Python QA test sections | 38 | `backend/qa_check.py` |
| Python QA run command | `python qa_check.py` (from `backend/`) | — |
| Java unit tests | 40 | `backend-java/src/test/java/` |
| Java test framework | JUnit 5 + Mockito | `backend-java/pom.xml` |
| Java test database | H2 in-memory (PostgreSQL compat mode) | `src/test/resources/application.properties` |
| TypeScript errors | 0 | `npm run build` output |
| Next.js build | Clean (9 compiled pages) | build output |

**Caveat on QA script:** It is a scripted integration test that makes real HTTP requests and asserts on responses — not a pytest/unittest suite. It does not measure code coverage.

---

## Algorithms

| Algorithm | File | Key Metric |
|-----------|------|-----------|
| BMR calculation | `services/nutrition_engine.py` | Mifflin-St Jeor formula |
| Macro target calculation | `services/nutrition_engine.py` | 5 health conditions, 4 macro strategy overrides |
| Expiration risk | `services/expiration_engine.py` | 4 risk levels: CRITICAL / HIGH / MEDIUM / OK |
| Meal scoring | `services/meal_scorer.py` | 8 components, 0–100 scale |
| Unit conversion | `services/unit_converter.py` | 4 mass units convertible; 7 discrete units blocked |
| Meal templates | `services/meal_templates.py` | 20 fixed templates |
| Food database | `services/food_database.py` | 40+ entries with per-100g nutrition |

---

## Meal Scoring Components

"The meal recommender uses an 8-component scoring system:"

| # | Component | Points | Logic |
|---|-----------|--------|-------|
| 1 | Urgency | +25 | CRITICAL inventory items in meal → +25; HIGH → +15; MEDIUM → +8 |
| 2 | Protein gap | +20 | Fills remaining daily protein target |
| 3 | Calorie fit | +15 | 15–65% of remaining calorie budget used = perfect fit |
| 4 | Preference | +25 | Cuisine match +15; diet style match +10 |
| 5 | Cooking time | +8 | Fits within user's stated time constraint |
| 6 | Variety | +7 | Uses a food category not already eaten today |
| 7 | Dislike penalty | −25 | Any disliked food ingredient in template |
| 8 | Health constraint | ±30 / −100 | Condition-relevant penalty; allergen = −100 (hard exclude) |

**Source:** `backend/app/services/meal_scorer.py`

---

## Java Microservice

**Integration status: Implemented, tested, not wired into active UI request path.**

| Claim | Evidence | Caveat |
|-------|---------|--------|
| Spring Boot 3 microservice (Java 17) | `pom.xml`: `spring-boot-starter-parent 3.2.5` | Not in active request path |
| Strategy pattern for health constraints | 5 `@Component` implementations of `HealthConstraintPolicy` | Tested; not called at runtime by frontend |
| Async job pattern (HTTP 202 + polling) | `MealPlanController` + `MealPlanJob` entity + PostgreSQL-persisted state | Full implementation; frontend does not poll it |
| Two-layer inventory locking | `PESSIMISTIC_WRITE` lock + `@Version` on `InventoryItem` | Tested in `MealLogServiceTest` |
| Flyway migrations | 4 SQL files (V1–V4) | Run on Spring Boot startup; need PostgreSQL running |
| WebClient with retry | `FastApiNutritionClient`: `retryWhen(Retry.backoff(...))` | Calls FastAPI back; not triggered in current flow |

---

## Known Limitations

**Source:** `README.md` + code inspection

| # | Limitation | Source location |
|---|-----------|----------------|
| 1 | **Single user** — no authentication; one profile row assumed | `backend/app/routers/profile.py` (uses `.first()`) |
| 2 | **Inventory not restored on meal deletion** — `DELETE /nutrition-log/meal/{id}` reverses macros but not quantities | `backend/app/routers/nutrition.py` |
| 3 | **Nutrition data is estimated** — food DB provides per-100g values; 150g serving is assumed | `backend/app/services/food_database.py` |
| 4 | **Discrete units not cross-convertible** — logging "1 cup" against "500ml" skips deduction with a warning | `backend/app/services/unit_converter.py` |
| 5 | **Log resets at midnight** — server uses `date.today()`; no time-zone awareness | `backend/app/routers/nutrition.py` |
| 6 | **No meal history UI** — past logs exist in DB but no frontend page to browse them | `frontend/src/app/` — no history page |
| 7 | **Discard does not restore inventory** — no "undo discard" | `backend/app/routers/inventory.py` |
| 8 | **Meal templates are fixed** — 20 templates; no UI to add/edit/delete | `backend/app/services/meal_templates.py` |
| 9 | **Grocery list is guidance only** — no brand selection, no price, no shopping cart | `backend/app/routers/grocery_list.py` |
| 10 | **Java service not integrated** — implemented and tested but not connected to active path | `backend-java/` (standalone) |
| 11 | **SQLite unsuitable for concurrent production writes** — single-file DB | `backend/app/database.py` |

---

## Demo-Safe Statements

These can be stated without qualification in a presentation:

- "231-assertion end-to-end QA suite — all passing"
- "8-component meal scoring algorithm balancing expiration urgency, nutrition targets, cuisine preferences, and health conditions"
- "Persistent household meal schedule: weekday and weekend/holiday attendance per meal, stored in SQLite"
- "Inventory deduction on meal logging with unit conversion between gram, kilogram, pound, and ounce"
- "Four-level expiration risk engine: OK, MEDIUM, HIGH, CRITICAL — calculated server-side at query time"
- "Five health condition adjustments: fatty liver (reduced calorie surplus, fat cap), diabetes (carb cap), kidney disease (protein cap), high cholesterol (fat cap), lactose intolerance (dairy exclusion)"
- "Spring Boot microservice with async HTTP 202 job pattern — job state persisted to PostgreSQL, survives JVM restarts"
- "Two-layer concurrent inventory safety: pessimistic read lock + optimistic `@Version` → HTTP 409 for client retry"
- "40 JUnit 5 + Mockito tests; H2 in-memory with PostgreSQL compatibility mode"
- "Zero TypeScript errors; clean Next.js build"

---

## QA Commands

```bash
# Start backend
cd backend && source ../venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Seed demo data (run before QA for clean state)
python seed.py

# Run full QA suite
python qa_check.py

# Start frontend (separate terminal)
cd frontend && npm run dev
# → http://localhost:3000

# TypeScript build check
cd frontend && npm run build
```
