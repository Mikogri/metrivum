# BodyParts3D data attribution

BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International

- Dataset version: **4.0**, original geometry release 2013; official license updated February 2025.
- [Official download page](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html).
- [Official README](https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/README_e.html).
- [Official license](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html).
- [Creative Commons Attribution 4.0 International legal code](https://creativecommons.org/licenses/by/4.0/legalcode.en).
- Original archives: `isa_BP3D_4.0_obj_99.zip`, `partof_BP3D_4.0_obj_99.zip`. Associated ISA/PART-OF parts, inclusion and element tables are listed and hash-pinned in `infra/anatomy/source-lock.json`.

The unchanged OBJ files contain the older CC BY-SA 2.1 Japan header. The current official DBCLS license page and README explicitly license the database under CC BY 4.0. Original headers are preserved in the original archives, not silently rewritten. The README is retained with those archives. Copyright, attribution and disclaimer links remain accessible through the Anatomy page's **Anatomy Data & Licenses** dialog.

Derived assets: every GLB and the anatomy manifest under `/anatomy/bodyparts3d-4.0/`, and anatomical identifiers/names in the import metadata and catalogue additions. TrainFlow converts OBJ coordinates/normals to standard float32 GLB and retains original indices/triangles, separate FJ meshes, FMA/representation identifiers and hierarchies. Identical FJ geometry appearing in both archive variants is represented once, with both metadata sources retained. Display-only materials, highlighting and coordinate rotation are applied by the viewer. No additional simplification, decimation, muscle removal or anatomical editing is performed. The provider already reduced polygons in the official `_99` variant; TrainFlow does not claim unreduced source geometry.

Anatomical data is offered as-is/as-available, without warranties, subject to the official license's disclaimer and limitation of liability. DBCLS and BodyParts3D do not endorse TrainFlow. Users retain the rights granted by CC BY 4.0 in original and derived anatomical data. Any proprietary TrainFlow application-code terms exclude this separately licensed data; the anatomical geometry is not exclusively owned by TrainFlow. CC BY does not apply to the entire application code.
