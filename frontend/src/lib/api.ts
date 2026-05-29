const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function request(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }
  return res.json();
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Profile ───────────────────────────────────────────────────────────────
export async function fetchProfile() {
  try { return await request("/profile"); } catch { return null; }
}
export async function createProfile(data: unknown) {
  return request("/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
}
export async function updateProfile(data: unknown) {
  return request("/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
}

// ── Nutrition Target ──────────────────────────────────────────────────────
export async function fetchNutritionTarget() {
  try { return await request("/nutrition-target"); } catch { return null; }
}

// ── Nutrition Log ─────────────────────────────────────────────────────────
export async function fetchNutritionLog() {
  try { return await request("/nutrition-log/today"); } catch { return null; }
}
export async function logMeal(data: unknown) {
  return request("/nutrition-log/meal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}
export async function deleteMealLog(mealLogId: number) {
  return request(`/nutrition-log/meal/${mealLogId}`, { method: "DELETE" });
}

// ── Inventory ─────────────────────────────────────────────────────────────
export async function fetchInventory() {
  try { return await request("/inventory"); } catch { return []; }
}
export async function fetchUrgentItems() {
  try { return await request("/inventory/urgent"); } catch { return []; }
}
export async function createInventoryItem(data: unknown) {
  return request("/inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
}
export async function updateInventoryItem(id: number, data: unknown) {
  return request(`/inventory/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
}
export async function deleteInventoryItem(id: number) {
  return request(`/inventory/${id}`, { method: "DELETE" });
}
export async function discardInventoryItem(id: number, reason: string, quantity?: number) {
  return request(`/inventory/${id}/discard`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason, quantity: quantity ?? null }),
  });
}

// ── Foods ─────────────────────────────────────────────────────────────────
export async function searchFoods(query: string) {
  try { return await request(`/foods/search?q=${encodeURIComponent(query)}`); } catch { return []; }
}
export async function fetchAllFoods() {
  try { return await request("/foods"); } catch { return []; }
}

// ── Meal Plan ─────────────────────────────────────────────────────────────
export async function fetchMealPlan() {
  try { return await request("/meal-plan/today"); } catch { return null; }
}

// ── Grocery List ──────────────────────────────────────────────────────────
export async function fetchGroceryList() {
  try { return await request("/grocery-list/weekly"); } catch { return null; }
}

// ── Waste Log ─────────────────────────────────────────────────────────────
export async function fetchWasteLog() {
  try { return await request("/waste-log"); } catch { return []; }
}
