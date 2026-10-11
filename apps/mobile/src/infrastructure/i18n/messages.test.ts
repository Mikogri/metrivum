import { describe, expect, it } from "vitest";
import { english, polish, resolveLocale, translate } from "./messages";
describe("explicit mobile localization", () => {
    it("has matching EN/PL keys and resolves regional device locales", () => {
        expect(Object.keys(polish).sort()).toEqual(Object.keys(english).sort());
        expect(resolveLocale("pl-PL")).toBe("pl");
        expect(resolveLocale("en_GB")).toBe("en");
        expect(resolveLocale("de-DE")).toBeUndefined();
    });
    it("interpolates values without translating user content or replacement syntax", () => {
        expect(
            translate("pl", "auth.continueAs", { email: "$&@example.com" }),
        ).toBe("Kontynuować jako $&@example.com?");
        expect(translate("en", "tabs.today")).toBe("Today");
    });
});
