# Metrivum API JSON types

Client-role and Coaching additions are described in [stage 01](coaching/stage-01.md) and [stage 02](coaching/stage-02.md); the complete current types are generated in `contracts/generated/api.d.ts`. Form answers and profile values are dynamic JSON dictionaries, with their values validated by the selected form/system field.

Field reference for [all endpoints](api-endpoints.md), derived from the committed OpenAPI contract. Each object uses the fields below; referenced names link to another type in this file. `null` means nullable, and `Array<T>` is a JSON array. The Required column reflects OpenAPI presence metadata, not all domain validation: send the documented fields and use endpoint behavior for validation and defaults. Request and response bodies have no extra envelope unless their type explicitly contains one.

The names AccessAdminOverview, UserAccessSettings, AccessAuditEntry, FeatureOverride, BuiltInFormula, ConfigurationAssignment and AccessConfiguration are readable aliases for anonymous OpenAPI schemas. FeatureFlag is documented from the handler because anonymous flag/override schemas currently collide in generated OpenAPI. A flag has `enabled`; an override has `granted`. The nullable user assignment is also corrected from the handler. Audit `change` is serialized JSON text. Numeric unions with string describe accepted quoted-number input; normal numeric responses contain JSON numbers.

For complete training examples and meaning of units/sets, see [Training](features/training.md). File downloads and the few inline administration responses are described directly in the endpoint reference.

## AccessAdminOverview

| Field | JSON type | Required |
| --- | --- | --- |
| `configurations` | Array<[AccessConfiguration](#accessconfiguration)> | Yes |
| `flags` | Array<[FeatureFlag](#featureflag)> | Yes |

## AccessAuditEntry

| Field | JSON type | Required |
| --- | --- | --- |
| `id` | `string (uuid)` | Yes |
| `actorId` | `string (uuid)` | Yes |
| `operation` | `null \| string` | Yes |
| `subject` | `null \| string` | Yes |
| `change` | `null \| string` | Yes |
| `at` | `string (date-time)` | Yes |

## AccessConfiguration

| Field | JSON type | Required |
| --- | --- | --- |
| `id` | `null \| string` | Yes |
| `version` | `integer (int64) \| string (int64)` | Yes |
| `grantedFeatures` | `null \| Array<string>` | Yes |

## AccessSnapshot

| Field | JSON type | Required |
| --- | --- | --- |
| `version` | `string` | Yes |
| `features` | Array<[FeatureDecision](#featuredecision)> | Yes |
| `limits` | Array<[LimitDecision](#limitdecision)> | Yes |

## AnalysisComparison

| Field | JSON type | Required |
| --- | --- | --- |
| `left` | [AnalysisResult](#analysisresult) | Yes |
| `right` | [AnalysisResult](#analysisresult) | Yes |

## AnalysisConfiguration

| Field | JSON type | Required |
| --- | --- | --- |
| `metersPerPixel` | `null \| number (double) \| string (double)` | No |
| `movement` | `string` | No |

## AnalysisDto

| Field | JSON type | Required |
| --- | --- | --- |
| `id` | `string (uuid)` | Yes |
| `name` | `string` | Yes |
| `note` | `null \| string` | Yes |
| `tags` | `Array<string>` | Yes |
| `mediaId` | `string (uuid)` | Yes |
| `configuration` | [AnalysisConfiguration](#analysisconfiguration) | Yes |
| `status` | `string` | Yes |
| `createdAt` | `string (date-time)` | Yes |
| `completedAt` | `null \| string (date-time)` | Yes |
| `failureCode` | `null \| string` | Yes |
| `attempts` | `integer (int32) \| string (int32)` | Yes |
| `version` | `integer (int64) \| string (int64)` | Yes |

## AnalysisPhase

| Field | JSON type | Required |
| --- | --- | --- |
| `kind` | `string` | Yes |
| `startSeconds` | `number (double) \| string (double)` | Yes |
| `endSeconds` | `number (double) \| string (double)` | Yes |

## AnalysisRepetition

| Field | JSON type | Required |
| --- | --- | --- |
| `number` | `integer (int32) \| string (int32)` | Yes |
| `startSeconds` | `number (double) \| string (double)` | Yes |
| `endSeconds` | `number (double) \| string (double)` | Yes |
| `phases` | Array<[AnalysisPhase](#analysisphase)> | Yes |

## AnalysisResult

| Field | JSON type | Required |
| --- | --- | --- |
| `schemaVersion` | `integer (int32) \| string (int32)` | Yes |
| `engineVersion` | `string` | Yes |
| `modelVersion` | `string` | Yes |
| `method` | `string` | Yes |
| `positionUnit` | `string` | Yes |
| `metersPerPixel` | `null \| number (double) \| string (double)` | Yes |
| `repetitions` | Array<[AnalysisRepetition](#analysisrepetition)> | Yes |
| `trajectory` | Array<[TrajectoryPoint](#trajectorypoint)> | Yes |
| `warnings` | `Array<string>` | Yes |

## ArchiveExerciseRequest

| Field | JSON type | Required |
| --- | --- | --- |
| `expectedVersion` | `integer (int32) \| string (int32)` | Yes |

## ArchiveRequest

| Field | JSON type | Required |
| --- | --- | --- |
| `archived` | `boolean` | Yes |

## AssignmentRequest

| Field | JSON type | Required |
| --- | --- | --- |
| `expectedVersion` | `integer (int64) \| string (int64)` | Yes |
| `configurationId` | `string` | Yes |

## Block

| Field | JSON type | Required |
| --- | --- | --- |
| `id` | `string (uuid)` | Yes |
| `name` | `string` | Yes |
| `description` | `string` | Yes |
| `cycles` | Array<[Cycle](#cycle)> | Yes |

## BuiltInFormula

| Field | JSON type | Required |
| --- | --- | --- |
| `key` | `null \| string` | Yes |
| `version` | `integer (int32) \| string (int32)` | Yes |
| `definition` | [FormulaDefinition](#formuladefinition) | Yes |

## CatalogPage

| Field | JSON type | Required |
| --- | --- | --- |
| `items` | Array<[ExerciseListItemDto](#exerciselistitemdto)> | Yes |
| `total` | `integer (int32) \| string (int32)` | Yes |
| `page` | `integer (int32) \| string (int32)` | Yes |
| `pageSize` | `integer (int32) \| string (int32)` | Yes |

## CommitImportRequest

| Field | JSON type | Required |
| --- | --- | --- |
| `name` | `string` | Yes |
| `kind` | [DocumentKind](#documentkind) | Yes |
| `folderId` | `null \| string (uuid)` | Yes |

## ConfigurationAssignment

| Field | JSON type | Required |
| --- | --- | --- |
| `configurationId` | `null \| string` | Yes |
| `version` | `integer (int64) \| string (int64)` | Yes |

## ConfigurationRequest

| Field | JSON type | Required |
| --- | --- | --- |
| `expectedVersion` | `integer (int64) \| string (int64)` | Yes |
| `grantedFeatures` | `Array<string>` | Yes |

## CopyPlanRequest

| Field | JSON type | Required |
| --- | --- | --- |
| `name` | `string` | Yes |
| `kind` | [DocumentKind](#documentkind) | Yes |
| `folderId` | `null \| string (uuid)` | Yes |

## CreateAnalysisRequest

| Field | JSON type | Required |
| --- | --- | --- |
| `name` | `string` | Yes |
| `note` | `null \| string` | Yes |
| `tags` | `Array<string>` | Yes |
| `mediaId` | `string (uuid)` | Yes |
| `configuration` | [AnalysisConfiguration](#analysisconfiguration) | Yes |

## CreateExerciseRequest

| Field | JSON type | Required |
| --- | --- | --- |
| `name` | `string` | Yes |
| `description` | `string` | No |
| `instructions` | `string` | No |
| `demonstrationUrl` | `null \| string` | No |
| `tagIds` | `null \| Array<string (uuid)>` | No |
| `primaryMuscleKeys` | `null \| Array<string>` | No |
| `secondaryMuscleKeys` | `null \| Array<string>` | No |
| `movementPatternKeys` | `null \| Array<string>` | No |

## CreatePlanRequest

| Field | JSON type | Required |
| --- | --- | --- |
| `name` | `string` | Yes |
| `description` | `string` | Yes |
| `kind` | [DocumentKind](#documentkind) | Yes |
| `folderId` | `null \| string (uuid)` | Yes |
| `document` | [TrainingDocument](#trainingdocument) | Yes |

## CreateTagRequest

| Field | JSON type | Required |
| --- | --- | --- |
| `name` | `string` | Yes |

## Cycle

| Field | JSON type | Required |
| --- | --- | --- |
| `id` | `string (uuid)` | Yes |
| `name` | `string` | Yes |
| `description` | `string` | Yes |
| `dayCount` | `integer (int32) \| string (int32)` | Yes |
| `days` | Array<[TrainingDay](#trainingday)> | Yes |

## DictionariesDto

| Field | JSON type | Required |
| --- | --- | --- |
| `muscles` | Array<[DictionaryEntryDto](#dictionaryentrydto)> | Yes |
| `movementPatterns` | Array<[DictionaryEntryDto](#dictionaryentrydto)> | Yes |

## DictionaryEntryDto

| Field | JSON type | Required |
| --- | --- | --- |
| `key` | `string` | Yes |
| `labelEn` | `string` | Yes |
| `labelPl` | `string` | Yes |
| `isActive` | `boolean` | Yes |
| `version` | `integer (int32) \| string (int32)` | Yes |

## DictionaryRequest

| Field | JSON type | Required |
| --- | --- | --- |
| `expectedVersion` | `integer (int32) \| string (int32)` | Yes |
| `labelEn` | `string` | Yes |
| `labelPl` | `string` | Yes |
| `isActive` | `boolean` | No |

## DocumentKind

`"Program" \| "Template"`

## ExerciseDto

| Field | JSON type | Required |
| --- | --- | --- |
| `id` | `string (uuid)` | Yes |
| `name` | `string` | Yes |
| `description` | `string` | Yes |
| `instructions` | `string` | Yes |
| `demonstrationUrl` | `null \| string` | Yes |
| `version` | `integer (int32) \| string (int32)` | Yes |
| `isArchived` | `boolean` | Yes |
| `isFavorite` | `boolean` | Yes |
| `isAuthor` | `boolean` | Yes |
| `createdAt` | `string (date-time)` | Yes |
| `updatedAt` | `string (date-time)` | Yes |
| `tags` | Array<[TagDto](#tagdto)> | Yes |
| `primaryMuscleKeys` | `Array<string>` | Yes |
| `secondaryMuscleKeys` | `Array<string>` | Yes |
| `movementPatternKeys` | `Array<string>` | Yes |

## ExerciseGroup

| Field | JSON type | Required |
| --- | --- | --- |
| `id` | `string (uuid)` | Yes |
| `kind` | [GroupKind](#groupkind) | Yes |
| `exerciseIds` | `Array<string (uuid)>` | Yes |
| `rounds` | `integer (int32) \| string (int32)` | Yes |
| `restSeconds` | `number (double) \| string (double)` | Yes |

## ExerciseInstance

| Field | JSON type | Required |
| --- | --- | --- |
| `id` | `string (uuid)` | Yes |
| `exerciseId` | `string (uuid)` | Yes |
| `comment` | `string` | Yes |
| `sets` | Array<[TrainingSet](#trainingset)> | Yes |

## ExerciseListItemDto

| Field | JSON type | Required |
| --- | --- | --- |
| `id` | `string (uuid)` | Yes |
| `name` | `string` | Yes |
| `description` | `string` | Yes |
| `version` | `integer (int32) \| string (int32)` | Yes |
| `isFavorite` | `boolean` | Yes |
| `createdAt` | `string (date-time)` | Yes |
| `primaryMuscleKeys` | Array<`string`> | Yes |

## ExerciseRevisionDto

| Field | JSON type | Required |
| --- | --- | --- |
| `version` | `integer (int32) \| string (int32)` | Yes |
| `description` | `string` | Yes |
| `instructions` | `string` | Yes |
| `isArchived` | `boolean` | Yes |
| `createdAt` | `string (date-time)` | Yes |

## ExerciseSnapshot

| Field | JSON type | Required |
| --- | --- | --- |
| `id` | `string (uuid)` | Yes |
| `version` | `integer (int32) \| string (int32)` | Yes |
| `name` | `string` | Yes |
| `description` | `string` | Yes |
| `instructions` | `string` | Yes |

## FeatureDecision

| Field | JSON type | Required |
| --- | --- | --- |
| `key` | `string` | Yes |
| `available` | `boolean` | Yes |
| `reason` | `string` | Yes |

## FeatureDefinition

| Field | JSON type | Required |
| --- | --- | --- |
| `key` | `string` | Yes |
| `module` | `string` | Yes |
| `titleKey` | `string` | Yes |
| `descriptionKey` | `string` | Yes |
| `dependencies` | `Array<string>` | Yes |
| `limits` | `Array<string>` | Yes |

## FeatureFlag

| Field | JSON type | Required |
| --- | --- | --- |
| `key` | `string` | Yes |
| `enabled` | `boolean` | Yes |
| `version` | `integer (int64)` | Yes |

## FeatureOverride

| Field | JSON type | Required |
| --- | --- | --- |
| `key` | `null \| string` | Yes |
| `granted` | `boolean` | Yes |
| `version` | `integer (int64) \| string (int64)` | Yes |

## FlagRequest

| Field | JSON type | Required |
| --- | --- | --- |
| `expectedVersion` | `integer (int64) \| string (int64)` | Yes |
| `enabled` | `boolean` | Yes |

## FolderDto

| Field | JSON type | Required |
| --- | --- | --- |
| `id` | `string (uuid)` | Yes |
| `name` | `string` | Yes |
| `parentId` | `null \| string (uuid)` | Yes |
| `position` | `integer (int32) \| string (int32)` | Yes |
| `version` | `integer (int64) \| string (int64)` | Yes |

## FolderRequest

| Field | JSON type | Required |
| --- | --- | --- |
| `name` | `string` | Yes |
| `parentId` | `null \| string (uuid)` | Yes |
| `position` | `integer (int32) \| string (int32)` | Yes |

## FormulaCopyRequest

| Field | JSON type | Required |
| --- | --- | --- |
| `name` | `string` | Yes |

## FormulaDefinition

| Field | JSON type | Required |
| --- | --- | --- |
| `expression` | `string` | Yes |
| `inputs` | `Record<string, Unit>` | Yes |
| `outputUnit` | [Unit](#unit) | Yes |

## FormulaDto

| Field | JSON type | Required |
| --- | --- | --- |
| `id` | `string (uuid)` | Yes |
| `name` | `string` | Yes |
| `version` | `integer (int32) \| string (int32)` | Yes |
| `archived` | `boolean` | Yes |
| `definition` | [FormulaDefinition](#formuladefinition) | Yes |

## FormulaEvaluation

| Field | JSON type | Required |
| --- | --- | --- |
| `expression` | `string` | Yes |
| `version` | `integer (int32) \| string (int32)` | Yes |
| `inputs` | `Record<string, Quantity>` | Yes |
| `result` | [Quantity](#quantity) | Yes |

## FormulaListItem

| Field | JSON type | Required |
| --- | --- | --- |
| `id` | `string (uuid)` | Yes |
| `name` | `string` | Yes |
| `version` | `integer (int32) \| string (int32)` | Yes |
| `archived` | `boolean` | Yes |

## FormulaRequest

| Field | JSON type | Required |
| --- | --- | --- |
| `name` | `string` | Yes |
| `definition` | [FormulaDefinition](#formuladefinition) | Yes |

## FormulaUse

| Field | JSON type | Required |
| --- | --- | --- |
| `formulaId` | `null \| string (uuid)` | Yes |
| `version` | `integer (int32) \| string (int32)` | Yes |
| `builtIn` | `null \| string` | Yes |
| `inputs` | `Record<string, Quantity>` | Yes |

## GroupKind

`"Superset" \| "Circuit"`

## ImportPreview

| Field | JSON type | Required |
| --- | --- | --- |
| `id` | `string (uuid)` | Yes |
| `version` | `integer (int64) \| string (int64)` | Yes |
| `expiresAt` | `string (date-time)` | Yes |
| `rowCount` | `integer (int32) \| string (int32)` | Yes |
| `rows` | Array<[ImportRowPreview](#importrowpreview)> | Yes |
| `committedPlanId` | `null \| string (uuid)` | Yes |

## ImportRowPreview

| Field | JSON type | Required |
| --- | --- | --- |
| `index` | `integer (int32) \| string (int32)` | Yes |
| `block` | `string` | Yes |
| `cycle` | `string` | Yes |
| `day` | `integer (int32) \| string (int32)` | Yes |
| `workout` | `string` | Yes |
| `exercise` | `string` | Yes |
| `matchedExerciseId` | `null \| string (uuid)` | Yes |
| `rowKind` | `string` | Yes |

## ImportValidation

| Field | JSON type | Required |
| --- | --- | --- |
| `valid` | `boolean` | Yes |
| `version` | `integer (int64) \| string (int64)` | Yes |
| `document` | [TrainingDocument](#trainingdocument) | Yes |

## IntRange

| Field | JSON type | Required |
| --- | --- | --- |
| `minimum` | `integer (int32) \| string (int32)` | Yes |
| `maximum` | `integer (int32) \| string (int32)` | Yes |

## LimitDecision

| Field | JSON type | Required |
| --- | --- | --- |
| `key` | `string` | Yes |
| `maximum` | `integer (int64) \| string (int64)` | Yes |
| `used` | `integer (int64) \| string (int64)` | Yes |

## MapImportRequest

| Field | JSON type | Required |
| --- | --- | --- |
| `exercises` | `Record<string, string (uuid)>` | Yes |

## MediaDto

| Field | JSON type | Required |
| --- | --- | --- |
| `id` | `string (uuid)` | Yes |
| `name` | `string` | Yes |
| `contentType` | `string` | Yes |
| `size` | `integer (int64) \| string (int64)` | Yes |
| `state` | `string` | Yes |
| `pinned` | `boolean` | Yes |
| `createdAt` | `string (date-time)` | Yes |
| `version` | `integer (int64) \| string (int64)` | Yes |

## MediaReadTicket

| Field | JSON type | Required |
| --- | --- | --- |
| `url` | `string` | Yes |
| `expiresAt` | `string (date-time)` | Yes |

## MergeTagRequest

| Field | JSON type | Required |
| --- | --- | --- |
| `targetId` | `string (uuid)` | Yes |

## OnboardingRequest

| Field | JSON type | Required |
| --- | --- | --- |
| `username` | `string` | Yes |
| `displayName` | `string` | Yes |
| `birthDate` | `string (date)` | Yes |
| `acceptedTerms` | `boolean` | Yes |
| `locale` | `string` | Yes |
| `timeZone` | `string` | Yes |

## OverrideRequest

| Field | JSON type | Required |
| --- | --- | --- |
| `expectedVersion` | `integer (int64) \| string (int64)` | Yes |
| `granted` | `boolean` | Yes |

## PagedOfFolderDto

| Field | JSON type | Required |
| --- | --- | --- |
| `items` | Array<[FolderDto](#folderdto)> | Yes |
| `page` | `integer (int32) \| string (int32)` | Yes |
| `pageSize` | `integer (int32) \| string (int32)` | Yes |
| `total` | `integer (int64) \| string (int64)` | Yes |

## PagedOfFormulaListItem

| Field | JSON type | Required |
| --- | --- | --- |
| `items` | Array<[FormulaListItem](#formulalistitem)> | Yes |
| `page` | `integer (int32) \| string (int32)` | Yes |
| `pageSize` | `integer (int32) \| string (int32)` | Yes |
| `total` | `integer (int64) \| string (int64)` | Yes |

## PagedOfPlanListItem

| Field | JSON type | Required |
| --- | --- | --- |
| `items` | Array<[PlanListItem](#planlistitem)> | Yes |
| `page` | `integer (int32) \| string (int32)` | Yes |
| `pageSize` | `integer (int32) \| string (int32)` | Yes |
| `total` | `integer (int64) \| string (int64)` | Yes |

## PagedOfRevisionListItem

| Field | JSON type | Required |
| --- | --- | --- |
| `items` | Array<[RevisionListItem](#revisionlistitem)> | Yes |
| `page` | `integer (int32) \| string (int32)` | Yes |
| `pageSize` | `integer (int32) \| string (int32)` | Yes |
| `total` | `integer (int64) \| string (int64)` | Yes |

## PlanDto

| Field | JSON type | Required |
| --- | --- | --- |
| `id` | `string (uuid)` | Yes |
| `name` | `string` | Yes |
| `description` | `string` | Yes |
| `kind` | [DocumentKind](#documentkind) | Yes |
| `folderId` | `null \| string (uuid)` | Yes |
| `archived` | `boolean` | Yes |
| `version` | `integer (int64) \| string (int64)` | Yes |
| `updatedAt` | `string (date-time)` | Yes |
| `document` | [TrainingDocument](#trainingdocument) | Yes |

## PlanListItem

| Field | JSON type | Required |
| --- | --- | --- |
| `id` | `string (uuid)` | Yes |
| `name` | `string` | Yes |
| `description` | `string` | Yes |
| `kind` | [DocumentKind](#documentkind) | Yes |
| `folderId` | `null \| string (uuid)` | Yes |
| `archived` | `boolean` | Yes |
| `version` | `integer (int64) \| string (int64)` | Yes |
| `updatedAt` | `string (date-time)` | Yes |

## Prescription

| Field | JSON type | Required |
| --- | --- | --- |
| `reps` | `null \| IntRange` | No |
| `load` | `null \| QuantityRange` | No |
| `loadPercent` | `null \| number (double) \| string (double)` | No |
| `baseValue` | `null \| Quantity` | No |
| `rpe` | `null \| number (double) \| string (double)` | No |
| `rir` | `null \| number (double) \| string (double)` | No |
| `workTime` | `null \| Quantity` | No |
| `rest` | `null \| Quantity` | No |
| `tempo` | `null \| string` | No |
| `distance` | `null \| Quantity` | No |
| `comment` | `null \| string` | No |
| `loadFormula` | `null \| FormulaUse` | No |

## ProfileResponse

| Field | JSON type | Required |
| --- | --- | --- |
| `id` | `string (uuid)` | Yes |
| `workspaceId` | `string (uuid)` | Yes |
| `username` | `null \| string` | Yes |
| `displayName` | `string` | Yes |
| `birthDate` | `null \| string (date)` | Yes |
| `locale` | `string` | Yes |
| `timeZone` | `string` | Yes |
| `onboarded` | `boolean` | Yes |
| `version` | `integer (int64) \| string (int64)` | Yes |

## Quantity

| Field | JSON type | Required |
| --- | --- | --- |
| `value` | `number (double) \| string (double)` | Yes |
| `unit` | [Unit](#unit) | Yes |

## QuantityRange

| Field | JSON type | Required |
| --- | --- | --- |
| `minimum` | [Quantity](#quantity) | Yes |
| `maximum` | [Quantity](#quantity) | Yes |

## RevisionDto

| Field | JSON type | Required |
| --- | --- | --- |
| `id` | `string (uuid)` | Yes |
| `number` | `integer (int32) \| string (int32)` | Yes |
| `draftVersion` | `integer (int64) \| string (int64)` | Yes |
| `publishedAt` | `string (date-time)` | Yes |
| `snapshot` | [RevisionSnapshot](#revisionsnapshot) | Yes |

## RevisionListItem

| Field | JSON type | Required |
| --- | --- | --- |
| `id` | `string (uuid)` | Yes |
| `number` | `integer (int32) \| string (int32)` | Yes |
| `draftVersion` | `integer (int64) \| string (int64)` | Yes |
| `publishedAt` | `string (date-time)` | Yes |

## RevisionSnapshot

| Field | JSON type | Required |
| --- | --- | --- |
| `schemaVersion` | `integer (int32) \| string (int32)` | Yes |
| `name` | `string` | Yes |
| `description` | `string` | Yes |
| `kind` | [DocumentKind](#documentkind) | Yes |
| `document` | [TrainingDocument](#trainingdocument) | Yes |
| `exercises` | `Record<string, ExerciseSnapshot>` | Yes |
| `formulas` | `Record<string, FormulaEvaluation>` | Yes |

## SavePlanRequest

| Field | JSON type | Required |
| --- | --- | --- |
| `name` | `string` | Yes |
| `description` | `string` | Yes |
| `folderId` | `null \| string (uuid)` | Yes |
| `document` | [TrainingDocument](#trainingdocument) | Yes |

## SetKind

`"Standard" \| "Amrap" \| "Ramp" \| "TopSet" \| "BackOff" \| "DropSet" \| "RestPause" \| "Cluster"`

## SetSegment

| Field | JSON type | Required |
| --- | --- | --- |
| `id` | `string (uuid)` | Yes |
| `prescription` | [Prescription](#prescription) | Yes |

## TagDto

| Field | JSON type | Required |
| --- | --- | --- |
| `id` | `string (uuid)` | Yes |
| `name` | `string` | Yes |

## TrainingDay

| Field | JSON type | Required |
| --- | --- | --- |
| `id` | `string (uuid)` | Yes |
| `dayNumber` | `integer (int32) \| string (int32)` | Yes |
| `workouts` | Array<[Workout](#workout)> | Yes |
| `note` | `string` \| `null` (at most 2000 characters) | No |

## TrainingDocument

| Field | JSON type | Required |
| --- | --- | --- |
| `schemaVersion` | `integer (int32) \| string (int32)` | Yes |
| `blocks` | Array<[Block](#block)> | Yes |

## TrainingSet

| Field | JSON type | Required |
| --- | --- | --- |
| `id` | `string (uuid)` | Yes |
| `kind` | [SetKind](#setkind) | Yes |
| `prescription` | [Prescription](#prescription) | Yes |
| `segments` | `null \| Array<SetSegment>` | No |
| `sourceSetId` | `null \| string (uuid)` | No |

## TrajectoryPoint

| Field | JSON type | Required |
| --- | --- | --- |
| `seconds` | `number (double) \| string (double)` | Yes |
| `x` | `number (double) \| string (double)` | Yes |
| `y` | `number (double) \| string (double)` | Yes |
| `velocity` | `null \| number (double) \| string (double)` | Yes |
| `quality` | `number (double) \| string (double)` | Yes |
| `occluded` | `boolean` | Yes |

## Unit

`"Scalar" \| "Kg" \| "Lb" \| "Seconds" \| "Minutes" \| "Meters" \| "Kilometers" \| "Percent"`

## UpdateAnalysisRequest

| Field | JSON type | Required |
| --- | --- | --- |
| `name` | `string` | Yes |
| `note` | `null \| string` | Yes |
| `tags` | `Array<string>` | Yes |

## UpdateExerciseRequest

| Field | JSON type | Required |
| --- | --- | --- |
| `expectedVersion` | `integer (int32) \| string (int32)` | Yes |
| `description` | `string` | Yes |
| `instructions` | `string` | Yes |

## UpdateProfileRequest

| Field | JSON type | Required |
| --- | --- | --- |
| `displayName` | `string` | Yes |
| `locale` | `string` | Yes |
| `timeZone` | `string` | Yes |

## UploadRequest

| Field | JSON type | Required |
| --- | --- | --- |
| `name` | `string` | Yes |
| `contentType` | `string` | Yes |
| `size` | `integer (int64) \| string (int64)` | Yes |

## UploadTicket

| Field | JSON type | Required |
| --- | --- | --- |
| `file` | [MediaDto](#mediadto) | Yes |
| `uploadUrl` | `string` | Yes |
| `expiresAt` | `string (date-time)` | Yes |
| `method` | `string` | No |

## UserAccessSettings

| Field | JSON type | Required |
| --- | --- | --- |
| `assignment` | `ConfigurationAssignment \| null` | Yes |
| `overrides` | Array<[FeatureOverride](#featureoverride)> | Yes |

## Workout

| Field | JSON type | Required |
| --- | --- | --- |
| `id` | `string (uuid)` | Yes |
| `name` | `string` | Yes |
| `description` | `string` | Yes |
| `exercises` | Array<[ExerciseInstance](#exerciseinstance)> | Yes |
| `groups` | Array<[ExerciseGroup](#exercisegroup)> | Yes |

## Messaging contracts

See [Messaging](coaching/messaging.md) for conversation, message, membership, request, upload and cursor behavior. REST DTOs are generated in `contracts/generated/api.d.ts`; SignalR payloads are typed in `contracts/messaging-events.ts`.

### Messaging display metadata

`MemberDto.username` is nullable and supports @username in direct-chat headers. `MessageDto.clientMessageId` is the normalized UUID from the send idempotency key, or null for legacy/non-UUID keys. Clients use it to reconcile local pending messages with HTTP and SignalR responses; it is not an authorization token. Direct conversation details resolve the peer's display name as their title.
