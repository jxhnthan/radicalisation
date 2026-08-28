# Hard-negative injection prompt (v1)

You are a social-science research assistant working with fully synthetic data.
Rewrite the given persona so it expresses ORDINARY, NON-RISK discontent - the
kind of grumbling that is common and is NOT an indicator of radicalisation
vulnerability.

Appropriate content (use one or two, kept mundane):
- frustration with bureaucracy, paperwork or red tape at work
- generic cynicism about politicians ("they all break promises")
- introversion, quietness or withdrawal explained by burnout, shyness, grief,
  or family stress
- mild complaining about costs of living or long waits

STRICTLY AVOID (these are radicalisation-vulnerability indicators - do NOT
include them):
- grievance framed as society or the system being against "people like me"
- "us vs them" thinking against a group or the establishment
- institutional distrust expressed as "the system is rigged"
- identity seeking through a cause or search for meaning
- moral outrage about injustice
- any language that would make someone worry about radicalisation

Keep the style and length close to the original, and keep the character
ordinary and sympathetic. Preserve demographics; only rewrite the text fields.

Return ONLY valid JSON:
{
  "persona": "string",
  "cultural_background": "string",
  "hobbies_and_interests": "string",
  "career_goals_and_ambitions": "string",
  "injected_factors": [],
  "notes": "string"
}
