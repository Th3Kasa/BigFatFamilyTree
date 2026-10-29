import { describe, expect, test } from "vitest";
import { birthdayTurns, birthdayWhen, upcomingBirthdays } from "./birthdays";

const p = (id: string, birth_date: string | null, death_date: string | null = null) => ({ id, birth_date, death_date });
const ids = (list: { person: { id: string } }[]) => list.map((b) => b.person.id);

// Thursday 8 October 2026, local time.
const today = new Date(2026, 9, 8);

describe("upcomingBirthdays", () => {
  test("splits the next seven days from the rest of the month, soonest first", () => {
    const { week, month } = upcomingBirthdays(
      [p("later", "1990-10-30"), p("today", "1998-10-08"), p("sixth", "2000-10-14"), p("seventh", "2000-10-15"), p("tomorrow", "1964-10-09")],
      today,
    );
    expect(ids(week)).toEqual(["today", "tomorrow", "sixth"]);
    expect(ids(month)).toEqual(["seventh", "later"]);
    expect(week[0]).toMatchObject({ daysAway: 0, turns: 28 });
  });

  test("leaves out people who have died, and dates that aren't full dates", () => {
    const { week, month } = upcomingBirthdays(
      [p("died", "1954-10-09", "2000-03-11"), p("year-only", "1954"), p("none", null), p("bad", "1990-13-40"), p("alive", "1954-10-09", "  ")],
      today,
    );
    expect(ids(week)).toEqual(["alive"]);
    expect(month).toEqual([]);
  });

  test("a week that runs into next month (and next year) still counts", () => {
    const nye = new Date(2026, 11, 29);
    const { week, month } = upcomingBirthdays([p("jan2", "1988-01-02"), p("dec30", "2000-12-30"), p("past", "2000-12-01")], nye);
    expect(ids(week)).toEqual(["dec30", "jan2"]);
    expect(week[1]).toMatchObject({ daysAway: 4, turns: 39 });
    expect(month).toEqual([]);
  });

  test("29 February is celebrated on 28 February in other years", () => {
    const { week } = upcomingBirthdays([p("leap", "2000-02-29")], new Date(2027, 1, 27));
    expect(week[0]).toMatchObject({ month: 2, day: 28, daysAway: 1, turns: 27 });
  });
});

describe("labels", () => {
  const [b0, b1, b6] = upcomingBirthdays([p("a", "1998-10-08"), p("b", "1998-10-09"), p("c", "1998-10-14")], today).week;
  test("today, tomorrow, then weekday and date", () => {
    expect(birthdayWhen(b0, today, "en")).toBe("Today");
    expect(birthdayWhen(b1, today, "ar")).toBe("غدًا");
    expect(birthdayWhen(b6, today, "en")).toBe("Wed 14 Oct");
    expect(birthdayTurns(b6, "en")).toBe("turns 28");
  });
});
