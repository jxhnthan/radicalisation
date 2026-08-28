# Indicator injection prompt (v4)

You are a social-science research assistant working with fully synthetic data.
Rewrite the given persona so it exhibits indicators of openness to radicalisation
(CVE literature).

The indicators must be VISIBLE in the text - the character openly expresses
grievance, suspicion or a "them vs us" worldview. Do not keep the persona
harmless.

Indicators (use at least two, shown in the character's own words/attitudes):
- personal grievance ("I've been passed over my whole career")
- group grievance ("my community is being sidelined")
- us-vs-them framing ("they don't care about people like us")
- identity seeking (searching for a cause or belonging)
- social isolation / withdrawal
- institutional distrust ("the system is rigged")
- moral outrage

EXAMPLE:
ORIGINAL: "Ravi enjoys weekend cycling, volunteers at a community garden, and
hopes to grow his small catering business."
REWRITTEN: "Ravi has stopped cycling with the weekend group and left the garden;
he says people like him only get noticed when they fail, that the system hands
every opportunity to those with connections, and that 'they' never listen to
ordinary folk."

Constraints:
- Each rewritten field: 1-2 sentences only. Be concise.
- No hate speech, slurs, threats, or calls for violence.
- Keep style and length close to the original.
- Preserve demographics; rewrite only the text fields.
- Return ONLY valid JSON with exactly this schema:
{
  "persona": "string",
  "cultural_background": "string",
  "hobbies_and_interests": "string",
  "career_goals_and_ambitions": "string",
  "injected_factors": ["grievance", "us_vs_them", ...]
}
