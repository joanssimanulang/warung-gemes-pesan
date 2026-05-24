import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock supabase client BEFORE importing the component
vi.mock("@/integrations/supabase/client", async () => {
  const mod = await import("./supabase-mock");
  return { supabase: mod.supabase };
});

// Mock createFileRoute so importing the route file is safe in unit tests
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: unknown) => opts,
}));

// Mock toast
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { LocationsPage } from "@/routes/admin.locations";
import {
  setMockTables,
  setMockRooms,
  resetMockData,
  writes,
  writesFor,
  lastWrite,
  supabase,
} from "./supabase-mock";
import { toast } from "sonner";

const findIconButton = async (icon: string) => {
  const { waitFor } = await import("@testing-library/react");
  return await waitFor(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      b.querySelector(`svg.lucide-${icon}`),
    );
    if (!btn) throw new Error(`Button with icon lucide-${icon} not found`);
    return btn as HTMLButtonElement;
  });
};

describe("LocationsPage — Kelola Lokasi (TDD)", () => {
  beforeEach(() => {
    resetMockData();
    vi.clearAllMocks();
  });

  // ───────────────────────── Render ─────────────────────────
  describe("Render", () => {
    it("shows empty state when no tables exist", async () => {
      render(<LocationsPage />);
      expect(await screen.findByText(/Belum ada meja/i)).toBeInTheDocument();
    });

    it("shows tables count in tab badge", async () => {
      setMockTables([
        { id: "1", label: "1", notes: null, is_active: true },
        { id: "2", label: "2", notes: null, is_active: true },
      ]);
      render(<LocationsPage />);
      await waitFor(() =>
        expect(screen.getByRole("button", { name: /Meja \(2\)/i })).toBeInTheDocument(),
      );
    });

    it("renders table label and notes", async () => {
      setMockTables([{ id: "a", label: "VIP-1", notes: "Dekat jendela", is_active: true }]);
      render(<LocationsPage />);
      expect(await screen.findByText(/Meja VIP-1/i)).toBeInTheDocument();
      expect(screen.getByText("Dekat jendela")).toBeInTheDocument();
    });

    it("renders rooms with building and floor when rooms tab is selected", async () => {
      setMockRooms([
        {
          id: "r1",
          name: "Ruang Dosen Informatika",
          building: "Gedung A",
          floor: "2",
          notes: null,
          is_active: true,
        },
      ]);
      render(<LocationsPage />);
      await userEvent.click(await screen.findByRole("button", { name: /Ruangan \(1\)/i }));
      expect(await screen.findByText("Ruang Dosen Informatika")).toBeInTheDocument();
      expect(screen.getByText(/Gedung A · Lt\. 2/)).toBeInTheDocument();
    });
  });

  // ───────────────────────── Add Table ─────────────────────────
  describe("Add Table", () => {
    it("inserts a new table with trimmed payload", async () => {
      render(<LocationsPage />);
      await userEvent.click(await screen.findByRole("button", { name: /Tambah Meja/i }));
      await userEvent.type(await screen.findByPlaceholderText(/Contoh: 11/i), "  12  ");
      await userEvent.type(screen.getByPlaceholderText(/Dekat jendela/i), "  Pojok  ");
      await userEvent.click(screen.getByRole("button", { name: /^Simpan$/i }));

      await waitFor(() => {
        const ins = writesFor("tables").find((w) => w.type === "insert");
        expect(ins?.payload).toEqual({ label: "12", notes: "Pojok" });
      });
      expect(toast.success).toHaveBeenCalledWith("Tersimpan");
    });

    it("stores notes as null when empty", async () => {
      render(<LocationsPage />);
      await userEvent.click(await screen.findByRole("button", { name: /Tambah Meja/i }));
      await userEvent.type(await screen.findByPlaceholderText(/Contoh: 11/i), "7");
      await userEvent.click(screen.getByRole("button", { name: /^Simpan$/i }));

      await waitFor(() => {
        const ins = writesFor("tables").find((w) => w.type === "insert");
        expect(ins?.payload).toEqual({ label: "7", notes: null });
      });
    });

    it("rejects empty label and does not insert", async () => {
      render(<LocationsPage />);
      await userEvent.click(await screen.findByRole("button", { name: /Tambah Meja/i }));
      await userEvent.click(await screen.findByRole("button", { name: /^Simpan$/i }));

      expect(toast.error).toHaveBeenCalledWith("Label meja wajib diisi");
      expect(writes.find((w) => w.type === "insert")).toBeUndefined();
    });

    it("enforces 20-char max length on label input", async () => {
      render(<LocationsPage />);
      await userEvent.click(await screen.findByRole("button", { name: /Tambah Meja/i }));
      const input = (await screen.findByPlaceholderText(/Contoh: 11/i)) as HTMLInputElement;
      expect(input.maxLength).toBe(20);
    });
  });

  // ───────────────────────── Edit Table ─────────────────────────
  describe("Edit Table", () => {
    it("pre-fills modal and issues update with row id", async () => {
      setMockTables([{ id: "tbl-1", label: "5", notes: "old", is_active: true }]);
      render(<LocationsPage />);

      await userEvent.click(await findIconButton("pencil"));
      const labelInput = await screen.findByDisplayValue("5");
      await userEvent.clear(labelInput);
      await userEvent.type(labelInput, "9");
      await userEvent.click(screen.getByRole("button", { name: /^Simpan$/i }));

      await waitFor(() => {
        const upd = writesFor("tables").find((w) => w.type === "update");
        expect(upd?.eqId).toBe("tbl-1");
        expect(upd?.payload).toMatchObject({ label: "9" });
      });
    });
  });

  // ───────────────────────── Toggle active ─────────────────────────
  describe("Toggle active", () => {
    it("flips is_active to false when active pill is clicked", async () => {
      setMockTables([{ id: "tbl-x", label: "3", notes: null, is_active: true }]);
      render(<LocationsPage />);

      await userEvent.click(await screen.findByRole("button", { name: /^Aktif$/i }));

      await waitFor(() => {
        const upd = writesFor("tables").find((w) => w.type === "update");
        expect(upd?.eqId).toBe("tbl-x");
        expect(upd?.payload).toEqual({ is_active: false });
      });
    });

    it("flips is_active to true when nonactive pill is clicked", async () => {
      setMockTables([{ id: "tbl-y", label: "3", notes: null, is_active: false }]);
      render(<LocationsPage />);

      await userEvent.click(await screen.findByRole("button", { name: /^Nonaktif$/i }));

      await waitFor(() => {
        const upd = writesFor("tables").find((w) => w.type === "update");
        expect(upd?.payload).toEqual({ is_active: true });
      });
    });
  });

  // ───────────────────────── Delete ─────────────────────────
  describe("Delete table", () => {
    it("calls delete after confirm", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      setMockTables([{ id: "del-1", label: "4", notes: null, is_active: true }]);
      render(<LocationsPage />);

      await userEvent.click(await findIconButton("trash2"));

      await waitFor(() => {
        const del = writesFor("tables").find((w) => w.type === "delete");
        expect(del?.eqId).toBe("del-1");
      });
    });

    it("does NOT delete when confirm is cancelled", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(false);
      setMockTables([{ id: "keep-1", label: "4", notes: null, is_active: true }]);
      render(<LocationsPage />);

      await userEvent.click(await findIconButton("trash2"));
      await new Promise((r) => setTimeout(r, 30));
      expect(writes.find((w) => w.type === "delete")).toBeUndefined();
    });
  });

  // ───────────────────────── Add Room ─────────────────────────
  describe("Add Room", () => {
    it("inserts a room with trimmed payload and null-empty fields", async () => {
      render(<LocationsPage />);
      await userEvent.click(await screen.findByRole("button", { name: /Ruangan \(0\)/i }));
      await userEvent.click(screen.getByRole("button", { name: /Tambah Ruangan/i }));

      await userEvent.type(
        await screen.findByPlaceholderText(/Ruang Dosen Informatika/i),
        "Lab AI",
      );
      await userEvent.type(screen.getByPlaceholderText("Gedung A"), "Gedung C");
      await userEvent.type(screen.getByPlaceholderText("2"), "3");
      await userEvent.click(screen.getByRole("button", { name: /^Simpan$/i }));

      await waitFor(() => {
        const ins = writesFor("rooms").find((w) => w.type === "insert");
        expect(ins?.payload).toEqual({
          name: "Lab AI",
          building: "Gedung C",
          floor: "3",
          notes: null,
        });
      });
    });

    it("rejects empty room name", async () => {
      render(<LocationsPage />);
      await userEvent.click(await screen.findByRole("button", { name: /Ruangan \(0\)/i }));
      await userEvent.click(screen.getByRole("button", { name: /Tambah Ruangan/i }));
      await userEvent.click(await screen.findByRole("button", { name: /^Simpan$/i }));

      expect(toast.error).toHaveBeenCalledWith("Nama ruangan wajib diisi");
      expect(writesFor("rooms").find((w) => w.type === "insert")).toBeUndefined();
    });
  });

  // ───────────────────────── Smoke ─────────────────────────
  it("initial load queries both tables and rooms from supabase", async () => {
    render(<LocationsPage />);
    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith("tables");
      expect(supabase.from).toHaveBeenCalledWith("rooms");
    });
  });
});

// Avoid unused-import warning for lastWrite (exported for ad-hoc debugging)
void lastWrite;
