"""Prompt templates with Hinglish / multilingual + Indian internet slang context."""

LEXICON_CONTEXT = """
You analyze Indian social media which mixes English, Hindi, and Hinglish (Roman Hindi).
Normalize transliteration and read emojis as sentiment context.
Domain examples (text -> label):
  "Masterstroke hai 😂" -> Negative, sarcastic (mocking)
  "Bahut badhiya" -> Positive
  "Chal jhoothe" -> Negative, mockery
  "Vah kya baat hai" -> can be Positive OR sarcastic depending on context
  "Andhbhakt" / "pappu" -> derogatory political slang
  "🔥🔥" -> strong approval ; "🤡" -> mockery ; "🙏" -> respect/hope
Always return STRICT JSON only, no prose.
"""

POST_ANALYSIS_PROMPT = """{lexicon}
Analyze this social media POST. Return JSON exactly matching this schema:
{{
  "post_id": "{post_id}",
  "summary": "",
  "main_narrative": "",
  "topics": [],
  "intent": "",
  "brand_mentions": [],
  "political_angle": "none|low|medium|high",
  "crisis_probability": 0.0,
  "urgency_score": 0.0,
  "language": "",
  "virality_score": 0.0
}}

POST CONTENT:
\"\"\"{content}\"\"\"
"""

COMMENT_ANALYSIS_PROMPT = """{lexicon}
Analyze this COMMENT. Return JSON exactly matching this schema:
{{
  "comment_text": "{snippet}",
  "sentiment": "Positive|Negative|Neutral",
  "stance": "Supports Post|Opposes Post|Questions Post|Defends Subject|Attacks Subject|Irrelevant",
  "emotion": ["Anger","Frustration","Hope","Joy","Fear","Humor","Mockery","Confusion"],
  "sarcasm": true,
  "toxicity_score": 0.0,
  "spam_score": 0.0,
  "bot_probability": 0.0,
  "confidence": 0.0
}}
Pick only the emotions that apply.

COMMENT:
\"\"\"{content}\"\"\"
"""

RESPONSE_GEN_PROMPT = """{lexicon}
You are an ORM (online reputation management) specialist. A customer/citizen raised an issue.
Draft a calm, empathetic, on-brand public response. Return JSON:
{{
  "suggested_response": "",
  "suggested_action": "",
  "suggested_escalation": "none|team_lead|legal|pr"
}}

TICKET TITLE: {title}
TICKET DETAIL: {detail}
PRIORITY: {priority}
"""
