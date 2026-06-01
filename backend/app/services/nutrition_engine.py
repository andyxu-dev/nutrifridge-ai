from typing import Dict

ACTIVITY_MULTIPLIERS = {
    "sedentary": 1.2,
    "light": 1.375,
    "moderate": 1.55,
    "active": 1.725,
    "very_active": 1.9,
}


def calculate_bmr(user) -> float:
    if user.sex == "male":
        return 10 * user.weight_kg + 6.25 * user.height_cm - 5 * user.age + 5
    elif user.sex == "female":
        return 10 * user.weight_kg + 6.25 * user.height_cm - 5 * user.age - 161
    else:
        male = 10 * user.weight_kg + 6.25 * user.height_cm - 5 * user.age + 5
        female = 10 * user.weight_kg + 6.25 * user.height_cm - 5 * user.age - 161
        return (male + female) / 2


def calculate_nutrition_target(user) -> Dict:
    """
    Calculate the daily nutrition target for a user.

    Returns both the base targets (from BMR/TDEE) and adjusted targets
    (after applying health conditions and macro strategy).
    The top-level calories/protein_g/carbs_g/fat_g reflect the adjusted values
    for backward compatibility with all existing callers.
    """
    from app.services.health_constraint_engine import adjust_nutrition_target

    bmr = calculate_bmr(user)
    tdee = bmr * ACTIVITY_MULTIPLIERS[user.activity_level]

    if user.goal == "fat_loss":
        calories = tdee - 400
        protein_g = 1.8 * user.weight_kg
    elif user.goal == "muscle_gain":
        calories = tdee + 300
        protein_g = 2.0 * user.weight_kg
    else:  # maintenance
        calories = tdee
        protein_g = 1.5 * user.weight_kg

    fat_g = (calories * 0.25) / 9
    protein_calories = protein_g * 4
    fat_calories = fat_g * 9
    carbs_g = max(0, (calories - protein_calories - fat_calories) / 4)

    base_target = {
        "calories": round(calories),
        "protein_g": round(protein_g, 1),
        "carbs_g": round(carbs_g, 1),
        "fat_g": round(fat_g, 1),
        "bmr": round(bmr),
        "tdee": round(tdee),
    }

    adjusted = adjust_nutrition_target(user, base_target)

    return {
        # Adjusted values at top level for backward compatibility
        "calories": adjusted["calories"],
        "protein_g": adjusted["protein_g"],
        "carbs_g": adjusted["carbs_g"],
        "fat_g": adjusted["fat_g"],
        "bmr": round(bmr),
        "tdee": round(tdee),
        # Base values for comparison
        "base_calories": base_target["calories"],
        "base_protein_g": base_target["protein_g"],
        "base_carbs_g": base_target["carbs_g"],
        "base_fat_g": base_target["fat_g"],
        # Adjustment metadata
        "adjustment_reasons": adjusted["adjustment_reasons"],
        "using_custom_targets": adjusted["using_custom_targets"],
    }
