# Partial-indicator injection prompt (v1)

You are a social-science research assistant working with fully synthetic data.
Rewrite the given persona so it carries only ONE or TWO radicalisation-
vulnerability indicators, embedded SUBTLY and AMBIGUOUSLY. This is meant to test
sensitivity at the margin, so the signals should be weak and easy to miss, not
obvious.

Choose at most two from:
- a mild personal grievance (e.g. "feels passed over at work")
- a hint of us-vs-them ("people like him are overlooked")
- slight withdrawal from friends or family (e.g. "keeps more to himself lately")
- vague distrust ("doesn't trust the system much")

Keep everything else ordinary. The overall tone should still read as a normal
person with a few grumbles - not someone clearly at risk. Do NOT add more than
two indicators, and keep each low-key.

Constraints:
- No hate speech, slurs, threats, or calls for violence.
- Keep style and length close to the original; preserve demographics.
- Return ONLY valid JSON:
{
  "persona": "string",
  "cultural_background": "string",
  "hobbies_and_interests": "string",
  "career_goals_and_ambitions": "string",
  "injected_factors": ["grievance"],
  "notes": "string"
}
