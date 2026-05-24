import { vi } from "vitest";

// Default datasets — tests can override via setMockData
let tables: Array<{ id: string; label: string; notes: string | null; is_active: boolean }> = [];
let rooms: Array<{
  id: string;
  name: string;
  building: string | null;
  floor: string | null;
  notes: string | null;
  is_active: boolean;
}> = [];

// Capture last operation so tests can assert payloads
export const lastOp: {
  table?: string;
  type?: "select" | "insert" | "update" | "delete";
  payload?: unknown;
  eqId?: string;
} = {};

export function setMockTables(t: typeof tables) {
  tables = t;
}
export function setMockRooms(r: typeof rooms) {
  rooms = r;
}
export function resetMockData() {
  tables = [];
  rooms = [];
  for (const k of Object.keys(lastOp)) delete (lastOp as Record<string, unknown>)[k];
}

function dataFor(table: string) {
  return table === "tables" ? tables : rooms;
}

function builder(table: string) {
  const state: { type?: "select" | "insert" | "update" | "delete"; payload?: unknown; eqId?: string } = {};

  const exec = async () => {
    lastOp.table = table;
    lastOp.type = state.type;
    lastOp.payload = state.payload;
    lastOp.eqId = state.eqId;

    if (state.type === "select") {
      return { data: dataFor(table), error: null };
    }
    if (state.type === "insert") {
      return { data: null, error: null };
    }
    if (state.type === "update") {
      return { data: null, error: null };
    }
    if (state.type === "delete") {
      return { data: null, error: null };
    }
    return { data: null, error: null };
  };

  const api: Record<string, unknown> = {
    select: () => {
      state.type = "select";
      return api;
    },
    insert: (payload: unknown) => {
      state.type = "insert";
      state.payload = payload;
      return api;
    },
    update: (payload: unknown) => {
      state.type = "update";
      state.payload = payload;
      return api;
    },
    delete: () => {
      state.type = "delete";
      return api;
    },
    eq: (_col: string, val: string) => {
      state.eqId = val;
      return api;
    },
    order: () => api,
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      exec().then(resolve, reject),
  };
  return api;
}

export const supabase = {
  from: vi.fn((table: string) => builder(table)),
};
