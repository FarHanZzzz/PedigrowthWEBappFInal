# Pedi-Growth - HSIL Hackathon 2026 Final Pitch

Theme: Building High-Value Health Systems: Leveraging AI  
Format: 3-minute pitch + demo  
Required timing: 10s intro, 20s problem, 60s product, 60s demo, 30s wrap-up

---

## What Was Updated Before Final Lock

This final version is aligned to the project as implemented and to the official timing card.

Key fixes from the previous draft:
- Timing is now exactly mapped to 10s / 20s / 60s / 60s / 30s.
- "5-second video" changed to "5-10 second clip" to match capture guidance.
- "video never leaves device" changed to precise privacy wording:
  - video is processed locally for analysis
  - only derived data is sent for optional backend inference
  - sharing is explicit and user-controlled
- Technical claim wording is now exact:
  - 33 pose landmarks
  - 34 backend ML features
  - 7 clinician-facing gait metrics
  - 5 backend risk targets
- Typo fixed: "instead of从零" -> "instead of starting from zero".

---

## Final 3-Minute Script (Stage-Ready)

## 0:00-0:10 (10s) - Introduction

"Good afternoon. We are Pedi-Growth.

We help turn one parent-recorded walking clip into a structured clinical handoff, so children with movement concerns can be identified and referred earlier."

## 0:10-0:30 (20s) - Problem

"In Bangladesh, many children with cerebral palsy are diagnosed around age five, after the highest-impact early intervention window.

The bottleneck is not only specialist shortage. It is the handoff gap.
Parents struggle to describe what they saw, and clinicians start from limited, subjective context during a short visit."

## 0:30-1:30 (60s) - Product

"Pedi-Growth is a phone-browser workflow, no app install.

A caregiver records or uploads a short 5-10 second walking clip.

From that clip, our system extracts 33 pose landmarks and runs a dual analysis path:
- local gait analysis for immediate structured outputs
- optional backend inference on derived landmark data, not raw video

We produce two outputs in the same session:

First, a calm caregiver summary in plain language:
what was observed, confidence context, and what to do next.

Second, a clinician packet:
quality status, evidence-backed gait metrics, concern domains, and explicit limitations.

The system is quality-gated by design.
If capture quality is poor, we downgrade confidence or recommend retake instead of forcing a confident-looking result.

Most importantly, this is not diagnostic AI.
Policy safeguards enforce non-diagnostic language across caregiver, clinician, and assistant outputs."

## 1:30-2:30 (60s) - Demo Talk Track

"In this demo, I will show four steps.

Step one: capture.
I open the browser, record or upload a clip, and run preflight quality checks.

Step two: analysis.
You can see staged progress from landmark extraction to concern scoring.

Step three: results.
Here is the caregiver summary with confidence notes and limitations.
Here is the clinician packet with structured metrics and follow-up framing.

Step four: handoff.
I generate a secure share link and PDF fallback so this can move across devices and clinical contexts.

Notice the trust controls:
run provenance labeling, visible quality context, and explicit non-diagnostic framing.
That is what makes this usable in real care workflows, not just as a model demo."

## 2:30-3:00 (30s) - Wrap-up

"Pedi-Growth is built for one outcome:
help families arrive with clearer evidence, so clinicians can act earlier.

This is a practical health-system bridge, not a black-box diagnosis claim.

One short clip.
One calm explanation.
One structured handoff.
One clearer next step for the child.

Thank you."

---

## Slide and Time Mapping (Aligned To Your 14-Slide PDF)

Official HSIL timing format:
- 10s Introduction
- 20s Problem
- 60s Product
- 60s Demo
- 30s Wrap-up

Your deck-aligned mapping:
- 0:00-0:10 (Introduction): Slides 1-2
  - Slide 1: Hello / team opening
  - Slide 2: Vision statement
- 0:10-0:30 (Problem): Slide 3
  - The Problem: The 5-Year Delay
- 0:30-1:30 (Product): Slides 4-7
  - Slide 4: Solution overview
  - Slide 5: Key features
  - Slide 6: Dual output workflow
  - Slide 7: Clinical trust and safety guardrails
- 1:30-2:30 (Demo): Live product walkthrough (primary), Slide 6 kept visible as anchor
  - Capture -> preflight -> analysis -> caregiver summary -> clinician packet -> handoff
  - If live demo fails, use Slides 5-7 as fallback feature walkthrough
- 2:30-3:00 (Wrap-up): Slides 12-14
  - Slide 12: Economic impact
  - Slide 13: Business model
  - Slide 14: Road ahead + close

Note for finals:
- Slides 8-11 are useful backup/context slides, but should be skipped in the main 3-minute run unless a judge asks.
- Reserve business-model depth for Q&A; do not spend more than ~10 seconds on Slide 13 during main delivery.

---

## Judge-Proof Technical Facts (Safe to Say Verbatim)

- "We extract 33 pose landmarks from the video."
- "Our backend model path uses 34 engineered features and predicts 5 gait risk targets."
- "The caregiver and clinician views are non-diagnostic by policy."
- "Quality gating prevents overconfident interpretation from poor video."
- "Care teams can use secure share links or PDF handoff outputs."

---

## Sustainability (30-second backup if asked)

"Families should not pay for first-line screening support.

Our model is B2B2C: clinics, NGOs, and telehealth partners license the workflow, while caregivers access it through those channels.

That aligns incentives: providers save context-gathering time, organizations gain structured screening coverage data, and families get earlier, clearer follow-up pathways."

## Business Model Verdict (From Current PDF)

Current model direction is strong, but not perfect yet for judge scrutiny.

What is strong:
- B2B2C positioning is correct for this problem.
- "Families do not pay" is ethically and strategically strong.
- Multi-channel revenue logic (clinics, telehealth, NGO/public health) is credible.

What to tighten before final delivery:
- Use one pricing story everywhere (avoid mixed seat-based vs volume-based phrasing across materials).
- Label partner names as "target channels" unless active agreements exist.
- Add one unit-economics line judges can remember: break-even point and why.
- Keep one primary revenue engine in the 3-minute pitch (clinic licensing), move others to Q&A.

Judge-safe one-liner:
- "Primary revenue is clinic licensing on a recurring monthly fee; NGO and platform partnerships are expansion channels after pilot validation." 

---

## High-Pressure Q and A (Fast Replies)

Q: "Are you diagnosing CP?"  
A: "No. We provide structured screening support and clinician handoff, not diagnosis."

Q: "What if the video is poor?"  
A: "We quality-gate, downgrade confidence, or ask for retake. We do not force unreliable output."

Q: "What is the moat?"  
A: "Trustworthy workflow integration: quality gating, policy-safe language, and clinician-ready handoff."

Q: "Why will health systems adopt this?"  
A: "It reduces context loss between home observation and clinic decision-making using existing phone behavior."

---

## Final Delivery Notes

- Speak slower than normal conversation pace.
- Keep eye contact during the problem and close.
- During demo, narrate only what judges should notice.
- If live demo fails, switch instantly to backup visuals and keep the same narration order.
- Never deviate into diagnostic language.

