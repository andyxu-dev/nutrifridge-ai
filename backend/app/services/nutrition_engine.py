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

    return {
        "calories": round(calories),
        "protein_g": round(protein_g, 1),
        "carbs_g": round(carbs_g, 1),
        "fat_g": round(fat_g, 1),
        "bmr": round(bmr),
        "tdee": round(tdee),
    }
