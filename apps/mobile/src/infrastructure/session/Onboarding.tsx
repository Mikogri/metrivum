import { useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import type { Schema } from "@trainflow/api-client-web";
import type { Transport } from "@trainflow/api-client-web/transport";
import { Button, ErrorState, Field, FieldButton, ListItem, LoadingState, Screen, Section, SelectField, Switch, Text } from "@trainflow/ui-mobile";
import { BrandMark } from "../../BrandMark";
import { useI18n } from "../i18n";
import type { TranslationKey } from "../i18n/messages";
import { namePartValid, normalizeDisplayName, usernameProblem } from "./identity";
import { ageAt, createOnboardingWriter, detailGroups, detailIssues, ranges } from "./onboarding-model";

const labels: Record<string, TranslationKey> = {
    Country: "setup.country", Region: "setup.region", City: "setup.city", PostalCode: "setup.postal", Sex: "setup.sex", Height: "setup.height", Weight: "setup.weight", BodyFat: "setup.bodyFat",
    HrMax: "setup.hrMax", Vo2Max: "setup.vo2", Sleep: "setup.sleep", Stress: "setup.stress", TrainingExperience: "setup.experience", ActivityLevel: "setup.activity",
    SessionsPerWeek: "setup.sessions", AvailableSessionDuration: "setup.duration", PreferredTrainingDays: "setup.days", AvailableEquipment: "setup.equipment",
    InjuriesLimitationsPainNotes: "setup.injuries", AdditionalNotes: "setup.notes",
};
const stepTitles: TranslationKey[] = ["setup.account", "setup.location", "setup.body", "setup.heart", "setup.training", "setup.health", "setup.specializations"];
const choices = {
    en: { TrainingExperience: ["Beginner (under 1 year)", "Intermediate (1 to 3 years)", "Advanced (over 3 years)"], ActivityLevel: ["Mostly sitting", "Lightly active", "Active", "Very active"], AvailableEquipment: ["Full gym", "Barbell and plates", "Dumbbells", "Kettlebells", "Pull-up bar", "Resistance bands", "Cardio machines", "Bodyweight only"] },
    pl: { TrainingExperience: ["Początkujący (poniżej roku)", "Średniozaawansowany (1–3 lata)", "Zaawansowany (ponad 3 lata)"], ActivityLevel: ["Głównie siedząca", "Lekko aktywna", "Aktywna", "Bardzo aktywna"], AvailableEquipment: ["Pełna siłownia", "Sztanga i obciążenie", "Hantle", "Kettlebelle", "Drążek", "Gumy oporowe", "Maszyny cardio", "Tylko masa ciała"] },
};

export function Onboarding({ api, signal, initialRole, termsAccepted, onComplete }: {
    api: Transport; signal: AbortSignal; initialRole: "Coach" | "Client"; termsAccepted: boolean; onComplete: () => Promise<void>;
}) {
    const { t, locale } = useI18n();
    const [step, setStep] = useState(0), [role, setRole] = useState(initialRole);
    const [accepted, setAccepted] = useState(termsAccepted);
    const [username, setUsername] = useState(""), [first, setFirst] = useState(""), [last, setLast] = useState(""), [birth, setBirth] = useState("");
    const [language, setLanguage] = useState<string>(locale), [zone, setZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    const [values, setValues] = useState<Record<string, unknown>>({});
    const [busy, setBusy] = useState(false), [submitted, setSubmitted] = useState(false), [error, setError] = useState<unknown>();
    const [catalog, setCatalog] = useState<Schema<"SpecializationCategoryDto">[]>(), [catalogError, setCatalogError] = useState<unknown>();
    const [search, setSearch] = useState(""), [selected, setSelected] = useState<string[]>([]), [primary, setPrimary] = useState<string[]>([]);
    const alive = useRef(true), lock = useRef(false);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    const writer = useMemo(() => createOnboardingWriter(api, () => alive.current && !signal.aborted), [api, signal]);
    const zones = useMemo(() => {
        try { return ["UTC", ...Intl.supportedValuesOf("timeZone")]; } catch { return ["UTC", zone]; }
    }, [zone]);
    const total = role === "Coach" ? 7 : 6, age = ageAt(birth);
    const group = detailGroups[step - 1];
    const issues = group ? detailIssues(values, group, role === "Client") : {};
    const update = (key: string, value: unknown) => setValues(current => ({ ...current, [key]: value }));
    function move(next: number) { setStep(next); setSubmitted(false); setError(undefined); }
    async function loadCatalog() {
        setCatalogError(undefined);
        try { const result = await api<Schema<"SpecializationCategoryDto">[]>({ path: "/api/v1/coaching/specializations", signal }); if (alive.current && !signal.aborted) setCatalog(result.data); }
        catch (failure) { if (alive.current && !signal.aborted) setCatalogError(failure); }
    }
    useEffect(() => { if (step === 6 && !catalog) void loadCatalog(); }, [step]); // eslint-disable-line react-hooks/exhaustive-deps -- only load the visible final step
    async function next(skip = false) {
        if (lock.current || signal.aborted) return;
        setSubmitted(true); setError(undefined);
        if (step === 0 && (usernameProblem(username.trim()) || !namePartValid(first) || !namePartValid(last) || age === null || age < 18 || !zones.includes(zone) || !accepted)) return;
        if (group && !skip && Object.keys(issues).length) return;
        if (skip && role === "Client" && step === 2) return;
        lock.current = true; setBusy(true);
        try {
            if (step === 0) {
                const available = await api<{ available: boolean }>({ path: "/api/v1/me/username-availability", query: { username: username.trim() }, signal });
                if (signal.aborted || !alive.current) return;
                if (!available.data.available) { setError(new Error(t("setup.usernameTaken"))); return; }
            }
            const input = skip && group ? Object.fromEntries(Object.entries(values).filter(([key]) => !(group as readonly string[]).includes(key))) : values;
            if (step === total - 1) {
                await writer.save({ username: username.trim(), firstName: normalizeDisplayName(first), lastName: normalizeDisplayName(last), displayName: normalizeDisplayName(`${first} ${last}`), birthDate: birth,
                    acceptedTerms: accepted, role, locale: language, timeZone: zone }, input, { selectedCodes: selected, primaryCodes: primary });
                if (!signal.aborted && alive.current) await onComplete();
            } else { if (skip) setValues(input); move(step + 1); }
        } catch (failure) { if (alive.current && !signal.aborted) setError(failure); }
        finally { lock.current = false; if (alive.current && !signal.aborted) setBusy(false); }
    }
    const problem = (key: string) => {
        if (!submitted || !issues[key]) return undefined;
        const range = ranges[key];
        return issues[key] === "range" && range ? t("setup.range", { min: range[0], max: range[1] }) : t(issues[key] === "integer" ? "setup.integer" : "setup.required");
    };
    return <Screen key={step} title={t(stepTitles[step]!)} subtitle={t("setup.step", { step: step + 1, total })} headerAction={<BrandMark />}>
        {step === 0 ? <>
            <SelectField label={t("auth.accountType")} value={role} disabled={busy || writer.created()} onChange={setRole} options={[{ value: "Client", label: t("role.client") }, { value: "Coach", label: t("role.coach") }]} />
            <Field label={t("onboarding.username")} value={username} maxLength={32} autoCapitalize="none" editable={!busy && !writer.created()} onChangeText={setUsername} error={submitted && usernameProblem(username.trim()) ? t("setup.usernameInvalid") : undefined} />
            <Field label={t("setup.firstName")} value={first} maxLength={50} editable={!busy && !writer.created()} onChangeText={setFirst} error={submitted && !namePartValid(first) ? t("setup.required") : undefined} />
            <Field label={t("setup.lastName")} value={last} maxLength={50} editable={!busy && !writer.created()} onChangeText={setLast} error={submitted && !namePartValid(last) ? t("setup.required") : undefined} />
            <BirthDate value={birth} onChange={setBirth} disabled={busy || writer.created()} />
            {submitted && (age === null || age < 18) && <Text tone="danger">{t("setup.adult")}</Text>}
            <SelectField label={t("settings.language")} value={language} disabled={busy || writer.created()} onChange={setLanguage} options={[{ value: "en", label: "English" }, { value: "pl", label: "Polski" }]} />
            <SelectField label={t("setup.timeZone")} value={zone} disabled={busy || writer.created()} onChange={setZone} options={zones.map(value => ({ value, label: value.replaceAll("_", " ") }))} />
            {!termsAccepted && <>
                <ListItem title={t("onboarding.terms")} trailing={<Switch accessibilityLabel={t("onboarding.acceptTerms")} value={accepted} disabled={busy || writer.created()} onValueChange={setAccepted} />} />
                {submitted && !accepted && <Text tone="danger">{t("auth.termsRequired")}</Text>}
            </>}
        </> : step === 6 ? <>
            <Text tone="mutedText">{t("setup.selfDeclared")}</Text>
            <Text>{selected.length}/5 · {primary.length}/3 {t("setup.primary")}</Text>
            <Field label={t("setup.search")} value={search} onChangeText={setSearch} />
            {catalogError ? <ErrorState error={catalogError} retry={loadCatalog} /> : !catalog ? <LoadingState /> : catalog.map(category => <Section title={category.name} key={category.code}>
                {category.specializations.filter(item => `${item.name} ${item.code} ${category.name}`.toLowerCase().includes(search.toLowerCase())).map(item => <Section flat key={item.code}>
                    <ListItem title={item.name} trailing={<Switch accessibilityLabel={item.name} disabled={busy || (!selected.includes(item.code) && selected.length >= 5)} value={selected.includes(item.code)} onValueChange={checked => {
                        setSelected(current => checked ? current.includes(item.code) || current.length >= 5 ? current : [...current, item.code] : current.filter(code => code !== item.code));
                        if (!checked) setPrimary(current => current.filter(code => code !== item.code));
                    }} />}
                    />
                    {selected.includes(item.code) && <ListItem title={t("setup.primary")} trailing={<Switch accessibilityLabel={`${item.name} · ${t("setup.primary")}`} value={primary.includes(item.code)} disabled={busy || (!primary.includes(item.code) && primary.length >= 3)} onValueChange={checked => setPrimary(current => checked ? current.includes(item.code) || current.length >= 3 ? current : [...current, item.code] : current.filter(code => code !== item.code))} />} />}
                </Section>)}
            </Section>)}
        </> : <>
            <Text tone="mutedText">{t(step === 2 && role === "Client" ? "setup.requiredBody" : "setup.optional")}</Text>
            {group?.map(key => key === "Sex" ? <SelectField key={key} label={t(labels[key]!)} value={String(values[key] ?? "")} disabled={busy} error={problem(key)}
                onChange={value => update(key, value)} options={[{ value: "Male", label: t("setup.male") }, { value: "Female", label: t("setup.female") }, { value: "Other", label: t("setup.other") }]} />
                : key === "TrainingExperience" || key === "ActivityLevel" ? <SelectField key={key} label={t(labels[key]!)} value={String(values[key] ?? "")} disabled={busy} onChange={value => update(key, value)} options={choices[locale][key].map(value => ({ value, label: value }))} />
                : key === "PreferredTrainingDays" || key === "AvailableEquipment" ? <Section key={key} title={t(labels[key]!)}>
                    {(key === "PreferredTrainingDays" ? [1, 2, 3, 4, 5, 6, 7] : choices[locale].AvailableEquipment).map(value => {
                        const selectedValues = (values[key] ?? []) as (string | number)[];
                        const label = typeof value === "number" ? new Intl.DateTimeFormat(locale, { weekday: "long" }).format(new Date(2026, 0, 4 + value)) : value;
                        return <ListItem key={value} title={label} trailing={<Switch accessibilityLabel={label} value={selectedValues.includes(value)} disabled={busy} onValueChange={checked => update(key, checked ? [...selectedValues, value] : selectedValues.filter(item => item !== value))} />} />;
                    })}
                </Section> : <Field key={key} label={t(labels[key]!)} value={String(values[key] ?? "")} editable={!busy} keyboardType={ranges[key] ? "decimal-pad" : "default"}
                    multiline={step === 5} maxLength={step === 5 ? 4000 : key === "Country" ? 2 : 160} error={problem(key)}
                    onChangeText={value => update(key, key === "Country" ? value.toUpperCase() : value)} />)}
            {step === 3 && age !== null && <Button tone="ghost" title={t("setup.estimate")} disabled={busy} onPress={() => update("HrMax", String(Math.round(208 - 0.7 * age)))} />}
        </>}
        {!!error && <><ErrorState error={error} />{writer.created() && <Text tone="mutedText">{t("setup.savedAccount")}</Text>}</>}
        <Button tone="primary" title={t(step === total - 1 ? "setup.finish" : "common.continue")} loading={busy} onPress={() => next()} />
        {step > 0 && !(role === "Client" && step === 2) && step < 6 && <Button tone="ghost" title={t("setup.skip")} disabled={busy} onPress={() => next(true)} />}
        {step > 0 && <Button tone="ghost" title={t("setup.back")} disabled={busy} onPress={() => move(step - 1)} />}
    </Screen>;
}

function BirthDate({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
    const { t } = useI18n();
    const date = value ? new Date(`${value}T12:00:00`) : new Date(1990, 0, 1);
    const apply = (date: Date) => onChange(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`);
    return Platform.OS === "android" ? <FieldButton label={t("onboarding.birth")} icon="calendar" value={value || null} disabled={disabled} onPress={() => DateTimePickerAndroid.open({ value: date, mode: "date", maximumDate: new Date(), minimumDate: new Date(1900, 0, 1), onValueChange: (_event, date) => apply(date) })} />
        : <Section title={t("onboarding.birth")}><DateTimePicker value={date} mode="date" display="compact" disabled={disabled} maximumDate={new Date()} minimumDate={new Date(1900, 0, 1)} onValueChange={(_event, date) => apply(date)} /></Section>;
}
