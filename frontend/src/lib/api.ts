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

// ── Nutrition Log — manual meal & analysis ────────────────────────────────
export async function logManualMeal(data: unknown) {
  return request("/nutrition-log/manual-meal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}
export async function fetchNutritionAnalysis() {
  try { return await request("/nutrition-log/analysis/today"); } catch { return null; }
}

// ── Family ────────────────────────────────────────────────────────────────
export async function fetchFamily() { try { return await request("/family"); } catch { return null; } }
export async function fetchFamilyMembers() { try { return await request("/family/members"); } catch { return []; } }
export async function createFamilyMember(data: unknown) { return request("/family/members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); }
export async function updateFamilyMember(id: number, data: unknown) { return request(`/family/members/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); }
export async function deleteFamilyMember(id: number) { return request(`/family/members/${id}`, { method: "DELETE" }); }
export async function fetchFamilyMealPlan(memberKeys: string[]) { return request("/family/meal-plan/today", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ member_keys: memberKeys }) }); }
export async function fetchFamilyGroceryList(memberKeys: string[], daysAtHome: Record<string, number>) { return request("/family/grocery-list/weekly", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ member_keys: memberKeys, days_at_home: daysAtHome }) }); }
export async function fetchFamilySchedule() { try { return await request("/family/schedule"); } catch { return null; } }
export async function updateFamilySchedule(data: unknown) { return request("/family/schedule", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); }

// ── Locations ─────────────────────────────────────────────────────────────
export async function fetchLocations() { try { return await request("/locations"); } catch { return []; } }
export async function fetchLocationsTree() { try { return await request("/locations/tree"); } catch { return []; } }
export async function createLocation(data: unknown) { return request("/locations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); }
export async function updateLocation(id: number, data: unknown) { return request(`/locations/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); }
export async function deleteLocation(id: number) { return request(`/locations/${id}`, { method: "DELETE" }); }

// ── Inventory search ──────────────────────────────────────────────────────
export async function searchInventory(q: string, locationId?: number) {
  const params = new URLSearchParams({ q });
  if (locationId != null) params.append("location_id", String(locationId));
  try { return await request(`/inventory/search?${params}`); } catch { return []; }
}

// ── AI Nutrition Assistant ────────────────────────────────────────────────
export async function assistantChat(payload: {
  message: string;
  conversation_id?: string;
  mode?: "rag" | "agent";
  confirm_log_meal?: boolean;
}) {
  return request("/assistant/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function assistantIngest(force = false) {
  return request("/assistant/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force }),
  });
}

export async function assistantSources() {
  try { return await request("/assistant/sources"); } catch { return { total_sources: 0, sources: [] }; }
}

export async function assistantConversation(conversationId: string) {
  try { return await request(`/assistant/conversations/${conversationId}`); } catch { return null; }
}
