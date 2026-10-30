import type { Transport } from "@trainflow/api-client-web/transport";
import type { OnboardingRequest, ProfileResponse, Schema } from "@trainflow/api-client-web";

export const detailGroups = [
    ["Country", "Region", "City", "PostalCode"],
    ["Sex", "Height", "Weight", "BodyFat"],
    ["HrMax", "Vo2Max", "Sleep", "Stress"],
    ["TrainingExperience", "ActivityLevel", "SessionsPerWeek", "AvailableSessionDuration", "PreferredTrainingDays", "AvailableEquipment"],
    ["InjuriesLimitationsPainNotes", "AdditionalNotes"],
] as const;
export const ranges: Record<string, [number, number, boolean?]> = {
    Height: [100, 250], Weight: [30, 300], BodyFat: [3, 60], HrMax: [100, 230, true], Vo2Max: [10, 100], Sleep: [0, 24], Stress: [0, 10, true],
    SessionsPerWeek: [0, 21, true], AvailableSessionDuration: [10, 300, true],
};
export function ageAt(birth: string, now = new Date()): number | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) return null;
    const [year, month, day] = birth.split("-").map(Number) as [number, number, number];
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || year < 1900) return null;
    return now.getFullYear() - year - (now.getMonth() < month - 1 || (now.getMonth() === month - 1 && now.getDate() < day) ? 1 : 0);
}
export function detailIssues(values: Record<string, unknown>, keys: readonly string[], client: boolean): Record<string, "required" | "range" | "integer"> {
    const errors: Record<string, "required" | "range" | "integer"> = {};
    for (const key of keys) {
        const raw = values[key], empty = raw === undefined || raw === "";
        if (empty) { if (client && ["Sex", "Height", "Weight"].includes(key)) errors[key] = "required"; continue; }
        if (ranges[key]) {
            const [min, max, integer] = ranges[key], value = Number(String(raw).replace(",", "."));
            if (!Number.isFinite(value) || value < min || value > max) errors[key] = "range";
            else if (integer && !Number.isInteger(value)) errors[key] = "integer";
        }
        if (key === "Country" && !/^[A-Z]{2}$/.test(String(raw))) errors[key] = "required";
    }
    return errors;
}
export function profileValues(values: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined && value !== "" && (!Array.isArray(value) || value.length > 0))
        .map(([key, value]) => [key, ranges[key] ? Number(String(value).replace(",", ".")) : typeof value === "string" ? value.trim() : value]));
}
/** Keep the completed identity when optional-field saving fails; retries never recreate onboarding. */
export function createOnboardingWriter(api: Transport, isCurrent: () => boolean) {
    let created: ProfileResponse | undefined;
    function check() { if (!isCurrent()) throw new Error("The account changed."); }
    return {
        created: () => !!created,
        async save(identity: OnboardingRequest, values: Record<string, unknown>, selections: { selectedCodes: string[]; primaryCodes: string[] }) {
            check();
            created ??= (await api<ProfileResponse>({ method: "PUT", path: "/api/v1/me/onboarding", json: identity })).data;
            check();
            const fields = profileValues(values);
            if (Object.keys(fields).length) {
                const current = (await api<Schema<"AccountProfileFields">>({ path: "/api/v1/me/profile-fields" })).data;
                check();
                await api({ method: "PATCH", path: "/api/v1/me/profile-fields", ifMatch: current.version, json: { values: fields } });
                check();
            }
            if (identity.role === "Coach" && selections.selectedCodes.length) {
                const current = (await api<Schema<"CoachSpecializationsDto">>({ path: "/api/v1/me/coaching-specializations" })).data;
                check();
                await api({ method: "PUT", path: "/api/v1/me/coaching-specializations", json: { ...selections, version: current.version } });
                check();
            }
        },
    };
}
