import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ThemeProvider, useTheme } from "../lib/theme-context";

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

  it("toggles to dark mode", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );
    act(() => {
      fireEvent.click(screen.getByTestId("toggle-dark"));
    });
    expect(screen.getByTestId("theme").textContent).toBe("dark");
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
  });

  it("toggles back to light mode", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );
    act(() => {
      fireEvent.click(screen.getByTestId("toggle-dark"));
    });
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
    act(() => {
      fireEvent.click(screen.getByTestId("toggle-light"));
    });
    expect(screen.getByTestId("resolved").textContent).toBe("light");
  });

  it("persists theme to localStorage", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );
    act(() => {
      fireEvent.click(screen.getByTestId("toggle-dark"));
    });
    expect(localStorage.getItem("nexus_theme")).toBe("dark");
  });

  it("applies .dark class to document element", () => {
    render(
      <ThemeProvider>
        <ThemeConsumer />
      </ThemeProvider>
    );
    act(() => {
      fireEvent.click(screen.getByTestId("toggle-dark"));
    });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    act(() => {
      fireEvent.click(screen.getByTestId("toggle-light"));
    });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
