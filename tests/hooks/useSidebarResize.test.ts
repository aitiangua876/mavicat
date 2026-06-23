import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useSidebarResize } from "../../src/hooks/useSidebarResize";

describe("useSidebarResize", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("should initialize with default width (256)", () => {
    const { result } = renderHook(() => useSidebarResize());
    expect(result.current.sidebarWidth).toBe(256);
  });

  it("should initialize with saved width from localStorage", () => {
    localStorage.setItem("mavicat_sidebar_width", "300");
    const { result } = renderHook(() => useSidebarResize());
    expect(result.current.sidebarWidth).toBe(300);
  });

  it("should update width on resize", () => {
    const { result } = renderHook(() => useSidebarResize());
    const { startResize } = result.current;

    // Simulate start resize
    const preventDefault = vi.fn();
    startResize({ preventDefault } as unknown as React.MouseEvent);

    expect(document.body.style.cursor).toBe("col-resize");

    // Simulate mouse move (new width = 1000 - 64 = 936 -> clamped to 600)
    // Actually let's try a valid width. 300 + 64 = 364
    act(() => {
      const moveEvent = new MouseEvent("mousemove", { clientX: 364 });
      document.dispatchEvent(moveEvent);
    });

    expect(result.current.sidebarWidth).toBe(300);
  });

  it("should clamp width between MIN (150) and MAX (600)", () => {
    const { result } = renderHook(() => useSidebarResize());
    const { startResize } = result.current;

    const preventDefault = vi.fn();
    startResize({ preventDefault } as unknown as React.MouseEvent);

    // Try too small (100 - 64 = 36 < 150) -> should clamp to 150.
    act(() => {
      const moveEvent = new MouseEvent("mousemove", { clientX: 100 });
      document.dispatchEvent(moveEvent);
    });
    expect(result.current.sidebarWidth).toBe(150);

    // Try too large (1000 - 64 = 936 > 600) -> should clamp to 600.
    act(() => {
      const moveEvent = new MouseEvent("mousemove", { clientX: 1000 });
      document.dispatchEvent(moveEvent);
    });
    expect(result.current.sidebarWidth).toBe(600);
  });

  it("should keep resizing after the pointer crosses the left edge", () => {
    const { result } = renderHook(() => useSidebarResize());
    const { startResize } = result.current;

    startResize({ preventDefault: vi.fn() } as unknown as React.MouseEvent);

    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 20 }));
    });
    expect(result.current.sidebarWidth).toBe(150);
    expect(document.body.style.cursor).toBe("col-resize");

    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 364 }));
    });
    expect(result.current.sidebarWidth).toBe(300);
  });

  it("should stop resizing on mouseup and save to localStorage", () => {
    const { result } = renderHook(() => useSidebarResize());
    const { startResize } = result.current;

    const preventDefault = vi.fn();
    startResize({ preventDefault } as unknown as React.MouseEvent);

    // Move to valid width
    act(() => {
      const moveEvent = new MouseEvent("mousemove", { clientX: 364 }); // 300px
      document.dispatchEvent(moveEvent);
    });

    // Stop resize
    act(() => {
      const upEvent = new MouseEvent("mouseup");
      document.dispatchEvent(upEvent);
    });

    expect(document.body.style.cursor).toBe("default");
    expect(localStorage.getItem("mavicat_sidebar_width")).toBe("300");
  });
});
