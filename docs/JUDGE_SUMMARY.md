# Pedi-Growth Judge Summary

Pedi-Growth is a frontal-first observational gait screening and documentation prototype. It is not a gait lab replacement and it does not diagnose medical conditions.

## Hero demo path

1. Start with one approved frontal toward-camera clip
2. Run strict `REAL ANALYSIS` mode with no hidden fallback
3. Track visible landmarks through the walk
4. Detect step events and compute only supported front-view metrics
5. Show clean annotated evidence, key frames, and a concise summary

## What makes this demo trustworthy

- Every run is visibly labeled as `REAL ANALYSIS`, `DEMO FIXTURE`, or `VALIDATION FAILURE`
- Validation mode fails loudly instead of substituting fixture output
- Unsupported or low-confidence metrics are suppressed instead of guessed
- The results page ties video, tracking, events, and observations together
- The overlay is intentionally limited to front-view evidence that the MVP can support

## What this MVP does not claim

- It does not replace a clinical gait lab
- It does not claim full multi-plane assessment
- It does not expose sagittal metrics in the frontal MVP
- It does not treat demo fixtures as real evidence

## Current blocker

The repo still needs one real approved hero clip at `public/demo/videos/toward_good.mp4` before the demo can be considered fully judge-safe.
