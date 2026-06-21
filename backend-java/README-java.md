# NutriFridge AI — Nutrition Core Service (Spring Boot)

A production-grade Java microservice that handles nutrition analysis, meal logging, and async meal-plan generation for NutriFridge AI.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Next.js 14 Frontend  (TypeScript / Tailwind CSS)               │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTPS
         ┌─────────────────────▼──────────────────────┐
         │  FastAPI Backend  (Python 3.12 / SQLite)    │
         │  • Food search & inventory CRUD             │
         │  • Meal logging & daily nutrition log       │
         │  • Profile management                       │
         └──────┬────────────────────────────┬─────────┘
                │ WebClient (async HTTP)       │
                ▼                             │
  ┌─────────────────────────────┐            │
  │  Spring Boot Service        │            │
  │  nutrition-core  :8081      │            │
  │  • POST /meal-plans/jobs    │            │
  │  • GET  /meal-plans/jobs/id │            │
  │  • POST /meals/log          │            │
  │  • GET  /nutrition/analysis │            │
  │  • GET  /actuator/health    │            │
  └──────────────┬──────────────┘            │
                 │ JPA / Flyway              │
                 ▼                           ▼
         ┌───────────────────────────────────────────┐
         │           PostgreSQL                       │
         │  inventory_items  (w/ @Version locking)   │
         │  daily_nutrition_logs                      │
         │  meal_logs                                 │
         │  meal_plan_jobs                            │
         └───────────────────────────────────────────┘
```

## Module Layout

```
backend-java/
├── pom.xml
└── src/
    ├── main/
    │   ├── java/com/nutrifridge/core/
    │   │   ├── NutritionCoreApplication.java
    │   │   ├── client/          FastApiNutritionClient   (WebClient + retry)
    │   │   ├── config/          AsyncConfig, CorsConfig, WebClientConfig
    │   │   ├── constraint/      HealthConstraintPolicy (Strategy pattern)
    │   │   │   ├── AllergyPolicy
    │   │   │   ├── DiabetesPolicy
    │   │   │   ├── FattyLiverPolicy
    │   │   │   ├── HighCholesterolPolicy
    │   │   │   └── LactoseIntolerancePolicy
    │   │   ├── controller/      MealLogController, MealPlanController, NutritionAnalysisController
    │   │   ├── domain/          JPA entities (InventoryItem, DailyNutritionLog, MealLog, MealPlanJob)
    │   │   ├── dto/             Request/Response records
    │   │   ├── exception/       GlobalExceptionHandler, domain exceptions
    │   │   ├── repository/      Spring Data JPA interfaces
    │   │   └── service/         Business logic
    │   └── resources/
    │       ├── application.yml
    │       └── db/migration/    V1–V4 Flyway SQL migrations
    └── test/
        └── java/com/nutrifridge/core/
            ├── constraint/      AllergyPolicyTest, HealthConstraintServiceTest
            ├── controller/      MealLogControllerTest, MealPlanControllerTest
            └── service/         MealLogServiceTest, MealPlanServiceTest, NutritionAnalysisServiceTest
```

## Key Design Decisions

### Strategy Pattern — Health Constraints

`HealthConstraintPolicy` is a Spring-discovered interface. Each condition (fatty liver, diabetes, allergies, high cholesterol, lactose intolerance) is a `@Component` that implements:

- `conditionKey()` — the condition identifier
- `appliesTo(UserProfileDto)` — whether this policy is active for a given user
- `adjustTarget(MacroTotals, UserProfileDto)` — modify calorie/macro targets
- `hardExcludedFoodFragments(UserProfileDto)` — foods to exclude from meal plans
- `tagPenalties()` — scoring penalties for tags (e.g. `"fried"` → -20)
- `warnings(MacroTotals, MacroTotals, UserProfileDto)` — health warnings to display

`HealthConstraintService` auto-collects all policies via constructor injection and composes them:

```java
public HealthConstraintService(List<HealthConstraintPolicy> policies) { ... }
```

### Concurrency — Async Job Pattern

`POST /api/v1/meal-plans/jobs` returns HTTP 202 immediately. Work is handed to a bounded `ThreadPoolTaskExecutor` (`mealPlanExecutor`) via `CompletableFuture.runAsync()`. Status transitions (PENDING → RUNNING → SUCCEEDED/FAILED) are persisted to PostgreSQL so they survive JVM restarts and can be queried across instances.

```
submitJob()
  ├── save job as PENDING  ──► return 202 + jobId
  └── runAsync(executeJob)
        ├── updateStatus(RUNNING)
        ├── fastApiClient.getInventoryItems()  // live inventory
        ├── apply health constraints
        ├── build meal suggestions
        └── markSucceeded(resultJson) or markFailed(message)
```

The executor is bounded with `CallerRunsPolicy` — a flood of requests slows the caller rather than growing an unbounded queue.

### Concurrency — Optimistic Locking on Inventory

`InventoryItem` carries `@Version long version`. The meal-log write path uses two defence layers:

1. `findByIdForUpdate()` with `@Lock(PESSIMISTIC_WRITE)` — only one thread can read-then-write the same row
2. `saveAndFlush()` — immediately triggers the version check; an `ObjectOptimisticLockingFailureException` is caught and re-thrown as `InventoryConflictException` → HTTP 409 (client retries)

### HTTP Client — WebClient with Retry

`FastApiNutritionClient` uses Spring WebFlux's `WebClient` backed by Netty:

```
connectTimeout(FASTAPI_CONNECT_TIMEOUT_MS)
responseTimeout(FASTAPI_READ_TIMEOUT_MS)
retryWhen(Retry.backoff(FASTAPI_RETRY_MAX, Duration.ofMillis(FASTAPI_RETRY_DELAY_MS))
          .filter(e -> e instanceof ConnectException || e instanceof ReadTimeoutException))
```

Retry is scoped to transient network errors only — 4xx/5xx from FastAPI are converted to `RuntimeException` by the status error filter and are **not** retried.

## REST API

### POST `/api/v1/meal-plans/jobs`
Submit an async meal-plan generation job.

```bash
curl -X POST http://localhost:8081/api/v1/meal-plans/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "profile": {
      "name": "Alex",
      "ageYears": 30,
      "sex": "male",
      "weightKg": 75,
      "heightCm": 175,
      "activityLevel": "moderate",
      "goal": "maintenance",
      "healthConditions": ["fatty_liver"],
      "allergies": ["peanuts"],
      "strictAvoidFoods": []
    },
    "baseTarget":  { "calories": 2000, "proteinG": 150, "carbsG": 200, "fatG": 65 },
    "consumed":    { "calories": 800,  "proteinG": 60,  "carbsG": 100, "fatG": 25  }
  }'
# → 202 Accepted   {"jobId": "uuid", "status": "PENDING"}
# → Location: /api/v1/meal-plans/jobs/uuid
```

### GET `/api/v1/meal-plans/jobs/{jobId}`
Poll job status.

```bash
curl http://localhost:8081/api/v1/meal-plans/jobs/uuid
# → {"jobId":"uuid","status":"SUCCEEDED","result":{...},"errorMessage":null}
```

### POST `/api/v1/meals/log`
Atomically log a meal and deduct inventory.

```bash
curl -X POST http://localhost:8081/api/v1/meals/log \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "default",
    "mealType": "lunch",
    "mealName": "Grilled Chicken",
    "calories": 400, "proteinG": 35, "carbsG": 10, "fatG": 8,
    "ingredientsUsed": [
      { "inventoryItemId": 1, "itemName": "Chicken Breast", "quantityUsed": 150, "unit": "g" }
    ]
  }'
# → 200 OK   { dailyConsumed, target, remaining, macroStatus }
# → 409 INVENTORY_CONFLICT   (optimistic lock race — client should retry)
# → 409 INVENTORY_INSUFFICIENT
```

### GET `/api/v1/nutrition/analysis/today`
Today's nutrition snapshot with health warnings.

```bash
curl "http://localhost:8081/api/v1/nutrition/analysis/today?userId=default&ageYears=30&sex=male&weightKg=75&heightCm=175&activityLevel=moderate&goal=maintenance&healthConditions=fatty_liver"
# → { consumed, target, remaining, macroStatus, healthWarnings, recommendation, disclaimer }
```

### GET `/actuator/health`

```bash
curl http://localhost:8081/actuator/health
# → {"status":"UP","components":{"db":{"status":"UP"},"diskSpace":{"status":"UP"}}}
```

## Running Locally

### Prerequisites

- Java 17 (Temurin recommended)
- Maven 3.9+
- PostgreSQL 14+ running locally

### Database setup

```sql
CREATE DATABASE nutrifridge;
CREATE USER nutrifridge_user WITH PASSWORD 'nutrifridge_pass';
GRANT ALL PRIVILEGES ON DATABASE nutrifridge TO nutrifridge_user;
```

### Run

```bash
export DATABASE_URL=jdbc:postgresql://localhost:5432/nutrifridge
export DB_USER=nutrifridge_user
export DB_PASSWORD=nutrifridge_pass
export FASTAPI_BASE_URL=http://localhost:8000  # FastAPI backend URL

JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home \
  ./mvnw spring-boot:run
```

Flyway runs migrations automatically on startup. Service listens on port 8081 by default.

### Run tests

```bash
JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home \
  mvn clean test
# → Tests run: 40, Failures: 0, Errors: 0, Skipped: 0

# Build executable JAR
JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home \
  mvn package -DskipTests
java -jar target/nutrition-core-1.0.0.jar
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | JDBC URL for PostgreSQL |
| `DB_USER` | — | Database username |
| `DB_PASSWORD` | — | Database password |
| `FASTAPI_BASE_URL` | `http://localhost:8000` | FastAPI backend base URL |
| `FASTAPI_CONNECT_TIMEOUT_MS` | `3000` | WebClient connect timeout |
| `FASTAPI_READ_TIMEOUT_MS` | `10000` | WebClient read timeout |
| `FASTAPI_RETRY_MAX` | `3` | Max retry attempts |
| `FASTAPI_RETRY_DELAY_MS` | `500` | Initial backoff delay |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated allowed origins |
| `ASYNC_POOL_CORE` | `4` | Meal-plan executor core pool size |
| `ASYNC_POOL_MAX` | `10` | Meal-plan executor max pool size |

## Resume Bullets

- Built a Spring Boot 3 microservice (Java 17) integrating with an existing FastAPI backend via Spring WebFlux `WebClient` with configurable connect/read timeouts and exponential backoff retry scoped to transient network errors
- Implemented the Strategy pattern for health constraints (`HealthConstraintPolicy` interface with five `@Component` implementations — FattyLiver, Diabetes, Allergy, HighCholesterol, LactoseIntolerance) auto-discovered via constructor injection of `List<HealthConstraintPolicy>`
- Designed an async job pattern for meal-plan generation: `POST /meal-plans/jobs` returns HTTP 202 immediately; a bounded `ThreadPoolTaskExecutor` (CallerRunsPolicy) persists PENDING → RUNNING → SUCCEEDED/FAILED transitions to PostgreSQL so status survives restarts
- Enforced concurrent inventory safety with two defence layers: pessimistic `PESSIMISTIC_WRITE` lock on read + `@Version` optimistic lock on flush; `ObjectOptimisticLockingFailureException` mapped to HTTP 409 for client-driven retry
- Managed schema evolution with four Flyway migrations and validated correctness on H2 (PostgreSQL compatibility mode) in 40 JUnit 5 / Mockito tests across controller (`@WebMvcTest`), service, and policy layers
- Exposed operational endpoints via Spring Boot Actuator (health, metrics, info) and configured CORS via env vars for multi-origin deployments
