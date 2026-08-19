# Pedi-Growth Pitch Deck: Comprehensive Speaker Notes

**Context**: These notes are designed to flow naturally while presenting the Pedi-Growth slide deck. They cover the problem, the technical solution, the clinical guardrails, the impact, and the business model, providing a cohesive narrative for a hackathon or investor pitch.

---

## Slide 1: The Problem: The 5-Year Delay
**Speech:**
"Imagine noticing your child has a limp. You wait months for a specialist appointment, only for the doctor to watch your child walk for 30 seconds and say, 'Let's wait and see.' This is the reality for countless parents. In South Asia alone, by the time a child with Cerebral Palsy gets a formal diagnosis, they are often already five years old. But here is the tragedy: the critical window for brain plasticity—when physical interventions are most effective—closes at age three. Looking specifically at Bangladesh, there are over 230,000 children living with CP. A formal, hospital-grade gait analysis lab costs up to $100,000 to build, which is why there are zero accessible public gait labs available. We simply lack the objective, accessible data needed to make confident, early clinical referrals. We are losing critical years of development simply because we can't measure the problem."

---

## Slide 2: The Solution: Mobile-Powered Gait Analysis
**Speech:**
"Our solution is Pedi-Growth: Mobile-Powered Gait Analysis. We turn any standard smartphone into a clinical-grade screening tool. A parent simply records a 5-second video of their child walking at home. Behind the scenes, our deterministic pose-to-feature-to-risk pipeline takes over. It utilizes MediaPipe to extract precise skeletal landmarks and XGBoost models to classify risk—instantly delivering the objective data that doctors desperately need. It's clinically reliable, achieving 90% accuracy that we validated using strict, patient-aware data splits to prevent any data leakage. Most importantly, it acts as a bridge between the home and the clinic, eliminating data silos by compiling these home-recorded videos into a rich, metric-driven handoff packet for clinicians. With zero hardware barrier, we remove the dependency on expensive motion-capture labs, entirely bridging the gap between underserved homes and professional clinical workflows."

---

## Slide 3: Key Features: Deep Biomechanics
**Speech:**
"Behind this seamless user experience is deep biomechanical analysis. Our edge-AI tracks 33 critical skeletal landmarks frame-by-frame with high precision, and it's optimized to run even on low-end cameras. From those 33 landmarks, we automatically compute 34 distinct medical metrics—things like step length, cadence, joint angles, and asymmetry scores. But we also know that garbage-in means garbage-out. That's why we built strict Quality Gating; if the lighting or angle is wrong, the AI instantly rejects the video to ensure clinical accuracy. We've also integrated Smart Routing to dynamically guide users based on the child's ambulatory status and age, keeping the analysis clinically appropriate. Our Policy-Bounded AI grounds the system in evidence, safely falling back to deterministic guidance when needed. Finally, the platform is Connectivity-Aware: the core video capture and pose extraction happen completely locally on the device, relying on online services only for synchronization and sharing when internet is available."

---

## Slide 4: Clinical Trust & Safety Guardrails
**Speech:**
"In healthcare, trust is everything. Pedi-Growth is built on rigorous Clinical Trust & Safety Guardrails. Let's be very clear: this is strictly a screening and data-collection tool, not a diagnostic medical device. Our system has explicit constraints so it will never output diagnostic words like 'Cerebral Palsy' or 'Autism' to a user. We also guarantee Privacy First by Design. By processing the video array entirely via WebAssembly directly on the user's browser, the video never actually leaves their device. Protected Health Information (PHI) never touches our servers. This ensures absolute privacy, bypasses massive regulatory hurdles regarding pediatric video storage, and heavily reduces our cloud compute costs. Additionally, we purposefully chose engineered XGBoost models instead of black-box deep learning. XGBoost is highly interpretable, meaning clinicians can look under the hood and understand exactly *why* a risk classification was made."

---

## Slide 5: Communication Flow
**Speech:**
"Finally, let's look at how Pedi-Growth brings the parent and clinician together in one unified system. The flow starts at home: the parent records the walking video, and our AI pipeline processes it instantly on the device. That result is securely stored in a centralized database and immediately populates right on the clinician's dashboard. Back at home, the system generates automated insights, providing the parent with a safe, non-diagnostic summary of the screening. Over at the clinic, the doctor reviews the comprehensive handoff packet and publishes a clinical note. This note syncs with the patient record and is routed securely back down to the parent. Pedi-Growth completely closes the loop, creating continuous, data-driven communication between the home and the healthcare system."

---

## Slide 9: Target Audience & Key Stakeholders
**Speech:**
"To make this clinical vision a reality, we employ a B2B2C model that directly bridges the gap between anxious families and overwhelmed healthcare systems. We serve three key stakeholders. First is the End-User: parents and children in rural areas. These are families who are noticing early motor abnormalities but live hundreds of miles away from the nearest specialist. Second is our Primary Customer: clinics and telemedicine providers. These are overburdened pediatricians and physical therapists who desperately need objective, rapid triage data to prioritize severe cases and reduce the overall time to diagnosis. Finally, we have the Ecosystem Partner: NGOs and public health organizations like BRAC and UNICEF. They require scalable, low-cost screening tools for tracking developmental health at a massive, population level."

---

## Slide 10: Value Proposition
**Speech:**
"Because we serve a multi-sided market, our value proposition is distinct and powerful for each group. For families, Pedi-Growth transforms anxiety and the dreaded 'wait-and-see' approach into actionable, immediate steps. It completely eliminates the need to travel hundreds of miles just to be told to come back in six months. For clinicians, the value is pure efficiency: it allows them to start every appointment at Step 3 instead of Step 1. It provides an objective, baseline dataset that is practically impossible to gather during a chaotic 10-minute pediatric clinic visit. And for health systems and NGOs, Pedi-Growth effectively democratizes a $50,000 gait lab, placing it into a free smartphone browser. This essentially enables true population-level screening for pediatric motor delays at zero marginal cost per patient."

---

## Slide 11: Competitive Advantage & SWOT
**Speech:**
"Looking at our competitive landscape through a SWOT analysis, our strategic positioning becomes clear. Our primary Strengths are the absolute zero hardware requirements and our edge processing architecture, which ensures total privacy and offline capability in low-resource settings. Our main Weakness is a dependence on the quality of the smartphone camera and the parent's ability to follow recording instructions; however, we have strongly mitigated this through our strict AI quality gating system that rejects poor videos. There are massive Opportunities ahead in integrating our API with existing telemedicine platforms, and expanding the product to longitudinally track rehabilitation progress over time, rather than just initial screening. Finally, our Threats include potential resistance from traditional specialists who strongly prefer in-person observation, and the need to navigate potential future regulatory shifts in AI-assisted clinical screening."

---

## Slide 12: Market Analysis & Projections
**Speech:**
"When discussing the market, it's important to understand that we are not just entering a market; we are creating one. Currently, gait analysis in South Asia is a luxury reserved strictly for the ultra-wealthy or severe post-op patients. Our Total Addressable Market includes the 400 million plus children globally under the age of 5. Our Serviceable Addressable Market focuses on the 150 million children specifically in South Asia and Africa. And our Serviceable Obtainable Market targets clinics and NGOs in Bangladesh and India. Looking at our financial projections for Year 2, we are targeting approximately $5,000 monthly from NGO pilots, $12,000 from Telemedicine APIs, and $18,000 from Clinic Licenses. Crucially, these projections represent a highly sustainable business model because our edge-compute architecture keeps our marginal operating costs incredibly low—around $800 a month."

---

## Slide 13: Go-to-Market & Scaling Strategy
**Speech:**
"Let's look at how we plan to go to market and scale effectively. We have a three-phase strategy. Phase 1, over the first six months, is purely focused on Clinical Validation. We are targeting clinics and NGOs to deploy our dual-portal system in controlled environments. This allows us to build clinical trust, refine the dashboard, and gather essential pediatrician feedback. During Phase 2, between months six and twelve, we shift to Direct-to-Consumer Expansion targeting parents and caregivers directly. By launching the patient portal publicly, we empower parents to screen their children from home, generating bottom-up demand that aggressively drives clinic adoption. In Phase 3, Year 2 and beyond, we hit Gov & Rural Scale. We aim to equip over 100,000 government Community Health Workers, or CHWs, with our tool, empowering them to universally screen children across remote areas. Look at the impact of scaling to just one percent of that CHW network, meaning just 1,000 workers. We would screen 10,000 children every month, continuously catching roughly 1,500 motor delays, and bringing detection forward by a massive three years. This doesn't just solve the rural access gap—it provides the government with real-time public health data and fuels our internal models with diverse, longitudinal datasets."

---

## Slide 14: Business Model & Revenue Generation
**Speech:**
"Moving to our Business Model and Revenue Generation. Our core philosophy is built on a B2B2C strategy: the capture tool is always free for parents. We never want to put a financial barrier between a concerned parent and their child's initial screening. Instead, we monetize by licensing the clinical interpretation portal to the providers who serve them. We have four distinct and scalable revenue streams. First, we offer Clinic Licensing targeting pediatricians and physical therapy clinics. For $49 to $99 a month, tiered by volume, they receive unlimited patient screenings and access to our longitudinal tracking dashboards. Second, we offer an Enterprise API targeting existing telemedicine applications in the region, like Shastho or CMED. Through a revenue-share or a bulk license running around 50 cents per scan, we provide a seamless white-label integration. This adds massive diagnostic value to their existing remote pediatric consults without them needing to build the tech. Third, we secure NGO Partnerships with massive organizations like UNICEF, BRAC, and Save the Children. For project-based fees ranging between $500 and $2,000, we deliver population-level screening data and anonymized geographic trend reports that are critical for tracking sustainable development goals. Finally, our ultimate, long-term goal is Government Integration. By securing annual enterprise contracts with the Ministry of Health and public health departments, we can integrate directly into national rural health networks. The value proposition here is immense: by catching delays early, we radically reduce the long-term disability burden on state resources."

---

## Slide 15: Economic Impact & Cost-Benefit
**Speech:**
"But beyond the financial returns, the most important metric for us is the economic and societal impact. Consider the structural reality in Bangladesh: there are only 6.8 rehabilitation units per one million people, almost all located in urban centers. This creates massive travel and financial friction. Pedi-Growth drives a structural shift. With zero hardware CAPEX, we leverage existing infrastructure—the smartphones already in people's pockets. The program hits immediate break-even if operating costs remain below $16.80 per child per year, which is easily achievable via our edge-compute architecture. When we look at the quantified annual benefits based on population surveillance data, the results are staggering. We project that children will receive a diagnosis and start rehab 1.8 years earlier. We project a 31.2% increase in overall rehab uptake. And for the families, we save an average of 95 kilometers in travel and $16.80 in out-of-pocket costs per visit. Pedi-Growth isn't just a clinical tool; it is a fundamental restructuring of how pediatric care accesses the most vulnerable."

---

## 2-Minute Hackathon Pitch Script
*(Target Time: ~1:45s to leave room for judging/breathing)*

"Hi everyone, we are the team behind Pedi-Growth.

Imagine noticing your toddler has a limp. You wait months to see a specialist, only for the doctor to watch them walk for 30 seconds and say, 'Let's wait and see.' 

In places like South Asia, by the time a child receives a formal diagnosis for something like Cerebral Palsy, they are often five years old. But the critical window for physical therapy closes at age three. We are losing crucial years of a child's development just because we can't measure the problem early enough. A formal clinical gait lab costs $100,000 to build, meaning there are practically zero public labs accessible to rural families. 

That's why we built Pedi-Growth. We turn any standard smartphone into a clinical-grade movement lab. 

Here's how it works: A parent simply records a 5-second video of their child walking at home. Our AI, running entirely local on the phone, tracks 33 skeletal points and instantly calculates a risk score. It requires zero hardware, works offline, and because the video never leaves the device, it is completely private. 

We aren't replacing doctors; we're empowering them. That 5-second video automatically translates into a rich data dashboard for the pediatrician, meaning they start the appointment with objective data rather than just guessing. 

Our business model is highly scalable. The tool is 100% free for parents. We monetize by licensing our dashboard and API to clinics, telemedicine platforms, and NGOs. 

With Pedi-Growth, we can catch motor delays almost two years earlier. We are democratizing pediatric care—taking a $100,000 lab and putting it directly into the pockets of the parents who need it most. 

Thank you."
