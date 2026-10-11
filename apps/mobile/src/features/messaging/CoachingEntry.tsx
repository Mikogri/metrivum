import { useState } from "react";
import { router } from "expo-router";
import type { Schema } from "@trainflow/api-client-web";
import { BottomSheet, Button, ErrorState, Field, ListItem, LoadingState, Section, Text } from "@trainflow/ui-mobile";
import { useApiMutation, useApiQuery } from "../../infrastructure/networking/queries";

export function CoachingEntry({ entry, mine }: { entry: NonNullable<Schema<"MessageDto">["coachingEntry"]>; mine: boolean }) {
    const [open, setOpen] = useState(false);
    const [counts, setCounts] = useState<Record<string, string>>({});
    const offer = useApiQuery<Schema<"OfferRevisionDto">>(`/api/v1/coaches/${entry.coachId}/offers/${entry.offerId}`, undefined, open);
    const start = useApiMutation<Schema<"ApplicationDetailDto">>(value => {
        setOpen(false);
        router.push({ pathname: "/application/[id]", params: { id: value.application.id } });
    });
    return <>
        <ListItem icon="mail" title={entry.title} subtitle={entry.kind === "Invitation" ? "Coaching invitation" : "Application form"} onPress={() => {
            if (entry.kind === "Invitation" && entry.invitationId) router.push({ pathname: "/invitation/[id]", params: { id: entry.invitationId } });
            else setOpen(true);
        }} />
        <BottomSheet open={open} onClose={() => setOpen(false)} title={entry.title}>
            {offer.isPending ? <LoadingState /> : offer.error ? <ErrorState error={offer.error} retry={() => void offer.refetch()} /> : offer.data && <>
                <Text tone="mutedText">Review the current offer before starting your application.</Text>
                {offer.data.billingOptions.map(option => {
                    const count = counts[option.id] ?? "";
                    const custom = option.model === "CustomPackage";
                    const valid = !custom || (/^\d+$/.test(count) && Number(count) >= Number(option.minSessions ?? 1) && Number(count) <= Number(option.maxSessions ?? 1000));
                    return <Section key={option.id} title={option.name}>
                        <Text>{option.price} {offer.data.currency}</Text>
                        <Text tone="mutedText">{option.validityDays ? `Valid for ${option.validityDays} days from payment` : "No fixed expiry"}</Text>
                        {custom && !mine && <Field label="Number of sessions" keyboardType="number-pad" value={count} onChangeText={value => setCounts(previous => ({ ...previous, [option.id]: value }))} />}
                        {!mine && <Button title="Fill in the application" disabled={!valid} loading={start.isPending} onPress={() => start.mutate({ method: "POST", path: "/api/v1/coaching/applications", json: { offerId: entry.offerId, billingOptionId: option.id, ...(custom ? { selectedSessionCount: Number(count) } : {}) } })} />}
                    </Section>;
                })}
            </>}
            {start.error && <ErrorState error={start.error} />}
        </BottomSheet>
    </>;
}
