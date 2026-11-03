import { useT as useUiCopy } from "~/shared/i18n/AppLocale";
import { useQuery } from '@tanstack/react-query';
import { Video } from 'lucide-react';
import { Link } from 'react-router';
import { useAccountKey, useApi } from '~/shared/session/AccountScope';
import { listFromCoach } from '../api';
import styles from './CoachAnalysisChips.module.css';

/** Analyses the coach shared for one logged workout; one request per workout, shared by all its sets. */
function useWorkoutAnalyses(executionId: string, enabled: boolean) {
  const api = useApi();
  const account = useAccountKey();
  return useQuery({
    queryKey: [account, 'video', 'from-coach', 'execution', executionId] as const,
    queryFn: ({ signal }) => listFromCoach(api, executionId, signal),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

/**
 * Client view of a logged workout: a link to each video analysis the coach attached to this set
 * (or, without `setId`, to the whole workout). Renders nothing when there are none.
 */
export function CoachAnalysisChips({ executionId, setId = null, enabled = true }: { executionId: string; setId?: string | null; enabled?: boolean }) {
 const uiCopy = useUiCopy();

  const list = useWorkoutAnalyses(executionId, enabled);
  const shown = (list.data ?? []).filter(item => (item.set.setId ?? null) === setId);
  if (!shown.length) return null;
  return <span className={styles.chips}>
    {shown.map(({ analysis }) => <Link key={analysis.id} to={`/app/my-analyses/${analysis.id}`} className={styles.chip} title={analysis.name}>
      <Video aria-hidden="true" />
      <span>{setId ? uiCopy["ui"]["Coach video"] : `Coach video: ${analysis.name}`}</span>
    </Link>)}
  </span>;
}
