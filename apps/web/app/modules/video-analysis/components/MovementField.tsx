import { useId, useState } from 'react';
import { ChevronDown, Dumbbell } from 'lucide-react';
import { Chip, ChipGroup } from '@trainflow/ui-web';
import { ExercisePicker } from '~/modules/exercises';
import styles from './MovementField.module.css';

const QUICK = ['Squat', 'Bench press', 'Deadlift'];

/**
 * The movement of an analysis: any exercise from the catalog (searchable), with the three main lifts one tap away.
 */
export function MovementField({ value, onChange, isDisabled = false, isRequired = false, label = 'Movement', errorMessage }: { value: string | null; onChange: (exercise: string) => void; isDisabled?: boolean; isRequired?: boolean; label?: string; /** Shown under the field, and the field is marked invalid. */ errorMessage?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div className={styles.field}>
    <span id={id} className={styles.label}>{label}{isRequired ? <span aria-hidden="true" className={styles.required}>*</span> : null}</span>
    <button type="button" className={styles.trigger} aria-labelledby={id} aria-describedby={errorMessage ? `${id}-value ${id}-error` : `${id}-value`} aria-invalid={errorMessage ? true : undefined}
      disabled={isDisabled} aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <Dumbbell aria-hidden="true" />
      <span id={`${id}-value`} className={styles.value} data-empty={!value || undefined}>{value || 'Choose the exercise'}</span>
      <ChevronDown aria-hidden="true" />
    </button>
    {errorMessage ? <p id={`${id}-error`} className={styles.error} role="alert">{errorMessage}</p> : null}
    <ChipGroup aria-label="Main lifts" isDisabled={isDisabled} disallowEmptySelection
      selectedKeys={value && QUICK.includes(value) ? [value] : []} onSelectionChange={keys => { const key = [...keys][0]; if (key != null) onChange(String(key)); }}>
      {QUICK.map(name => <Chip key={name} id={name}>{name}</Chip>)}
    </ChipGroup>
    {open ? <ExercisePicker isOpen onOpenChange={setOpen} title="Choose the movement" onPick={exercise => onChange(exercise.name)} /> : null}
  </div>;
}
