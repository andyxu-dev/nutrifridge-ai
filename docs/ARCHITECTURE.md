# NutriFridge AI — Architecture

## System Overview

NutriFridge AI is a full-stack nutrition and fridge management application consisting of three layers:

| Layer | Technology | Port | Status |
|-------|-----------|------|--------|
| Frontend | Next.js 14, TypeScript, TailwindCSS | 3000 | **Active** |
| Backend (Python) | FastAPI, SQLAlchemy 2.0, Pydantic v2, SQLite | 8000 | **Active** |
| Backend (Java) | Spring Boot 3.2, Spring WebFlux, PostgreSQL | 8080 | **Implemented — not wired into active UI** |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Next.js 14 Frontend (TypeScript / TailwindCSS)                 │
│  • Dashboard, Profile, Inventory, Grocery List, Family pages    │
│  • Navbar, reusable components (StatCard, ProgressBar, Badge)   │
│  • API client library (src/lib/api.ts)                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │ REST/JSON  http://localhost:8000
          ┌────────────────▼────────────────────────────────────┐
          │  FastAPI Backend (Python 3.11+)                     │
          │  • 10 routers (profile, inventory, nutrition, etc.) │
          │  • SQLAlchemy 2.0 ORM                               │
          │  • 8 domain services                                │
          │  • SQLite database (nutrifridge.db)                 │
          └──────┬──────────────────────────────────────────────┘
                 │ HTTP WebClient (async, not yet called by UI)
                 ▼
     ┌────────────────────────────────────────┐
     │  Spring Boot Microservice (Java 17)    │
     │  :8080  (nutrition-core)               │
     │  • Async meal-plan jobs (HTTP 202)     │
     │  • Health constraint strategy pattern  │
     │  • PostgreSQL for job-state persistence│
     └────────────────────────────────────────┘
```

**Active request path:** Browser → FastAPI (port 8000) → SQLite  
**Java integration path:** FastAPI → Spring Boot (port 8080) → PostgreSQL  
**Current status:** Java service is fully built and tested but FastAPI does not call it in any active code path. The Spring Boot service includes a `FastApiNutritionClient` configured to call FastAPI back if needed.

---

## Environment Variables

### Frontend (`frontend/.env.local`)

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://127.0.0.1:8000` | FastAPI base URL (must be `NEXT_PUBLIC_` prefix for browser access) |

### FastAPI (`backend/`)

| Variable | Default | Description |
|----------|---------|-------------|
| `SQLALCHEMY_DATABASE_URL` | `sqlite:///./nutrifridge.db` | SQLite file path (see `backend/app/database.py`) |

### Spring Boot (`backend-java/src/main/resources/application.yml`)

| Variable | Default | Description |
|----------|---------|-------------|
| `SERVER_PORT` | `8080` | Spring Boot HTTP port |
| `DATABASE_URL` | `jdbc:postgresql://localhost:5432/nutrifridge_java` | PostgreSQL JDBC URL |
| `DATABASE_USERNAME` | `nutrifridge` | PostgreSQL user |
| `DATABASE_PASSWORD` | (required) | PostgreSQL password |
| `FASTAPI_BASE_URL` | `http://localhost:8000` | FastAPI URL for WebClient |
| `FASTAPI_CONNECT_TIMEOUT_MS` | `3000` | WebClient connect timeout |
| `FASTAPI_READ_TIMEOUT_MS` | `8000` | WebClient read timeout |
| `FASTAPI_RETRY_MAX_ATTEMPTS` | `3` | Retry count on transient failures |
| `FASTAPI_RETRY_DELAY_MS` | `500` | Initial backoff delay (exponential) |
| `ASYNC_CORE_POOL_SIZE` | `4` | mealPlanExecutor core threads |
| `ASYNC_MAX_POOL_SIZE` | `8` | mealPlanExecutor max threads |
| `ASYNC_QUEUE_CAPACITY` | `50` | mealPlanExecutor queue depth |

---

## Startup Sequence

### FastAPI

1. `backend/app/main.py` imports all model modules (triggers SQLAlchemy class registration)
2. `Base.metadata.create_all(bind=engine)` creates any missing tables (including new `household_meal_schedules` from Week 6)
3. CORS middleware added (allows all origins in dev)
4. All 10 routers registered under their path prefixes
5. Uvicorn serves on port 8000

**Start command:**
```bash
cd backend && source ../venv/bin/activate && uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend && npm run dev          # development on port 3000
cd frontend && npm run build && npm start  # production
```

### Spring Boot

```bash
cd backend-java && ./mvnw spring-boot:run
# Requires PostgreSQL running; Flyway runs V1–V4 migrations on startup
```

---

## Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| DB for Python | SQLite | Zero-config for local dev; swap to PostgreSQL via env var |
| DB for Java | PostgreSQL | Required for async job state to survive pod restarts |
| Java integration | Not wired into UI | Java service is standalone; FastAPI does not delegate to it at runtime |
| Async pattern (Java) | HTTP 202 + polling | Prevents request timeout for CPU-intensive meal planning |
| Locking (Java) | Pessimistic read + optimistic `@Version` | Double defense against concurrent inventory writes |
| Unit conversion | Mass only; blocks discrete | Prevents nonsensical conversions (cups → grams) |
| Table creation | `create_all` (Python) | No migration files for Python schema; acceptable for SQLite dev use |
| Schema migration (Java) | Flyway V1–V4 | Production-grade; transactional, version-controlled |

---

## Technology Versions

| Component | Version |
|-----------|---------|
| Python | 3.11+ |
| FastAPI | Latest (via `requirements.txt`) |
| SQLAlchemy | 2.0 |
| Pydantic | v2 |
| Uvicorn | Latest |
| Node.js | 18+ (LTS) |
| Next.js | 14 (App Router) |
| TypeScript | 5+ |
| TailwindCSS | 3 |
| Java | 17 |
| Spring Boot | 3.2.5 |
| Spring WebFlux | (included in Spring Boot 3.2.5) |
| Flyway | (included in Spring Boot 3.2.5) |
| H2 (test only) | Latest |
