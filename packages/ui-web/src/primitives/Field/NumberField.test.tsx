import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nProvider } from "react-aria-components";
import { expect, it, vi } from "vitest";
import { DecimalInput, NumberInput } from "./NumberField";

it.each(["en-US", "pl-PL"])(
  "accepts decimal commas for decimal fields in %s",
  async (locale) => {
    const onChange = vi.fn();
    render(
      <I18nProvider locale={locale}>
        <NumberInput label="RPE" decimalScale={2} onChange={onChange} />
      </I18nProvider>,
    );
    const user = userEvent.setup();
    await user.type(screen.getByRole("textbox"), "8,25");
    await user.tab();
    expect(onChange).toHaveBeenLastCalledWith(8.25);
  },
);

it("keeps a comma draft, emits a canonical decimal and refuses a third fractional digit", async () => {
  const values: string[] = [];
  render(
    <DecimalInput
      aria-label="Load"
      value=""
      onChange={(event) => values.push(event.target.value)}
    />,
  );
  const user = userEvent.setup();
  const input = screen.getByRole("textbox");
  await user.type(input, "82,255");
  expect(input).toHaveValue("82,25");
  expect(values.at(-1)).toBe("82.25");
});
