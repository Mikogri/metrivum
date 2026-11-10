import { expect, it } from "vitest";
import {
  COVER_DEFAULTS,
  DEFAULT_BACKDROP,
  backgrounds,
  changedProps,
  resolveCover,
} from "./coverStyle";

it("falls back to the default silk for missing or unknown covers", () => {
  expect(resolveCover(null).entry.name).toBe("Silk");
  expect(resolveCover({ background: "NoSuchBackground" }).entry.name).toBe(
    "Silk",
  );
  expect(resolveCover(undefined).props).toMatchObject(COVER_DEFAULTS);
});

it("keeps only known, in-range settings and never free text", () => {
  const silk = backgrounds.find((entry) => entry.name === "Silk")!;
  const speed = silk.params.find((param) => param.name === "speed")!;
  const { props } = resolveCover({
    background: "Silk",
    props: {
      speed: 1e9,
      color: "javascript:alert(1)",
      unknown: 5,
      mouseInteraction: "yes",
    },
  });
  expect(props.speed).toBe(Math.max(speed.max ?? 10, Number(speed.default)));
  expect(props.color).toBe(COVER_DEFAULTS.color);
  expect(props).not.toHaveProperty("unknown");
  // An invalid value is dropped, so the background keeps its own default (pointer reactions on).
  expect(props).not.toHaveProperty("mouseInteraction");
  for (const entry of backgrounds)
    for (const param of entry.params.filter((p) => p.kind === "text"))
      expect(
        resolveCover({
          background: entry.name,
          props: { [param.name]: "https://example.com/x.png" },
        }).props[param.name],
      ).not.toBe("https://example.com/x.png");
});

it("keeps the banner colour only when it is a #rrggbb colour", () => {
  expect(
    resolveCover({ background: "Silk", backdrop: "#223344" }).backdrop,
  ).toBe("#223344");
  expect(
    resolveCover({ background: "Silk", backdrop: "url(x)" }).backdrop,
  ).toBe(DEFAULT_BACKDROP);
});

it("offers exactly the chosen backgrounds", () => {
  expect(backgrounds.map((entry) => entry.name)).toHaveLength(22);
  expect(backgrounds.map((entry) => entry.name)).toContain("Dither");
});

it("saves only what differs from the starting point", () => {
  const silk = backgrounds.find((entry) => entry.name === "Silk")!;
  expect(changedProps(silk, { ...COVER_DEFAULTS })).toEqual({});
  expect(changedProps(silk, { ...COVER_DEFAULTS, speed: 4 })).toEqual({
    speed: 4,
  });
});
