# Season 1 Node Classifier Training and Release

This document describes the offline multi-label classifier used as an assistive scorer for Season 1 node assignment.

## Scope
- Season: `season-1`
- Pack: `horror`
- Taxonomy-aware: artifact is versioned by `taxonomyVersion`
- No network calls in training/inference logic

## Label source
Training labels come from:
1. Latest published `SeasonNodeRelease` for Season 1 horror (or explicit taxonomy version)
2. Admin overrides (`NodeMovie.source = override`) for the same pack

Positive labels include `curated`, `weak_supervision`, and `override` assignment membership from the release snapshot.

## Features (deterministic local)
- Text/tags:
  - `title`
  - `synopsis` (if present)
  - `genres`
  - `keywords`
- Metadata:
  - `year` + decade bucket
  - `country`
  - `director`
  - `castTop` names
- Optional embedding signal:
  - cosine similarity to per-node prototype embedding centroid

## Model
- One-vs-rest logistic regression (one binary model per node)
- Probability output via sigmoid
- Per-node threshold calibrated on validation set

## Calibration
Threshold search (`0.20..0.90`, step `0.02`) chooses best F1 while honoring precision floor (`SEASON1_CLASSIFIER_PRECISION_FLOOR`, default `0.55`).

## Training command
```bash
node --experimental-strip-types scripts/train-season1-node-classifier.ts
```

Optional:
```bash
node --experimental-strip-types scripts/train-season1-node-classifier.ts --taxonomy-version=season-1-horror-v3.5 --output-dir=artifacts/season1-node-classifier/season-1-horror-v3.5
```

Env knobs:
- `SEASON1_CLASSIFIER_SEED` (default `42`)
- `SEASON1_CLASSIFIER_VAL_RATIO` (default `0.2`)
- `SEASON1_CLASSIFIER_MAX_VOCAB` (default `1600`)
- `SEASON1_CLASSIFIER_EPOCHS` (default `220`)
- `SEASON1_CLASSIFIER_LR` (default `0.08`)
- `SEASON1_CLASSIFIER_L2` (default `0.0005`)
- `SEASON1_CLASSIFIER_PRECISION_FLOOR` (default `0.55`)
- `SEASON1_CLASSIFIER_RUN_ID` (optional)

## Artifact format
Produced files:
- `artifacts/season1-node-classifier/<taxonomyVersion>/model.json`
- `artifacts/season1-node-classifier/<taxonomyVersion>/dataset.json`

`model.json` includes:
- model weights and bias per node
- `featureSchema.vocabulary`
- calibrated thresholds
- optional node prototype embeddings
- `taxonomyVersion`
- training metadata (`seed`, split sizes, epochs, lr, l2, label release id)

## Inference integration (assistive only)
Season 1 seed pipeline can use classifier probabilities to rerank weak-supervision candidates.
Curated assignments are unchanged.

Enable:
- `SEASON1_CLASSIFIER_ASSIST_ENABLED=true`

Optional:
- `SEASON1_CLASSIFIER_ASSIST_WEIGHT` (default `0.25`)
- `SEASON1_CLASSIFIER_ARTIFACT_PATH` (default `artifacts/season1-node-classifier/<taxonomyVersion>/model.json`)

## Determinism and CI
- Inference and loader have no network dependencies.
- Unit tests validate:
  - deterministic artifact loading
  - stable probability outputs for a fixed fixture artifact/movie set
