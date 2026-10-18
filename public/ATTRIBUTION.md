# Attribution and asset provenance

## 3D heart model — `models/heart.glb`

**BodyParts3D, © The Database Center for Life Science (DBCLS), licensed under CC BY 4.0.**

- Licence: https://creativecommons.org/licenses/by/4.0/ (DBCLS licence page: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html)
- Dataset: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html (BodyParts3D 4.0)
- Citation: Mitsuhashi N, Fujieda K, Tamura T, Kawamoto S, Takagi T, Okubo K. BodyParts3D: 3D structure database for anatomical concepts. *Nucleic Acids Res.* 2009;37(Database issue):D782-5. doi:10.1093/nar/gkn613
- Represents an adult male reference anatomy. It is not every human variation and is not a clinical tool.

### How the file was made (changes are indicated as CC BY 4.0 requires)

1. **Intermediate source.** The BodyParts3D 4.0 OBJ elements were taken as converted by *Human Atlas* (github.com/ashemag/human-atlas, fork github.com/Niyaz-05/human-atlas, commit `76f069640f2c3dd40a58d1556896ac25008f592e`). That project's code is MIT and its data is CC BY 4.0. Its changes were: millimetres/Z-up converted to metres/Y-up; meshoptimizer simplification with a 0.2 % relative error bound per element; normals quantised to 16-bit. `atlas.json` sha256 is `c359f4bcd2cba90b7411d66d5e9fc04dc81294d46cd5c1e8b212c824f2e5bbee`.
2. **This project** (`tools/extract-heart.mjs`):
   - selected 142 heart and great-vessel elements, chosen by their BodyParts3D English names and FMA concepts and listed in `src/heart/source/structures.source.json`;
   - merged them into 34 structures;
   - decoded the normals to 32-bit floats;
   - translated the model so the centre of the heart walls is the origin.
   - No other geometry was altered.
3. Output `heart.glb` sha256: `be55fe1cc557e5ae964277a9ed8f143ade103c2101cb8a6c7a077586df5e5dac`. The full per-element record is in `src/heart/generated/provenance.json`.

To rebuild from the official archive instead, download `isa_BP3D_4.0_obj_99.zip` from the DBCLS page above and convert it with the same axis and unit transform. See `docs/research/IMPLEMENTATION_PLAN.md`.

## Explanatory text

Written for this project. The facts are checked against:

- Betts JG, Young KA, Wise JA, et al. *Anatomy and Physiology 2e*, section 19.1 "Heart Anatomy". OpenStax, 2022. https://openstax.org/books/anatomy-and-physiology-2e/pages/19-1-heart-anatomy. Cited only; no OpenStax text is reproduced.

## Software

Open-source libraries used at runtime, each under its own licence (see `node_modules/<package>/LICENSE`):

- React (MIT)
- three.js (MIT)
- @react-three/fiber (MIT)
- @react-three/drei (MIT)
- zod (MIT)
