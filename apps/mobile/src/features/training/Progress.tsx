import { NativeDateField } from "./NativeDateField";
import { useState } from "react";
import { View } from "react-native";
import type { Schema } from "@metrivum/api-client-web";
import {
    Text,
    Section,
    ListItem,
    ErrorState,
    LoadingState,
    EmptyState,
    SearchField,
    Stat,
    ChipGroup,
} from "@metrivum/ui-mobile";
import { Chart } from "@metrivum/ui-mobile/chart";
import { useApiQuery } from "../../infrastructure/networking/queries";
import { useMobile } from "../../infrastructure/session/MobileSession";
import { Filters } from "../shared/Filters";
import { formatDay, joinParts } from "../shared/format";
import { localDate, type Page } from "./model";
import { Choices } from "./components";

const loadMeanings: Record<string, string> = {
    TotalExternal: "Total external load",
    PerHand: "Load per hand",
    Bodyweight: "Bodyweight",
    Assisted: "Assisted",
};

export function TrainingProgress({
    relationshipId,
}: {
    relationshipId?: string;
}) {
    const { role } = useMobile();
    const initial = () => ({
        from: localDate(new Date(Date.now() - 90 * 86400000)),
        to: localDate(),
    });
    const [range, setRange] = useState(initial);
    const [programId, setProgram] = useState("");
    const [exerciseId, setExercise] = useState("");
    const [search, setSearch] = useState("");
    const programs = useApiQuery<Page<Schema<"AssignmentDto">>>(
        "/api/v1/training/assignments",
        { relationshipId, view: role, page: 1, pageSize: 50 },
    );
    const catalog = useApiQuery<Page<Schema<"ExerciseListItemDto">>>(
        "/api/v1/exercises",
        { search, page: 1, pageSize: 10 },
        search.length > 1,
    );
    const query = useApiQuery<Schema<"TrainingProgressDto">>(
        "/api/v1/training/progress",
        {
            from: range.from,
            to: range.to,
            relationshipId,
            programId: programId || undefined,
            exerciseId: exerciseId || undefined,
            view: role,
        },
    );
    const programNames = Object.fromEntries(
        programs.data?.items.map((item) => [item.programId, item.programName]) ||
            [],
    );
    const exerciseNames = Object.fromEntries(
        catalog.data?.items.map((item) => [item.id, item.name]) || [],
    );
    return (
        <>
            <Section
                title="Progress"
                action={
                    <Filters
                        title="Filter progress"
                        active={!!programId || !!exerciseId}
                        summary={joinParts(
                            `${formatDay(range.from)} – ${formatDay(range.to)}`,
                            programNames[programId],
                            exerciseNames[exerciseId],
                        )}
                        onReset={() => {
                            setRange(initial());
                            setProgram("");
                            setExercise("");
                            setSearch("");
                        }}
                    >
                        <NativeDateField
                            label="From"
                            value={range.from}
                            onChange={(from) =>
                                setRange((current) => ({ ...current, from }))
                            }
                        />
                        <NativeDateField
                            label="Through"
                            value={range.to}
                            onChange={(to) =>
                                setRange((current) => ({ ...current, to }))
                            }
                        />
                        <Choices
                            labels={programNames}
                            label="Program"
                            values={[
                                "",
                                ...new Set(
                                    programs.data?.items.map(
                                        (item) => item.programId,
                                    ) || [],
                                ),
                            ]}
                            value={programId}
                            onChange={setProgram}
                        />
                        <SearchField
                            label="Find an exercise"
                            value={search}
                            onChangeText={setSearch}
                        />
                        {search.length > 1 && (
                            <Choices
                                labels={exerciseNames}
                                label="Exercise"
                                values={[
                                    "",
                                    ...(catalog.data?.items.map(
                                        (item) => item.id,
                                    ) || []),
                                ]}
                                value={exerciseId}
                                onChange={setExercise}
                            />
                        )}
                    </Filters>
                }
            >
                {query.isPending ? (
                    <LoadingState />
                ) : query.error ? (
                    <ErrorState
                        error={query.error}
                        retry={() => void query.refetch()}
                    />
                ) : (
                    query.data && (
                        <>
                            <View style={{ flexDirection: "row" }}>
                                <Stat
                                    label="Completed"
                                    value={query.data.completed}
                                    tone="brand"
                                />
                                <Stat label="Missed" value={query.data.missed} />
                                <Stat
                                    label="Skipped"
                                    value={query.data.skipped}
                                />
                                <Stat
                                    label="Done"
                                    value={
                                        query.data.completionPercentage == null
                                            ? "–"
                                            : `${query.data.completionPercentage}%`
                                    }
                                />
                            </View>
                            <Text variant="caption" tone="subtleText">
                                {query.data.metricDefinition}
                            </Text>
                            {role === "coach" && !relationshipId && (
                                <Text variant="caption" tone="mutedText">
                                    These results combine the clients included
                                    in the current filters.
                                </Text>
                            )}
                        </>
                    )
                )}
            </Section>
            {query.data && (
                <>
                    {(query.data.clientsHasMore || query.data.performanceHasMore) && (
                        <Text variant="caption" tone="mutedText">
                            Showing part of the detailed results. Totals include all matching records.
                            Narrow the date range, client or exercise filters to see more detail.
                        </Text>
                    )}
                    <PerformanceChart performance={query.data.performance} />
                    {query.data.performance.length > 0 && (
                        <Section title="Recorded sessions">
                            {query.data.performance.map((point, index) => (
                                <ListItem
                                    key={`${point.exerciseId}:${point.performedDate}:${point.loadMeaning}:${index}`}
                                    title={point.name}
                                    subtitle={joinParts(
                                        formatDay(point.performedDate),
                                        `${point.sets} × ${point.reps} reps`,
                                        point.bestLoadKg != null &&
                                            `best ${point.bestLoadKg} kg`,
                                        loadMeanings[point.loadMeaning],
                                    )}
                                />
                            ))}
                        </Section>
                    )}
                </>
            )}
        </>
    );
}

function PerformanceChart({
    performance,
}: {
    performance: Schema<"TrainingPerformancePoint">[];
}) {
    const [exercise, setExercise] = useState("");
    const [meaning, setMeaning] = useState("");
    const [metric, setMetric] = useState<"bestLoadKg" | "volumeKg" | "reps">(
        "bestLoadKg",
    );
    const exercises = [
        ...new Set(performance.map((point) => point.exerciseId)),
    ];
    const selectedExercise = exercises.includes(exercise)
        ? exercise
        : exercises[0];
    const meanings = [
        ...new Set(
            performance
                .filter((point) => point.exerciseId === selectedExercise)
                .map((point) => point.loadMeaning),
        ),
    ];
    const selectedMeaning = meanings.includes(meaning) ? meaning : meanings[0];
    const selected = performance.filter(
        (point) =>
            point.exerciseId === selectedExercise &&
            point.loadMeaning === selectedMeaning,
    );
    const labels = {
        bestLoadKg: "Best load",
        volumeKg: "Volume",
        reps: "Repetitions",
    };
    const units = { bestLoadKg: "kg", volumeKg: "kg·reps", reps: "reps" };
    if (!performance.length)
        return (
            <EmptyState
                icon="progress"
                title="No recorded results in this period"
                description="Logged sets appear here as a chart."
            />
        );
    return (
        <Section title="Exercise trend">
            <Choices
                label="Exercise"
                values={exercises}
                value={selectedExercise || ""}
                labels={Object.fromEntries(
                    performance.map((point) => [point.exerciseId, point.name]),
                )}
                onChange={setExercise}
            />
            {meanings.length > 1 && (
                <ChipGroup
                    label="How the load was recorded"
                    options={meanings.map((value) => ({
                        value,
                        label: loadMeanings[value] ?? value,
                    }))}
                    value={selectedMeaning}
                    onChange={setMeaning}
                />
            )}
            <Choices
                label="Metric"
                values={["bestLoadKg", "volumeKg", "reps"] as const}
                value={metric}
                onChange={setMetric}
                labels={labels}
            />
            <Chart
                title={`${selected[0]?.name || "Exercise"} · ${labels[metric]}`}
                unit={units[metric]}
                points={selected.map((point, index) => ({
                    id: `${point.performedDate}:${index}`,
                    date: point.performedDate,
                    value: point[metric],
                }))}
            />
            {metric === "volumeKg" && (
                <Text variant="caption" tone="mutedText">
                    Volume uses recorded total external loads only, as
                    calculated by the API.
                </Text>
            )}
        </Section>
    );
}
