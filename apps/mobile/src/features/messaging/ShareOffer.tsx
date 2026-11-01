import { useRef, useState } from "react";
import { randomUUID } from "expo-crypto";
import type { Schema } from "@metrivum/api-client-web";
import { BottomSheet, Button, ErrorState, ListItem, LoadingState, Text } from "@metrivum/ui-mobile";
import { useApiMutation, useApiQuery } from "../../infrastructure/networking/queries";

export function ShareOffer({ kind, userId, username, close, refresh }: { kind: "form" | "invitation"; userId: string; username: string; close: () => void; refresh: () => void }) {
    const offers = useApiQuery<{ items: Schema<"OfferDto">[] }>("/api/v1/offers", { status: "Active", pageSize: 100 });
    const [selected, setSelected] = useState("");
    const attempt = useRef({ offerId: "", key: "" });
    const share = useApiMutation(() => { refresh(); close(); });
    const offer = offers.data?.items.find(item => item.id === selected) ?? (offers.data?.items.length === 1 ? offers.data.items[0] : undefined);
    return <BottomSheet open title={kind === "form" ? "Send application form" : "Send invitation"} onClose={() => { if (!share.isPending) close(); }}>
        <Text tone="mutedText">Send an active offer to @{username}.</Text>
        {offers.isPending ? <LoadingState /> : offers.error ? <ErrorState error={offers.error} retry={() => void offers.refetch()} /> : offers.data?.items.length ? offers.data.items.map(item => <ListItem key={item.id} title={item.name} subtitle={offer?.id === item.id ? "Selected" : undefined} onPress={share.isPending ? undefined : () => setSelected(item.id)} />) : <Text>Activate an offer with an application form first.</Text>}
        <Button title="Send" loading={share.isPending} disabled={!offer} onPress={() => {
            if (!offer) return;
            if (attempt.current.offerId !== offer.id) attempt.current = { offerId: offer.id, key: randomUUID() };
            share.mutate({ method: "POST", path: kind === "form" ? "/api/v1/coaching/form-shares" : "/api/v1/coaching/invitations", idempotencyKey: attempt.current.key, json: kind === "form" ? { userId, offerId: offer.id } : { username, offerId: offer.id, billingOptionId: null, message: null } });
        }} />
        {share.error && <ErrorState error={share.error} />}
    </BottomSheet>;
}
