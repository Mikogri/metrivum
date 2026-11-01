import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Schema } from '@metrivum/api-client-web';
import { Alert, Button, Option, Select } from '@metrivum/ui-web';
import { useAccountContext } from '~/shared/session/AccountScope';
import { useT } from '~/shared/i18n/AppLocale';

export type PlanUsage = Schema<'PlanUsageDto'>;

/** Personal is always explicit default; membership alone never silently selects a shared budget. */
export function useQuotaContext() {
  const { api, accountKey } = useAccountContext();
  const [teamId, setTeamId] = useState<string | undefined>();
  const team = useQuery({ queryKey: [accountKey, 'quota-team'], queryFn: async ({ signal }) => (await api<Schema<'TeamAccess'> | null>({ path: '/api/v1/me/team-context', signal })).data });
  const usage = useQuery({ queryKey: [accountKey, 'usage', teamId ?? 'personal'], queryFn: async ({ signal }) => (await api<PlanUsage>({ path: '/api/v1/me/usage', query: teamId ? { teamId } : undefined, signal })).data });
  return { teamId, setTeamId, team, usage };
}

export function QuotaContextField({ context, disabled = false }: { context: ReturnType<typeof useQuotaContext>; disabled?: boolean }) {
  const m = useT();
  // With no active Team there is only the personal plan to choose, so the choice is not shown.
  const choice = Boolean(context.team.data?.isActive);
  return <>
    {choice && <Select label={m.access.quotaContext} selectedKey={context.teamId ?? 'personal'} onSelectionChange={key => context.setTeamId(key === 'personal' ? undefined : String(key))} isDisabled={disabled || context.team.isPending}>
      <Option id="personal">{m.access.personalQuota}</Option>
      {context.team.data?.isActive && <Option id={context.team.data.teamId}>{context.team.data.name || m.access.workspaceQuota}</Option>}
    </Select>}
    {context.team.isError && <Alert tone="warning" title={m.access.teamQuotaUnavailable} actions={<Button size="sm" onPress={() => void context.team.refetch()}>{m.common.retry}</Button>} />}
    {context.usage.isError && <Alert tone="warning" title={m.access.quotaUnavailable} actions={<Button size="sm" onPress={() => void context.usage.refetch()}>{m.common.retry}</Button>} />}
  </>;
}
