import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { useDeadline } from "@presentation/hooks/useCountdown";

function Probe({ deadline, running, onExpire }: { deadline: number | null; running: boolean; onExpire: () => void }) {
  useDeadline(deadline, running, onExpire);
  return null;
}

describe("useDeadline", () => {
  afterEach(() => vi.useRealTimers());

  it("fires once at the deadline and not while stopped", () => {
    vi.useFakeTimers();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const onExpire = vi.fn();
    const root = createRoot(document.createElement("div"));
    const deadline = Date.now() + 1000;

    act(() => root.render(createElement(Probe, { deadline, running: false, onExpire })));
    act(() => void vi.advanceTimersByTime(2000));
    expect(onExpire).not.toHaveBeenCalled();

    const later = Date.now() + 1000;
    act(() => root.render(createElement(Probe, { deadline: later, running: true, onExpire })));
    act(() => void vi.advanceTimersByTime(999));
    expect(onExpire).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(1));
    expect(onExpire).toHaveBeenCalledTimes(1);
    act(() => void vi.advanceTimersByTime(5000));
    expect(onExpire).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });
});
