# NutriFridge AI — 5-Minute Live Demo Script

A structured walkthrough for live presentations. Each section includes what to show, what to say, and what to watch for.

---

## Pre-Demo Checklist (5 minutes before)

```bash
# Terminal 1 — start backend
cd backend && source ../venv/bin/activate
python seed.py          # populate with demo data (idempotent-safe)
uvicorn app.main:app --reload --port 8000

# Terminal 2 — start frontend
cd frontend && npm run dev

# Terminal 3 — ready to run QA
cd backend && source ../venv/bin/activate
# (don't run yet — wait for QA section)
```

**Verify:**
- [ ] http://localhost:3000 loads and shows Dashboard
- [ ] Backend health banner is NOT shown (green = connected)
- [ ] At least 5–8 inventory items visible on Dashboard urgent items
- [ ] Profile is set (age/weight/height filled in)

---

## Minute 0:00–0:45 — Intro & Architecture

**Show:** Nothing (talking)

**Say:**
> "NutriFridge AI is a smart fridge management system that combines inventory tracking with personalized nutrition planning. It's built on three layers: a Next.js 14 TypeScript frontend, a FastAPI Python backend backed by SQLite, and a Spring Boot Java microservice for more advanced async processing. Today I'll walk through the active application, then explain the Java layer's design patterns."

**Key points:**
- Active request path: Browser → FastAPI (port 8000) → SQLite
- Java is fully implemented and tested but not in the active path (be upfront about this)

---

## Minute 0:45–1:30 — Dashboard Overview

**Show:** `/dashboard` page

**Say:**
> "The dashboard is the main hub. On load, it fires 9 parallel API requests — nutrition log for today, recommended meal plan, urgent inventory items, grocery list, waste log, nutrition analysis, family info, and the household schedule. Everything loads concurrently."

**Point out:**
- Four macro progress bars (calories, protein, carbs, fat)
- Recommended meal cards (each has a score — hover or show the score breakdown: "87.5/100")
- Urgent items sidebar (items expiring in ≤2 days)
- "Today's Attendance" widget on sidebar

**Say about meal scores:**
> "Each meal recommendation is scored on 8 components: expiration urgency, protein gap, calorie fit, cuisine preference, cooking time, variety, a dislike penalty, and health constraint adjustments. The top-scoring meal for each slot — breakfast, lunch, dinner, snack — is selected."

---

## Minute 1:30–2:15 — Mark as Eaten + Inventory Deduction

**Show:** Click "Mark as Eaten" on the Lunch recommendation

**Say:**
> "Clicking Mark as Eaten logs the meal to today's daily log, updates the macro progress bars in real time, and deducts the ingredient quantities from inventory. The backend handles unit conversion — so if the meal uses 150 grams of chicken but it's stored in pounds, it converts automatically."

**Point out:**
- Progress bars update after logging
- "Undo" button appears (click it to demonstrate)

**Say about Undo:**
> "Undo reverses the macro totals — but this is one of the documented limitations: it does not restore inventory quantities. That's an intentional trade-off to keep the operation simple; restoring inventory would require tracking partial deductions across multiple concurrent sessions."

---

## Minute 2:15–3:00 — Inventory + Expiration Engine

**Show:** Navigate to `/inventory`

**Say:**
> "The inventory page shows all items with expiration risk badges — Critical (red), High (orange), Medium (yellow), OK (green). These are calculated server-side from the item's expiration date relative to today."

**Point out:**
- An expiring item (red or orange badge)
- Location label (e.g., "Fridge → Top Shelf")

**Show:** Click "Add Item", type "chicken" in the name field

**Say:**
> "The food database has 40+ entries. Searching auto-fills the nutrition fields from a per-100g lookup — no manual entry needed. Storage locations form a hierarchy — fridge, freezer, pantry — with configurable sub-locations."

**Show (optionally):** Discard an item

**Say:**
> "Discarding logs a waste entry with estimated calories wasted, then permanently removes the item from inventory. The waste log is available on the dashboard as a trend overview."

---

## Minute 3:00–3:45 — Family Planning + Meal Schedule

**Show:** Navigate to `/family`

**Say:**
> "The Family page manages household members, each with their own profile — age, weight, health conditions, food preferences. The meal schedule editor lets you configure who eats at home on weekdays versus weekends, per meal."

**Point out:**
- Weekday / Weekend tabs (today's tab has a "Today" badge)
- Per-meal checkboxes
- Save button

**Say:**
> "The schedule persists to a `household_meal_schedules` table. When the grocery list page loads, it reads this schedule and computes days-at-home per member to scale weekly nutrition targets proportionally."

**Show (if time):** The Household Food Plan section

**Say:**
> "The household food plan generates individual meal suggestions for each scheduled member. Ingredients are shown as individual cards — not the whole recipe at once — and each card has an Eaten checkbox that logs to the user's own nutrition log."

---

## Minute 3:45–4:30 — QA Demonstration

**Show:** Terminal (pre-positioned)

```bash
python qa_check.py
```

**Say while it runs:**
> "The QA script is a 231-assertion end-to-end integration test suite. It runs against the live server, testing every endpoint. The 38 sections cover: CRUD for all entities, the Mifflin-St Jeor BMR calculation, meal scoring, unit conversion with lb-to-g deduction, the discard and waste log flow, household schedule CRUD, and the structured nutrition summary format."

**When it completes:**
> "231 out of 231 assertions pass. TypeScript also compiles with zero errors."

---

## Minute 4:30–5:00 — Java Microservice Design Patterns

**Show:** Architecture diagram (from `docs/ARCHITECTURE.md`) or just talk

**Say:**
> "The Java Spring Boot microservice implements two patterns worth highlighting. First, the Strategy pattern for health constraints: there's a `HealthConstraintPolicy` interface with five `@Component` implementations — fatty liver, diabetes, allergy, high cholesterol, lactose intolerance. Spring auto-discovers and injects all of them; adding a new condition is just one new class."

**Say:**
> "Second, async job execution for meal planning. The endpoint returns HTTP 202 Accepted immediately, submits the work to a bounded `ThreadPoolTaskExecutor`, and persists job state — PENDING, RUNNING, SUCCEEDED, FAILED — to PostgreSQL. Job results survive JVM restarts. The client polls for completion."

**Say:**
> "Inventory writes are protected by two-layer locking: a pessimistic read lock prevents concurrent reads, and a JPA `@Version` optimistic lock catches any races that slip through. Conflicts return HTTP 409 for client-driven retry."

**Say honestly:**
> "The Java service is fully implemented with 40 unit tests — it's just not wired into the active frontend path yet. That integration would require the frontend to call the Java port instead of Python, or FastAPI to delegate to Java for async planning. The design is there; it's the glue that's next."

---

## Backup Questions

**Q: Why SQLite and not PostgreSQL for the Python backend?**
> "SQLite is zero-configuration for local development. The database URL is an environment variable — changing to PostgreSQL is a one-line config change. For a single-user portfolio project, SQLite is simpler to demo."

**Q: Why did you build both Python and Java backends?**
> "The FastAPI backend demonstrates Python patterns — SQLAlchemy ORM, Pydantic validation, dependency injection. The Java service demonstrates enterprise patterns — Strategy, async jobs, Flyway migrations, Spring WebFlux. They're different tools for different scales. In a real system, you'd choose one and deploy it; here both exist to show both skill sets."

**Q: What would you add next?**
> "Authentication (JWT), wiring the Java service into the active path, a meal history page, and richer nutrition data — currently it's estimated from 150g serving assumptions. Production deployment with a PostgreSQL swap would also be a natural next step."

**Q: How does the meal plan score work?**
> "Eight components on a 0–100 scale. Urgency — expiring items — gets the most weight at 25 points, because reducing food waste is the core problem this solves. Preference and protein gap each get 20–25 points. A hard allergen match sets the score to −100 so the meal never appears."

---

## Time Variations

**3-minute version:** Dashboard → Mark as Eaten → QA terminal (skip Family and Java)

**8-minute version:** Add full profile walkthrough showing health condition impact on macro targets; show the score breakdown tooltip on a meal card; show grocery list with family schedule applied

**Technical-audience version:** Lead with request traces (`docs/REQUEST_TRACES.md`); show code for `meal_scorer.py`; show `HealthConstraintPolicy` interface and one implementation; show `MealPlanController` HTTP 202 pattern
