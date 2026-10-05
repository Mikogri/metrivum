// Generated from module feature definitions. Do not edit.
export const features = [
  {
    "key": "exercises.browse",
    "module": "ExerciseCatalog",
    "titleKey": "features.exercises.browse.title",
    "descriptionKey": "features.exercises.browse.description",
    "dependencies": [],
    "limits": []
  },
  {
    "key": "exercises.create",
    "module": "ExerciseCatalog",
    "titleKey": "features.exercises.create.title",
    "descriptionKey": "features.exercises.create.description",
    "dependencies": [
      "exercises.browse"
    ],
    "limits": []
  },
  {
    "key": "exercises.favorites",
    "module": "ExerciseCatalog",
    "titleKey": "features.exercises.favorites.title",
    "descriptionKey": "features.exercises.favorites.description",
    "dependencies": [
      "exercises.browse"
    ],
    "limits": []
  },
  {
    "key": "training.export.csv",
    "module": "Training",
    "titleKey": "training.export.csv.title",
    "descriptionKey": "training.export.csv.description",
    "dependencies": [
      "training.programs.read"
    ],
    "limits": []
  },
  {
    "key": "training.export.pdf",
    "module": "Training",
    "titleKey": "training.export.pdf.title",
    "descriptionKey": "training.export.pdf.description",
    "dependencies": [
      "training.programs.read"
    ],
    "limits": []
  },
  {
    "key": "training.folders.manage",
    "module": "Training",
    "titleKey": "training.folders.manage.title",
    "descriptionKey": "training.folders.manage.description",
    "dependencies": [
      "training.programs.read"
    ],
    "limits": [
      "training.folders"
    ]
  },
  {
    "key": "training.formulas.custom",
    "module": "Training",
    "titleKey": "training.formulas.custom.title",
    "descriptionKey": "training.formulas.custom.description",
    "dependencies": [
      "training.programs.read"
    ],
    "limits": [
      "training.formulas"
    ]
  },
  {
    "key": "training.import.csv",
    "module": "Training",
    "titleKey": "training.import.csv.title",
    "descriptionKey": "training.import.csv.description",
    "dependencies": [
      "training.programs.read"
    ],
    "limits": []
  },
  {
    "key": "training.programs.create",
    "module": "Training",
    "titleKey": "training.programs.create.title",
    "descriptionKey": "training.programs.create.description",
    "dependencies": [
      "training.programs.read"
    ],
    "limits": [
      "training.documents"
    ]
  },
  {
    "key": "training.programs.manage",
    "module": "Training",
    "titleKey": "training.programs.manage.title",
    "descriptionKey": "training.programs.manage.description",
    "dependencies": [
      "training.programs.read"
    ],
    "limits": []
  },
  {
    "key": "training.programs.read",
    "module": "Training",
    "titleKey": "training.programs.read.title",
    "descriptionKey": "training.programs.read.description",
    "dependencies": [],
    "limits": []
  },
  {
    "key": "training.sets.advanced",
    "module": "Training",
    "titleKey": "training.sets.advanced.title",
    "descriptionKey": "training.sets.advanced.description",
    "dependencies": [
      "training.programs.read"
    ],
    "limits": []
  },
  {
    "key": "training.templates.manage",
    "module": "Training",
    "titleKey": "training.templates.manage.title",
    "descriptionKey": "training.templates.manage.description",
    "dependencies": [
      "training.programs.read"
    ],
    "limits": []
  },
  {
    "key": "video.analysis.compare",
    "module": "VideoAnalysis",
    "titleKey": "features.video.analysis.compare.title",
    "descriptionKey": "features.video.analysis.compare.description",
    "dependencies": [],
    "limits": []
  },
  {
    "key": "video.analysis.run",
    "module": "VideoAnalysis",
    "titleKey": "features.video.analysis.run.title",
    "descriptionKey": "features.video.analysis.run.description",
    "dependencies": [
      "video.library.manage"
    ],
    "limits": [
      "analysis.concurrent"
    ]
  },
  {
    "key": "video.library.manage",
    "module": "Media",
    "titleKey": "features.video.library.title",
    "descriptionKey": "features.video.library.description",
    "dependencies": [],
    "limits": [
      "media.maxVideoBytes",
      "media.maxPendingUploads"
    ]
  }
] as const;
export type FeatureKey = (typeof features)[number]['key'];
