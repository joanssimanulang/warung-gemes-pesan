import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// jsdom doesn't implement window.confirm reliably across versions
if (!window.confirm) {
  (window as unknown as { confirm: () => boolean }).confirm = () => true;
}
