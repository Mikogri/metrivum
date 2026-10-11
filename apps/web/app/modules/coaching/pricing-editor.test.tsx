import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { BillingOptionsEditor, newOption, type BillingOption } from "./pricing";

function Editor({ model = "FixedPackage" }: { model?: BillingOption["model"] }) {
  const [options, setOptions] = useState([newOption(model)]);
  return <><BillingOptionsEditor options={options} onChange={setOptions} /><output data-testid="options">{JSON.stringify(options)}</output></>;
}
it("sets and clears expiry without converting unlimited validity to zero", async () => {
  render(<Editor />);
  const input = screen.getByRole("textbox", { name: "Validity after payment (days)" });
  await userEvent.type(input, "30"); await userEvent.tab();
  expect(JSON.parse(screen.getByTestId("options").textContent!)[0].validityDays).toBe(30);
  await userEvent.clear(input); await userEvent.tab();
  expect(JSON.parse(screen.getByTestId("options").textContent!)[0].validityDays).toBeNull();
});
it("does not offer a conflicting expiry field for subscriptions", () => {
  render(<Editor model="PeriodSubscription" />);
  expect(screen.queryByRole("textbox", { name: "Validity after payment (days)" })).not.toBeInTheDocument();
});
