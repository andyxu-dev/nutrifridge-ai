"""
Local nutrition database for 40+ common foods.
Used for autofilling inventory item nutrition values and food search.
"""
from typing import Optional

FOOD_DB = [
    {"id": 1,  "name": "beef",          "aliases": ["ground beef", "beef mince", "minced beef"],              "calories_per_100g": 250, "protein_per_100g": 26.0, "carbs_per_100g": 0.0,  "fat_per_100g": 17.0, "category": "meat"},
    {"id": 2,  "name": "chicken breast","aliases": ["chicken", "grilled chicken", "chicken fillet"],          "calories_per_100g": 165, "protein_per_100g": 31.0, "carbs_per_100g": 0.0,  "fat_per_100g": 3.6,  "category": "meat"},
    {"id": 3,  "name": "salmon",        "aliases": ["salmon fillet", "atlantic salmon", "smoked salmon"],     "calories_per_100g": 208, "protein_per_100g": 20.0, "carbs_per_100g": 0.0,  "fat_per_100g": 13.0, "category": "meat"},
    {"id": 4,  "name": "egg",           "aliases": ["eggs", "chicken egg", "whole egg", "large egg"],         "calories_per_100g": 155, "protein_per_100g": 13.0, "carbs_per_100g": 1.1,  "fat_per_100g": 11.0, "category": "other"},
    {"id": 5,  "name": "greek yogurt",  "aliases": ["greek yoghurt", "plain yogurt", "yogurt", "greek yogurt"], "calories_per_100g": 59,  "protein_per_100g": 10.0, "carbs_per_100g": 3.6,  "fat_per_100g": 0.4,  "category": "dairy"},
    {"id": 6,  "name": "milk",          "aliases": ["whole milk", "skim milk", "low-fat milk", "dairy milk"], "calories_per_100g": 61,  "protein_per_100g": 3.2,  "carbs_per_100g": 4.8,  "fat_per_100g": 3.3,  "category": "dairy"},
    {"id": 7,  "name": "tofu",          "aliases": ["firm tofu", "silken tofu", "bean curd"],                 "calories_per_100g": 76,  "protein_per_100g": 8.0,  "carbs_per_100g": 1.9,  "fat_per_100g": 4.8,  "category": "other"},
    {"id": 8,  "name": "rice",          "aliases": ["white rice", "jasmine rice", "basmati rice", "dry rice"],"calories_per_100g": 365, "protein_per_100g": 7.1,  "carbs_per_100g": 80.0, "fat_per_100g": 0.7,  "category": "grain"},
    {"id": 9,  "name": "cooked rice",   "aliases": ["steamed rice", "boiled rice", "cooked white rice"],      "calories_per_100g": 130, "protein_per_100g": 2.7,  "carbs_per_100g": 28.0, "fat_per_100g": 0.3,  "category": "grain"},
    {"id": 10, "name": "oats",          "aliases": ["rolled oats", "oatmeal", "porridge oats", "oat"],        "calories_per_100g": 389, "protein_per_100g": 17.0, "carbs_per_100g": 66.0, "fat_per_100g": 7.0,  "category": "grain"},
    {"id": 11, "name": "bread",         "aliases": ["white bread", "whole wheat bread", "whole grain bread"],  "calories_per_100g": 265, "protein_per_100g": 9.0,  "carbs_per_100g": 49.0, "fat_per_100g": 3.2,  "category": "grain"},
    {"id": 12, "name": "pasta",         "aliases": ["spaghetti", "penne", "fusilli", "dried pasta", "noodles"],"calories_per_100g": 371, "protein_per_100g": 13.0, "carbs_per_100g": 74.0, "fat_per_100g": 1.5,  "category": "grain"},
    {"id": 13, "name": "potato",        "aliases": ["potatoes", "white potato", "russet potato"],             "calories_per_100g": 77,  "protein_per_100g": 2.0,  "carbs_per_100g": 17.0, "fat_per_100g": 0.1,  "category": "vegetable"},
    {"id": 14, "name": "sweet potato",  "aliases": ["yam", "sweet potatoes", "kumara"],                       "calories_per_100g": 86,  "protein_per_100g": 1.6,  "carbs_per_100g": 20.0, "fat_per_100g": 0.1,  "category": "vegetable"},
    {"id": 15, "name": "banana",        "aliases": ["bananas"],                                                "calories_per_100g": 89,  "protein_per_100g": 1.1,  "carbs_per_100g": 23.0, "fat_per_100g": 0.3,  "category": "fruit"},
    {"id": 16, "name": "apple",         "aliases": ["apples", "red apple", "green apple"],                    "calories_per_100g": 52,  "protein_per_100g": 0.3,  "carbs_per_100g": 14.0, "fat_per_100g": 0.2,  "category": "fruit"},
    {"id": 17, "name": "strawberry",    "aliases": ["strawberries", "fresh strawberries"],                    "calories_per_100g": 32,  "protein_per_100g": 0.7,  "carbs_per_100g": 7.7,  "fat_per_100g": 0.3,  "category": "fruit"},
    {"id": 18, "name": "blueberry",     "aliases": ["blueberries"],                                            "calories_per_100g": 57,  "protein_per_100g": 0.7,  "carbs_per_100g": 14.0, "fat_per_100g": 0.3,  "category": "fruit"},
    {"id": 19, "name": "spinach",       "aliases": ["baby spinach", "spinach leaves", "fresh spinach"],       "calories_per_100g": 23,  "protein_per_100g": 2.9,  "carbs_per_100g": 3.6,  "fat_per_100g": 0.4,  "category": "vegetable"},
    {"id": 20, "name": "broccoli",      "aliases": ["broccoli florets", "fresh broccoli"],                    "calories_per_100g": 34,  "protein_per_100g": 2.8,  "carbs_per_100g": 7.0,  "fat_per_100g": 0.4,  "category": "vegetable"},
    {"id": 21, "name": "carrot",        "aliases": ["carrots", "baby carrots"],                               "calories_per_100g": 41,  "protein_per_100g": 0.9,  "carbs_per_100g": 10.0, "fat_per_100g": 0.2,  "category": "vegetable"},
    {"id": 22, "name": "tomato",        "aliases": ["tomatoes", "cherry tomatoes", "roma tomato"],            "calories_per_100g": 18,  "protein_per_100g": 0.9,  "carbs_per_100g": 3.9,  "fat_per_100g": 0.2,  "category": "vegetable"},
    {"id": 23, "name": "onion",         "aliases": ["onions", "yellow onion", "white onion", "red onion"],    "calories_per_100g": 40,  "protein_per_100g": 1.1,  "carbs_per_100g": 9.3,  "fat_per_100g": 0.1,  "category": "vegetable"},
    {"id": 24, "name": "garlic",        "aliases": ["garlic cloves", "fresh garlic", "minced garlic"],        "calories_per_100g": 149, "protein_per_100g": 6.4,  "carbs_per_100g": 33.0, "fat_per_100g": 0.5,  "category": "condiment"},
    {"id": 25, "name": "lettuce",       "aliases": ["romaine lettuce", "iceberg lettuce", "salad leaves"],    "calories_per_100g": 15,  "protein_per_100g": 1.4,  "carbs_per_100g": 2.9,  "fat_per_100g": 0.2,  "category": "vegetable"},
    {"id": 26, "name": "avocado",       "aliases": ["avocados", "hass avocado"],                              "calories_per_100g": 160, "protein_per_100g": 2.0,  "carbs_per_100g": 9.0,  "fat_per_100g": 15.0, "category": "fruit"},
    {"id": 27, "name": "olive oil",     "aliases": ["extra virgin olive oil", "evoo", "cooking oil"],         "calories_per_100g": 884, "protein_per_100g": 0.0,  "carbs_per_100g": 0.0,  "fat_per_100g": 100.0,"category": "condiment"},
    {"id": 28, "name": "peanut butter", "aliases": ["natural peanut butter", "crunchy peanut butter", "pb"],  "calories_per_100g": 588, "protein_per_100g": 25.0, "carbs_per_100g": 20.0, "fat_per_100g": 50.0, "category": "other"},
    {"id": 29, "name": "almonds",       "aliases": ["almond", "raw almonds", "roasted almonds", "almond nuts"],"calories_per_100g": 579, "protein_per_100g": 21.0, "carbs_per_100g": 22.0, "fat_per_100g": 50.0, "category": "snack"},
    {"id": 30, "name": "cheese",        "aliases": ["cheddar", "mozzarella", "parmesan", "shredded cheese"],  "calories_per_100g": 402, "protein_per_100g": 25.0, "carbs_per_100g": 1.3,  "fat_per_100g": 33.0, "category": "dairy"},
    {"id": 31, "name": "turkey",        "aliases": ["ground turkey", "turkey breast", "turkey mince"],        "calories_per_100g": 189, "protein_per_100g": 29.0, "carbs_per_100g": 0.0,  "fat_per_100g": 7.4,  "category": "meat"},
    {"id": 32, "name": "pork",          "aliases": ["pork loin", "pork chop", "ground pork"],                 "calories_per_100g": 242, "protein_per_100g": 27.0, "carbs_per_100g": 0.0,  "fat_per_100g": 14.0, "category": "meat"},
    {"id": 33, "name": "shrimp",        "aliases": ["prawns", "cooked shrimp", "tiger prawns"],               "calories_per_100g": 99,  "protein_per_100g": 24.0, "carbs_per_100g": 0.2,  "fat_per_100g": 0.3,  "category": "meat"},
    {"id": 34, "name": "tuna",          "aliases": ["canned tuna", "tuna fish", "tuna in water"],             "calories_per_100g": 132, "protein_per_100g": 29.0, "carbs_per_100g": 0.0,  "fat_per_100g": 1.0,  "category": "meat"},
    {"id": 35, "name": "black beans",   "aliases": ["canned black beans", "cooked black beans"],              "calories_per_100g": 132, "protein_per_100g": 8.9,  "carbs_per_100g": 24.0, "fat_per_100g": 0.5,  "category": "other"},
    {"id": 36, "name": "chickpeas",     "aliases": ["garbanzo beans", "canned chickpeas", "cooked chickpeas"],"calories_per_100g": 164, "protein_per_100g": 8.9,  "carbs_per_100g": 27.0, "fat_per_100g": 2.6,  "category": "other"},
    {"id": 37, "name": "lentils",       "aliases": ["red lentils", "green lentils", "cooked lentils"],        "calories_per_100g": 116, "protein_per_100g": 9.0,  "carbs_per_100g": 20.0, "fat_per_100g": 0.4,  "category": "other"},
    {"id": 38, "name": "cucumber",      "aliases": ["cucumbers", "english cucumber", "lebanese cucumber"],    "calories_per_100g": 15,  "protein_per_100g": 0.7,  "carbs_per_100g": 3.6,  "fat_per_100g": 0.1,  "category": "vegetable"},
    {"id": 39, "name": "bell pepper",   "aliases": ["capsicum", "red pepper", "green pepper", "yellow pepper","sweet pepper"], "calories_per_100g": 31, "protein_per_100g": 1.0, "carbs_per_100g": 7.2, "fat_per_100g": 0.3, "category": "vegetable"},
    {"id": 40, "name": "mushroom",      "aliases": ["mushrooms", "button mushrooms", "cremini mushrooms", "portobello"], "calories_per_100g": 22, "protein_per_100g": 3.1, "carbs_per_100g": 3.3, "fat_per_100g": 0.3, "category": "vegetable"},
]


def search_foods(query: str) -> list:
    """Case-insensitive search across name and aliases. Returns all partial matches."""
    q = query.lower().strip()
    if not q:
        return []
    results = []
    for food in FOOD_DB:
        if q in food["name"].lower() or any(q in alias.lower() for alias in food["aliases"]):
            results.append(food)
    return results


def find_best_match(name: str) -> Optional[dict]:
    """Return the single best-matching food for a given item name, or None."""
    q = name.lower().strip()

    # 1. Exact name match
    for food in FOOD_DB:
        if food["name"].lower() == q:
            return food

    # 2. Exact alias match
    for food in FOOD_DB:
        if any(q == alias.lower() for alias in food["aliases"]):
            return food

    # 3. Partial name match (longest match wins)
    best = None
    best_len = 0
    for food in FOOD_DB:
        if q in food["name"].lower():
            if len(food["name"]) > best_len:
                best, best_len = food, len(food["name"])
        for alias in food["aliases"]:
            if q in alias.lower() and len(alias) > best_len:
                best, best_len = food, len(alias)

    return best
