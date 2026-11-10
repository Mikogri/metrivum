import { expect, it } from "vitest";
import { achievementsFor } from "./ProfileAchievements";

const now = new Date("2026-10-24T12:00:00Z").getTime();
const reached = (list: ReturnType<typeof achievementsFor>) =>
  list.filter((a) => a.current >= a.goal).map((a) => a.id);

it("gives coaches client, offer and portfolio milestones with progress", () => {
  const list = achievementsFor(
    {
      coach: true,
      bio: true,
      location: true,
      headline: true,
      competencies: 4,
      memberSince: "2025-09-01T00:00:00Z",
      clientsCoached: 12,
      activeClients: 4,
      offers: 1,
      certificates: 1,
      results: 2,
      yearsExperience: 6,
    },
    now,
  );
  expect(reached(list)).toEqual(
    expect.arrayContaining([
      "firstClient",
      "tenClients",
      "openForBusiness",
      "certified",
      "seasoned",
      "profileComplete",
      "located",
      "month",
      "year",
    ]),
  );
  expect(list.find((a) => a.id === "provenResults")).toMatchObject({
    current: 2,
    goal: 3,
  });
  expect(list.find((a) => a.id === "fiftyClients")).toMatchObject({
    current: 12,
    goal: 50,
  });
});

it("gives everyone else profile and time milestones only", () => {
  const list = achievementsFor(
    {
      coach: false,
      bio: false,
      location: true,
      memberSince: "2026-10-10T00:00:00Z",
    },
    now,
  );
  expect(list.map((a) => a.id)).toEqual([
    "profileComplete",
    "located",
    "month",
    "year",
  ]);
  expect(reached(list)).toEqual(["located"]);
  expect(list.find((a) => a.id === "month")).toMatchObject({
    current: 14,
    goal: 30,
  });
});
