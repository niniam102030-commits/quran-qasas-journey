// src/store/__tests__/usePreferencesStore.test.ts
import { beforeEach, describe, expect, it } from "vitest";
import { usePreferencesStore } from "../usePreferencesStore";

describe("usePreferencesStore appTheme & darkMode", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    const mockStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    };
    const attrs = new Map<string, string>();
    const classes = new Set<string>();
    const mockDocument = {
      documentElement: {
        setAttribute: (k: string, v: string) => attrs.set(k, v),
        removeAttribute: (k: string) => attrs.delete(k),
        getAttribute: (k: string) => attrs.get(k) ?? null,
        classList: {
          toggle: (cls: string, force?: boolean) => {
            if (force === undefined) {
              if (classes.has(cls)) classes.delete(cls);
              else classes.add(cls);
            } else if (force) {
              classes.add(cls);
            } else {
              classes.delete(cls);
            }
          },
          remove: (cls: string) => classes.delete(cls),
          contains: (cls: string) => classes.has(cls),
        },
      },
    };
    Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
    Object.defineProperty(globalThis, "localStorage", { value: mockStorage, configurable: true });
    Object.defineProperty(globalThis, "document", { value: mockDocument, configurable: true });
    usePreferencesStore.getState().initPreferences();
  });

  it("defaults to appTheme='default' and darkMode=false", () => {
    const state = usePreferencesStore.getState();
    expect(state.appTheme).toBe("default");
    expect(state.darkMode).toBe(false);
    expect(document.documentElement.getAttribute("data-app-theme")).toBeNull();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("sets data-app-theme='rose' and persists app_theme in localStorage", () => {
    usePreferencesStore.getState().setAppTheme("rose");
    expect(usePreferencesStore.getState().appTheme).toBe("rose");
    expect(localStorage.getItem("app_theme")).toBe("rose");
    expect(document.documentElement.getAttribute("data-app-theme")).toBe("rose");

    // Re-init reads from localStorage
    document.documentElement.removeAttribute("data-app-theme");
    usePreferencesStore.getState().initPreferences();
    expect(usePreferencesStore.getState().appTheme).toBe("rose");
    expect(document.documentElement.getAttribute("data-app-theme")).toBe("rose");
  });

  it("supports all 4 combinations independently (default/rose x light/dark)", () => {
    usePreferencesStore.getState().setAppTheme("rose");
    usePreferencesStore.getState().setDarkMode(true);
    expect(document.documentElement.getAttribute("data-app-theme")).toBe("rose");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    usePreferencesStore.getState().setAppTheme("default");
    expect(document.documentElement.getAttribute("data-app-theme")).toBeNull();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("app_theme")).toBe("default");
  });
});
