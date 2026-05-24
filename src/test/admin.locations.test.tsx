import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock supabase client BEFORE importing the component
vi.mock("@/integrations/supabase/client", async () => {
  const mod = await import("./supabase-mock");
  return { supabase: mod.supabase };
});

// Mock @tanstack/react-router's createFileRoute so importing the route file is safe
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
  lastOp,
  supabase,
} from "./supabase-mock";
import { toast } from "sonner";

describe("LocationsPage - Kelola Lokasi", () => {
  beforeEach(() => {
    resetMockData();
    vi.clearAllMocks();
  });

  describe("Initial render", () => {
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
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Meja \(2\)/i })).toBeInTheDocument();
      });
    });

    it("renders table list with labels", async () => {
      setMockTables([
        { id: "a", label: "VIP-1", notes: "Dekat jendela", is_active: true },
      ]);
      render(<LocationsPage />);
      expect(await screen.findByText(/Meja VIP-1/i)).toBeInTheDocument();
      expect(screen.getByText("Dekat jendela")).toBeInTheDocument();
    });

    it("renders rooms when rooms tab is selected", async () => {
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

  describe("Add Table", () => {
    it("opens modal and inserts a new table with trimmed payload", async () => {
      render(<LocationsPage />);
      await userEvent.click(await screen.findByRole("button", { name: /Tambah Meja/i }));

      const labelInput = await screen.findByPlaceholderText(/Contoh: 11 atau VIP-A/i);
      await userEvent.type(labelInput, "  12  ");
      await userEvent.type(screen.getByPlaceholderText(/Dekat jendela/i), "  Pojok  ");
      await userEvent.click(screen.getByRole("button", { name: /^Simpan$/i }));

      await waitFor(() => {
        expect(lastOp.type).toBe("insert");
        expect(lastOp.table).toBe("tables");
        expect(lastOp.payload).toEqual({ label: "12", notes: "Pojok" });
      });
      expect(toast.success).toHaveBeenCalledWith("Tersimpan");
    });

    it("rejects empty label and does not call supabase insert", async () => {
      render(<LocationsPage />);
      await userEvent.click(await screen.findByRole("button", { name: /Tambah Meja/i }));
      await userEvent.click(await screen.findByRole("button", { name: /^Simpan$/i }));

      expect(toast.error).toHaveBeenCalledWith("Label meja wajib diisi");
      expect(lastOp.type).not.toBe("insert");
    });

    it("stores notes as null when empty", async () => {
      render(<LocationsPage />);
      await userEvent.click(await screen.findByRole("button", { name: /Tambah Meja/i }));
      await userEvent.type(await screen.findByPlaceholderText(/Contoh: 11/i), "7");
      await userEvent.click(screen.getByRole("button", { name: /^Simpan$/i }));

      await waitFor(() => {
        expect(lastOp.payload).toEqual({ label: "7", notes: null });
      });
    });
  });

  describe("Edit Table", () => {
    it("opens modal pre-filled and issues update with row id", async () => {
      setMockTables([{ id: "tbl-1", label: "5", notes: "old", is_active: true }]);
      render(<LocationsPage />);

      // pencil = first edit button on the rendered row
      const editButtons = await screen.findAllByRole("button");
      const pencil = editButtons.find((b) => b.querySelector("svg.lucide-pencil"));
      expect(pencil).toBeTruthy();
      await userEvent.click(pencil!);

      const labelInput = await screen.findByDisplayValue("5");
      await userEvent.clear(labelInput);
      await userEvent.type(labelInput, "9");
      await userEvent.click(screen.getByRole("button", { name: /^Simpan$/i }));

      await waitFor(() => {
        expect(lastOp.type).toBe("update");
        expect(lastOp.table).toBe("tables");
        expect(lastOp.eqId).toBe("tbl-1");
        expect(lastOp.payload).toMatchObject({ label: "9" });
      });
    });
  });

  describe("Toggle active", () => {
    it("flips is_active when status pill is clicked", async () => {
      setMockTables([{ id: "tbl-x", label: "3", notes: null, is_active: true }]);
      render(<LocationsPage />);
      const pill = await screen.findByRole("button", { name: /^Aktif$/i });
      await userEvent.click(pill);

      await waitFor(() => {
        expect(lastOp.type).toBe("update");
        expect(lastOp.eqId).toBe("tbl-x");
        expect(lastOp.payload).toEqual({ is_active: false });
      });
    });
  });

  describe("Delete table", () => {
    it("calls delete after confirm", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      setMockTables([{ id: "del-1", label: "4", notes: null, is_active: true }]);
      render(<LocationsPage />);

      const buttons = await screen.findAllByRole("button");
      const trash = buttons.find((b) => b.querySelector("svg.lucide-trash-2"));
      await userEvent.click(trash!);

      await waitFor(() => {
        expect(lastOp.type).toBe("delete");
        expect(lastOp.table).toBe("tables");
        expect(lastOp.eqId).toBe("del-1");
      });
    });

    it("does NOT delete when confirm is cancelled", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(false);
      setMockTables([{ id: "keep-1", label: "4", notes: null, is_active: true }]);
      render(<LocationsPage />);

      const buttons = await screen.findAllByRole("button");
      const trash = buttons.find((b) => b.querySelector("svg.lucide-trash-2"));
      await userEvent.click(trash!);

      // brief wait to ensure no async write happened
      await new Promise((r) => setTimeout(r, 30));
      expect(lastOp.type).not.toBe("delete");
    });
  });

  describe("Add Room", () => {
    it("inserts a room with trimmed/nulled fields", async () => {
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
        expect(lastOp.type).toBe("insert");
        expect(lastOp.table).toBe("rooms");
        expect(lastOp.payload).toEqual({
          name: "Lab AI",
          building: "Gedung C",
          floor: "3",
          notes: null,
        });
      });
    });

    it("rejects empty name", async () => {
      render(<LocationsPage />);
      await userEvent.click(await screen.findByRole("button", { name: /Ruangan \(0\)/i }));
      await userEvent.click(screen.getByRole("button", { name: /Tambah Ruangan/i }));
      await userEvent.click(await screen.findByRole("button", { name: /^Simpan$/i }));

      expect(toast.error).toHaveBeenCalledWith("Nama ruangan wajib diisi");
      expect(supabase.from).not.toHaveBeenCalledWith("rooms");
    });
  });
});
