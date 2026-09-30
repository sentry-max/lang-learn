import { describe, it, expect } from "vitest";
import { formatCountdown, isTimeWarning, joinDuration, splitDuration } from "@domain/services/Duration";
import { afterRating, DEFAULT_PREFERENCES, normalizePreferences } from "@domain/entities/Preferences";
import { MAX_TIMER_SECONDS, isValidTimerSeconds, normalizeQuizSettings } from "@domain/entities/QuizSettings";

describe("durations", () => {
  it("splits and joins hours, minutes and seconds", () => {
    expect(splitDuration(3725)).toEqual({ hours: 1, minutes: 2, seconds: 5 });
    expect(joinDuration({ hours: 1, minutes: 2, seconds: 5 })).toBe(3725);
    expect(joinDuration({ hours: NaN, minutes: -3, seconds: 9 })).toBe(9);
  });

  it("formats countdowns, rounding up", () => {
    expect(formatCountdown(65_000)).toBe("1:05");
    expect(formatCountdown(3_725_000)).toBe("1:02:05");
    expect(formatCountdown(100)).toBe("0:01");
    expect(formatCountdown(-5)).toBe("0:00");
  });

  it("warns in the last 15%", () => {
    expect(isTimeWarning(16_000, 100_000)).toBe(false);
    expect(isTimeWarning(15_000, 100_000)).toBe(true);
  });

  it("accepts 1 second to 5 hours", () => {
    expect(isValidTimerSeconds(0)).toBe(false);
    expect(isValidTimerSeconds(1)).toBe(true);
    expect(isValidTimerSeconds(MAX_TIMER_SECONDS)).toBe(true);
    expect(isValidTimerSeconds(MAX_TIMER_SECONDS + 1)).toBe(false);
    expect(normalizeQuizSettings({ timerMode: "word", wordTimerSeconds: 999999 }).wordTimerSeconds).toBe(MAX_TIMER_SECONDS);
  });
});

describe("preferences", () => {
  it("fills missing values with defaults and clamps delays", () => {
    const p = normalizePreferences({ theme: "dark", ratingBehavior: { bad: { autoAdvance: true, delaySeconds: 999 } } });
    expect(p.theme).toBe("dark");
    expect(p.fontSize).toBe("medium");
    expect(p.ratingBehavior.bad).toEqual({ showAnswer: true, autoAdvance: true, delaySeconds: 60 });
    expect(p.ratingBehavior.good).toEqual(DEFAULT_PREFERENCES.ratingBehavior.good);
  });

  it("shows known words for 2 seconds by default and waits after mistakes", () => {
    expect(afterRating(DEFAULT_PREFERENCES, "easy")).toEqual({ reveal: true, advanceAfterMs: 2000 });
    expect(afterRating(DEFAULT_PREFERENCES, "very_bad")).toEqual({ reveal: true, advanceAfterMs: null });
  });

  it("moves on at once when auto-advancing without showing the answer", () => {
    const p = normalizePreferences({ ratingBehavior: { good: { showAnswer: false, autoAdvance: true, delaySeconds: 3 } } });
    expect(afterRating(p, "good")).toEqual({ reveal: false, advanceAfterMs: 0 });
  });
});
