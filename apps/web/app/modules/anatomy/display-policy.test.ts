import { expect, it } from "vitest";
import {
  DISPLAY_MASK,
  isDisplayMasked,
  PERMANENTLY_HIDDEN,
} from "./display-policy";
import { structureVisible, type Category } from "./model";

it("never reveals excluded structures through layer toggles, selection, isolation or reset", () => {
  const all = new Set<Category>([
    "muscles",
    "skeleton",
    "nervous",
    "tendons",
    "ligaments",
    "skin",
    "vascular",
    "organs",
    "other",
  ]);
  for (const id of PERMANENTLY_HIDDEN) {
    for (const category of all) {
      for (const isolated of [false, true]) {
        expect(
          structureVisible(
            id,
            category,
            all,
            new Set(),
            new Set([id]),
            isolated,
          ),
        ).toBe(false);
      }
    }
  }
  expect(
    structureVisible("normal", "muscles", all, new Set(), new Set(), false),
  ).toBe(true);
});

it("masks covering skin in fixed anatomical coordinates, including the boundary", () => {
  expect(isDisplayMasked("FJ2810", { x: 0, y: -190, z: 730 })).toBe(true);
  expect(
    isDisplayMasked("FJ2810", {
      x: DISPLAY_MASK.min[0],
      y: DISPLAY_MASK.min[1],
      z: DISPLAY_MASK.min[2],
    }),
  ).toBe(true);
  expect(isDisplayMasked("FJ2810", { x: 0, y: -120, z: 1100 })).toBe(false);
  expect(isDisplayMasked("FJ2810", { x: 100, y: -120, z: 730 })).toBe(false);
});

it("does not clip groin muscles or other structures inside the covering-surface mask", () => {
  const point = { x: 0, y: -190, z: 730 };
  expect(isDisplayMasked("FJ2815", point)).toBe(true);
  expect(isDisplayMasked("muscle", point)).toBe(false);
  expect(isDisplayMasked("tendon", point)).toBe(false);
  expect(isDisplayMasked("ligament", point)).toBe(false);
});
