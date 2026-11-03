import { expect, it } from "vitest";
import { formatInterfaceText } from "./interface-format";

it("allows translated argument order without interpreting user content", () => {
  expect(formatInterfaceText("{1}: {0}, {0}", ["{1}$&", 3])).toBe("3: {1}$&, {1}$&");
  expect(formatInterfaceText("{2}", ["name"])).toBe("{2}");
});
