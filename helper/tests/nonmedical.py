"""Thirteen non-medical texts for the pack matching tests and the calibration (written for this project): four short
ones, seven longer technical ones from the T15 review, and two everyday uses of "staining" / "nuclei"."""

BUDGET_MEMO = """MEMORANDUM
To: Department heads
From: Finance Office
Subject: Budget review for the next fiscal year

The finance committee met on Monday to review the draft budget. Overall spending is expected to rise by 4 percent,
mainly because of higher energy prices and the new maintenance contract. Each department must submit its final
spending plan by the end of the month. Requests above the approval threshold of 50,000 dollars need a short written
justification and the signature of the department head.
Key findings of the review: travel costs fell after the move to online meetings; printing costs remain high; two
service contracts can be renegotiated. The committee recommends a hiring freeze for administrative positions until
the second quarter, with exceptions for positions funded by external grants.
Please use the attached spreadsheet template. Do not change the formulas in the summary sheet. Late or incomplete
submissions will be returned without review. Contact the finance office if you have questions about cost codes or
the reimbursement policy."""

SOFTWARE_README = """# fastsync

fastsync keeps two folders in sync over SSH. It compares file hashes, copies only the blocks that changed and
resumes interrupted transfers.

## Features
- Incremental transfer: only changed blocks are sent.
- Deletion handling: files deleted at the source are moved to a trash folder at the target, never removed at once.
- Configurable size threshold for files that are always copied in full.
- Dry-run mode that prints every planned insertion, update and deletion without touching the target.

## Installation
Run `pip install fastsync`. Python 3.10 or later is required. On Windows, install OpenSSH first.

## Usage
    fastsync ./photos user@server:/backup/photos --dry-run

## Configuration
Settings live in `fastsync.toml`. Set `threshold_mb` to change the full-copy threshold and `exclude` to skip
patterns such as `*.tmp`. Logs are written to the user cache folder.

## Contributing
Open an issue before sending a large patch. Run the test suite with `pytest` and keep the coverage above 90 percent.
Released under the MIT license."""

NEWS_ARTICLE = """City opens new riverside park after two years of construction

The city council opened the new riverside park on Saturday, ending two years of construction along the eastern bank.
The park covers twelve hectares and includes a cycling track, two playgrounds, a small amphitheatre and a floating
pier for kayaks. More than three thousand residents attended the opening, which featured local musicians and food
stalls.
The mayor said the project came in slightly under budget thanks to recycled materials from the old warehouses that
once stood on the site. Environmental groups welcomed the new wetland area, which is expected to attract migrating
birds in the autumn. Some shop owners in the old town worry that the park will draw visitors away from the central
market, while others expect more customers on weekends.
The park is open from six in the morning until ten at night. Parking is limited, and the council encourages visitors
to arrive by bus or bicycle. A second phase, with a sports field and a cafe, is planned for next year."""

SCHOOL_NOTICE = """NOTICE TO PARENTS AND STUDENTS

The school will hold its annual science fair on Friday, 14 November, in the main hall. All students in grades 6 to 9
are invited to present a project. Projects may be done alone or in teams of up to three students. Each team needs a
teacher as a supervisor; Professor Lan and the visiting lecturer from the university will chair the judging panel.
Registration forms are available from the school office and must be returned by 31 October. Students should bring
their own posters and any equipment they need; the school provides tables and power sockets.
Classes will end at noon on the day of the fair. Parents are welcome to visit the exhibition from 1 pm to 4 pm.
Lunch will be served in the canteen as usual. Please remember that the school gate closes at 5 pm.
For questions, contact the head teacher or the school office by phone or email. Thank you for your support."""

# Seven longer non-medical technical texts from the T15 review (generic glossary words: threshold, deletion,
# marker, positive, professor, recurrence...). Before the detect-keyword gate all seven selected pathology.

RELEASE_NOTES = """Release notes - DataPipe 4.2.0

This release focuses on reliability features, faster incremental sync and several security patches. Please read the
upgrade notes before you deploy to production; the staging environment should be upgraded first.

New features
- Feature gating: every new feature can now be switched on per tenant through the admin console. Gating rules are
  evaluated at request time and cached for 60 seconds.
- Bulk insertion API: clients can send up to 10,000 rows in one request. Insertion order is preserved, and a failed
  insertion is retried once before the batch is marked as failed.
- Soft deletion: records are no longer removed at once. A deletion moves the record to an archive table, and a
  nightly job purges archived rows older than 30 days. Deletion of a whole project still requires an admin role.
- Regular expression filters in the log viewer. An invalid expression is rejected with a clear message instead of a
  stack trace.
- A new alert threshold setting. When the error rate crosses the threshold for five minutes, the on-call engineer is
  paged. The default threshold is 2 percent of requests.

Improvements
- The scheduler now supports recurrence rules (daily, weekly, monthly). A recurrence that falls on a holiday is moved
  to the next working day.
- Memory use of the indexer is down by 30 percent; large repositories no longer show scattered timeouts.
- The CLI shows a progress marker for every file and a summary of findings from the static analyser at the end of a
  run. Findings are grouped by severity.
- Dashboards load faster thanks to sensor fusion of the three latency probes into one smoothed series.

Bug fixes
- Fixed a race condition that caused sporadic test failures on Windows runners.
- Fixed false positive warnings about unused variables in generated code. Positive and negative test cases were
  added for the parser.
- Fixed a crash when a patch file contained a binary diff. The patch command now reports which hunk failed.
- Fixed a subtle off-by-one error in pagination that hid the last item on some pages.

Known issues and pitfalls
- Clients that mimic the old v3 API through a proxy may see duplicate events; switch to the v4 endpoint.
- The migration is not reversible. Take a backup first.

Security
- Two dependencies were upgraded to address published vulnerabilities. All users should install this patch release.
- Session tokens are now rotated after a password change.

Thanks to all contributors who reported issues and sent patches during this cycle."""

STATS_TUTORIAL = """Tutorial: choosing a decision threshold for a binary classifier

A classifier usually returns a score between 0 and 1, and we turn it into a yes / no answer by comparing it with a
threshold. The choice of threshold changes the balance between false positive and false negative results, so it
should depend on the cost of each kind of error.

1. Start from the confusion matrix. A true positive is a case that is positive and predicted positive; a false
positive is a negative case predicted positive. Sensitivity is the share of positive cases that are found;
specificity is the share of negative cases that are correctly rejected.

2. Plot the ROC curve by moving the threshold from 0 to 1 and recording sensitivity against 1 - specificity. The area
under the curve summarises discrimination. For survival models the concordance index plays the same role: it is the
share of comparable pairs in which the model ranks the earlier event higher.

3. Look at calibration. A model can rank cases well and still be badly calibrated. Plot observed against predicted
risk in ten groups; points scattered far from the diagonal show miscalibration.

4. Feature selection matters as much as the threshold. Too many features invite overfitting; a penalised regression
keeps only the features that carry signal. Report which features were kept and why.

5. Check reproducibility. Fix the random seed, keep the code under version control and report the software version.
A finding that cannot be reproduced on a second split is not a finding.

6. Be careful with borderline results. A p-value of 0.049 is not strong evidence, and a p-value of 0.051 is not
evidence of no effect. Report effect sizes with confidence intervals instead of a yes / no verdict.

7. Bayesian analysts may start from a diffuse prior when little is known, then update it with the data. The posterior
expression for a normal mean with a diffuse prior is close to the classical estimate.

8. For time series, a recurrence relation such as an autoregressive model describes each value from the previous ones.
Differentiation of the series removes a trend before the model is fitted.

Common pitfalls: tuning the threshold on the test set, ignoring class imbalance, and reporting only accuracy. A
prognostic model must be validated on data that played no part in building it. Summarise the main findings in plain
language at the end of the report."""

ENGINEERING_SPEC = """Technical specification - LED luminaire series LX-400 for warehouse lighting

1. Scope
This specification covers the optical, electrical and mechanical features of the LX-400 series. It applies to the
40 W, 60 W and 80 W models.

2. Optical design
2.1 The luminaire uses a solid-state light engine with 96 mid-power LEDs on an aluminium board.
2.2 A diffuse polycarbonate cover spreads the light evenly and limits glare. Light scattered by the cover must not
reduce the efficacy below 140 lm/W.
2.3 The secondary lens has a focal length of 12 mm; focal alignment is checked on every unit at the end of the line.
2.4 Colour rendering index >= 80; correlated colour temperature 4000 K or 5000 K.

3. Electrical design
3.1 Input 220-240 V AC, 50/60 Hz; power factor >= 0.95.
3.2 The driver has a high-pass filter (HPF) on the dimming input to reject mains noise, and gating of the output
stage during start-up to prevent inrush current.
3.3 Surge protection 6 kV between line and earth. A thermal fuse opens at 105 C; a thermal fusion test is part of
type approval.
3.4 Positive and negative terminals of the LED board are marked with a red and a black marker.
3.5 Insertion loss of the EMI filter >= 40 dB at 1 MHz.

4. Mechanical design
4.1 Housing: die-cast aluminium, IP65, IK08. Cable glands accept 6-12 mm cables; insertion force for the quick
connector <= 50 N.
4.2 A patch of thermal interface material sits between the board and the housing.
4.3 Mounting: suspension hooks or a bracket; the bracket allows tilt in 15 degree steps.

5. Reliability
5.1 A failure mode and effects analysis (FMEA) was carried out for the driver and the thermal path. The main findings
and actions are listed in annex B.
5.2 L80 lifetime >= 60,000 h at 35 C ambient.
5.3 The design upgraded the capacitor rating after early field returns showed sporadic driver failures.

6. Testing and accreditation
Type tests are performed in a laboratory with ISO/IEC 17025 accreditation. Production tests: hipot, insulation,
photometric spot check (1 in 50), and a burn-in of 4 hours. Units outside the threshold are rejected and their
serial numbers recorded."""

HR_POLICY = """Staff development and appointments policy - Faculty of Engineering

1. Purpose
This policy sets out how the faculty appoints, supports and promotes academic staff and trainees.

2. Academic grades
The faculty has five academic grades: graduate teaching assistant, instructor, lecturer, senior lecturer and
professor. Each grade has a salary band and a workload model. Promotion from lecturer to senior lecturer requires
evidence of teaching quality, research findings published in peer-reviewed venues and service to the faculty.
A professor is expected to lead a research group and mentor junior staff.

3. Trainees
3.1 Interns: the faculty offers a summer internship for undergraduate students. Each intern has a named supervisor
and a written plan. The internship lasts up to twelve weeks.
3.2 Research fellows: a fellowship is a fixed-term appointment of one to three years funded by an external grant.
A fellow may teach up to four hours a week with the head of department's approval.
3.3 Visiting scholars hold an honorary title; a visiting professor may give lectures but does not hold a budget.

4. Recruitment
Vacancies are advertised for at least three weeks. Shortlisting uses written criteria agreed before the advert is
published. Interview panels have at least three members, including one member from outside the department.
Candidates must hold a relevant degree (B.Sc. or higher for instructors; PhD for lecturers and above).

5. International staff
Staff who are not citizens need a valid work permit; the faculty supports applications for residency permits and
pays the fee for the first application. A resident of another country who works remotely must agree the tax position
with the finance office before the contract starts.

6. Performance review
Every staff member has an annual review with their line manager. The review records achievements, agreed objectives
and training needs. A review rated below the threshold for two years in a row leads to a support plan, not to an
automatic dismissal.

7. Accreditation and quality
Programmes are reviewed every five years for professional accreditation. Positive feedback from students and
employers is recorded together with the findings of the external examiners.

8. Complaints
Complaints about an appointment are handled by the faculty secretary within 20 working days. The outcome and the
reasons are given in writing."""

FINANCE_REPORT = """Quarterly report to shareholders - third quarter

Overview
Revenue rose 8 percent year on year to 412 million dollars, a solid result in a patchy market. Operating margin
improved to 14.2 percent thanks to cost-effective sourcing and lower freight costs. The board remains positive about
the outlook for the fourth quarter.

Market conditions
Demand in the domestic market was steady, while export orders were scattered and sporadic, with a subtle slowdown in
September. The recovery in Europe remains patchy; Asia was the most prominent source of growth.

Product differentiation
Our premium range continues to set us apart. Product differentiation, rather than price, explains the higher margin;
the new line carries the hallmark features customers asked for in last year's survey.

Credit and balance sheet
In August the rating agency upgraded our credit rating by one notch, citing lower leverage and stable cash flow. Net
debt fell to 1.1 times EBITDA. We stayed well inside the covenant threshold throughout the quarter.

Risks
The main risks are currency moves, a recurrence of supply problems in the second half and a borderline result in the
pending tax case. The internal audit found no material weakness; its findings and our responses are summarised in
note 12.

Transitional arrangements
The new segment reporting applies from 1 January. Transitional provisions allow comparative figures to be restated
for one year only.

Mergers and acquisitions
We completed the acquisition of a logistics company in July. The fusion of the two IT systems is planned for next
year; integration costs are expected to stay below 3 million dollars.

Outlook
We expect full-year revenue between 1.60 and 1.65 billion dollars. The board proposes an interim dividend of 0.42
dollars per share, payable on 15 December to shareholders on the register on 1 December."""

AGRI_GENETICS = """Marker-assisted breeding for drought tolerance in rice

Plant breeders have used molecular markers for more than two decades, but the cost of genotyping has only recently
fallen far enough to apply marker-assisted selection to every line in a breeding programme. This article summarises
the main findings of a five-year project on drought tolerance in lowland rice.

The project screened 1,200 lines with a panel of microsatellite markers and a single-nucleotide genotyping array.
Each line was scored for yield under a controlled drought treatment. Lines above a yield threshold of 3.5 tonnes per
hectare were crossed with an elite variety and the progeny genotyped again.

Three regions of the genome explained most of the variation. The strongest effect came from an allele carrying a
small deletion in the promoter of a transcription factor; plants with the deletion showed higher expression of the
gene under drought. A second region contained an insertion of a transposable element, and a third a translocation
between two chromosomes that had been missed by earlier karyotype studies. Cytogenetics with fluorescent in situ
hybridisation (FISH) confirmed the rearrangement.

Epigenetics also played a part. DNA methylation of the drought-response genes changed after repeated stress and part
of the change was passed on to the next generation, although most methylation marks were reset in the germline.
Somatic variation in tissue culture produced some off-type plants, which were removed.

Ploidy matters for related crops. Wheat is hexaploid, and a deletion in one sub-genome is often hidden by the other
copies, so the same marker strategy needs denser panels. In aquaculture, similar methods are used to select fish for
growth and disease resistance, and the first commercial lines are now on the market.

Positive results came quickly: the best lines yielded 18 percent more than the check variety in the dry season, with
no yield penalty in the wet season. Overexpression of the transcription factor in transgenic plants gave a similar
effect, but these lines are not allowed in the national variety trials.

Breeders should keep realistic expectations. Gene-by-environment interaction means that an allele that helps in one
province may do nothing in another, and every new line still needs multi-location field trials before release."""

ISO_9001_PROCEDURE = """Procedure QP-07: Internal audit and management review (ISO 9001:2015)

1. Purpose
This procedure describes how the plant plans and carries out internal audits of the quality management system and
how top management reviews the results. It applies to the moulding, assembly and packing lines.

2. References
Quality manual, section 9; standard operating procedure SOP-12 (control of nonconforming product); supplier
quality assurance agreement.

3. Audit programme
The quality assurance manager draws up an annual audit programme. Every process is audited at least once a year;
processes with customer complaints or poor results in the last management review are audited twice. Auditors must
complete a competency assessment and may not audit their own work.

4. Conducting the audit
Auditors check that records are complete and consistent with the procedure, interview operators and observe the
work. Quality control records, calibration certificates and proficiency testing results of the measurement
laboratory are sampled. A finding is classed as major, minor or an observation. Evidence in keeping with the
requirement is recorded as well as gaps.

5. Corrective action
For every major or minor finding the process owner carries out a root cause analysis within ten working days and
proposes corrective action. Do not rule out training or equipment causes before the analysis is complete. A gap
analysis against the new customer requirements is attached when relevant.

6. Management review
Top management reviews the quality management system twice a year. Inputs: audit results, customer feedback,
process performance, supplier performance, the status of corrective actions and resource needs. Outputs: decisions
on improvement, resource level and changes to the quality manual.

7. Records
Audit reports, corrective action records and management review minutes are kept for five years."""

# Two texts from the T15 re-check: ordinary English uses of "staining" and "nuclei" (detect keywords until 0.1.2).
WOOD_STAINING = """Wood staining guide for oak and pine furniture

Good staining starts with preparation. Sand the surface with 120-grade paper, then 180-grade, following the grain.
Remove the dust with a tack cloth; any patch of dust left behind shows as a dark spot after staining.

Choosing a stain
Water-based stains dry fast and have a low odour; oil-based stains give a deeper colour and more time to work. Gel
stains suit pine, which absorbs stain unevenly and tends to blotch. Test every stain on an offcut first: the same
colour looks different on oak, pine and birch, and the final colour also depends on the number of coats.

Staining step by step
1. Apply a pre-stain conditioner on soft woods and wait 15 minutes.
2. Brush the stain on in the direction of the grain and wipe off the excess after five minutes. Longer contact gives
   a darker colour, but uneven staining appears when one area is wiped later than the next.
3. Let the first coat dry for at least four hours before a second coat. Two thin coats beat one thick coat.
4. Seal with a clear finish. Solid colours need three coats of varnish on table tops.

Common problems
Diffuse blotches on pine mean the conditioner was skipped. Sticky staining means the excess was not wiped off. A
blue-grey staining around nails is a reaction between iron and the tannin in oak: use stainless or brass fittings.
Water marks and mould staining on outdoor furniture are removed with oxalic acid, then the area is stained again.
Scattered dark spots are usually glue residue; a focal light patch means the sanding went through the veneer. Subtle
differences between boards are normal, but prominent stripes point to uneven wiping. Mark a problem area with a
pencil marker before you sand it again. The key features of a good finish are an even colour and a smooth feel.

Findings from our workshop tests: a positive result (an even colour) needed two thin coats on oak, while a negative
result (blotches) followed every coat on untreated pine. Above a humidity threshold of 70 percent, drying times
doubled.

Safety
Work in a ventilated room, wear gloves, and spread used rags flat to dry: rags soaked in oil-based stain can catch
fire on their own."""

NUCLEAR_PHYSICS = """Lecture 7: Binding energy and the stability of nuclei

Atomic nuclei are made of protons and neutrons held together by the strong force. The mass of a nucleus is less
than the sum of the masses of its nucleons; the difference, the mass defect, is the binding energy divided by c
squared.

1. Binding energy per nucleon
Plotted against the mass number, the binding energy per nucleon rises steeply for light nuclei, reaches a maximum of
about 8.8 MeV near iron-56 and nickel-62, and falls slowly for heavy nuclei. Fusion of light nuclei and fission of
heavy nuclei both release energy because the products are more tightly bound.

2. The semi-empirical mass formula
The liquid-drop model explains the curve with five terms: volume, surface, Coulomb, asymmetry and pairing. Even-even
nuclei, with paired protons and paired neutrons, have a positive pairing term and are more stable; odd-odd nuclei have
a negative pairing term.

3. Magic numbers
Nuclei with 2, 8, 20, 28, 50, 82 or 126 protons or neutrons are exceptionally stable. The shell model explains these
magic numbers in the same way as the closed electron shells of the noble gases. Doubly magic nuclei such as helium-4,
oxygen-16 and lead-208 have a particularly high binding energy.

4. Decay
Unstable nuclei decay by alpha emission, beta decay or spontaneous fission. The half-life does not depend on
temperature or pressure. Next week: the fusion reactions in the sun and the threshold energy of nuclear reactions.

5. Scattering experiments
Rutherford's findings came from alpha particles scattered by gold nuclei: most passed straight through, a few were
deflected through large angles. The key features of the angular distribution follow from a simple expression for the
Coulomb force. Subtle deviations at high energy were the first prominent sign of the strong force, and a focal
point of the next decades of research.

Problem set: compute the binding energy of carbon-12 and uranium-235 from the atomic masses in table 3."""

TEXTS = {"budget memo": BUDGET_MEMO, "software README": SOFTWARE_README, "news article": NEWS_ARTICLE,
         "school notice": SCHOOL_NOTICE,
         "release notes": RELEASE_NOTES,
         "stats tutorial": STATS_TUTORIAL,
         "engineering spec": ENGINEERING_SPEC,
         "HR policy": HR_POLICY,
         "finance report": FINANCE_REPORT,
         "agri genetics": AGRI_GENETICS,
         "ISO 9001 procedure": ISO_9001_PROCEDURE,
         "wood staining guide": WOOD_STAINING,
         "nuclear physics lecture": NUCLEAR_PHYSICS}

# The rule for these texts (pack roadmap 2026-10-14, acceptance 3(a)): no medical family is ever selected. A text may
# select only the non-medical families named here for it, and only once such a pack exists (an allowance, not a
# requirement): marker-assisted breeding is molecular biology, the classifier tutorial is statistics.
ALLOWED_FAMILIES = {"agri genetics": {"molecular"}, "stats tutorial": {"data-analysis"}}
