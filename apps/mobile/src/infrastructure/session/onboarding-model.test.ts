import { describe, expect, it, vi } from "vitest";
import type { Transport } from "@trainflow/api-client-web/transport";
import { ageAt, createOnboardingWriter, detailGroups, detailIssues, profileValues } from "./onboarding-model";
import { isValidEmail } from "./email";
import { passwordProblem } from "./auth-policy";
import { namePartValid, usernameProblem } from "./identity";

describe("native onboarding parity", () => {
    it("validates real calendar dates, adult boundary, names and usernames", () => {
        expect(ageAt("2008-10-28", new Date(2026, 9, 28))).toBe(18);
        expect(ageAt("2008-10-29", new Date(2026, 9, 28))).toBe(17);
        expect(ageAt("2000-02-30")).toBeNull();
        expect(usernameProblem("admin")).toBe("reserved");
        expect(usernameProblem("someone_")).toBe("invalid");
        expect(namePartValid("Łukasz")).toBe(true);
        expect(namePartValid("  ")).toBe(false);
    });
    it("requires the same client body fields but permits an empty coach step", () => {
        expect(Object.keys(detailIssues({}, detailGroups[1], true))).toEqual(["Sex", "Height", "Weight"]);
        expect(detailIssues({}, detailGroups[1], false)).toEqual({});
        expect(detailIssues({ Sex: "Other", Height: "181", Weight: "81,5" }, detailGroups[1], true)).toEqual({});
        expect(detailIssues({ HrMax: "180.5" }, detailGroups[2], false)).toEqual({ HrMax: "integer" });
        expect(profileValues({ Weight: "81,5", BodyFat: "", AdditionalNotes: " hello " })).toEqual({ Weight: 81.5, AdditionalNotes: "hello" });
    });
    it("uses the same email and password bounds as web", () => {
        expect(isValidEmail("a+tag@example.com")).toBe(true);
        expect(isValidEmail("a@localhost")).toBe(false);
        expect(passwordProblem("password123")).toBe("auth.passwordWeak");
        expect(passwordProblem("😀".repeat(19))).toBe("auth.passwordLong");
    });
    it("retries only remaining fields after identity creation and fences stale account responses", async () => {
        let current = true, fail = true;
        const api = vi.fn(async (request: { path: string; method?: string }) => {
            if (request.method === "PATCH" && fail) { fail = false; throw Error("Offline"); }
            return { data: { version: 2 }, response: new Response() };
        });
        const writer = createOnboardingWriter(api as unknown as Transport, () => current);
        const identity = { username: "someone", displayName: "Some One", birthDate: "1990-01-01", acceptedTerms: true, locale: "en", timeZone: "UTC", role: "Client" as const };
        const selections = { selectedCodes: [], primaryCodes: [] };
        await expect(writer.save(identity, { Weight: "75" }, selections)).rejects.toThrow("Offline");
        await writer.save(identity, { Weight: "75" }, selections);
        expect(api.mock.calls.filter(([request]) => request.path.endsWith("/onboarding"))).toHaveLength(1);
        current = false;
        await expect(writer.save(identity, {}, selections)).rejects.toThrow("account changed");
    });
});
