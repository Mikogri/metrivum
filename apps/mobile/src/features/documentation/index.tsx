import { useI18n as useNativeCopy } from "../../infrastructure/i18n";
import { NativeDateField } from "../training/NativeDateField";
import { useState } from "react";
import { Linking, View } from "react-native";
import type { Schema } from "@metrivum/api-client-web";
import {
  Badge,
  BottomSheet,
  Button,
  EmptyState,
  ErrorState,
  Field,
  ListItem,
  LoadingState,
  SearchField,
  Section,
  Text,
  useTheme,
} from "@metrivum/ui-mobile";
import {
  useApiMutation,
  useApiQuery,
} from "../../infrastructure/networking/queries";
import { useMobile } from "../../infrastructure/session/MobileSession";
import { pickAndUpload } from "../../infrastructure/networking/uploads";
import { Filters } from "../shared/Filters";
import { FormSheet } from "../shared/FormSheet";
import { formatDay, humanize, joinParts } from "../shared/format";
import { Choices, DecimalField, Pagination } from "../training/components";
import { localDate, type Page } from "../training/model";
import { MeasurementChart } from "./MeasurementChart";

type Document = Schema<"DocumentDto">;

export function Documentation({ relationshipId }: { relationshipId: string }) {
  const nativeCopy = useNativeCopy().t;

  const base = `/api/v1/coaching/relationships/${relationshipId}/documentation`;
  const theme = useTheme();
  const { api, accountSignal } = useMobile();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [fileTitle, setFileTitle] = useState("");
  const [visibility, setVisibility] = useState("CoachPrivate");
  const [error, setError] = useState<unknown>();
  const [uploading, setUploading] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);
  const [viewing, setViewing] = useState<Document>();
  const [viewOpen, setViewOpen] = useState(false);
  const access = useApiQuery<Schema<"DocumentationAccess">>(base);
  const documents = useApiQuery<Page<Document>>(`${base}/documents`, {
    search,
    page,
    pageSize: 20,
  });
  const notes = useApiQuery<Page<Schema<"NoteDto">>>(
    `${base}/notes`,
    { page, pageSize: 20 },
    access.data?.coach === true,
  );
  const mutation = useApiMutation(() => {
    setText("");
    setTitle("");
    setFileTitle("");
    setVisibility("CoachPrivate");
    setNoteOpen(false);
    setFileOpen(false);
    void documents.refetch();
    void notes.refetch();
  });
  const shareMutation = useApiMutation(() => {
    setViewOpen(false);
    void documents.refetch();
  });
  async function upload() {
    setUploading(true);
    setError(undefined);
    try {
      const mediaId = await pickAndUpload(api, base, accountSignal);
      if (accountSignal.aborted) return;
      if (mediaId)
        mutation.mutate({
          path: `${base}/documents`,
          method: "POST",
          json: {
            title: fileTitle || "Attachment",
            description: null,
            category: "Other",
            visibility,
            text: null,
            mediaId,
            observedAt: new Date().toISOString(),
          },
        });
    } catch (failure) {
      setError(failure);
    } finally {
      setUploading(false);
    }
  }
  async function open(id: string) {
    try {
      const result = await api<Schema<"DocumentReadUrl">>({
        path: `${base}/documents/${id}/read-url`,
        method: "POST",
      });
      if (accountSignal.aborted) return;
      await Linking.openURL(result.data.url);
    } catch (failure) {
      setError(failure);
    }
  }
  const canNote = access.data?.allowedActions.includes("notes");
  const canUpload = access.data?.allowedActions.includes("upload");
  const shared = (item: Document) => item.visibility === "SharedWithClient";
  return (
    <>
      {access.error && <ErrorState error={access.error} />}
      {(canNote || canUpload) && (
        <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
          {canNote && (
            <View style={{ flex: 1 }}>
              <FormSheet
                trigger={{
                  title: nativeCopy("interface.Add a note"),
                  icon: "edit",
                }}
                title={nativeCopy("interface.New private note")}
                subtitle={nativeCopy("interface.Only you see it")}
                size="content"
                dirty={!!(title || text)}
                open={noteOpen}
                onOpenChange={setNoteOpen}
                onDiscard={() => {
                  setTitle("");
                  setText("");
                }}
                footer={() => (
                  <Button
                    size="lg"
                    tone="primary"
                    title={nativeCopy("interface.Save note")}
                    loading={mutation.isPending}
                    disabled={!text.trim()}
                    onPress={() =>
                      mutation.mutate({
                        path: `${base}/notes`,
                        method: "POST",
                        json: { title, text },
                      })
                    }
                  />
                )}
              >
                <Field
                  editable={!mutation.isPending}
                  label={nativeCopy("interface.Title")}
                  placeholder={nativeCopy("interface.Optional")}
                  value={title}
                  onChangeText={setTitle}
                />
                <Field
                  editable={!mutation.isPending}
                  label={nativeCopy("interface.Note")}
                  placeholder={nativeCopy(
                    "interface.What do you want to remember?",
                  )}
                  value={text}
                  multiline
                  onChangeText={setText}
                />
                {mutation.error && <ErrorState error={mutation.error} />}
              </FormSheet>
            </View>
          )}
          {canUpload && (
            <View style={{ flex: 1 }}>
              <FormSheet
                trigger={{
                  title: nativeCopy("interface.Add a file"),
                  icon: "attach",
                }}
                title={nativeCopy("interface.Add a file or photo")}
                subtitle={nativeCopy("interface.Choose who can see this file")}
                size="content"
                dirty={!!fileTitle}
                open={fileOpen}
                onOpenChange={setFileOpen}
                onDiscard={() => {
                  setFileTitle("");
                  setVisibility("CoachPrivate");
                }}
                footer={() => (
                  <Button
                    size="lg"
                    tone="primary"
                    icon="attach"
                    title={nativeCopy("interface.Choose a file")}
                    loading={uploading || mutation.isPending}
                    onPress={() => void upload()}
                  />
                )}
              >
                <Field
                  editable={!mutation.isPending && !uploading}
                  label={nativeCopy("interface.Title")}
                  placeholder={nativeCopy("interface.e.g. Blood test results")}
                  value={fileTitle}
                  onChangeText={setFileTitle}
                />
                <Choices
                  label={nativeCopy("interface.Visibility")}
                  disabled={uploading || mutation.isPending}
                  values={["CoachPrivate", "SharedWithClient"]}
                  labels={{
                    CoachPrivate: "Only me",
                    SharedWithClient: access.data?.coach
                      ? "Shared with client"
                      : "Shared with coach",
                  }}
                  value={visibility}
                  onChange={setVisibility}
                />
                {!!error && <ErrorState error={error} />}
              </FormSheet>
            </View>
          )}
        </View>
      )}
      <SearchField
        label={nativeCopy("interface.Search documents")}
        value={search}
        onChangeText={(value) => {
          setSearch(value);
          setPage(1);
        }}
      />
      <Section title={nativeCopy("interface.Files")}>
        {documents.isPending ? (
          <LoadingState />
        ) : documents.error ? (
          <ErrorState
            error={documents.error}
            retry={() => void documents.refetch()}
          />
        ) : (
          documents.data && (
            <>
              {documents.data.items.map((item) => (
                <ListItem
                  key={item.id}
                  icon={item.hasFile ? "attach" : "document"}
                  title={item.title}
                  subtitle={joinParts(
                    humanize(item.category),
                    formatDay(item.observedAt),
                  )}
                  trailing={
                    <Badge tone={shared(item) ? "info" : "neutral"}>
                      {shared(item)
                        ? access.data?.coach
                          ? nativeCopy("interface.Shared with client")
                          : nativeCopy("interface.Shared with coach")
                        : nativeCopy("interface.Only me")}
                    </Badge>
                  }
                  onPress={() => {
                    setViewing(item);
                    setViewOpen(true);
                  }}
                />
              ))}
              {!documents.data.items.length && (
                <EmptyState
                  icon="document"
                  title={
                    search
                      ? nativeCopy("interface.No documents match")
                      : nativeCopy("interface.No documents yet")
                  }
                />
              )}
              <Pagination data={documents.data} onChange={setPage} />
            </>
          )
        )}
      </Section>
      {access.data?.coach && (
        <Section title={nativeCopy("interface.Private notes")}>
          {notes.error ? (
            <ErrorState error={notes.error} />
          ) : notes.data?.items.length ? (
            notes.data.items.map((item) => (
              <ListItem
                key={item.id}
                icon="edit"
                title={item.title || nativeCopy("interface.Note")}
                subtitle={item.text}
              />
            ))
          ) : (
            <Text variant="caption" tone="mutedText">
              {nativeCopy("interface.No notes yet.")}
            </Text>
          )}
        </Section>
      )}
      {!!(error && !fileOpen) && <ErrorState error={error} />}
      <BottomSheet
        title={viewing?.title ?? ""}
        subtitle={
          viewing
            ? joinParts(
                humanize(viewing.category),
                formatDay(viewing.observedAt),
                shared(viewing)
                  ? access.data?.coach
                    ? "Shared with client"
                    : "Shared with coach"
                  : "Only me",
              )
            : undefined
        }
        open={viewOpen}
        onClose={() => setViewOpen(false)}
      >
        {viewing && (
          <>
            {viewing.text || viewing.description ? (
              <Text>{viewing.text || viewing.description}</Text>
            ) : null}
            {viewing.hasFile && (
              <Button
                size="lg"
                tone="primary"
                icon="attach"
                title={nativeCopy("interface.Open file")}
                onPress={() => void open(viewing.id)}
              />
            )}
            {viewing.allowedActions.includes("share") && (
              <Button
                loading={shareMutation.isPending}
                icon={shared(viewing) ? "lock" : "send"}
                title={
                  shared(viewing)
                    ? nativeCopy("interface.Make visible only to me")
                    : access.data?.coach
                      ? nativeCopy("interface.Share with client")
                      : nativeCopy("interface.Share with coach")
                }
                onPress={() =>
                  shareMutation.mutate({
                    path: `${base}/documents/${viewing.id}/share`,
                    method: "POST",
                    ifMatch: viewing.version,
                    json: {
                      visibility: shared(viewing)
                        ? "CoachPrivate"
                        : "SharedWithClient",
                    },
                  })
                }
              />
            )}
            {shareMutation.error && <ErrorState error={shareMutation.error} />}
          </>
        )}
      </BottomSheet>
    </>
  );
}

export function Measurements({ relationshipId }: { relationshipId: string }) {
  const nativeCopy = useNativeCopy().t;

  const base = `/api/v1/coaching/relationships/${relationshipId}/documentation`;
  const [page, setPage] = useState(1);
  const initialRange = () => ({
    from: localDate(new Date(Date.now() - 90 * 86400000)),
    to: localDate(),
  });
  const [range, setRange] = useState(initialRange);
  const [key, setKey] = useState("weight");
  const [unit, setUnit] = useState("kg");
  const [value, setValue] = useState<number | null>(null);
  const [valueValid, setValueValid] = useState(true);
  const [date, setDate] = useState(localDate());
  const [comment, setComment] = useState("");
  const [open, setOpen] = useState(false);
  const access = useApiQuery<Schema<"DocumentationAccess">>(base);
  const definitions = useApiQuery<Schema<"MeasurementDefinition">[]>(
    `${base}/measurement-definitions`,
  );
  const query = useApiQuery<Page<Schema<"MeasurementDto">>>(
    `${base}/measurements`,
    {
      from: `${range.from}T00:00:00Z`,
      to: `${range.to}T23:59:59Z`,
      key,
      page,
      pageSize: 20,
    },
  );
  const reset = () => {
    setValue(null);
    setValueValid(true);
    setDate(localDate());
    setComment("");
  };
  const mutation = useApiMutation(() => {
    reset();
    setOpen(false);
    void query.refetch();
  });
  const definition = definitions.data?.find((item) => item.key === key);
  const measurementLabels = Object.fromEntries(
    definitions.data?.map((item) => [item.key, item.label]) ?? [],
  );
  const selectMeasurement = (next: string) => {
    setKey(next);
    setUnit(
      definitions.data?.find((item) => item.key === next)?.units[0] || "",
    );
    setPage(1);
  };
  return (
    <>
      <Section
        title={definition?.label ?? nativeCopy("interface.Body measurements")}
        action={
          <Filters
            title={nativeCopy("interface.Measurements")}
            summary={`${formatDay(range.from)} – ${formatDay(range.to)}`}
            onReset={() => {
              setRange(initialRange());
              setPage(1);
            }}
          >
            {definitions.data && (
              <Choices
                label={nativeCopy("interface.Measurement")}
                labels={measurementLabels}
                values={definitions.data.map((item) => item.key)}
                value={key}
                onChange={selectMeasurement}
              />
            )}
            <NativeDateField
              label={nativeCopy("interface.From")}
              value={range.from}
              onChange={(from) => {
                setRange((current) => ({ ...current, from }));
                setPage(1);
              }}
            />
            <NativeDateField
              label={nativeCopy("interface.Through")}
              value={range.to}
              onChange={(to) => {
                setRange((current) => ({ ...current, to }));
                setPage(1);
              }}
            />
          </Filters>
        }
      >
        {query.isPending ? (
          <LoadingState />
        ) : query.error ? (
          <ErrorState error={query.error} retry={() => void query.refetch()} />
        ) : (
          query.data && (
            <>
              <MeasurementChart
                records={query.data.items}
                definition={definition}
                measurementKey={key}
                page={page}
              />
              {query.data.items.map((item) => (
                <ListItem
                  key={item.id}
                  title={`${item.value} ${item.unit}`}
                  subtitle={joinParts(formatDay(item.observedAt), item.comment)}
                />
              ))}
              <Pagination data={query.data} onChange={setPage} />
            </>
          )
        )}
      </Section>
      {access.data?.allowedActions.includes("measure") && (
        <FormSheet
          trigger={{
            title: nativeCopy("interface.Add a measurement"),
            icon: "add",
          }}
          title={nativeCopy("interface.Add a measurement")}
          subtitle={definition?.label}
          size="content"
          dirty={value != null || !!comment}
          open={open}
          onOpenChange={setOpen}
          onDiscard={reset}
          footer={() => (
            <Button
              size="lg"
              tone="primary"
              title={nativeCopy("interface.Save measurement")}
              loading={mutation.isPending}
              disabled={value == null || !valueValid}
              onPress={() =>
                mutation.mutate({
                  path: `${base}/measurements`,
                  method: "POST",
                  json: {
                    key,
                    unit,
                    value,
                    observedAt: `${date}T12:00:00Z`,
                    comment,
                  },
                })
              }
            />
          )}
        >
          <DecimalField
            label={nativeCopy("interface.Value ({0})", { "0": String(unit) })}
            placeholder="e.g. 80.5"
            value={value}
            onChange={setValue}
            onValidityChange={setValueValid}
          />
          {(definition?.units.length ?? 0) > 1 && (
            <Choices
              label={nativeCopy("interface.Unit")}
              values={definition?.units || ["kg"]}
              labels={Object.fromEntries(
                (definition?.units ?? []).map((item) => [item, item]),
              )}
              value={unit}
              onChange={setUnit}
            />
          )}
          <NativeDateField
            label={nativeCopy("interface.Measured on")}
            value={date}
            onChange={setDate}
          />
          <Field
            label={nativeCopy("interface.Comment")}
            placeholder={nativeCopy(
              "interface.Optional, e.g. morning, before breakfast",
            )}
            value={comment}
            onChangeText={setComment}
          />
          {mutation.error && <ErrorState error={mutation.error} />}
        </FormSheet>
      )}
    </>
  );
}
