import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { useState } from "react";
import type { Schema } from "@metrivum/api-client-web";
import {
  Alert,
  AlertDialog,
  Button,
  Dialog,
  DialogFooter,
  Option,
  Select,
  toast,
} from "@metrivum/ui-web";
import {
  useCoachingMutation,
  useCoachingQuery,
  type Relationship,
} from "../api";
import { Failure, Loading, MutationError } from "../components";
import styles from "./client-details.module.css";

export function useClientTeamActions(relationship?: Relationship) {
  const home = useCoachingQuery<Schema<"TeamHomeDto">>(
    "/api/v1/teams/mine",
    undefined,
    !!relationship,
  );
  const teams =
    home.data?.teams.filter(
      (t) => t.status === "Active" && (t.isMember || t.isOwner),
    ) ?? [];
  const team = teams.find((t) => t.id === relationship?.teamId);
  const client = useCoachingQuery<Schema<"TeamClientCaseDto">>(
    `/api/v1/teams/${team?.id}/clients/${relationship?.teamClientCaseId}`,
    undefined,
    !!team && !!relationship?.teamClientCaseId,
  );
  return {
    teams,
    client: client.data,
    canTransfer:
      !!relationship &&
      !relationship.teamId &&
      relationship.status === "Active" &&
      teams.length > 0,
    canAssign: client.data?.allowedActions.includes("assign-coach") === true,
  };
}
export function ClientTeamDialog({
  relationship,
  teams,
  client,
  close,
}: {
  relationship: Relationship;
  teams: Schema<"TeamDto">[];
  client?: Schema<"TeamClientCaseDto">;
  close: () => void;
}) {
  const uiCopy = useUiCopy();

  const [selected, setSelected] = useState(
    teams.length === 1 ? teams[0]!.id : "",
  );
  const [remove, setRemove] = useState<string | null>(null);
  const [coachId, setCoach] = useState("");
  const members = useCoachingQuery<Schema<"TeamMemberDto">[]>(
    `/api/v1/teams/${client?.teamId}/members`,
    undefined,
    !!client,
  );
  const mutation = useCoachingMutation(() => {
    toast({
      tone: "success",
      title: client ? "Coach assignments updated" : "Transfer request sent",
    });
    close();
  });
  const candidates =
    members.data?.filter(
      (m) =>
        m.userId !== client?.clientId &&
        !client?.assignedCoachIds.includes(m.userId),
    ) ?? [];
  return (
    <Dialog
      isOpen
      title={
        client
          ? uiCopy["ui"]["Assign Team coach"]
          : uiCopy["ui"]["Request transfer to Team"]
      }
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) close();
      }}
      isDismissable={!mutation.isPending}
      isKeyboardDismissDisabled={mutation.isPending}
    >
      <div className={styles.stack}>
        {client ? (
          <>
            {members.isPending ? (
              <Loading />
            ) : members.isError ? (
              <Failure
                error={members.error}
                retry={() => void members.refetch()}
              />
            ) : !candidates.length ? (
              <Alert
                tone="info"
                title={uiCopy["ui"]["Every Team coach is already assigned"]}
              >
                {
                  uiCopy["ui"][
                    "Invite another coach to the Team to add them to this client."
                  ]
                }
              </Alert>
            ) : (
              <Select
                label={uiCopy["profile"]["roles"]["Coach"]}
                selectedKey={coachId || null}
                onSelectionChange={(key) => setCoach(String(key))}
              >
                {candidates.map((m) => (
                  <Option key={m.userId} id={m.userId}>
                    {m.displayName || m.username}
                  </Option>
                ))}
              </Select>
            )}
            <div className={styles.stack}>
              {client.assignedCoachIds.map((id) => (
                <Button
                  key={id}
                  variant="ghost"
                  isDisabled={mutation.isPending}
                  onPress={() => setRemove(id)}
                >
                  {uiCopy["ui"]["Unassign"]}{" "}
                  {members.data?.find((m) => m.userId === id)?.displayName ||
                    uiCopy["ui"]["coach"]}
                </Button>
              ))}
            </div>
            <p>
              {
                uiCopy["ui"][
                  "Adding a coach grants access to the Team case. It does not share another coach’s private notes."
                ]
              }
            </p>
          </>
        ) : (
          <>
            <Alert title={uiCopy["ui"]["Client consent is required"]}>
              {
                uiCopy["ui"][
                  "This sends a request. The Team case is created only after the client accepts. Private history remains private; active services and unpaid obligations must be resolved first."
                ]
              }
            </Alert>
            <Select
              label={uiCopy["ui"]["Team"]}
              selectedKey={selected || null}
              onSelectionChange={(key) => setSelected(String(key))}
            >
              {teams.map((t) => (
                <Option key={t.id} id={t.id}>
                  {t.name}
                </Option>
              ))}
            </Select>
          </>
        )}
        <MutationError error={mutation.error} />
        <DialogFooter>
          <Button isDisabled={mutation.isPending} onPress={close}>
            {uiCopy["common"]["cancel"]}
          </Button>
          <Button
            variant="primary"
            loading={mutation.isPending}
            isDisabled={client ? !coachId : !selected}
            onPress={() =>
              mutation.mutate(
                client
                  ? {
                      method: "POST",
                      path: `/api/v1/teams/${client.teamId}/clients/${client.id}/assign-coach`,
                      json: { coachId, version: client.version },
                    }
                  : {
                      method: "POST",
                      path: `/api/v1/teams/${selected}/client-transfer-requests`,
                      json: { relationshipId: relationship.id },
                    },
              )
            }
          >
            {client
              ? uiCopy["ui"]["Assign coach"]
              : uiCopy["ui"]["Request client consent"]}
          </Button>
        </DialogFooter>
        <AlertDialog
          isOpen={!!remove}
          onOpenChange={(open) => {
            if (!open && !mutation.isPending) setRemove(null);
          }}
          title={uiCopy["ui"]["Unassign this coach?"]}
          confirmLabel={uiCopy["ui"]["Unassign coach"]}
          cancelLabel={uiCopy["ui"]["Keep assignment"]}
          isConfirming={mutation.isPending}
          onConfirm={() => {
            if (client && remove)
              mutation.mutate({
                method: "DELETE",
                path: `/api/v1/teams/${client.teamId}/clients/${client.id}/assignments/${remove}`,
                json: { version: client.version },
              });
          }}
        >
          {
            uiCopy["ui"][
              "This removes the coach’s access to the Team case. Existing private records remain private."
            ]
          }
        </AlertDialog>
      </div>
    </Dialog>
  );
}
