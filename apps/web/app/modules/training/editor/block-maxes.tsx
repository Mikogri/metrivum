import type { ReactNode } from "react";
import type { Block, BlockExerciseMax } from "@metrivum/api-client-web";
import { useFormulaEvaluation } from "./components/useFormulaEvaluation";
import {
  ClientFormulaContext,
  useClientFormulaContext,
} from "./client-context";
import {
  convertMass,
  exerciseMaxAlias,
  withClientVariables,
} from "./model/inline-formula";

/** Local constants belong to the block's revision; they never mutate athlete measurements. */
export function BlockFormulaScope({
  block,
  children,
}: {
  block?: Block;
  children: ReactNode;
}) {
  const parent = useClientFormulaContext();
  if (!block?.exerciseMaxes?.length) return children;
  return block.exerciseMaxes.reduceRight<ReactNode>(
    (content, row, index) => (
      <MaxRowScope key={`${block.id}:${index}`} row={row} baseline={parent}>
        {content}
      </MaxRowScope>
    ),
    children,
  );
}
function MaxRowScope(props: {
  row: BlockExerciseMax;
  baseline: ReturnType<typeof useClientFormulaContext>;
  children: ReactNode;
}) {
  return (
    <TimeMaxScope row={props.row} baseline={props.baseline}>
      {props.row.loadFormula ? (
        <FormulaMaxRowScope {...props} />
      ) : (
        <MaxValueScope row={props.row} load={props.row.load}>
          {props.children}
        </MaxValueScope>
      )}
    </TimeMaxScope>
  );
}
function FormulaMaxRowScope({
  row,
  baseline,
  children,
}: {
  row: BlockExerciseMax;
  baseline: ReturnType<typeof useClientFormulaContext>;
  children: ReactNode;
}) {
  const resolved = withClientVariables(
    row.loadFormula,
    baseline.variables,
    true,
  );
  const missing = Object.keys(resolved?.variableBindings ?? {}).some(
    (name) => !resolved?.inputs[name],
  );
  const evaluation = useFormulaEvaluation(missing ? null : resolved);
  const load = evaluation.data
    ? convertMass(evaluation.data.result, row.loadUnit === "Lb" ? "Lb" : "Kg")
    : null;
  return (
    <MaxValueScope row={row} load={load}>
      {children}
    </MaxValueScope>
  );
}
function MaxValueScope({
  row,
  load,
  children,
}: {
  row: BlockExerciseMax;
  load: BlockExerciseMax["load"];
  children: ReactNode;
}) {
  const parent = useClientFormulaContext();
  const variables = { ...parent.variables };
  const sourceVersions = { ...parent.sourceVersions };
  const exerciseMaxReps = { ...parent.exerciseMaxReps };
  const blockSources = new Set(parent.blockSources ?? []);
  if (row.exerciseId) {
    exerciseMaxReps[row.exerciseId] = row.reps;
    if (load) {
      const alias = exerciseMaxAlias(row.exerciseId, row.reps);
      variables[alias] = load;
      blockSources.add(alias);
      delete sourceVersions[alias];
    }
  }
  return (
    <ClientFormulaContext.Provider
      value={{
        ...parent,
        variables,
        sourceVersions,
        exerciseMaxReps,
        blockSources: [...blockSources],
      }}
    >
      {children}
    </ClientFormulaContext.Provider>
  );
}

function TimeMaxScope({
  row,
  baseline,
  children,
}: {
  row: BlockExerciseMax;
  baseline: ReturnType<typeof useClientFormulaContext>;
  children: ReactNode;
}) {
  const parent = useClientFormulaContext();
  const resolved = withClientVariables(
    row.timeFormula,
    baseline.variables,
    true,
  );
  const missing = Object.keys(resolved?.variableBindings ?? {}).some(
    (name) => !resolved?.inputs[name],
  );
  const evaluated = useFormulaEvaluation(
    missing || !resolved
      ? null
      : { ...resolved, outputUnit: row.time?.unit ?? "Seconds" },
  );
  const time = row.timeFormula ? evaluated.data?.result : row.time;
  if (!row.exerciseId || !time) return children;
  const alias = `exerciseTime${row.reps}Rm_${row.exerciseId.replaceAll("-", "")}`;
  return (
    <ClientFormulaContext.Provider
      value={{
        ...parent,
        variables: { ...parent.variables, [alias]: time },
        blockSources: [...(parent.blockSources ?? []), alias],
      }}
    >
      {children}
    </ClientFormulaContext.Provider>
  );
}
