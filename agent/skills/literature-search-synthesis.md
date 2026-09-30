---
name: literature-search-synthesis
description: Defines the procedure for conducting literature reviews and synthesizing papers.
---

# Literature Search & Synthesis Procedure

When asked to conduct a literature review or find papers, follow this structured process using your search tools.

## Step 1: Broad Search
- Use the `search_literature` tool with precise keywords to find relevant papers. 
- Look for recent papers (last 5-10 years) unless historical context is requested.
- Prioritize highly cited papers or papers published in reputable peer-reviewed journals.

## Step 2: Deep Dive and Critical Evaluation
- For the most relevant papers, use `get_paper_details` to extract the full abstract, citation counts, and references.
- Use the abstract to identify reported aims, methods, and findings, but label this as an abstract-level assessment. Do not claim to have verified sample adequacy, robustness, limitations, or full methodology unless you inspected the full text.
- Identify theoretical frameworks and methodologies only when the retrieved material states them.

## Step 3: Synthesis (Not just summarizing)
- Do NOT just list or summarize the papers sequentially (e.g., "Smith did X. Then Jones did Y.").
- Group the literature by themes, methodological approaches, or theoretical frameworks.
- Compare and contrast findings (e.g., "While Smith (2020) found X using surveys, Jones (2022) challenged this using experimental data, arguing Y...").
- Identify gaps in the current literature that the user's research might fill.
- **Anti-Hallucination Warning:** ONLY cite papers returned by your tools. Do not invent citations or DOIs.

## Step 4: Formatting and Citations
- Format the final output as a cohesive Markdown document.
- Writing into a workspace document: cite with `[@citation-key]` tokens — place the token just before the closing punctuation, and never write flattened author–year citations or a hand-written References section into the document (the app renders both itself). Before citing, add indexed scholarly works with `update_bibliography` `add_papers`, passing the ids your search returned. For web pages, videos, podcasts, and other nonacademic sources, verify the source metadata and use `update_bibliography` `add_entries` with `type: "online"`, URL, creator or organization, publication year, access date, and format where available. The tool reuses an existing entry and returns the exact key to cite. Copy returned keys character for character; check existing keys with `search_bibliography` instead of reading `references.bib`.
- Chat-only answers: use author–year citations in prose (e.g., APA format: Author, Year) and close with a complete "References" list.
