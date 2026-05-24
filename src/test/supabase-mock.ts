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
export interface WriteOp {
  table: string;
  type: "insert" | "update" | "delete";
  payload?: unknown;
  eqId?: string;
}
export const writes: WriteOp[] = [];
export const lastWrite = () => writes[writes.length - 1];
export const writesFor = (table: string) => writes.filter((w) => w.table === table);

export function setMockTables(t: typeof tables) {
  tables = t;
}
export function setMockRooms(r: typeof rooms) {
  rooms = r;
}
export function resetMockData() {
  tables = [];
  rooms = [];
  writes.length = 0;
}

function dataFor(table: string) {
  return table === "tables" ? tables : rooms;
}

function builder(table: string) {
  const state: { type?: "select" | "insert" | "update" | "delete"; payload?: unknown; eqId?: string } = {};

  const exec = async () => {
    if (state.type && state.type !== "select") {
      writes.push({ table, type: state.type, payload: state.payload, eqId: state.eqId });
    }
    if (state.type === "select") {
      return { data: dataFor(table), error: null };
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
