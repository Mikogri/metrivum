import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { AppLocaleProvider, useAppLocale } from "./AppLocale";

it("switches interface labels and document language without changing dictionary keys", () => {
  const { result } = renderHook(() => useAppLocale(), {
    wrapper: AppLocaleProvider,
  });
  act(() => result.current.setLocale("pl"));
  expect(result.current.m.ui["Formula data sources"]).toBe(
    "Źródła danych formuły",
  );
  expect(result.current.m.ui["Groups"]).toBe("Grupy");
  expect(document.documentElement.lang).toBe("pl");
  act(() => result.current.setLocale("en"));
  expect(result.current.m.ui["Formula data sources"]).toBe(
    "Formula data sources",
  );
  expect(document.documentElement.lang).toBe("en");
});
