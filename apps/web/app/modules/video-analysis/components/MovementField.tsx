import { useId, useState } from 'react';
import { ChevronDown, Dumbbell } from 'lucide-react';
import { ExercisePicker } from '~/modules/exercises';
import styles from './MovementField.module.css';

const QUICK = ['Squat', 'Bench press', 'Deadlift'];

/**
 * The movement of an analysis: any exercise from the catalog (searchable), with the three main lifts one tap away.
 */
export function MovementField({ value, onChange, isDisabled = false, isRequired = false, label = 'Movement' }: { value: string | null; onChange: (exercise: string) => void; isDisabled?: boolean; isRequired?: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className={styles.field}>
    <span id={id} className={styles.label}>{label}{isRequired ? <span aria-hidden="true" className={styles.required}>*</span> : null}</span>
    <button type="button" className={styles.trigger} aria-labelledby={id} aria-describedby={`${id}-value`} disabled={isDisabled} aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <Dumbbell aria-hidden="true" />
      <span id={`${id}-value`} className={styles.value} data-empty={!value || undefined}>{value || 'Choose the exercise'}</span>
      <ChevronDown aria-hidden="true" />
    </button>
    <span className={styles.quick} role="group" aria-label="Main lifts">
      {QUICK.map(name => <button key={name} type="button" disabled={isDisabled} aria-pressed={value === name} onClick={() => onChange(name)}>{name}</button>)}
    </span>
    {open ? <ExercisePicker isOpen onOpenChange={setOpen} title="Choose the movement" onPick={exercise => onChange(exercise.name)} /> : null}
  </div>;
}
