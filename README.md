# NutriFridge AI

> Smart fridge management meets personalized nutrition — track what you have, eat what you need.

A full-stack health-tech SaaS demo built with Next.js 14 + FastAPI. Enter your body metrics and fitness goals, log your fridge inventory, and get AI-scored meal recommendations that prioritise expiring ingredients, respect your macro targets, and match your cuisine preferences.

---

## Feature Overview

| Feature | Description |
|---------|-------------|
| **Nutrition Engine** | Mifflin-St Jeor BMR → TDEE → macro targets (protein/carbs/fat) |
| **Inventory Tracking** | Fridge, freezer, pantry with expiration risk badges |
| **Expiration Alerts** | Expired / high / medium / low / unknown risk classification |
| **Meal Planner** | 20 named templates (10 Chinese + 10 Western) scored against 7 criteria |
| **Meal Scoring** | Urgency · protein gap · calorie fit · preference · cooking time · variety · dislikes |
| **Daily Nutrition Log** | Mark meals as eaten · deducts inventory quantities · progress bars |
| **Food Database** | 40+ foods with auto-fill when adding inventory items |
| **User Preferences** | Cuisine · cooking time · diet style · preferred / disliked foods |
| **Weekly Grocery List** | Personalised buy/avoid recommendations with priority badges |
| **Waste Tracking** | Discard items with a reason → calories wasted logged and surfaced on dashboard |
| **Backend QA Script** | 13 check groups / 75 assertions covering all features |

---

## Tech Stack

| Layer       | Technology                            |
|-------------|---------------------------------------|
| Frontend    | Next.js 14 (App Router), TypeScript, TailwindCSS |
| Backend     | FastAPI, Python 3.11+                 |
| Database    | SQLite — `backend/nutrifridge.db`     |
| ORM         | SQLAlchemy 2.0                        |
| Validation  | Pydantic v2                           |
| API style   | REST                                  |

---

## Architecture

```mermaid
flowchart LR
    subgraph Frontend["Frontend (Next.js 14)"]
        D[Dashboard]
        P[Profile]
        I[Inventory]
        G[Grocery List]
    end

    subgraph Backend["Backend (FastAPI)"]
        PR[/profile]
        NL[/nutrition-log]
        MP[/meal-plan/today]
        INV[/inventory]
        GL[/grocery-list/weekly]
        WL[/waste-log]
    end

    subgraph Services["Python Services"]
        NE["nutrition_engine.py\nMifflin-St Jeor BMR/TDEE"]
        EE["expiration_engine.py\nRisk classification"]
        MS["meal_scorer.py\n7-component scoring"]
        MT["meal_templates.py\n20 named templates"]
        FD["food_database.py\n40+ foods"]
        UC["unit_converter.py\ng/kg/lb/oz"]
    end

    subgraph DB["SQLite"]
        U[(Users)]
        II[(InventoryItems)]
        DL[(DailyLog / MealLog)]
        WLog[(WasteLog)]
    end

    Frontend -- REST/JSON --> Backend
    Backend --> Services
    Services --> DB
```

---

## Screenshots

> Screenshots taken after seeding sample data with `python3 seed.py`.

| Page | Preview |
|------|---------|
| **Dashboard** | _[screenshot placeholder — run the app to see the live dashboard]_ |
| **Inventory** | _[screenshot placeholder — fridge/freezer/pantry with risk badges]_ |
| **Profile** | _[screenshot placeholder — body metrics + nutrition targets]_ |
| **Grocery List** | _[screenshot placeholder — personalised weekly shopping recommendations]_ |

---

## Quick Start

### 1 — Backend

```bash
cd backend

# Create & activate a virtual environment
python3 -m venv venv
source venv/bin/activate        # macOS / Linux
# venv\Scripts\activate         # Windows PowerShell

# Install dependencies
pip install -r requirements.txt

# Start the API server
uvicorn app.main:app --reload
```

The API runs at **http://localhost:8000** — interactive docs at **http://localhost:8000/docs**.

---

### 2 — Seed sample data

```bash
cd backend
source venv/bin/activate
python3 seed.py
```

Seeds **Alex** (175 cm, 88 kg, 24 yo, male, moderate activity, fat-loss goal, mixed cuisine, high-protein diet) with 7 inventory items covering every expiration risk level.

---

### 3 — Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000** — it redirects to `/dashboard` automatically.

---

## Demo Flow

After seeding, run through this flow to see all features:

1. **Dashboard** → 4 nutrition-progress cards, recommended meal plan with match-score bars, urgent ingredients sidebar
2. Click **"Mark as Eaten"** on a meal → progress bars update, meal moves to _Meals Eaten Today_
3. **Profile** → form pre-fills with Alex's data; change Goal to _Muscle Gain_ → calories rise ~700 kcal
4. **Inventory** → 7 items with risk badges; click _+ Add Item_, type a food name to trigger auto-fill
5. Click **"Discard"** on an expiring item, pick a reason → waste event appears on the dashboard
6. **Grocery List** → personalised buy/avoid list with priority badges and nutrition insight
7. Stop the backend (`Ctrl-C`) and refresh the dashboard → red _Backend not reachable_ banner appears

---

## Local URLs

| URL | What you see |
|-----|--------------|
| http://localhost:3000/dashboard   | Hero, nutrition progress, meal plan, sidebar |
| http://localhost:3000/profile     | Body metrics + food preferences + nutrition targets |
| http://localhost:3000/inventory   | Add/discard/delete items, expiration table |
| http://localhost:3000/grocery-list | Weekly shopping recommendations |
| http://localhost:8000/docs        | Swagger UI — full API explorer |
| http://localhost:8000/health      | `{ "status": "ok" }` |

---

## Project Structure

```
NutriFridge AI/
├── README.md
├── backend/
│   ├── requirements.txt
│   ├── seed.py                   # Sample user + 7 inventory items
│   ├── qa_check.py               # 75 assertions across 13 check groups
│   └── app/
│       ├── main.py               # FastAPI app, CORS, router registration
│       ├── database.py           # SQLAlchemy engine + session
│       ├── models/
│       │   ├── user.py           # User ORM (includes Week 3 preference fields)
│       │   ├── inventory.py      # InventoryItem ORM
│       │   ├── nutrition_log.py  # DailyLog + MealLog ORM
│       │   └── waste_log.py      # WasteLog ORM
│       ├── schemas/
│       │   ├── user.py           # Pydantic schemas + Enum preferences
│       │   ├── inventory.py
│       │   └── nutrition_log.py
│       ├── routers/
│       │   ├── profile.py        # POST / GET / PUT /profile
│       │   ├── inventory.py      # CRUD + /urgent
│       │   ├── nutrition.py      # GET /nutrition-target
│       │   ├── meal_plan.py      # GET /meal-plan/today
│       │   ├── nutrition_log.py  # GET+POST /nutrition-log, DELETE /meal
│       │   ├── foods.py          # GET /foods, GET /foods/search
│       │   ├── grocery_list.py   # GET /grocery-list/weekly
│       │   └── waste_log.py      # POST /inventory/{id}/discard, GET /waste-log
│       └── services/
│           ├── nutrition_engine.py   # Mifflin-St Jeor BMR/TDEE/macros
│           ├── expiration_engine.py  # Risk classification
│           ├── meal_planner.py       # Template-based, macro-aware planner
│           ├── meal_scorer.py        # 7-component scoring (0–100)
│           ├── meal_templates.py     # 20 named templates (Chinese + Western)
│           ├── unit_converter.py     # g/kg/lb/oz cross-conversion
│           └── food_database.py      # 40+ food nutrition database
└── frontend/
    ├── package.json
    ├── tailwind.config.ts
    └── src/
        ├── app/
        │   ├── layout.tsx
        │   ├── page.tsx              # Redirects → /dashboard
        │   ├── dashboard/page.tsx   # Hero · progress · meal plan · sidebar
        │   ├── profile/page.tsx     # Metrics + preferences + targets
        │   ├── inventory/page.tsx   # Cards (mobile) + table (desktop)
        │   └── grocery-list/page.tsx
        ├── components/
        │   ├── Navbar.tsx
        │   ├── Badge.tsx            # Colored pill badges
        │   ├── ProgressBar.tsx      # Labeled progress bar
        │   ├── EmptyState.tsx       # Empty state with icon
        │   ├── AlertBanner.tsx      # Error / warning / success banners
        │   ├── StatCard.tsx         # Metric display card
        │   └── SectionCard.tsx      # Section wrapper with header
        └── lib/
            └── api.ts               # Typed fetch wrappers for all endpoints
```

---

## API Endpoint Summary

### Profile
| Method | Path     | Description          |
|--------|----------|----------------------|
| POST   | /profile | Create user profile  |
| GET    | /profile | Get user profile     |
| PUT    | /profile | Update user profile  |

### Nutrition
| Method | Path              | Description                          |
|--------|-------------------|--------------------------------------|
| GET    | /nutrition-target | Calculated calorie + macro targets   |

### Inventory
| Method | Path                      | Description                     |
|--------|---------------------------|---------------------------------|
| POST   | /inventory                | Add an inventory item           |
| GET    | /inventory                | List all items (sorted by risk) |
| GET    | /inventory/urgent         | Expired/high/medium risk items  |
| GET    | /inventory/{id}           | Get a single item               |
| PUT    | /inventory/{id}           | Update an item                  |
| DELETE | /inventory/{id}           | Delete an item                  |
| POST   | /inventory/{id}/discard   | Discard item; log waste event   |

### Meal Plan
| Method | Path             | Description                                        |
|--------|------------------|----------------------------------------------------|
| GET    | /meal-plan/today | Scored one-day plan (respects today's log)         |

### Nutrition Log
| Method | Path                     | Description                               |
|--------|--------------------------|-------------------------------------------|
| GET    | /nutrition-log/today     | Today's consumed macros + logged meals    |
| POST   | /nutrition-log/meal      | Log a meal; deducts inventory quantities  |
| DELETE | /nutrition-log/meal/{id} | Remove a logged meal; reverses macros     |

### Foods
| Method | Path             | Description                           |
|--------|------------------|---------------------------------------|
| GET    | /foods           | Full built-in food database (40+ items) |
| GET    | /foods/search?q= | Search foods by name or alias         |

### Grocery List
| Method | Path                  | Description                             |
|--------|-----------------------|-----------------------------------------|
| GET    | /grocery-list/weekly  | Personalised weekly shopping list       |

### Waste Log
| Method | Path       | Description                              |
|--------|------------|------------------------------------------|
| GET    | /waste-log | Last 30 waste events                     |

### System
| Method | Path    | Description  |
|--------|---------|--------------|
| GET    | /health | Health check |

---

## Nutrition Engine Logic

**BMR (Mifflin-St Jeor)**
- Male: `10 × weight_kg + 6.25 × height_cm − 5 × age + 5`
- Female: `10 × weight_kg + 6.25 × height_cm − 5 × age − 161`
- Other: average of male and female

**TDEE** = BMR × activity multiplier (1.2 – 1.9)

**Calorie goal:** TDEE − 400 (fat loss) · TDEE (maintenance) · TDEE + 300 (muscle gain)

**Macros:** protein 1.5–2.0 g/kg, fat 25% of calories, carbs fill remaining

---

## Meal Scoring

Each candidate template is scored 0–100 before selection:

| Component       | Max pts | Description                                        |
|-----------------|---------|---------------------------------------------------|
| Urgency         | 25      | Fraction of matched ingredients that are expiring |
| Protein gap     | 20      | How well the meal covers remaining protein target  |
| Calorie fit     | 15      | Whether meal fits neatly in remaining budget       |
| Preference      | 25      | Cuisine + diet style match                         |
| Cooking time    | 8       | Template fits cooking time preference              |
| Variety         | 7       | Ingredient category diversity                      |
| Dislike penalty | −25     | Applied if a disliked food is in the ingredients   |

---

## Expiration Risk Levels

| Risk    | Definition                   | Badge colour |
|---------|------------------------------|--------------|
| expired | best-before date has passed  | Red          |
| high    | 0–2 days remaining           | Orange       |
| medium  | 3–5 days remaining           | Yellow       |
| low     | 6+ days remaining            | Green        |
| unknown | no best-before date set      | Grey         |

---

## QA Results

```bash
cd backend && source venv/bin/activate && python3 qa_check.py
```

**75/75 assertions PASS** across 13 check groups:
1. Health check
2. Profile CRUD
3. Food database search
4. Inventory CRUD + urgent sorting
5. Calorie math (Mifflin-St Jeor verification)
6. Meal plan generation
7. Mark-as-eaten macro update
8. lb → g inventory deduction
9. Unit converter
10. Preference fields persisted correctly
11. Meal scoring (score 0–100, breakdown present)
12. Grocery list structure and priority
13. Discard flow + waste log

---

## Known Limitations

- **Single user** — assumes one profile row; multi-user requires authentication
- **Inventory not restored on meal deletion** — deleting a logged meal reverses macros but not quantities
- **Nutrition data is estimated** — based on per-100g values with an assumed 150g serving
- **Discrete units not cross-convertible** — "cups" vs "count" deduction is skipped with a warning
- **Log resets at midnight** — uses `date.today()` server-side
- **No persistent meal history UI** — past logs exist in the DB but have no frontend view
- **Waste log does not restore inventory** — discard removes the item; hard-delete does not log waste
- **Meal templates are fixed** — 20 templates cannot be edited through the UI
- **Grocery list is guidance, not a cart** — quantities and brands are not specified

---

## Future Roadmap

- **LLM recipe generation** — replace rule-based planner with Claude for personalised recipes
- **Receipt OCR** — scan grocery receipts to auto-populate inventory
- **Barcode scanning** — phone camera to identify packaged food
- **Photo-based fridge recognition** — AI vision to detect items from a fridge photo
- **Nutrition history charts** — visualise macro trends over time
- **User authentication** — multi-user support with secure login
- **Mobile app** — React Native version with camera and push notifications

---

## Troubleshooting

**`ModuleNotFoundError: No module named 'fastapi'`**
You are not inside the virtual environment. Run `source venv/bin/activate` first.

**Frontend shows "Backend is not reachable"**
The FastAPI server is not running. Start with `uvicorn app.main:app --reload` from `backend/`.

**Frontend shows "No profile found" after seeding**
Run `python3 seed.py` from inside `backend/` with the venv active.

**Port already in use**
`uvicorn app.main:app --reload --port 8001` — then set `NEXT_PUBLIC_API_URL=http://localhost:8001` in `frontend/.env.local`.

**CORS error in browser console**
The backend allows `http://localhost:3000` by default. If your frontend is on a different port, edit `allow_origins` in `backend/app/main.py`.

---

## Resume Bullets

> Copy-paste into a resume or portfolio description:

- Built a **full-stack nutrition + inventory management app** with Next.js 14 (TypeScript, TailwindCSS) frontend and FastAPI + SQLAlchemy backend, deployed locally with SQLite
- Implemented a **rule-based meal scoring engine** (7 components, 0–100 scale) that prioritises expiring ingredients, respects macro targets, and accounts for user cuisine and diet preferences
- Designed and built **5 REST API modules** (profile, inventory, nutrition log, meal plan, grocery list) with Pydantic v2 validation and full CRUD
- Created a **waste tracking system** with calorie-wasted estimation and dashboard visualisation to encourage mindful consumption
- Achieved **75/75 QA assertions** across 13 check groups with a custom backend QA script covering unit conversion, macro math, meal scoring, and preference persistence
- Engineered a **food database with 40+ entries and fuzzy search** that auto-fills nutrition data when items are added to inventory
