# GAITBRIDGE Cost-Benefit Analysis (Bangladesh Context)

## Objective
Estimate whether a smartphone-based gait screening and clinician-handoff workflow is economically and operationally justified in Bangladesh, using currently available evidence from project documentation and cited studies.

## Scope and perspective
- Geography: Bangladesh (rural access constraints emphasized)
- Use case: walking-age child screening support and clinician handoff (non-diagnostic)
- Perspective: mixed (family + delivery program + health-system access)
- Time horizon: 12 months for direct measurable effects; medium-term benefits discussed qualitatively

## Evidence base used
1. Bangladesh CP burden and access constraints from population and register studies (PMID: 30394528, 33939721, 36836130, 34176400).
2. Service-access effect sizes from SMART-CP cluster RCT (PMID: 40193125).
3. Product architecture and constraints from repository docs and pipeline artifacts.

---

## Baseline problem economics

### A) High unmet need and delayed pathway
- CP prevalence in Bangladesh: 3.4 per 1000 children (95% CI 3.2-3.7).
- Estimated children with CP nationally: about 233,514.
- Mean age at diagnosis in population surveillance: 5 years 2 months.
- Large rehabilitation non-use burden reported (49.8% to 78.2% depending on cohort and period).

Economic implication:
- Delayed diagnosis and delayed rehabilitation shift care toward higher-intensity, higher-friction pathways and increase household burden over time.

### B) Structural supply-side constraints
- Rehabilitation units: 6.8 per 1 million people.
- Rural distribution: only 6.2% of units in rural areas.
- Out-of-pocket payment required in 66.3% of services.

Economic implication:
- Access frictions are structural, not only behavioral; any intervention that reduces travel and navigation burden can create real economic value even before full clinical outcome gains are monetized.

---

## Quantified benefits (from available evidence)

The strongest directly quantifiable program effects come from the Bangladesh SMART-CP RCT (n=968):

1. Rehabilitation uptake increase:
- 68.2% (control endline) vs 99.4% (intervention endline)
- Absolute increase: +31.2 percentage points

2. Earlier diagnosis:
- Mean diagnosis age: 3.8 years (control) vs 2.0 years (intervention)
- Time gain: 1.8 years earlier

3. Earlier rehabilitation start:
- Mean rehab start age: 3.6 years (control) vs 1.8 years (intervention)
- Time gain: 1.8 years earlier

4. Out-of-pocket spending reduction:
- $2.9 vs $1.5 per month
- Direct family saving: $1.4 per month = $16.8 per child per year

5. Travel burden reduction:
- 113.4 km vs 18.1 km (distance traveled for rehabilitation over 12 months)
- Reduction: 95.3 km per child per year

---

## Economic translation scenarios

## Scenario 1: 1000 children enrolled
Using only RCT-observed deltas:

1. Additional children accessing rehabilitation:
- 1000 x 31.2% = 312 additional children

2. Aggregate annual out-of-pocket savings:
- 1000 x $16.8 = $16,800 per year (household-side direct saving)

3. Aggregate travel distance reduction:
- 1000 x 95.3 km = 95,300 km less travel per year
- Monetized value depends on local travel cost per km (not fixed here).

## Scenario 2: 10,000 children enrolled
1. Additional children accessing rehabilitation:
- 3,120 additional children

2. Aggregate annual out-of-pocket savings:
- $168,000 per year

3. Aggregate travel distance reduction:
- 953,000 km less travel per year

Note: These figures are conservative because they count only directly measured annual household financial effect from one reported spending variable, not broader productivity or long-term disability-cost reduction.

---

## Cost stack for GAITBRIDGE-style deployment

## A) Expected cost components
1. Product and engineering:
- Ongoing model/pipeline maintenance, QA, feature updates

2. Cloud and operations:
- API hosting, storage, logging, monitoring, support

3. Program delivery:
- Field onboarding, caregiver education, referral coordination

4. Clinical integration:
- Training for clinician packet usage, workflow integration

5. Governance and compliance:
- Data protection, safety language governance, auditability

## B) Why cost risk is structurally lower than lab-first models
- Uses existing smartphones
- No specialized gait-lab hardware CAPEX
- Can operate through task-shifted workflows and remote triage

---

## Break-even framing (decision formula)

Let:
- C = annual program cost per child
- S_oop = annual out-of-pocket saving per child (= $16.8 from RCT)
- S_travel = monetized travel saving per child
- V_access = value of improved service access (not directly monetized in current evidence)

Then net value per child is:

Net = (S_oop + S_travel + V_access) - C

Conservative threshold (ignoring travel and access valuation):
- Break-even requires C < $16.8 per child-year

Practical threshold (including travel and access value):
- Break-even allowable C is higher than $16.8, potentially substantially higher, depending on local transport costs and referral value.

---

## Non-monetized strategic benefits (material for funders and judges)
1. Access equity benefit:
- Rural families gain earlier and more reliable entry to care pathways.

2. Clinical workflow benefit:
- Structured pre-visit packets reduce unstructured consultation time and improve triage quality.

3. Risk management benefit:
- Non-diagnostic positioning with quality gating lowers harm from overclaiming and improves adoption trust.

4. System learning benefit:
- Standardized data traces support future external validation and policy-grade evidence generation.

---

## Risks and limitations
1. Internal model metrics are not equivalent to external clinical effectiveness.
2. Some benefits (functional gains, caregiver productivity, long-term cost offsets) are not yet monetized in repo evidence.
3. Program cost inputs for GAITBRIDGE are not yet published as a full unit economics model in the repository.

---

## Recommendation
Based on current evidence, the intervention class (community-linked early detection + structured rehabilitation linkage) is likely cost-beneficial in Bangladesh, especially at scale, because:

1. It improves access substantially (+31.2 percentage points).
2. It reduces direct household spending and travel burden.
3. It advances diagnosis and rehabilitation by about 1.8 years.
4. It avoids expensive hardware-dependent deployment models.

Operational recommendation:
- Proceed with phased implementation and publish a formal prospective cost-effectiveness evaluation (with per-child program cost, transport monetization, and long-term functional outcomes) as the next milestone.

---

## References (core)
1. Khandaker G, et al. Dev Med Child Neurol. 2019;61(5):601-609. PMID: 30394528. DOI: 10.1111/dmcn.14013.
2. Al Imam MH, et al. PLoS One. 2021;16(5):e0250640. PMID: 33939721. DOI: 10.1371/journal.pone.0250640.
3. Narayan A, et al. J Clin Med. 2023;12(4):1597. PMID: 36836130. DOI: 10.3390/jcm12041597.
4. Al Imam MH, et al. Disabil Rehabil. 2022;44(19):5571-5584. PMID: 34176400. DOI: 10.1080/09638288.2021.1939799.
5. Al Imam MH, et al. JAMA Pediatr. 2025;179(6):621-629. PMID: 40193125. DOI: 10.1001/jamapediatrics.2025.0150.
