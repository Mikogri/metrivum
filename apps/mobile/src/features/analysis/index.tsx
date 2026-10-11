import { useState } from "react";
import { View } from "react-native";
import type { AnalysisDto, AnalysisResult } from "@trainflow/api-client-web";
import {
    BottomSheet,
    EmptyState,
    ErrorState,
    ListItem,
    LoadingState,
    NoAccessState,
    Screen,
    Section,
    Stat,
    Text,
} from "@trainflow/ui-mobile";
import { useApiQuery } from "../../infrastructure/networking/queries";
import { StatusBadge } from "../shared/format";
import { Pagination } from "../training/components";

const pageSize = 20;
const seconds = (value: number | string | null | undefined) =>
    value == null ? "–" : `${Number(value).toFixed(2)} s`;
const speed = (value: number | string | null | undefined) =>
    value == null ? "–" : Number(value).toFixed(2);

function Result({ id }: { id: string }) {
    const query = useApiQuery<AnalysisResult>(`/api/v1/analyses/${id}/result`, {
        maxPoints: 300,
    });
    if (query.isPending) return <LoadingState />;
    if (query.error || !query.data)
        return (
            <ErrorState error={query.error} retry={() => void query.refetch()} />
        );
    return (
        <>
            <Text variant="caption" tone="mutedText">
                {query.data.method} · positions in {query.data.positionUnit}
            </Text>
            {query.data.repetitions.length ? (
                query.data.repetitions.map((rep) => (
                    <Section key={rep.number} title={`Repetition ${rep.number}`}>
                        <Text variant="caption" tone="mutedText">
                            {seconds(rep.startSeconds)} –{" "}
                            {seconds(rep.endSeconds)}
                        </Text>
                        <View style={{ flexDirection: "row" }}>
                            <Stat label="Mean speed" value={speed(rep.meanSpeed)} />
                            <Stat label="Peak speed" value={speed(rep.peakSpeed)} />
                            <Stat label="Phases" value={rep.phases.length} />
                        </View>
                    </Section>
                ))
            ) : (
                <EmptyState
                    icon="video"
                    title="No repetitions detected"
                    description="This analysis has no repetition data."
                />
            )}
        </>
    );
}

export function AnalysisScreen() {
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState<AnalysisDto>();
    const [open, setOpen] = useState(false);
    const query = useApiQuery<AnalysisDto[]>("/api/v1/analyses", {
        page,
        pageSize,
        sort: "created",
    });
    return (
        <Screen title="Video analysis" subtitle="Bar path and speed, on your device">
            <Section>
                <NoAccessState
                    title="New analysis is not available on this phone yet"
                    description="The on-device model has not been validated for this device. Videos are never sent to a server instead. Saved results stay readable below."
                />
            </Section>
            <Section title="Saved analyses">
                {query.isPending ? (
                    <LoadingState />
                ) : query.error ? (
                    <ErrorState
                        error={query.error}
                        retry={() => void query.refetch()}
                    />
                ) : query.data?.length ? (
                    query.data.map((item) => (
                        <ListItem
                            key={item.id}
                            icon="video"
                            title={item.name}
                            trailing={<StatusBadge status={item.status} />}
                            onPress={() => {
                                setSelected(item);
                                setOpen(true);
                            }}
                        />
                    ))
                ) : (
                    <EmptyState
                        icon="video"
                        title="No saved analyses"
                        description="Analyses made in the web app appear here."
                    />
                )}
                {/* The list endpoint returns a bare page, so "more" is inferred from a full page. */}
                <Pagination
                    unknownTotal
                    data={{
                        items: query.data ?? [],
                        page,
                        pageSize,
                        total:
                            (page - 1) * pageSize +
                            (query.data?.length ?? 0) +
                            ((query.data?.length ?? 0) === pageSize ? 1 : 0),
                    }}
                    onChange={setPage}
                />
            </Section>
            <BottomSheet
                title={selected?.name ?? "Analysis"}
                subtitle="Saved result"
                open={open}
                size="full"
                onClose={() => setOpen(false)}
            >
                {selected ? <Result key={selected.id} id={selected.id} /> : null}
            </BottomSheet>
        </Screen>
    );
}
