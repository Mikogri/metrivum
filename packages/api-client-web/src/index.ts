import type { components } from "../generated/contracts";

export type { paths } from "../generated/contracts";
export { featureDefinitions, type FeatureKey } from "../generated/contracts";

/**
 * The generated schema marks numeric fields as `number | string` because the API *accepts*
 * quoted numbers. Responses always contain JSON numbers and the web client always sends numbers,
 * so the app works with the narrowed shape.
 */
export type Normalized<T> = [number] extends [T]
  ? Exclude<T, string> // non-distributive: `number | string` (and `null | number | string`) → number
  : T extends readonly (infer U)[]
    ? Normalized<U>[]
    : T extends object
      ? { [K in keyof T]: Normalized<T[K]> }
      : T;

type Schemas = components["schemas"];
export type Schema<K extends keyof Schemas> = Normalized<Schemas[K]>;

// Accounts
export type ProfileResponse = Schema<"ProfileResponse">;
export type OnboardingRequest = Schema<"OnboardingRequest">;
export type UpdateProfileRequest = Schema<"UpdateProfileRequest">;

// Access
export type AccessSnapshot = Schema<"AccessSnapshot">;
export type FeatureDecision = Schema<"FeatureDecision">;
export type LimitDecision = Schema<"LimitDecision">;
export type FeatureDefinition = Schema<"FeatureDefinition">;

// Exercise catalog
export type CatalogPage = Schema<"CatalogPage">;
export type ExerciseListItemDto = Schema<"ExerciseListItemDto">;
export type ExerciseDto = Schema<"ExerciseDto">;
export type ExerciseRevisionDto = Schema<"ExerciseRevisionDto">;
export type CreateExerciseRequest = Schema<"CreateExerciseRequest">;
export type UpdateExerciseRequest = Schema<"UpdateExerciseRequest">;
export type TagDto = Schema<"TagDto">;
export type DictionariesDto = Schema<"DictionariesDto">;
export type DictionaryEntryDto = Schema<"DictionaryEntryDto">;

// Training
export type DocumentKind = Schema<"DocumentKind">;
export type PlanDto = Schema<"PlanDto">;
export type PlanListItem = Schema<"PlanListItem">;
export type PagedOfPlanListItem = Schema<"PagedOfPlanListItem">;
export type CreatePlanRequest = Schema<"CreatePlanRequest">;
export type SavePlanRequest = Schema<"SavePlanRequest">;
export type CopyPlanRequest = Schema<"CopyPlanRequest">;
export type ArchiveRequest = Schema<"ArchiveRequest">;
export type RevisionDto = Schema<"RevisionDto">;
export type RevisionListItem = Schema<"RevisionListItem">;
export type PagedOfRevisionListItem = Schema<"PagedOfRevisionListItem">;
export type FolderDto = Schema<"FolderDto">;
export type FolderRequest = Schema<"FolderRequest">;
export type PagedOfFolderDto = Schema<"PagedOfFolderDto">;
export type TrainingDocument = Schema<"TrainingDocument">;
export type Block = Schema<"Block">;
export type Cycle = Schema<"Cycle">;
export type TrainingDay = Schema<"TrainingDay">;
export type Workout = Schema<"Workout">;
export type ExerciseInstance = Schema<"ExerciseInstance">;
export type ExerciseGroup = Schema<"ExerciseGroup">;
export type GroupKind = Schema<"GroupKind">;
export type TrainingSet = Schema<"TrainingSet">;
export type SetSegment = Schema<"SetSegment">;
export type SetKind = Schema<"SetKind">;
export type Prescription = Schema<"Prescription">;
export type Quantity = Schema<"Quantity">;
export type QuantityRange = Schema<"QuantityRange">;
export type IntRange = Schema<"IntRange">;
export type Unit = Schema<"Unit">;
export type FormulaUse = Schema<"FormulaUse">;
export type FormulaDefinition = Schema<"FormulaDefinition">;
export type FormulaDto = Schema<"FormulaDto">;
export type FormulaListItem = Schema<"FormulaListItem">;
export type PagedOfFormulaListItem = Schema<"PagedOfFormulaListItem">;
export type FormulaRequest = Schema<"FormulaRequest">;
export type FormulaEvaluation = Schema<"FormulaEvaluation">;
/** Readable alias for the anonymous built-in formula schema. */
export type BuiltInFormula = Schema<"AnonymousTypeOfstringAndintAndFormulaDefinition">;
export type ImportPreview = Schema<"ImportPreview">;
export type ImportRowPreview = Schema<"ImportRowPreview">;
export type ImportValidation = Schema<"ImportValidation">;
export type MapImportRequest = Schema<"MapImportRequest">;
export type CommitImportRequest = Schema<"CommitImportRequest">;
export type RevisionSnapshot = Schema<"RevisionSnapshot">;
export type ExerciseSnapshot = Schema<"ExerciseSnapshot">;

// Media & analysis
export type MediaDto = Schema<"MediaDto">;
export type UploadRequest = Schema<"UploadRequest">;
export type UploadTicket = Schema<"UploadTicket">;
export type MediaReadTicket = Schema<"MediaReadTicket">;
export type AnalysisDto = Schema<"AnalysisDto">;
export type AnalysisConfiguration = Schema<"AnalysisConfiguration">;
export type AnalysisTracking = Schema<"AnalysisTracking">;
export type AnalysisTrackingPoint = Schema<"AnalysisTrackingPoint">;
export type CreateAnalysisRequest = Schema<"CreateAnalysisRequest">;
export type UpdateAnalysisRequest = Schema<"UpdateAnalysisRequest">;
export type AnalysisResult = Schema<"AnalysisResult">;
export type AnalysisRepetition = Schema<"AnalysisRepetition">;
export type AnalysisPhase = Schema<"AnalysisPhase">;
export type TrajectoryPoint = Schema<"TrajectoryPoint">;
export type AnalysisComparison = Schema<"AnalysisComparison">;

/** RFC 7807 body returned by the API (`application/problem+json`). */
export interface ProblemDetails {
  status?: number;
  title?: string;
  detail?: string | null;
  code?: string;
  traceId?: string;
  errors?: Record<string, string[]> | null;
}

/** Stable API error codes documented in docs/api-endpoints.md. */
export type ApiErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "ONBOARDING_REQUIRED"
  | "ACCOUNT_DISABLED"
  | "FEATURE_UNAVAILABLE"
  | "ADMIN_PERMISSION_REQUIRED"
  | "RESOURCE_NOT_FOUND"
  | "CONFLICT"
  | "VERSION_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "LIMIT_EXCEEDED"
  | "VERSION_REQUIRED"
  | "PRECONDITION_REQUIRED"
  | "IF_MATCH_REQUIRED"
  | "RATE_LIMIT_EXCEEDED"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "DATABASE_UNAVAILABLE"
  | "INTEGRATION_UNAVAILABLE"
  | "ANALYZER_NOT_CONFIGURED"
  | "EXERCISE_NAME_EXISTS"
  | "EXERCISE_ARCHIVED"
  | "TAG_NAME_EXISTS"
  | "TAG_MERGED"
  | "MEDIA_IN_USE"
  | "MEDIA_NOT_READY"
  | "ANALYSIS_NOT_COMPLETED";

/** Reasons returned in FeatureDecision.reason (docs/features/access.md). */
export type FeatureReason =
  | "available"
  | "not_granted"
  | "explicit_deny"
  | "operationally_disabled"
  | "dependency_unavailable"
  | "limit_reached";

export const SET_KINDS = ["Standard", "Amrap", "Ramp", "TopSet", "BackOff", "DropSet", "RestPause", "Cluster"] as const satisfies readonly SetKind[];
export const SEGMENTED_SET_KINDS = ["Ramp", "DropSet", "RestPause", "Cluster"] as const satisfies readonly SetKind[];
export const UNITS = ["Scalar", "Kg", "Lb", "Seconds", "Minutes", "Meters", "Kilometers", "Percent"] as const satisfies readonly Unit[];
export const ANALYSIS_STATUSES = ["Queued", "Processing", "Completed", "Failed", "Cancelled"] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];
export const MEDIA_STATES = ["Pending", "Ready", "Deleting"] as const;
export type MediaState = (typeof MEDIA_STATES)[number];
