import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const appShellPropsSpy = vi.fn();
vi.mock("@/components/app-shell", () => ({
  AppShell: (props: { databaseName?: string; children?: unknown }) => {
    appShellPropsSpy(props.databaseName);
    return <div data-testid="app-shell">{props.children as never}</div>;
  },
}));

afterEach(() => {
  cleanup();
  appShellPropsSpy.mockClear();
});

describe("AppLayout — data namespace separation (EVENT STUDIO — PHASE 2 §3)", () => {
  it("passes no databaseName override for normal FDraft (isEventStudioBuild false, the real default in this test environment) — AppShell falls through to its own real 'fdraft' default", async () => {
    vi.doMock("@/lib/event-studio-build", () => ({
      isEventStudioBuild: false,
    }));
    const { default: AppLayout } = await import("./layout");

    render(<AppLayout>child</AppLayout>);

    expect(screen.getByTestId("app-shell")).toBeInTheDocument();
    expect(appShellPropsSpy).toHaveBeenCalledWith(undefined);
  });

  it("passes a distinct 'fdraft-dev' databaseName when isEventStudioBuild is true — never the same database normal FDraft opens", async () => {
    vi.doMock("@/lib/event-studio-build", () => ({
      isEventStudioBuild: true,
    }));
    vi.resetModules();
    const { default: AppLayout } = await import("./layout");

    render(<AppLayout>child</AppLayout>);

    expect(appShellPropsSpy).toHaveBeenCalledWith("fdraft-dev");
    expect(appShellPropsSpy.mock.calls[0]?.[0]).not.toBe("fdraft");
  });
});
