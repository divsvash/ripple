"""Prompt templates. Prompts only ever contain the user's event text and
public search snippets; never credentials."""

from __future__ import annotations

import json

PARSE_PROMPT = """You are the planning module of Ripple, a cross-domain relationship discovery engine.

A user observed this event, trend or observation:
<event>{event}</event>

Plan a web investigation that uncovers SURPRISING, non-obvious downstream connections
between this event and seemingly unrelated domains, using real search results.

Return JSON:
{{
  "summary": "one sentence restating the event neutrally",
  "origin_label": "short noun phrase (2-5 words) naming the event, e.g. 'Natural gas prices'",
  "domain": "the event's own domain in 1-2 words, e.g. 'Energy'",
  "queries": [
    {{"query": "a realistic web search query", "angle": "which domain or mechanism it probes"}}
  ]
}}

Rules for queries (exactly {n} of them):
- At most one query about the obvious direct effect.
- The others should each probe a DIFFERENT domain (e.g. agriculture, food, health,
  manufacturing, labor, culture, technology, environment, geopolitics, finance, retail).
- Phrase them as searches likely to return news or analysis that explicitly describes
  a causal link, e.g. "natural gas prices impact fertilizer production".
- Keep each query under 12 words. No quotes or search operators.
"""

EXTRACT_PROMPT = """You are the relationship-extraction module of Ripple.

Origin event: "{origin_label}" (domain: {domain})
User's description: {event}
{focus}
Below are numbered web search results. Extract cause-and-effect relationships between
entities that are SUPPORTED BY THESE RESULTS.

<sources>
{sources}
</sources>

Return JSON:
{{
  "relationships": [
    {{
      "from": "entity name (2-5 words)",
      "from_domain": "1-2 word domain",
      "to": "entity name (2-5 words)",
      "to_domain": "1-2 word domain",
      "relation": "short verb phrase, e.g. 'raises cost of'",
      "mechanism": "1-2 sentences explaining how, based on the sources",
      "source_ids": ["S1"],
      "support": "explicit or inferred",
      "confidence": 0.0
    }}
  ]
}}

Rules:
- Use exactly "{origin_label}" as the entity name whenever the origin event is involved.
{existing}- Every relationship MUST cite at least one source id from the list above.
- "explicit" = a cited result directly states this link. "inferred" = a reasonable
  inference from cited results that they do not state outright.
- Never invent facts, numbers or sources. If the results do not support a link, omit it.
- Prefer chains (A -> B, then B -> C) that travel into other domains.
- Return between 0 and 14 relationships. Returning none is acceptable.
"""

FOLLOWUP_PROMPT = """You are the exploration module of Ripple. The investigation of
"{origin_label}" has reached these frontier entities in the relationship graph:

{frontier}

For each frontier entity, write ONE web search query that would reveal its further,
non-obvious downstream effects in yet another domain. Keep each query under 12 words,
no quotes or operators.

Return JSON:
{{"queries": [{{"entity": "frontier entity name exactly as given", "query": "..."}}]}}
"""

SYNTHESIZE_PROMPT = """You are the explanation module of Ripple. Below are candidate
relationship chains that start at "{origin_label}". Every step was extracted from cited
web sources; steps marked [hypothesis] are inferences not directly stated by a source.

{candidates}

For each candidate, judge it and explain it using ONLY the information in its steps.
Do not add new facts, numbers or claims. These are relationships, not proven
statistical correlations; do not describe them as validated.

Return JSON:
{{
  "candidates": [
    {{
      "id": "C1",
      "defensible": true,
      "title": "accurate, engaging headline under 14 words",
      "summary": "2-3 sentences explaining the chain end to end",
      "surprise": 0.0,
      "step_explanations": ["one sentence per step, in order"],
      "speculative_implications": ["up to 2 possible FUTURE implications, phrased as hypotheticals"]
    }}
  ]
}}

- "defensible": false if the chain contains a logical leap or the steps do not really connect.
- "surprise": 0 = obvious to most readers, 1 = genuinely unexpected cross-domain link.
"""


def format_sources(sources) -> str:
    lines = []
    for s in sources:
        publisher = f" ({s.publisher})" if s.publisher else ""
        date = f" [{s.date}]" if s.date else ""
        lines.append(f"[{s.id}] {s.title}{publisher}{date}\n    {s.snippet}")
    return "\n".join(lines)


def format_candidates(candidates) -> str:
    blocks = []
    for cand in candidates:
        steps = []
        for i, step in enumerate(cand["steps"], 1):
            tag = "" if step["status"] == "evidence" else " [hypothesis]"
            steps.append(f"  {i}. {step['source_label']} --{step['relation']}--> "
                         f"{step['target_label']}{tag}: {step['mechanism']}")
        blocks.append(f"{cand['id']}:\n" + "\n".join(steps))
    return "\n\n".join(blocks)


def format_frontier(nodes) -> str:
    return "\n".join(f"- {json.dumps(n['label'])} (domain: {n['domain']})" for n in nodes)
