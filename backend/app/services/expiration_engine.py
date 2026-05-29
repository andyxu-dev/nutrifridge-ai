from datetime import date
from typing import Optional, List

RISK_ORDER = {"expired": 0, "high": 1, "medium": 2, "low": 3, "unknown": 4}


def get_expiration_risk(best_before_date: Optional[date]) -> str:
    if best_before_date is None:
        return "unknown"

    today = date.today()
    days_left = (best_before_date - today).days

    if days_left < 0:
        return "expired"
    elif days_left <= 2:
        return "high"
    elif days_left <= 5:
        return "medium"
    else:
        return "low"


def sort_by_risk(items: List) -> List:
    return sorted(
        items,
        key=lambda item: RISK_ORDER.get(get_expiration_risk(item.best_before_date), 4),
    )
