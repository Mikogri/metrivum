import { useEffect, useState } from 'react';
import { Alert, Button, PageHeader, TextField } from '@trainflow/ui-web';
import { RequireFeature } from '~/shared/access';
import { useT } from '~/shared/i18n/AppLocale';
import { privateMeta } from '~/shared/i18n/site';
import { TrackingPicker, type TrackingSelection } from '../components/TrackingPicker';
import { ACCEPTED_TYPES, DEFAULT_MAX_BYTES, videoContentType } from '../upload';
import { LOCAL_ANALYZER_UNAVAILABLE } from '../local-analysis';
import styles from './new-analysis.module.css';
export const meta = () => privateMeta('New analysis — TrainFlow');
function LocalAnalysis() {
  const t = useT().video.new;
  const [file, setFile] = useState<File>();
  const [src, setSrc] = useState<string>();
  const [tracking, setTracking] = useState<TrackingSelection | null>(null);
  const [name, setName] = useState(''); const [error, setError] = useState('');
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file); setSrc(url); setTracking(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <><PageHeader title={t.title} /><Alert tone="warning" title="Local analysis unavailable">{LOCAL_ANALYZER_UNAVAILABLE}</Alert>
    <div className={styles.layout}><section><label htmlFor="local-analysis-video">Video (MP4, MOV or WebM)</label><input id="local-analysis-video" type="file" accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm" onChange={event => {
      const next = event.target.files?.[0]; if (!next) return;
      if (!ACCEPTED_TYPES.includes(videoContentType(next)) || next.size > DEFAULT_MAX_BYTES) { setError('Choose a supported video within the file-size limit.'); return; }
      setError(''); setFile(next); setName(next.name.replace(/\.[^.]+$/, ''));
    }} />{error && <Alert tone="danger" title="Cannot use this video">{error}</Alert>}{src && <TrackingPicker key={src} src={src} value={tracking} onChange={setTracking} />}</section>
    <section><TextField label={t.name} value={name} onChange={setName} maxLength={200} /><p>The video stays on this device. Preview and point selection are available; tracking and charts require a validated browser model.</p><Button isDisabled>Local analysis unavailable</Button></section></div></>;
}
export default function NewAnalysisRoute() { return <RequireFeature feature="video.library.manage"><LocalAnalysis /></RequireFeature>; }
