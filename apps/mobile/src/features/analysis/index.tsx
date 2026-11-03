import { useI18n as useNativeCopy } from "../../infrastructure/i18n";
import { useState } from "react";
import { View } from "react-native";
import type { AnalysisDto, AnalysisResult } from "@metrivum/api-client-web";
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
} from "@metrivum/ui-mobile";
import { useApiQuery } from "../../infrastructure/networking/queries";
import { StatusBadge } from "../shared/format";
import { Pagination } from "../training/components";

const pageSize = 20;
const seconds = (value: number | string | null | undefined) =>
    value == null ? "–" : `${Number(value).toFixed(2)} s`;
const speed = (value: number | string | null | undefined) =>
    value == null ? "–" : Number(value).toFixed(2);

function Result({ id }: { id: string }) {
 const nativeCopy = useNativeCopy().t;

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
                {query.data.method}  {nativeCopy("interface.· positions in")} {query.data.positionUnit}
            </Text>
            {query.data.repetitions.length ? (
                query.data.repetitions.map((rep) => (
                    <Section key={rep.number} title={nativeCopy("interface.Repetition {0}", {"0": String(rep.number)})}>
                        <Text variant="caption" tone="mutedText">
                            {seconds(rep.startSeconds)} –{" "}
                            {seconds(rep.endSeconds)}
                        </Text>
                        <View style={{ flexDirection: "row" }}>
                            <Stat label={nativeCopy("interface.Mean speed")} value={speed(rep.meanSpeed)} />
                            <Stat label={nativeCopy("interface.Peak speed")} value={speed(rep.peakSpeed)} />
                            <Stat label={nativeCopy("interface.Phases")} value={rep.phases.length} />
                        </View>
                    </Section>
                ))
            ) : (
                <EmptyState
                    icon="video"
                    title={nativeCopy("interface.No repetitions detected")}
                    description={nativeCopy("interface.This analysis has no repetition data.")}
                />
            )}
        </>
    );
}

export function AnalysisScreen() {
 const nativeCopy = useNativeCopy().t;

    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState<AnalysisDto>();
    const [open, setOpen] = useState(false);
    const query = useApiQuery<AnalysisDto[]>("/api/v1/analyses", {
        page,
        pageSize,
        sort: "created",
    });
    return (
        <Screen title={nativeCopy("interface.Video analysis")} subtitle={nativeCopy("interface.Bar path and speed, on your device")}>
            <Section>
                <NoAccessState
                    title={nativeCopy("interface.New analysis is not available on this phone yet")}
                    description={nativeCopy("interface.The on-device model has not been validated for this device. Videos are never sent to a server instead. Saved results stay readable below.")}
                />
            </Section>
            <Section title={nativeCopy("interface.Saved analyses")}>
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
                        title={nativeCopy("interface.No saved analyses")}
                        description={nativeCopy("interface.Analyses made in the web app appear here.")}
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
                title={selected?.name ?? nativeCopy("interface.Analysis")}
                subtitle={nativeCopy("interface.Saved result")}
                open={open}
                size="full"
                onClose={() => setOpen(false)}
            >
                {selected ? <Result key={selected.id} id={selected.id} /> : null}
            </BottomSheet>
        </Screen>
    );
}
