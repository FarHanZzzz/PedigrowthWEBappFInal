# HSIL Hackathon Deep Strategic Brief

Date: 2026-04-09  
Project: Pedi-Growth / GAITBRIDGE  
Positioning baseline: Clinical screening support and clinician handoff workflow, not diagnosis

## How this brief is grounded
This brief is aligned to your current mentor and judge-prep materials and product reality in the repository:
- Structured caregiver summary + clinician packet workflow
- Quality-gated interpretation with explicit limitations
- Safety-first language posture
- Route A (non-ambulant concern navigation) and Route B (ambulant gait analysis)

---

## 1. Research Depth for Gait Analysis

### A. Clinical understanding you must own (judge-proof)
1. Pediatric gait development by age
- What normal gait variation looks like between ages 2 to 7
- Why age-adjusted interpretation matters
- What is normal variability versus clinically meaningful deviation

2. Core CP and motor-delay gait patterns
- Equinus or toe-walking
- Crouch gait
- Scissoring gait
- Trendelenburg pattern
- Asymmetry and rhythm irregularity

3. Functional severity frameworks
- GMFCS levels and what each level means functionally
- Why your current solution is most suitable for ambulant children (typically GMFCS I to III)

4. Early risk versus diagnosis
- You are identifying movement-risk signals and communication priorities
- Final diagnosis remains clinician-led and multimodal

### B. Existing diagnostic and assessment methods you should reference
1. Clinical pathways for early CP risk
- GMA, HINE, DAYC, neurological exam, and MRI context

2. Standard gait assessment tools
- Edinburgh Visual Gait Score (EVGS)
- Instrumented 3D gait labs as reference standard
- Wearable IMU-based gait tools

3. Functional outcome tools
- GMFM-66
- Functional mobility and participation measures

### C. AI and ML approaches judges may ask about
1. Computer vision pipeline classes
- 2D keypoint tracking from RGB video
- 3D pose lifting and world-coordinate estimation
- Multi-view reconstruction (if two-camera capture exists)

2. Modeling families
- Feature-engineered models (XGBoost, logistic, random forest)
- Sequence models (TCN, LSTM, Transformer)
- Skeleton graph models (ST-GCN variants)

3. Model trust and reliability methods
- Confidence calibration
- Out-of-distribution detection
- Quality gating and metric suppression
- Explainability at feature and domain level

### D. Limitations in current solutions (and your position)
1. Most solutions fail one of these three:
- Clinical interpretability
- Real-world capture robustness
- Workflow handoff to clinicians

2. Common failure modes
- Camera angle sensitivity
- Motion blur, occlusion, poor lighting
- Dataset bias and poor external validity
- Overclaiming diagnosis from weak observational signals

3. Your strongest differentiation angle
- Trust-structured workflow with uncertainty visibility and clinician-ready handoff

### E. High-value research directions and keywords
#### Research directions to prioritize
1. External validation with independent cohorts
2. Age-stratified normative gait bands
3. View-specific confidence modeling (frontal versus sagittal)
4. Progression tracking and clinically meaningful change thresholds
5. Human-in-the-loop clinician feedback integration

#### Search keywords for papers and prep
- Pediatric gait analysis markerless motion capture
- Cerebral palsy gait biomarkers smartphone video
- EVGS reliability and validity
- GMFCS gait characteristics ambulatory children
- 2D to 3D pose lifting pediatric gait
- Confidence calibration medical AI triage
- Explainable AI in clinical decision support
- External validation transportability pediatric models

---

## 2. 3-Minute Pitch Structure (High Impact)

## Full script (practice version)
Good afternoon judges.  
We are building GAITBRIDGE to solve a painful healthcare communication gap.

Today, when a parent worries about a child’s walking pattern, they usually bring an unstructured phone video to a doctor. The clinician gets incomplete context, uncertain recording quality, and no consistent way to compare over time. That often leads to delayed, fragmented follow-up.

This matters because for conditions like cerebral palsy and broader motor delays, earlier and better-informed follow-up can significantly improve outcomes. But formal gait labs are expensive, specialized, and inaccessible for most families.

Current options are either high-cost and clinically constrained, or low-cost but not clinically actionable. In short, families can record videos, but they still cannot communicate gait concerns in a structured, trusted way.

GAITBRIDGE changes that.

Our solution takes one guided walking capture and produces two outputs at once:
- A calm caregiver summary in plain language
- A clinician-ready packet with observed domains, confidence context, quality limitations, and suggested follow-up priority

Technically, we run pose-based gait signal extraction, quality gating, and confidence-aware concern scoring. If the signal is weak, we do not guess. We downgrade confidence, suppress unreliable domains, and show exactly what was and was not assessable.

For non-ambulant or younger children where gait scoring is not appropriate, we route to structured concern navigation instead of forcing invalid analysis. That protects clinical integrity.

For parents, this means less panic and clearer next steps.  
For clinicians, this means less time decoding low-quality videos and more time making informed decisions.  
For health systems, this means a scalable, smartphone-first front door for better pediatric movement surveillance and referral readiness.

Most teams pitch AI accuracy. We pitch trust, safety, and workflow utility under real-world constraints.

GAITBRIDGE is not diagnosing children. It is helping families and clinicians communicate gait concerns earlier, more clearly, and more responsibly.

One clip. One clear summary. One structured handoff. One better next step.

Thank you.

### Delivery timing guide
- 0:00 to 0:35 Problem and emotional hook
- 0:35 to 1:00 Why it matters with urgency
- 1:00 to 1:35 Market and current gap
- 1:35 to 2:25 Solution and how it works
- 2:25 to 2:50 Impact by stakeholder
- 2:50 to 3:00 Close and memorably repeat your one-liner

---

## 3. Medical Terminologies You Must Know

| Term | Simple definition | How to use naturally in pitch |
|---|---|---|
| Gait cycle | One full walking sequence from one foot contact to next same-foot contact | We analyze movement over repeated gait cycles, not a single frame |
| Cadence | Steps per minute | Cadence helps us understand rhythm and walking consistency |
| Stride and step symmetry | How similar left and right timing or movement are | Asymmetry is often more clinically meaningful than raw speed |
| Stance phase | Portion of gait when foot is on ground | We track stance and swing behavior indirectly through pose dynamics |
| Swing phase | Portion of gait when foot moves forward in air | Irregular swing timing can indicate coordination concerns |
| Base of support | Width between feet during walking | Narrow or unstable base can reflect balance-related risk |
| Trendelenburg pattern | Pelvic drop pattern often linked to hip abductor weakness | We flag lateral stability concerns consistent with Trendelenburg-like patterns |
| Equinus or toe-walking | Walking with persistent plantarflexed ankle pattern | Toe-walking can be a signal that needs structured follow-up |
| Crouch gait | Excessive knee flexion during stance and progression | Crouch-like patterns suggest higher functional burden |
| Spasticity | Velocity-dependent increased muscle tone | Spasticity can alter gait rhythm and symmetry |
| Hypotonia | Reduced muscle tone | Hypotonia can present as instability or delayed motor control |
| GMFCS | Functional classification for CP movement ability | Our ambulant workflow is aligned to children where gait capture is meaningful |
| Developmental motor delay | Delayed achievement of expected motor milestones | We support early risk communication, not standalone diagnosis |
| Regression | Loss of previously acquired motor skill | Regression is a high-priority red flag for urgent clinical review |
| Neuroplasticity window | Early period where intervention impact is highest | Earlier structured escalation can improve intervention timing |
| Sensitivity | Ability to detect true positives | Judges may ask for sensitivity and specificity in future validation |
| Specificity | Ability to reject false positives | We prevent over-calling through confidence and suppression rules |

---

## 4. Market Impact and Judge Persuasion Strategy

### A. Why this problem is urgent and underserved
1. Access gap
- Formal gait labs are scarce and expensive
- Families rely on unstructured phone videos with low clinical usability

2. Timing gap
- Motor concerns are often observed early but escalated late
- Communication quality, not only detection quality, is the bottleneck

3. Workflow gap
- Most tools optimize model output, not care handoff quality

### B. Market relevance framing (use in pitch)
1. Immediate wedge market
- Pediatric neurodevelopment follow-up workflows in low-resource and mid-resource settings

2. Expansion potential
- Rehabilitation programs
- Telehealth pediatric triage
- School and community screening programs

3. Buyer and user alignment
- User: caregiver and front-line clinician
- Buyer: clinics, hospitals, NGO programs, telehealth networks, public health initiatives

### C. Judge-by-judge persuasion strategy
#### For medical judges
Lead with:
- Clinical appropriateness boundaries
- No-diagnosis posture
- Confidence and assessability transparency

Proof points to show:
- Route safeguards
- Quality gating and suppression
- Structured clinician packet

#### For technical judges
Lead with:
- Robustness constraints and failure-mode handling
- Explainability and confidence calibration
- Practical architecture for mobile capture

Proof points to show:
- Capture preflight checks
- Deterministic policy layer
- Validation and test coverage story

#### For business judges
Lead with:
- Workflow ROI and deployment feasibility
- Time saved in follow-up visits
- Scalable smartphone-first channel strategy

Proof points to show:
- Two-output wedge
- Integration path with existing care systems
- Clear post-hackathon productization milestones

### D. Competitive advantage statement
Your edge is not just model scoring. Your edge is trusted clinical communication:
- Explicit uncertainty
- Safe language controls
- Structured handoff artifact
- Clear pathway for practical adoption

---

## 5. Product Feedback and Feature Enhancement

### A. How current MVP features help parents
1. Guided capture reduces unusable recordings
2. Plain-language summary lowers anxiety and confusion
3. Follow-up prioritization gives a clearer next action
4. Safety framing avoids harmful overconfidence

### B. What is currently weak or missing
1. Claim-risk mismatch
- If you position as detection, judges will challenge clinical validity and regulation

2. Insight depth gap
- Parents still need clearer what this means today and what to do this week guidance

3. Longitudinal understanding gap
- Single-assessment insight is weaker than trend-based insight

4. Clinical workflow depth gap
- Handoff is strong, but multi-visit and comparative progression support can be deeper

### C. High-impact improvements (near-term)
1. Actionable care pathway card in every result
- What to monitor at home
- When to escalate
- What to bring to the appointment

2. Confidence and assessability visual dial
- One concise signal for what is reliable now

3. Progress timeline
- Compare current run to previous run with plain-language trend labels

4. Parent-ready discussion prep
- Auto-generate appointment questions and structured notes

5. Clinician packet readiness score
- Data quality, assessed domains, unresolved gaps

### D. Innovative features to differentiate your solution
1. Dual-view fusion mode
- Merge frontal and side captures into richer gait interpretation

2. Family guidance copilot with strict safety boundaries
- Clarifies report language and follow-up logistics only

3. Personalized milestone-aware risk context
- Age and function aligned context cards without diagnostic labeling

4. Explainable what changed between visits view
- Domain-by-domain delta with confidence guardrails

5. One-tap secure specialist referral bundle
- Packet, trend summary, and key observations in one shareable payload

### E. Strategic repositioning recommendation
Use this framing everywhere:
- Not CP detection
- Trusted gait-risk communication and follow-up readiness for caregivers and clinicians

This reduces regulatory risk and increases judge trust.

---

## 6. Advanced Visualization (3D Analysis)

### A. Is 3D feasible?
Yes, with a phased approach.

### B. Recommended implementation tiers
#### Tier 1: Practical now (hackathon-friendly)
1. Pseudo-3D from monocular world landmarks
- Use pose world coordinates and temporal smoothing
- Show rotating skeleton replay with confidence heatmap

2. Output to user
- Parent: simplified movement replay and highlighted concern regions
- Clinician: frame-synced 3D skeleton with metric overlays

#### Tier 2: Stronger clinical utility (post-hackathon)
1. Multi-view capture
- Frontal plus sagittal clip fusion
- Better depth approximation and side-plane feature reliability

2. Output to user
- Comparative frontal versus side kinematic views
- Improved interpretation for crouch and toe-walking patterns

#### Tier 3: Advanced mode
1. 3D kinematic timeline
- Joint-angle curves over cycle phases
- Event markers for stance and swing transitions

### C. What parents and doctors would see
1. Parent view
- Clean animated skeleton
- Simple labels: symmetry, stability, rhythm
- Confidence indicator and what to do next

2. Clinician view
- 3D replay plus metric plots
- Assessability map by domain
- Clickable events linked to video frames

### D. Why 3D improves understanding over 2D
1. Better spatial intuition for hip, knee, trunk patterns
2. Stronger explanation of asymmetry and instability
3. Higher confidence when discussing progression over time
4. Better communication artifact for multidisciplinary teams

### E. Risks and mitigations
1. Risk: False precision from monocular depth assumptions
- Mitigation: Show confidence bands and label 3D mode as estimate unless multi-view validated

2. Risk: Performance burden on low-end devices
- Mitigation: Device-adaptive rendering and server-side optional processing

3. Risk: User confusion
- Mitigation: Parent mode keeps visuals simple; advanced plots stay clinician-only

---

## Practical 7-Day Execution Plan for HSIL

1. Freeze message lock and remove diagnosis wording from all slides
2. Rehearse 3-minute script until stable under interruption
3. Add one slide on limitations and safety posture
4. Add one slide on phased 3D roadmap with clear feasibility tiers
5. Add one slide with parent and clinician impact metrics
6. Prepare judge-specific one-liners by persona
7. Prepare fallback demo branch for low-quality capture scenario

---

## Final Pitch Principle
Win by being clinically honest, technically credible, and operationally useful right now.

Best hackathon teams do not claim certainty. They demonstrate trustworthy decision support under real-world constraints.
