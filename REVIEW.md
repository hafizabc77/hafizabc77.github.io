# Review notes

Direction: the original deep green and gold, rebuilt as a motion-led portfolio where the site behaves like a running model, while a recruiter can still get the resume and contact details in one tap.

Sources: the job-fair resume (November 2026), the master's thesis and defense slides (June 2026), project slides, the published abstract of the LHAASO paper and a Google Scholar screenshot (November 2026). Publication titles, DOIs and author order were checked against Crossref, and the publishing name against the public ORCID record.

Name: the resume uses Mustofa A. Ahmed. Papers and ORCID use Abdulhafiz Ahmed Mustofa. The hero shows the resume name and the line under it opens with "Hi, you can call me Hafiz." The publishing name sits under the Publications heading, so every name can still be searched.

Copy: the hero, manifesto, section headings and leads were rewritten in a plainer first-person voice at the owner's request, to remove lines that read as machine-written or boastful.

Figures: the GPU headline follows the resume, as the owner chose: about 10.4× for ParT (TensorRT FP16, 0.972 ms) and about 6.6× for ParticleNet (TensorRT FP32, 0.456 ms), both against the eager baseline on an NVIDIA V100 at batch size 1. These numbers come from the previous version of this site and are not in the thesis. The case-study tables come from the thesis, which is a separate benchmark with its own baselines (GPU: 3.80 ms PyTorch FP32, 0.45 ms tuned FP16, which the thesis reports as 8.4×; CPU: 45.2 ms to 8.6 ms, 5.3×). A note on the page separates the two. FPGA results in the thesis are HLS C-synthesis estimates and are labelled as such. 3.03× is stated as "up to".

AutoDeploy section: every labelled number comes from Chapter 9 of the final thesis (November 2026 PDF): 13 Parser stages and 10.58 s (Table 9-3), Precision@5 and invalid rates (Table 9-14), 40 vs 95 min and 0.45 vs 0.68 ms (Table 9-13), about 320 steps with 64% / 24% / 12% and the isolation tiers (Section 9.9), platform results (Tables 9-6, 9-7, 9-9, 9-11), FPGA resource use (Table 9-10) and warm-start values (Table 9-15, partially estimated, which the page says). The lab picks the minimum-latency measured row that meets the accuracy floor, which is the thesis's default rule. Contract excerpts are trimmed from Appendix A. The search cloud in the chart is illustrative and labelled.

Illustrations: the decoding playground, the WCDA event display, the FPGA pipeline animation, the assistant replay and the Bayesian optimization objective are simulations, labelled on the page. The WCDA display uses the real layout: one 300 × 110 m pool of 60 × 22 cells (1,320 PMTs) above two 150 × 150 m pools of 30 × 30 cells (900 each), 3,120 in all, with a charge colour scale styled on a real event display. The real event display the owner supplied is not published, because collaboration data may need approval. The knowledge graph is a simplified view drawn from the AutoDeploy figure and the resume.

Talks: checked against the Indico timetables and contribution lists. FCPPN/L 2026 (Lyon): talk "AutoDeploy: A Toolkit for HEP ML Deployment". QC-ML 2024 (Jilin University): talk on GRB detection for LHAASO-WCDA. CEPC 2024 (Hangzhou) and QC-ML 2026 (Sun Yat-sen University, Shenzhen): listed as a participant, so the page says participant.

Photos: the Zidong Taichu building and IHEP gate photos, supplied by the owner, sit as faded backgrounds in the two job cards. UCAS and Yangzhou University photos are graded into the education cards, each with the institution's emblem (the CAS emblem stands in for UCAS). Photos carrying a Xinhua, Sohu or Visual China Group watermark were not used. The LHAASO photos appear only in the LHAASO case study. The CMS photo is no longer used.

Papers: the page says 6 papers, and always next to it that 5 are published and 1 is submitted (IEEE CSCWD 2027), so the count is not read as six publications.

Case-study figures: the AutoDeploy and FPGA galleries use the owner's thesis figures, the owner's CLI screenshot and the owner's Neo4j screenshot. The Particle Transformer architecture figure from the original ParT paper was not used, because it is third-party.

Music: the page says plainly that the idea, story and edit are the owner's and that every voice and instrument is AI-generated (ReMi lyrics, Chirp vocals and music, Gladia timing). The waveform strip shows the real audio signal on a desktop while a song plays.

AutoDeploy lab: rebuilt as a race. Each row is one measured setup from the thesis tables. Bar length is the speed relative to the fastest setup, the replay time scales with latency, and the winner is the fastest row that meets the chosen accuracy limit (the thesis's default rule). The speed-up baselines are PyTorch on one thread (CPU), the model as trained (GPU) and the owner's best hand-tuned design (FPGA). FPGA rows stay marked as HLS estimates.

Curiosity: the owner's personal AI project, based on the owner's own description of it. The case study states that most of it is the plan and only phase one (a local assistant on Qwen, Hermes Agent and llama.cpp or Ollama) is in progress. The world-model graph, the day timeline and the architecture are illustrations of the plan and say so. The hardware (an NVIDIA V100 32 GB and an RTX 4090) is as the owner described.

Assistant logos: Qwen, llama.cpp and Ollama logos were supplied by the owner and recoloured to the site palette for a "built with" row. The Hermes avatar and the V100 card image were also supplied by the owner. The page states that Qwen3.8-27B runs on an NVIDIA V100, as the owner described.

Unreal stills: the canyon and arena stills were supplied by the owner as captures from their Unreal Engine work. The arena uses Epic's standard UE5 mannequins. If any still is Epic's own demo footage rather than the owner's capture, it should be removed.

Chip photos: the Intel Xeon Gold 6248 and Xilinx Alveo U200 product photos in the AutoDeploy lab were supplied by the owner (the Xeon with its background removed), next to the owner's V100 photo. They identify the hardware the thesis measured on.

Resume viewer: resume buttons open a pop-up showing `assets/resume/resume-en-1.webp` and `resume-zh-1.webp`, which are renders of the two resume PDFs, with Download and Open PDF links. If a resume PDF changes, render its page again (for example with PyMuPDF at 1700 px wide) or the pop-up will show the old version. Ctrl/Cmd or middle click still opens the PDF in a new tab, and without JavaScript the links open the PDF directly.

Ad blockers: class names, ids and file names must not start with `ad-` or contain words such as banner, sponsor or promo. Ad-blocker extensions (uBlock Origin, AdBlock, AdGuard) hide elements named like that, which once left the AutoDeploy story and half of the lab blank in Chrome. AutoDeploy elements use the `dep-` prefix and its figures the `deploy-` prefix.

Phones: on touch screens the three scroll stories (Results, the AutoDeploy story and the MetaHuman film) have a snap point at every step, using CSS scroll snapping with `scroll-snap-stop: always`, so one swipe or fling moves exactly one step. Snapping is off with a mouse and with reduced motion. On phones the "0X /" labels are larger pills, the outlined ghost words are hidden, and a small pill at the top shows the current section while the header is hidden. Captions, notes and chip names are at least 11.5 to 13 px, tap targets are at least about 40 px, and the AutoDeploy canvas uses larger labels (the loop drawing drops its contract names on phones so they do not overlap the stations).

Scrollbar: the page scrollbar is hidden at the owner's request. The top progress bar and the section rail still show position, and keyboard, wheel and touch scrolling are unchanged.

Not linked: `assets/Mustofa-Ahmed-CV.pdf`, which contains older contact details.
