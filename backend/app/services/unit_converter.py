"""
Simple unit conversion utility for inventory deduction.

Mass units are converted precisely.
Volume/count units only deduct when units match exactly.
"""
from typing import Optional, Tuple

# Conversion factors to grams
MASS_TO_GRAMS: dict[str, float] = {
    "g": 1.0,
    "gram": 1.0,
    "grams": 1.0,
    "kg": 1000.0,
    "kilogram": 1000.0,
    "kilograms": 1000.0,
    "lb": 453.592,
    "lbs": 453.592,
    "pound": 453.592,
    "pounds": 453.592,
    "oz": 28.3495,
    "ounce": 28.3495,
    "ounces": 28.3495,
}

# Units that cannot be cross-converted
DISCRETE_UNITS = {"count", "bag", "cup", "cups", "ml", "l", "litre", "liter", "piece", "pieces", "slice", "slices"}


def _normalise(unit: str) -> str:
    return unit.lower().strip()


def is_mass_unit(unit: str) -> bool:
    return _normalise(unit) in MASS_TO_GRAMS


def to_grams(quantity: float, unit: str) -> Optional[float]:
    """Convert quantity in the given unit to grams. Returns None if unit is not a mass unit."""
    factor = MASS_TO_GRAMS.get(_normalise(unit))
    return quantity * factor if factor is not None else None


def deduct_quantity(
    item_quantity: float,
    item_unit: str,
    used_quantity: float,
    used_unit: str,
) -> Tuple[float, Optional[str]]:
    """
    Calculate the new item quantity after deducting used_quantity.

    Returns:
        (new_quantity, warning_message_or_None)

    Rules:
    - Exact unit match → direct subtraction.
    - Both mass units → convert to grams, subtract, convert back.
    - Otherwise → skip deduction, return a warning.
    """
    norm_item = _normalise(item_unit)
    norm_used = _normalise(used_unit)

    # Exact match
    if norm_item == norm_used:
        return max(0.0, round(item_quantity - used_quantity, 4)), None

    # Both are mass units → cross-convert
    if norm_item in MASS_TO_GRAMS and norm_used in MASS_TO_GRAMS:
        item_grams = item_quantity * MASS_TO_GRAMS[norm_item]
        used_grams = used_quantity * MASS_TO_GRAMS[norm_used]
        remaining_grams = max(0.0, item_grams - used_grams)
        new_qty = round(remaining_grams / MASS_TO_GRAMS[norm_item], 4)
        return new_qty, None

    # Cannot convert
    warning = (
        f"Unit mismatch: item stored in '{item_unit}', "
        f"deduction requested in '{used_unit}'. Inventory not updated."
    )
    return item_quantity, warning
