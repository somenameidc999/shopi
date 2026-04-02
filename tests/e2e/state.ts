import { join } from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const STATE_FILE = join(import.meta.dir, ".state.json");

export interface E2EState {
  runId: string;
  startedAt: string;
  customers: string[];
  products: string[];
  draftOrders: string[];
}

export function emptyState(runId: string): E2EState {
  return { runId, startedAt: new Date().toISOString(), customers: [], products: [], draftOrders: [] };
}

export function loadState(): E2EState | null {
  if (!existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf-8")) as E2EState;
  } catch {
    return null;
  }
}

export function saveState(state: E2EState): void {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

export function clearState(): void {
  if (existsSync(STATE_FILE)) {
    writeFileSync(STATE_FILE, JSON.stringify(emptyState(""), null, 2), "utf-8");
  }
}

export function addCustomer(state: E2EState, id: string): void {
  state.customers.push(id);
  saveState(state);
}

export function addProduct(state: E2EState, id: string): void {
  state.products.push(id);
  saveState(state);
}

export function addDraftOrder(state: E2EState, id: string): void {
  state.draftOrders.push(id);
  saveState(state);
}
