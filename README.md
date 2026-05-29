# NutriFridge AI

A personalized nutrition + refrigerator inventory assistant. Enter your body metrics and fitness goals, record what food you have, and get meal recommendations based on your daily targets, available ingredients, expiration dates, and goal (fat loss / muscle gain / maintenance).

---

## Tech Stack

| Layer      | Technology                          |
|------------|-------------------------------------|
| Frontend   | Next.js 14, TypeScript, TailwindCSS |
| Backend    | FastAPI, Python 3.11+               |
| Database   | SQLite (file: `backend/nutrifridge.db`) |
| ORM        | SQLAlchemy 2.0                      |
| API style  | REST                                |

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

# Start the API server (auto-reloads on file change)
uvicorn app.main:app --reload
```

The API is now running at **http://localhost:8000**  
Interactive docs (Swagger UI): **http://localhost:8000/docs**

---

### 2 — Seed sample data

Open a second terminal (keep the server running):

```bash
cd backend
source venv/bin/activate
python3 seed.py
```

This inserts:
- **User:** Alex — 175 cm, 88 kg, 24 yo, male, moderate activity, fat-loss goal
- **7 inventory items** with varying expiration dates so every risk level is visible

---

### 3 — Frontend

Open a third terminal:

```bash
cd frontend
npm install
npm run dev
```

The app is now running at **http://localhost:3000** and redirects to `/dashboard` automatically.

---

## Local URLs at a Glance

| URL                             | What you see                          |
|---------------------------------|---------------------------------------|
| http://localhost:3000/dashboard | Nutrition targets, urgent items, meal plan |
| http://localhost:3000/profile   | Create/edit profile, computed targets |
| http://localhost:3000/inventory | Add/delete items, expiration table    |
| http://localhost:8000/docs      | Swagger UI — full API explorer        |
| http://localhost:8000/health    | `{ "status": "ok" }`                 |

---

## Manual Test Checklist

After seeding, run through these in order:

- [ ] **Dashboard** loads with 4 nutrition-target cards (calories ≈ 2481 kcal for Alex)
- [ ] **Urgent Ingredients** table shows Strawberries (high), Beef (high), Cooked Rice (high), Spinach (medium)
- [ ] **Meal Plan** shows breakfast / lunch / dinner / snack cards, each with ingredients and macros
- [ ] **Daily Summary** shows estimated totals and remaining-to-target values
- [ ] **/profile** — form pre-fills with Alex's data; change Goal to "Muscle Gain", save → calories rise by ~700
- [ ] **/inventory** — 7 items appear with correct risk badges; add a new item; delete it
- [ ] **Stop the backend** (`Ctrl-C`) and refresh the dashboard — a red "Backend is not reachable" banner should appear instead of stale/empty states

---

## Project Structure

```
NutriFridge AI/
├── .gitignore
├── README.md
├── backend/
│   ├── requirements.txt
│   ├── seed.py
│   └── app/
│       ├── main.py              # FastAPI app, CORS, router registration
│       ├── database.py          # SQLAlchemy engine + session
│       ├── models/
│       │   ├── user.py           # User ORM model
│       │   ├── inventory.py      # InventoryItem ORM model
│       │   └── nutrition_log.py  # DailyLog + MealLog ORM models
│       ├── schemas/
│       │   ├── user.py           # Pydantic request/response schemas
│       │   ├── inventory.py
│       │   └── nutrition_log.py  # MealLogCreate, NutritionLogResponse
│       ├── routers/
│       │   ├── profile.py        # POST / GET / PUT /profile
│       │   ├── inventory.py      # Full CRUD + /inventory/urgent
│       │   ├── nutrition.py      # GET /nutrition-target
│       │   ├── meal_plan.py      # GET /meal-plan/today
│       │   ├── nutrition_log.py  # GET+POST /nutrition-log, DELETE /meal
│       │   └── foods.py          # GET /foods, GET /foods/search
│       └── services/
│           ├── nutrition_engine.py   # Mifflin-St Jeor BMR/TDEE/macros
│           ├── expiration_engine.py  # expired/high/medium/low/unknown risk
│           ├── meal_planner.py       # Macro-aware, dedup meal planner
│           ├── unit_converter.py     # Mass unit cross-conversion (g/kg/lb/oz)
│           └── food_database.py      # 40+ food nutrition database + search
└── frontend/
    ├── .env.local.example       # Copy to .env.local to override API URL
    ├── package.json
    ├── tailwind.config.ts
    └── src/
        ├── app/
        │   ├── layout.tsx
        │   ├── page.tsx          # Redirects to /dashboard
        │   ├── dashboard/page.tsx
        │   ├── profile/page.tsx
        │   └── inventory/page.tsx
        ├── components/
        │   └── Navbar.tsx
        └── lib/
            └── api.ts            # Typed fetch wrappers for all endpoints
```

---

## API Endpoint Summary

### Profile
| Method | Path       | Description              |
|--------|------------|--------------------------|
| POST   | /profile   | Create user profile      |
| GET    | /profile   | Get user profile         |
| PUT    | /profile   | Update user profile      |

### Nutrition
| Method | Path              | Description                        |
|--------|-------------------|------------------------------------|
| GET    | /nutrition-target | Calculated daily calorie + macro targets |

### Inventory
| Method | Path                 | Description                      |
|--------|----------------------|----------------------------------|
| POST   | /inventory           | Add an inventory item            |
| GET    | /inventory           | List all items (sorted by risk)  |
| GET    | /inventory/urgent    | Items that are expired/high/medium risk |
| GET    | /inventory/{id}      | Get a single item                |
| PUT    | /inventory/{id}      | Update an item                   |
| DELETE | /inventory/{id}      | Delete an item                   |

### Meal Plan
| Method | Path             | Description                                       |
|--------|------------------|---------------------------------------------------|
| GET    | /meal-plan/today | Macro-aware one-day meal plan (respects today's log) |

### Nutrition Log
| Method | Path                        | Description                                      |
|--------|-----------------------------|--------------------------------------------------|
| GET    | /nutrition-log/today        | Today's consumed macros + list of logged meals   |
| POST   | /nutrition-log/meal         | Log a meal; deducts inventory quantities         |
| DELETE | /nutrition-log/meal/{id}    | Remove a logged meal; reverses macros            |

### Foods
| Method | Path               | Description                            |
|--------|--------------------|----------------------------------------|
| GET    | /foods             | Full built-in food database (40+ items) |
| GET    | /foods/search?q=   | Search foods by name or alias          |

### Grocery List
| Method | Path                    | Description                                      |
|--------|-------------------------|--------------------------------------------------|
| GET    | /grocery-list/weekly    | Personalised weekly shopping recommendations     |

### Waste Log
| Method | Path                        | Description                                  |
|--------|-----------------------------|----------------------------------------------|
| POST   | /inventory/{id}/discard     | Discard item; log waste event                |
| GET    | /waste-log                  | List recent waste events (last 30)           |

### System
| Method | Path    | Description      |
|--------|---------|------------------|
| GET    | /health | Health check     |

---

## Nutrition Engine Logic

**BMR (Mifflin-St Jeor)**
- Male: `10 × weight_kg + 6.25 × height_cm − 5 × age + 5`
- Female: `10 × weight_kg + 6.25 × height_cm − 5 × age − 161`
- Other: average of male and female

**TDEE** = BMR × activity multiplier (1.2 – 1.9)

**Calorie goal:** TDEE − 400 (fat loss) | TDEE (maintenance) | TDEE + 300 (muscle gain)

**Macros:** protein 1.5–2.0 g/kg, fat 25% of calories, carbs fill remaining

---

## Expiration Risk Levels

| Risk    | Definition                        | Badge colour |
|---------|-----------------------------------|--------------|
| expired | best-before date has passed       | Red          |
| high    | 0–2 days remaining                | Orange       |
| medium  | 3–5 days remaining                | Yellow       |
| low     | 6+ days remaining                 | Green        |
| unknown | no best-before date set           | Grey         |

---

## Troubleshooting

**`ModuleNotFoundError: No module named 'fastapi'`**  
You are not inside the virtual environment. Run `source venv/bin/activate` first.

**`pydantic-core` build fails on Python 3.14**  
The pinned versions in `requirements.txt` use `>=` ranges and will install the latest wheel. If you still see a build error, upgrade pip first: `pip install --upgrade pip` and retry.

**Frontend shows "Backend is not reachable"**  
The FastAPI server is not running. Start it with `uvicorn app.main:app --reload` from the `backend/` folder.

**Frontend shows "No profile found" after seeding**  
Make sure you ran `python3 seed.py` from inside the `backend/` folder with the venv active, and that there are no errors in the output.

**Port already in use**  
`uvicorn app.main:app --reload --port 8001` — then set `NEXT_PUBLIC_API_URL=http://localhost:8001` in `frontend/.env.local`.

**CORS error in browser console**  
The backend allows `http://localhost:3000` by default. If your frontend is on a different port, edit `allow_origins` in `backend/app/main.py`.

---

## Week 1 MVP Features

1. **User Profile** — height, weight, age, sex, activity level, goal
2. **Nutrition Target Engine** — Mifflin-St Jeor BMR → TDEE → calories, protein, carbs, fat
3. **Inventory System** — track items across fridge, freezer, and pantry with expiration dates
4. **Expiration Risk Engine** — expired / high / medium / low / unknown classification
5. **Rule-based Meal Plan** — one-day plan prioritising ingredients that expire soonest
6. **Frontend UI** — Dashboard, Profile, and Inventory pages with mobile-friendly layout

---

## Week 2 Features

### Daily Nutrition Logging
Every meal recommended on the dashboard has a **Mark as Eaten** button. Clicking it:
1. Logs the meal to today's `DailyLog` with its calorie and macro values.
2. Deducts the ingredient quantities from your inventory (unit-aware — grams, kg, lb, oz all interoperate).
3. Refreshes the dashboard — progress bars fill up, the meal moves to **Meals Eaten Today**, and the meal plan recalculates against your remaining targets.

To manually delete a logged meal, click the trash icon next to it in the **Meals Eaten Today** section. Macros are reversed; inventory is **not** restored.

### Food Search & Nutrition Autofill (Inventory Page)
When you type a food name in the Add Item form, a dropdown appears with up to 6 matching suggestions from the built-in food database (40+ foods). Selecting a suggestion:
- Fills the name field.
- Sets the category automatically.
- Populates all four nutrition fields (Cal / P / C / F per 100g).

You can still override any field after autofill. The backend also autofills nutrition on `POST /inventory` if the item name matches a known food and no nutrition data was provided manually.

### Improved Meal Planner
- Ingredients are deduplicated across all meals in the same plan.
- Each meal card shows which macro gaps it helps fill (`macro_gap_helped`).
- Meals that use soon-to-expire ingredients are flagged with a warning chip.
- A `recommendation_summary` string at the top of the plan explains the priority logic in plain English.

### Backend QA Script
```bash
cd backend
source venv/bin/activate
python3 qa_check.py
```
Runs 9 check groups (health, profile, foods, inventory, urgent sorting, calorie math, meal plan, mark-as-eaten macro update, lb→g deduction) and prints `PASS` / `FAIL` for each. Exits non-zero on any failure.

---

## How to Use the Nutrition Log

1. Start the backend and seed data (see Quick Start above).
2. Open the dashboard at **http://localhost:3000/dashboard**.
3. In the **Recommended Meal Plan** section, click **Mark as Eaten** on any meal.
4. The **Daily Nutrition Progress** cards update immediately.
5. The marked meal appears in **Meals Eaten Today** with a delete icon.
6. The meal plan regenerates against your remaining calorie/macro budget.

---

## Week 3 Features

### User Preferences
The Profile page now has a **Food Preferences** section:
- **Cuisine Preference** — Chinese / Western / Mixed / No Preference. Meal scoring favours templates matching your preferred cuisine.
- **Cooking Time Preference** — Quick (≤15 min) / Normal (≤30 min) / Flexible. Templates exceeding your time limit receive a lower score.
- **Diet Style** — High Protein / Balanced / Low Carb / Low Fat / No Preference. Influences both meal scoring and grocery recommendations.
- **Preferred & Disliked Foods** — Comma-separated lists. Disliked ingredients trigger a score penalty; disliked items are skipped in grocery suggestions.

### Meal Templates & Scoring
The meal planner now uses a library of **20 named templates** (10 Chinese, 10 Western) instead of dynamically generated names. Each template includes:
- Name, cuisine, meal type, cooking time, and step-by-step instructions.
- Tags (`high_protein`, `low_carb`, `low_fat`, `balanced`, `quick`) used for scoring.

The **meal scoring engine** ranks each template (0–100) on:
| Component | Max pts | Description |
|-----------|---------|-------------|
| Urgency   | 25 | Fraction of matched ingredients that are expiring |
| Protein gap | 20 | How well the meal covers your remaining protein target |
| Calorie fit | 15 | Whether the meal fits neatly in your remaining calorie budget |
| Preference  | 25 | Cuisine + diet style match |
| Cooking time | 8 | Template fits your time preference |
| Variety | 7 | Ingredient category diversity |
| Dislike penalty | −25 | Applied if a disliked food is in the ingredients |

Each meal card on the dashboard now shows a match-score bar, cuisine flag, cooking time, tags, and expandable step-by-step instructions.

### Weekly Grocery List
New endpoint `GET /grocery-list/weekly` and a new `/grocery-list` page analyse:
- Your current inventory (quantity, expiry risk, categories present)
- Daily nutrition targets and today's consumed macros
- Cuisine + diet style preferences

Returns:
- **Buy this week** — prioritised list of staples you're missing, with `high / medium / low` priority tags
- **Use before buying more** — items that are urgent or at medium risk; no point restocking yet
- **Nutrition gap analysis** — plain-English summary of your protein/calorie situation
- **Inventory snapshot** — counts by risk level

### Waste Tracking
Every inventory item now has a **Discard** button in the inventory table. Discarding:
1. Prompts for a reason (Expired / Too much / Changed mind / Other).
2. Records a `WasteLog` entry with item name, quantity, unit, reason, and estimated calories wasted.
3. Removes or reduces the inventory item.

The Dashboard shows a **Recent Food Waste** section with a running tally of calories discarded, helping you notice patterns and waste less.

**Endpoints:**
- `POST /inventory/{id}/discard` — body: `{"reason": "expired", "quantity": null}` (null = discard all)
- `GET /waste-log` — returns the last 30 waste events

### Updated QA Script
`backend/qa_check.py` now covers **13 check groups / 75 assertions** including preference fields, meal scoring, instructions, grocery list, discard, and waste log.

---

## Known Limitations

- **Single user only** — the backend assumes one user (the first profile in the database). Multi-user support requires authentication.
- **Inventory is not restored on meal deletion** — deleting a logged meal reverses the macros from today's totals but does not add the ingredient quantities back to inventory.
- **Nutrition data is estimated** — calories and macros shown for meal-plan meals are based on the per-100g values in the food database and an assumed 150g serving, not a precise recipe.
- **Discrete units are not cross-convertible** — if an inventory item is stored in "cups" and a meal deducts in "count", the deduction is skipped with a warning rather than silently failing or guessing.
- **Log resets at midnight** — each `GET /nutrition-log/today` or `POST /nutrition-log/meal` call uses `date.today()` server-side, so meals logged before midnight are part of yesterday's log.
- **No persistent meal history** — only today's log is surfaced in the UI. Past logs exist in the database but have no frontend view yet.
- **Waste log does not restore inventory** — the discard flow removes the item from inventory but `DELETE /inventory/{id}` (the hard-delete button) does not create a waste log entry.
- **Meal templates are fixed** — the 20 templates cannot be added or edited through the UI. Extending the library requires editing `backend/app/services/meal_templates.py`.
- **Grocery list is weekly guidance, not a shopping cart** — quantities and brands are not specified; the list is a high-level recommendation based on your preferences and inventory state.

---

## Future Roadmap

- **LLM recipe generation** — replace rule-based planner with Claude / GPT for creative, personalised recipes
- **Receipt OCR** — scan grocery receipts to auto-populate inventory
- **Barcode scanning** — use phone camera to identify packaged food
- **Photo-based fridge recognition** — AI vision to detect items from a fridge photo
- **Automatic grocery list** — suggest what to buy based on depleted inventory and upcoming meal plans
- **Nutrition history tracking** — log daily intake and visualise macro trends over time
- **User authentication** — multi-user support with secure login / signup
- **Mobile app** — React Native version with camera and notification integrations
