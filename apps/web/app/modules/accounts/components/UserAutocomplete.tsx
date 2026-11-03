import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Avatar, Combobox, Option, Spinner } from "@metrivum/ui-web";
import { useAccountKey, useApi } from "~/shared/session";

export type UserSuggestion = { userId: string; username: string; displayName: string };
export function UserAutocomplete({ value, onChange, onSelect, label = "Username", searchPath = "/api/v1/accounts/people", isDisabled, isRequired, autoFocus, className, description }: {
  value: string; onChange: (value: string) => void; onSelect?: (person: UserSuggestion) => void;
  label?: string; searchPath?: string; isDisabled?: boolean; isRequired?: boolean; autoFocus?: boolean; className?: string; description?: string;
}) {
  const uiCopy = useUiCopy();

  const api = useApi();
  const account = useAccountKey();
  const normalized = value.trim().replace(/^@/, "");
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<UserSuggestion | null>(null);
  const selectedMatches = selected?.username === normalized;
  useEffect(() => { const timer = setTimeout(() => setTerm(normalized), 250); return () => clearTimeout(timer); }, [normalized]);
  const people = useQuery({ queryKey: [account, "user-autocomplete", searchPath, term], enabled: !isDisabled && !selectedMatches && term.length >= 2 && term.length <= 30,
    queryFn: async ({ signal }) => (await api<UserSuggestion[]>({ path: searchPath, query: { search: term }, signal })).data });
  const rows = selectedMatches ? [selected!] : term === normalized ? people.data ?? [] : [];
  return <Combobox label={label} placeholder={uiCopy["ui"]["@username"]} inputValue={value} onInputChange={text => { if (selected && text.trim().replace(/^@/, "") !== selected.username) setSelected(null); onChange(text); }}
    selectedKey={selectedMatches ? selected!.userId : null} onSelectionChange={key => { const person = rows.find(row => row.userId === key); if (person) { setSelected(person); onChange(person.username); onSelect?.(person); } }}
    menuTrigger="input" allowsCustomValue allowsEmptyCollection defaultFilter={() => true} isDisabled={isDisabled} isRequired={isRequired} autoFocus={autoFocus} className={className}
    description={description} isInvalid={people.isError} errorMessage={people.isError ? "Could not search users. Try again." : undefined}
    emptyState={normalized.length < 2 ? "Type at least two characters." : normalized !== term || people.isFetching ? <><Spinner size="sm" />  {uiCopy["nav"]["commandSearching"]}</> : "No matching users."}>
    {rows.map(person => <Option key={person.userId} id={person.userId} textValue={person.username}><span style={{ display: "flex", alignItems: "center", gap: "var(--tf-space-2)" }}><Avatar name={person.displayName || person.username} size="sm" decorative />@{person.username}</span></Option>)}
  </Combobox>;
}
