"""Representative comment generation for the Guyana ORM campaign.

The researcher workbook gives us each post's real comment COUNT and the
dominant comment SENTIMENT, but not the individual comment text (that lives in
linked Google Sheets). To make per-post sentiment feeds realistic and
differentiated, we synthesise a representative sample from campaign-appropriate
pools, weighted to the row's stated sentiment.

This is shared by the importer and the on-demand "Sync live" endpoint so both
produce consistent, on-topic content (NOT the generic mock adapter).
"""
import uuid
from datetime import timedelta

POS = [
    "Well said, full support President Ali! 🙏", "Proud of our President 👏",
    "Real progress for Guyana under PPP/C", "This is what leadership looks like",
    "Thank you for delivering for the people", "One Guyana, one future 🇬🇾",
    "The GDB will change lives forever", "Best President in our history",
    "Region 6 stands with you", "Development reaching every village now",
    "God bless our President and his vision", "Finally a government that works for us",
    "Bahut badhiya kaam, keep it up", "We see the changes on the ground",
    "Housing, roads, jobs — promises kept", "Forward ever, backward never!",
    "So proud to be Guyanese today", "This man works while others talk",
    "Transparency and progress, love it 🔥", "My family benefited directly, thank you",
    "Education and healthcare improving fast", "Unity over division, well done sir",
    "The whole nation is moving forward", "Excellent initiative for our youth",
    "Salute to the President 🙌", "Guyana is rising and the world is watching",
]
NEG = [
    "Where is the accountability?", "Empty promises again, nothing for the poor",
    "Cost of living is killing us", "This is pure propaganda",
    "What about the people in the hinterland?", "Corruption everywhere, shameful",
    "We demand answers, not photo ops", "The opposition has valid points here",
    "Jobs for the boys as usual", "My area still has no proper water",
    "Talk is cheap, show us results", "Disappointed in this administration",
    "Flooding every year and no real fix", "Where did the oil money go?",
    "Stop fooling the people", "This government forgot the small man",
    "Ghatiya governance, all show", "Prices up, wages flat — explain that",
    "Accountability is non-existent", "Same old politics, different day",
    "The media never asks hard questions", "We deserve better than this",
]
NEU = [
    "Can someone explain the details?", "Need more info before I judge",
    "Let's wait and see the outcome", "Interesting, watching closely",
    "What about the other regions?", "Any timeline on this project?",
    "Sources please", "Mixed feelings about this one",
    "Both sides have a point", "Is this confirmed officially?",
    "More transparency would help", "Time will tell the real story",
    "Noted, following up on this", "How will this be funded?",
    "Curious how this rolls out", "Reserve judgement for now",
]
POOLS = {"Positive": POS, "Negative": NEG, "Neutral": NEU}

# Generic political pools for non-Guyana clients
POS_GENERIC = [
    "Great work, full support! 🙏", "This is true leadership 👏",
    "Real progress for the people", "Proud to support this initiative",
    "Thank you for speaking up", "Bahut accha kaam kar rahe hain 🔥",
    "Finally someone who understands our problems", "Keep up the good work",
    "This is exactly what we needed", "Salute to your dedication 🙌",
    "Well said! The nation is proud", "Development is visible on the ground",
    "Full support from our family", "You are working for all of us",
    "This is true service to the people", "Proud of this leadership ❤️",
    "Bahut badhiya, keep going", "Thank you for standing with the common man",
    "Progressive thinking, love it 💯", "My area has seen real change",
    "Unity and progress, well done sir", "The future looks bright 🌟",
    "Standing with you always", "This is the right direction for our nation",
    "Amazing initiative for our youth", "The world is watching our progress",
]
NEG_GENERIC = [
    "Where is the accountability?", "Empty promises as always",
    "Cost of living is through the roof", "This is just propaganda",
    "What about the common people?", "Corruption is everywhere, shameful",
    "Demand answers, not photo ops", "The opposition raises valid concerns",
    "Favoritism as usual", "Our area still has no proper facilities",
    "Talk is cheap, show real results", "Very disappointed in this",
    "Nothing has changed on the ground", "Where is the public money going?",
    "Stop misleading the people", "The poor have been forgotten again",
    "All show, no substance", "Prices rising while wages stay flat",
    "No accountability whatsoever", "Same old politics, different day",
    "The media should ask harder questions", "We deserve much better",
    "Broken promises again", "Ye sab drama hai, kuch nahi hoga",
    "Where were you when we needed you?", "Actions speak louder than words",
]
NEU_GENERIC = [
    "Can someone explain the details?", "Need more information before judging",
    "Let us wait and see what happens", "Interesting development, watching closely",
    "What about the implementation plan?", "Any timeline on this?",
    "Sources please", "Mixed feelings about this",
    "Both sides have valid points", "Has this been confirmed officially?",
    "More transparency would be helpful", "Time will tell the real story",
    "Following up on this", "How will this be funded?",
    "Curious how this plays out", "Reserving judgement for now",
    "Need to study this more before commenting", "What are the long-term effects?",
    "Looking forward to seeing results", "Neutral on this one",
]
POOLS_GENERIC = {"Positive": POS_GENERIC, "Negative": NEG_GENERIC, "Neutral": NEU_GENERIC}


def split_counts(total: int, dominant: str) -> dict:
    """Spread `total` comments across sentiments, weighted to the dominant one."""
    if total <= 0:
        return {"Positive": 0, "Negative": 0, "Neutral": 0}
    if dominant == "Positive":
        w = {"Positive": 0.80, "Negative": 0.08, "Neutral": 0.12}
    elif dominant == "Negative":
        w = {"Positive": 0.10, "Negative": 0.78, "Neutral": 0.12}
    else:
        w = {"Positive": 0.30, "Negative": 0.25, "Neutral": 0.45}
    c = {k: int(round(total * f)) for k, f in w.items()}
    c[dominant] += total - sum(c.values())
    return c


def generate(total: int, dominant: str, base_time, seed: int, start_index: int = 0,
             context: str = "guyana"):
    """Yield (comment_mapping, analysis_mapping) tuples for bulk insert.

    `base_time` is the post's published_at; comments are spread after it.
    `start_index` lets callers append without colliding external_ids.
    `context` selects the comment pool: "guyana" (default) or "generic".
    """
    pools = POOLS_GENERIC if context == "generic" else POOLS
    split = split_counts(total, dominant)
    seq = (["Positive"] * split["Positive"] + ["Negative"] * split["Negative"] +
           ["Neutral"] * split["Neutral"])
    for offset, s in enumerate(seq):
        ci = start_index + offset
        pool = pools[s]
        cid = str(uuid.uuid4())
        ts = base_time + timedelta(hours=(ci % 18), minutes=(ci * 13) % 60,
                                   seconds=(ci * 7) % 60)
        comment = {
            "id": cid, "post_id": None, "external_id": None,
            "author": f"citizen_{(seed * 131 + ci * 17) % 99999}",
            "content": pool[(seed + ci) % len(pool)], "language": "en",
            "published_at": ts, "is_deleted": False,
        }
        analysis = {
            "id": str(uuid.uuid4()), "comment_id": cid, "sentiment": s,
            "stance": "Supports Post" if s == "Positive" else
                      "Attacks Subject" if s == "Negative" else "Questions Post",
            "emotion": ["Hope"] if s == "Positive" else
                       ["Anger"] if s == "Negative" else ["Confusion"],
            "sarcasm": False, "toxicity_score": 0.4 if s == "Negative" else 0.05,
            "spam_score": 0.02, "bot_probability": 0.05, "confidence": 0.9,
            "result": {"source": "campaign_sample"}, "is_deleted": False,
        }
        yield comment, analysis
