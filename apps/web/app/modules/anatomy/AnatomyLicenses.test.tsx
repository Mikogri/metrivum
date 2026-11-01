import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { AnatomyLicenses } from "./AnatomyLicenses";
import { anatomyMessages } from "./messages";

it.each(["en", "pl"] as const)("opens the same license shortcut in %s with dataset attribution", locale => {
  render(<AnatomyLicenses attribution="BodyParts3D — DBCLS" messages={anatomyMessages[locale]} />);
  fireEvent.click(screen.getByRole("button", { name: "Anatomy Data & Licenses" }));
  expect(screen.getByRole("dialog", { name: "Anatomy Data & Licenses" })).toBeInTheDocument();
  expect(screen.getByText("BodyParts3D — DBCLS")).toBeVisible();
  expect(screen.getByRole("link", { name: anatomyMessages[locale].license })).toHaveAttribute("href", "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html");
});
