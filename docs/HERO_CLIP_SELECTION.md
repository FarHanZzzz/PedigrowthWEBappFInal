# Hero Clip Selection Memo

## Current status

Pedi-Growth demo lock is still blocked on one real approved hero clip.

- Required clip: `public/demo/videos/toward_good.mp4`
- Required stance: frontal, toward camera, full body visible, stable camera, good lighting
- Current repo truth: no approved real hero clip is present
- Current unapproved assets: the existing `public/demo/videos/*.mp4` files are AI-generated development assets and are not approved for judge demo use

## Approval rule

The hero clip may be marked `approvedForDemo: true` only when all of the following are true:

1. The file exists at `public/demo/videos/toward_good.mp4`
2. The source is a real walking clip, not generated media
3. The clip is frontal and primarily toward-camera
4. Full body is visible for at least 4-6 steps
5. The clip completes in `REAL ANALYSIS` mode with no fallback
6. The annotation remains visually stable enough for the exported hero MP4

## Best candidate profile

- Toward-camera
- Frontal
- Clear left/right leg separation
- Minimal occlusion
- Stable camera at waist height
- Even lighting
- Child occupies enough of the frame for clean lower-limb tracking

## Repo source of truth

The manifest at `public/demo/videos/manifest.json` is the single source of truth for hero clip approval.
