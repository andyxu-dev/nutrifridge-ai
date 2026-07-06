"""
LLM Tool Service — defines and executes the allowlisted tools available to Claude.

Tools are grouped by access type:
  READ-ONLY  — query data, no writes
  WRITE      — log_meal (requires explicit user confirmation)

All tools are scoped to the single active user (single-user app).
Arguments are validated via Pydantic models before execution.
"""

import json
from datetime import date
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.inventory import InventoryItem
from app.models.nutrition_log import DailyLog, MealLog
from app.services.expiration_engine import get_expiration_risk
from app.services.food_database import FOOD_DB
from app.services.nutrition_engine import calculate_nutrition_target
from app.services.meal_planner import generate_meal_plan


# ── Argument schemas (Pydantic, validated before execution) ────────────────

class GetInventoryItemArgs(BaseModel):
    name: str = Field(..., description="Partial or full name of the inventory item to look up")


class GetExpiredRiskArgs(BaseModel):
    item_name: str = Field(..., description="Name of the inventory item to check expiration risk for")


class SearchFoodNutritionArgs(BaseModel):
    query: str = Field(..., description="Food name to search in the nutrition database")


class GetRecentMealLogsArgs(BaseModel):
    limit: int = Field(default=5, ge=1, le=20, description="Number of recent meal logs to return (1–20)")


class LogMealArgs(BaseModel):
    meal_type: str = Field(..., description="One of: breakfast, lunch, dinner, snack")
    meal_name: str = Field(..., description="Name of the meal")
    calories: float = Field(..., gt=0, description="Total calories in kcal")
    protein_g: float = Field(..., ge=0, description="Protein in grams")
    carbs_g: float = Field(..., ge=0, description="Carbohydrates in grams")
    fat_g: float = Field(..., ge=0, description="Fat in grams")
    notes: Optional[str] = Field(default=None, description="Optional notes about the meal")
    ingredients_used: List[Dict] = Field(
        default_factory=list,
        description="List of ingredients: [{name, quantity, unit}]"
    )


# ── Anthropic tool schema definitions ─────────────────────────────────────

TOOL_SCHEMAS = [
    {
        "name": "get_user_profile",
        "description": (
            "Retrieve the current user's profile including name, age, sex, weight, height, "
            "activity level, goal, health conditions, allergies, diet style, and macro targets."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "list_inventory",
        "description": (
            "List all items currently in the user's food inventory with their quantities, "
            "units, expiration dates, and expiration risk levels."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_inventory_item",
        "description": "Look up a specific inventory item by name (partial match supported).",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Partial or full name of the inventory item",
                }
            },
            "required": ["name"],
        },
    },
    {
        "name": "get_expiring_items",
        "description": (
            "Get a list of inventory items that are expiring soon "
            "(expired, high risk within 2 days, or medium risk within 5 days)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_expiration_risk",
        "description": "Get the expiration risk level for a specific inventory item by name.",
        "input_schema": {
            "type": "object",
            "properties": {
                "item_name": {
                    "type": "string",
                    "description": "Name of the inventory item",
                }
            },
            "required": ["item_name"],
        },
    },
    {
        "name": "search_food_nutrition",
        "description": (
            "Search the food nutrition database for a food item and return "
            "its per-100g macronutrient values (calories, protein, carbs, fat)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Food name to search for",
                }
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_daily_macro_summary",
        "description": (
            "Get today's nutrition summary: macro targets, amount consumed so far, "
            "and remaining budget for calories, protein, carbs, and fat."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_recent_meal_logs",
        "description": "Get the most recently logged meals for today.",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Number of meal logs to return (1–20, default 5)",
                    "minimum": 1,
                    "maximum": 20,
                }
            },
            "required": [],
        },
    },
    {
        "name": "get_recommended_meals",
        "description": (
            "Generate today's meal recommendations based on current inventory, "
            "user profile, health constraints, and remaining daily macro targets."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "log_meal",
        "description": (
            "Log a meal to the user's nutrition diary. "
            "IMPORTANT: Always show the user a preview of the meal details and ask for confirmation "
            "BEFORE calling this tool. Only call this after the user has explicitly confirmed."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "meal_type": {
                    "type": "string",
                    "enum": ["breakfast", "lunch", "dinner", "snack"],
                    "description": "Type of meal",
                },
                "meal_name": {"type": "string", "description": "Name of the meal"},
                "calories": {"type": "number", "minimum": 1, "description": "Total calories in kcal"},
                "protein_g": {"type": "number", "minimum": 0, "description": "Protein in grams"},
                "carbs_g": {"type": "number", "minimum": 0, "description": "Carbohydrates in grams"},
                "fat_g": {"type": "number", "minimum": 0, "description": "Fat in grams"},
                "notes": {"type": "string", "description": "Optional notes"},
                "ingredients_used": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "quantity": {"type": "number"},
                            "unit": {"type": "string"},
                        },
                        "required": ["name", "quantity", "unit"],
                    },
                    "description": "Ingredients with quantities",
                },
            },
            "required": ["meal_type", "meal_name", "calories", "protein_g", "carbs_g", "fat_g"],
        },
    },
]


# ── Tool execution ─────────────────────────────────────────────────────────

def execute_tool(
    tool_name: str,
    tool_input: Dict,
    db: Session,
    confirmed_log_meal: bool = False,
) -> Dict:
    """
    Execute a tool call and return a structured result.

    For log_meal: if confirmed_log_meal is False, returns a preview and
    requires_confirmation=True instead of writing to the database.

    Returns:
      {
        "result": any,             # tool output data
        "summary": str,            # user-facing one-line summary
        "requires_confirmation": bool,
        "meal_log_preview": dict | None,
        "error": str | None,
      }
    """
    _ALLOWED = {s["name"] for s in TOOL_SCHEMAS}
    if tool_name not in _ALLOWED:
        return _error(f"Tool '{tool_name}' is not in the allowlist.")

    try:
        if tool_name == "get_user_profile":
            return _get_user_profile(db)
        elif tool_name == "list_inventory":
            return _list_inventory(db)
        elif tool_name == "get_inventory_item":
            args = GetInventoryItemArgs(**tool_input)
            return _get_inventory_item(args.name, db)
        elif tool_name == "get_expiring_items":
            return _get_expiring_items(db)
        elif tool_name == "get_expiration_risk":
            args = GetExpiredRiskArgs(**tool_input)
            return _get_expiration_risk(args.item_name, db)
        elif tool_name == "search_food_nutrition":
            args = SearchFoodNutritionArgs(**tool_input)
            return _search_food_nutrition(args.query)
        elif tool_name == "get_daily_macro_summary":
            return _get_daily_macro_summary(db)
        elif tool_name == "get_recent_meal_logs":
            limit = tool_input.get("limit", 5)
            args = GetRecentMealLogsArgs(limit=limit)
            return _get_recent_meal_logs(args.limit, db)
        elif tool_name == "get_recommended_meals":
            return _get_recommended_meals(db)
        elif tool_name == "log_meal":
            args = LogMealArgs(**tool_input)
            return _log_meal(args, db, confirmed_log_meal)
        else:
            return _error(f"Tool '{tool_name}' handler not implemented.")
    except Exception as e:
        return _error(str(e))


# ── Individual tool handlers ───────────────────────────────────────────────

def _get_user_profile(db: Session) -> Dict:
    user = db.query(User).first()
    if not user:
        return _error("No user profile found.")
    import json as _j
    result = {
        "name": user.name,
        "age": user.age,
        "sex": user.sex,
        "weight_kg": user.weight_kg,
        "height_cm": user.height_cm,
        "activity_level": user.activity_level,
        "goal": user.goal,
        "diet_style": user.diet_style,
        "cuisine_preference": user.cuisine_preference,
        "health_conditions": _parse_list(user.health_conditions),
        "allergies": _parse_list(user.allergies),
        "strict_avoid_foods": _parse_list(user.strict_avoid_foods),
        "macro_strategy": user.macro_strategy,
    }
    return {
        "result": result,
        "summary": f"Retrieved profile for {user.name}",
        "requires_confirmation": False,
        "meal_log_preview": None,
        "error": None,
    }


def _list_inventory(db: Session) -> Dict:
    items = db.query(InventoryItem).all()
    result = []
    for item in items:
        result.append({
            "id": item.id,
            "name": item.name,
            "quantity": item.quantity,
            "unit": item.unit,
            "category": item.category,
            "zone": item.zone,
            "best_before_date": str(item.best_before_date) if item.best_before_date else None,
            "expiration_risk": get_expiration_risk(item.best_before_date),
        })
    return {
        "result": result,
        "summary": f"Listed {len(result)} inventory items",
        "requires_confirmation": False,
        "meal_log_preview": None,
        "error": None,
    }


def _get_inventory_item(name: str, db: Session) -> Dict:
    name_lower = name.lower()
    items = db.query(InventoryItem).all()
    matches = [i for i in items if name_lower in i.name.lower()]
    if not matches:
        return {
            "result": [],
            "summary": f"No inventory item matching '{name}' found",
            "requires_confirmation": False,
            "meal_log_preview": None,
            "error": None,
        }
    result = [{
        "id": i.id,
        "name": i.name,
        "quantity": i.quantity,
        "unit": i.unit,
        "category": i.category,
        "zone": i.zone,
        "best_before_date": str(i.best_before_date) if i.best_before_date else None,
        "expiration_risk": get_expiration_risk(i.best_before_date),
        "calories_per_100g": i.calories_per_100g,
        "protein_per_100g": i.protein_per_100g,
        "carbs_per_100g": i.carbs_per_100g,
        "fat_per_100g": i.fat_per_100g,
    } for i in matches]
    return {
        "result": result,
        "summary": f"Found {len(result)} item(s) matching '{name}'",
        "requires_confirmation": False,
        "meal_log_preview": None,
        "error": None,
    }


def _get_expiring_items(db: Session) -> Dict:
    items = db.query(InventoryItem).all()
    expiring = []
    for item in items:
        risk = get_expiration_risk(item.best_before_date)
        if risk in ("expired", "high", "medium"):
            expiring.append({
                "name": item.name,
                "quantity": item.quantity,
                "unit": item.unit,
                "best_before_date": str(item.best_before_date) if item.best_before_date else None,
                "expiration_risk": risk,
            })
    expiring.sort(key=lambda x: {"expired": 0, "high": 1, "medium": 2}.get(x["expiration_risk"], 3))
    return {
        "result": expiring,
        "summary": f"Found {len(expiring)} items expiring soon",
        "requires_confirmation": False,
        "meal_log_preview": None,
        "error": None,
    }


def _get_expiration_risk(item_name: str, db: Session) -> Dict:
    name_lower = item_name.lower()
    items = db.query(InventoryItem).all()
    matches = [i for i in items if name_lower in i.name.lower()]
    if not matches:
        return {
            "result": {"item_name": item_name, "risk": "not_found"},
            "summary": f"Item '{item_name}' not found in inventory",
            "requires_confirmation": False,
            "meal_log_preview": None,
            "error": None,
        }
    item = matches[0]
    risk = get_expiration_risk(item.best_before_date)
    days_left = None
    if item.best_before_date:
        days_left = (item.best_before_date - date.today()).days
    return {
        "result": {
            "item_name": item.name,
            "best_before_date": str(item.best_before_date) if item.best_before_date else None,
            "days_until_expiry": days_left,
            "expiration_risk": risk,
        },
        "summary": f"{item.name} — expiration risk: {risk}" + (f" ({days_left} days left)" if days_left is not None else ""),
        "requires_confirmation": False,
        "meal_log_preview": None,
        "error": None,
    }


def _search_food_nutrition(query: str) -> Dict:
    query_lower = query.lower().strip()
    matches = [f for f in FOOD_DB if query_lower in f["name"].lower()]
    if not matches:
        # Try word-level partial match
        query_words = set(query_lower.split())
        matches = [f for f in FOOD_DB if query_words & set(f["name"].lower().split())]
    result = matches[:5]  # return up to 5 matches
    return {
        "result": result,
        "summary": (
            f"Found {len(result)} nutrition entries matching '{query}'"
            if result else f"No nutrition data found for '{query}'"
        ),
        "requires_confirmation": False,
        "meal_log_preview": None,
        "error": None,
    }


def _get_daily_macro_summary(db: Session) -> Dict:
    user = db.query(User).first()
    if not user:
        return _error("No user profile found.")
    target = calculate_nutrition_target(user)
    daily_log = db.query(DailyLog).filter(DailyLog.date == date.today()).first()
    consumed = {
        "calories": round(daily_log.calories_consumed, 1) if daily_log else 0.0,
        "protein_g": round(daily_log.protein_consumed_g, 1) if daily_log else 0.0,
        "carbs_g": round(daily_log.carbs_consumed_g, 1) if daily_log else 0.0,
        "fat_g": round(daily_log.fat_consumed_g, 1) if daily_log else 0.0,
    }
    remaining = {
        key: max(0.0, round(target[key] - consumed[key], 1))
        for key in ["calories", "protein_g", "carbs_g", "fat_g"]
    }
    result = {
        "date": str(date.today()),
        "target": {k: target[k] for k in ["calories", "protein_g", "carbs_g", "fat_g"]},
        "consumed": consumed,
        "remaining": remaining,
    }
    return {
        "result": result,
        "summary": (
            f"Today: {consumed['calories']}/{target['calories']} kcal consumed, "
            f"{remaining['protein_g']}g protein remaining"
        ),
        "requires_confirmation": False,
        "meal_log_preview": None,
        "error": None,
    }


def _get_recent_meal_logs(limit: int, db: Session) -> Dict:
    today_log = db.query(DailyLog).filter(DailyLog.date == date.today()).first()
    if not today_log:
        return {
            "result": [],
            "summary": "No meals logged today",
            "requires_confirmation": False,
            "meal_log_preview": None,
            "error": None,
        }
    logs = (
        db.query(MealLog)
        .filter(MealLog.daily_log_id == today_log.id)
        .order_by(MealLog.id.desc())
        .limit(limit)
        .all()
    )
    result = [{
        "id": m.id,
        "meal_type": m.meal_type,
        "meal_name": m.meal_name,
        "calories": m.calories,
        "protein_g": m.protein_g,
        "carbs_g": m.carbs_g,
        "fat_g": m.fat_g,
        "notes": m.notes,
    } for m in logs]
    return {
        "result": result,
        "summary": f"Retrieved {len(result)} meal log(s) for today",
        "requires_confirmation": False,
        "meal_log_preview": None,
        "error": None,
    }


def _get_recommended_meals(db: Session) -> Dict:
    user = db.query(User).first()
    if not user:
        return _error("No user profile found.")
    inventory = db.query(InventoryItem).all()
    if not inventory:
        return {
            "result": [],
            "summary": "No inventory items to plan meals from",
            "requires_confirmation": False,
            "meal_log_preview": None,
            "error": None,
        }
    target = calculate_nutrition_target(user)
    daily_log = db.query(DailyLog).filter(DailyLog.date == date.today()).first()
    consumed = {
        "calories": round(daily_log.calories_consumed, 1) if daily_log else 0.0,
        "protein_g": round(daily_log.protein_consumed_g, 1) if daily_log else 0.0,
        "carbs_g": round(daily_log.carbs_consumed_g, 1) if daily_log else 0.0,
        "fat_g": round(daily_log.fat_consumed_g, 1) if daily_log else 0.0,
    }
    remaining = {k: max(0.0, target[k] - consumed[k]) for k in ["calories", "protein_g", "carbs_g", "fat_g"]}
    plan = generate_meal_plan(user, inventory, remaining_macros=remaining, consumed=consumed)
    meals_summary = [
        {
            "meal_type": m["meal_type"],
            "name": m["name"],
            "score": m["score"],
            "estimated_macros": m["estimated_macros"],
            "reason": m["reason"],
            "recommendation_reasons": m.get("recommendation_reasons", []),
            "urgent_ingredients_used": m.get("urgent_ingredients_used", []),
        }
        for m in plan.get("meals", [])
    ]
    return {
        "result": meals_summary,
        "summary": f"Generated {len(meals_summary)} meal recommendation(s)",
        "requires_confirmation": False,
        "meal_log_preview": None,
        "error": None,
    }


def _log_meal(args: LogMealArgs, db: Session, confirmed: bool) -> Dict:
    """If not confirmed, return preview. If confirmed, write to DB."""
    preview = {
        "meal_type": args.meal_type,
        "meal_name": args.meal_name,
        "calories": args.calories,
        "protein_g": args.protein_g,
        "carbs_g": args.carbs_g,
        "fat_g": args.fat_g,
        "notes": args.notes,
        "ingredients_used": args.ingredients_used,
    }

    if not confirmed:
        return {
            "result": None,
            "summary": (
                f"Ready to log: {args.meal_name} ({args.calories} kcal, "
                f"{args.protein_g}g protein) — awaiting user confirmation"
            ),
            "requires_confirmation": True,
            "meal_log_preview": preview,
            "error": None,
        }

    # Execute the write
    from app.services.nutrition_engine import calculate_nutrition_target

    user = db.query(User).first()
    if not user:
        return _error("No user profile found; cannot log meal.")

    today = date.today()
    daily_log = db.query(DailyLog).filter(DailyLog.date == today).first()
    if not daily_log:
        daily_log = DailyLog(
            user_id=user.id,
            date=today,
            calories_consumed=0.0,
            protein_consumed_g=0.0,
            carbs_consumed_g=0.0,
            fat_consumed_g=0.0,
        )
        db.add(daily_log)
        db.flush()

    meal_log = MealLog(
        daily_log_id=daily_log.id,
        meal_type=args.meal_type,
        meal_name=args.meal_name,
        calories=args.calories,
        protein_g=args.protein_g,
        carbs_g=args.carbs_g,
        fat_g=args.fat_g,
        ingredients_used=json.dumps(args.ingredients_used),
        source="assistant",
        notes=args.notes or "",
    )
    db.add(meal_log)

    daily_log.calories_consumed = round(daily_log.calories_consumed + args.calories, 1)
    daily_log.protein_consumed_g = round(daily_log.protein_consumed_g + args.protein_g, 1)
    daily_log.carbs_consumed_g = round(daily_log.carbs_consumed_g + args.carbs_g, 1)
    daily_log.fat_consumed_g = round(daily_log.fat_consumed_g + args.fat_g, 1)

    db.commit()

    return {
        "result": {"logged": True, "meal_log_id": meal_log.id},
        "summary": f"Logged {args.meal_name} ({args.calories} kcal) to today's nutrition diary",
        "requires_confirmation": False,
        "meal_log_preview": None,
        "error": None,
    }


# ── Helpers ────────────────────────────────────────────────────────────────

def _error(msg: str) -> Dict:
    return {
        "result": None,
        "summary": f"Error: {msg}",
        "requires_confirmation": False,
        "meal_log_preview": None,
        "error": msg,
    }


def _parse_list(val) -> List[str]:
    if val is None:
        return []
    if isinstance(val, list):
        return val
    try:
        parsed = json.loads(val)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []
