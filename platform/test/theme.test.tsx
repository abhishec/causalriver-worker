import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeProvider, useTheme } from "../lib/theme-context";

/**
 * Theme System tests
 *
 * NOTE: BrainOS is locked to light mode only (B9 security/UX fix).
 * setTheme() ignores its argument and always coerces to "light".
 * Dark mode UI is intentionally disabled — dark-mode token leakage
 * via localStorage was causing session-confusion bugs.
 *
 * These tests verify the LOCKED behaviour:
 *   - Theme is always "light" regardless of what setTheme() is called with
 *   - localStorage always stores "light"
 *   - .dark class is never applied to documentElement
 */

function ThemeConsumer() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button data-testid="toggle-dark" onClick={() => setTheme("dark")}>Dark</button>
      <button data-testid="toggle-light" onClick={() => setTheme("light")}>Light</button>
      <button data-testid="toggle-system" onClick={() => setTheme("system")}>System</button>
    </div>
  );
}

describe("Theme System", () => {
  it("defaults to light theme", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );
    expect(screen.getByTestId("resolved").textContent).toBe("light");
  });

  it("setTheme('dark') is a no-op — stays light (light-only lock)", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );
    act(() => {
      fireEvent.click(screen.getByTestId("toggle-dark"));
    });
    // Locked: always light regardless of argument
    expect(screen.getByTestId("theme").textContent).toBe("light");
    expect(screen.getByTestId("resolved").textContent).toBe("light");
  });

  it("setTheme('light') keeps light theme", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );
    act(() => {
      fireEvent.click(screen.getByTestId("toggle-dark"));
    });
    // Still light — lock holds
    expect(screen.getByTestId("resolved").textContent).toBe("light");
    act(() => {
      fireEvent.click(screen.getByTestId("toggle-light"));
    });
    expect(screen.getByTestId("resolved").textContent).toBe("light");
  });

  it("persists 'light' to localStorage even when dark is requested", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );
    act(() => {
      fireEvent.click(screen.getByTestId("toggle-dark"));
    });
    // Lock: localStorage always writes "light", never "dark"
    expect(localStorage.getItem("nexus_theme")).toBe("light");
  });

  it("never applies .dark class to document element", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );
    act(() => {
      fireEvent.click(screen.getByTestId("toggle-dark"));
    });
    // .dark class must never be present — light-only lock
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    act(() => {
      fireEvent.click(screen.getByTestId("toggle-light"));
    });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
