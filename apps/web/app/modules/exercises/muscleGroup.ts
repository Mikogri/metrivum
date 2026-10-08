/**
 * Muscles grouped into six body regions, each with one colour, so exercise lists can be colour-coded
 * without turning into a rainbow: the 73 catalogue muscles map onto 6 hues.
 */
export type MuscleGroup = "lower" | "chest" | "back" | "shoulders" | "arms" | "core";

const GROUP_OF: Record<string, MuscleGroup> = {};
const assign = (group: MuscleGroup, keys: string[]) => keys.forEach((key) => (GROUP_OF[key] = group));

assign("lower", [
  "quadriceps",
  "rectus-femoris",
  "hamstrings",
  "adductors",
  "adductor-magnus",
  "gluteus-maximus",
  "gluteus-medius",
  "gluteus-minimus",
  "deep-hip-rotators",
  "iliopsoas",
  "tensor-fasciae-latae",
  "gastrocnemius",
  "soleus",
  "tibialis-anterior",
  "tibialis-posterior",
  "fibularis-muscles",
  "intrinsic-foot-muscles",
  "foot-interossei",
  "flexor-digitorum-brevis",
  "flexor-digitorum-longus",
  "flexor-hallucis-brevis",
  "flexor-hallucis-longus",
  "extensor-hallucis-longus",
  "abductor-hallucis",
  "abductor-digiti-minimi",
]);
assign("chest", ["pectoralis-major", "serratus-anterior"]);
assign("back", ["latissimus-dorsi", "rhomboids", "trapezius", "teres-major", "erector-spinae", "levator-scapulae", "multifidus"]);
assign("shoulders", [
  "deltoids",
  "rotator-cuff",
  "infraspinatus",
  "supraspinatus",
  "subscapularis",
  "teres-minor",
  "sternocleidomastoid",
  "scalenes",
  "splenius-capitis",
  "splenius-cervicis",
  "semispinalis-capitis",
  "deep-neck-flexors",
]);
assign("arms", [
  "biceps",
  "brachialis",
  "brachioradialis",
  "triceps",
  "pronator-teres",
  "pronator-quadratus",
  "supinator",
  "wrist-flexors",
  "wrist-extensors",
  "flexor-carpi-radialis",
  "flexor-carpi-ulnaris",
  "extensor-carpi-radialis-brevis",
  "extensor-carpi-radialis-longus",
  "extensor-carpi-ulnaris",
  "finger-flexors",
  "finger-extensors",
  "grip-muscles",
  "hand-interossei",
  "intrinsic-hand-muscles",
  "thenar-muscles",
  "adductor-pollicis",
]);
assign("core", ["core", "rectus-abdominis", "obliques", "transversus-abdominis", "quadratus-lumborum", "diaphragm"]);

export function muscleGroup(key: string): MuscleGroup | null {
  return GROUP_OF[key] ?? null;
}

/** An exercise's region: the one most of its primary muscles belong to (the first muscle breaks ties). */
export function exerciseGroup(primaryMuscleKeys: readonly string[]): MuscleGroup | null {
  const counts = new Map<MuscleGroup, number>();
  for (const key of primaryMuscleKeys) {
    const group = muscleGroup(key);
    if (group) counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  let best: MuscleGroup | null = null;
  for (const [group, count] of counts) if (!best || count > counts.get(best)!) best = group;
  return best;
}

export const GROUP_LABELS: Record<"en" | "pl", Record<MuscleGroup, string>> = {
  en: { lower: "Lower body", chest: "Chest", back: "Back", shoulders: "Shoulders and neck", arms: "Arms", core: "Core" },
  pl: { lower: "Dół ciała", chest: "Klatka", back: "Plecy", shoulders: "Barki i szyja", arms: "Ramiona", core: "Core" },
};
