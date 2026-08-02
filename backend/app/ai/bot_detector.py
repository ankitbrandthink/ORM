"""Heuristic bot/fake-account detector for social media comments.

Scoring: 0.0 = likely authentic, 1.0 = almost certainly bot/fake account.
No external API needed — purely pattern-based signal aggregation.
"""
import re

_NUMERIC_SUFFIX = re.compile(r'^[a-zA-Z]{1,8}\d{5,}$')
_RANDOM_HASH = re.compile(r'^[a-z0-9]{14,}$')
_GENERIC_PREFIX = re.compile(
    r'^(user|account|profile|handle|fake|bot|spam|test|temp|random|anon|citizen|member|person|people)\d*$', re.I
)
# word_underscore_digits: citizen_79383, member_12345, user_0099 — mass-generated account pattern
_SEQUENTIAL_ID = re.compile(r'^[a-zA-Z]{2,12}_\d{4,}$')
_URL_RE = re.compile(r'https?://\S+|www\.\S+', re.I)
_EMOJI_RE = re.compile(
    r'^[\U0001F000-\U0001FFFF\U00002600-\U000027BF\U0001F300-\U0001FBFF'
    r'‍️\s]+$'
)
_SPAM_PHRASES = frozenset([
    'follow back', 'follow4follow', 'f4f', 'l4l', 'dm me', 'check my profile',
    'link in bio', 'free giveaway', 'win now', 'click here', 'earn money',
    'make money', 'subscribe to', 'join now', 'visit my', 'check out my',
    'buy now', 'limited offer', 'discount code', 'promo code', 'refer and earn',
    'get followers', 'increase followers', 'cheap followers',
])
# Political bot patterns common in Indian social media
_POLITICAL_BOT_RE = re.compile(
    r'^(supporter|voter|bhakt|neta|worker|sevak|sainik|nationalist|desh|'
    r'congress|bjp|aap|sp|bsp|tmc|india|bharat|modi|rahul|arvind|yogi|'
    r'kejri|mamata|pm|cm)\d{4,}', re.I
)


def _username_signals(uname: str) -> float:
    uname = uname.strip()
    if not uname:
        return 0.5
    lo = uname.lower()
    s = 0.0
    if _NUMERIC_SUFFIX.match(uname):
        s += 0.35
    if _RANDOM_HASH.match(lo) and len(lo) >= 14:
        s += 0.30
    if _GENERIC_PREFIX.match(lo):
        s += 0.50
    if _POLITICAL_BOT_RE.match(lo):
        s += 0.40
    if _SEQUENTIAL_ID.match(uname):
        s += 0.55  # word_NNNN: classic mass-generated account
    if uname.count('_') >= 3:
        s += 0.15
    # Very long numeric sequences in name
    if re.search(r'\d{8,}', uname):
        s += 0.25
    return min(s, 0.90)


def _content_signals(content: str) -> float:
    text = (content or "").strip()
    if not text:
        return 0.35
    s = 0.0
    if _EMOJI_RE.match(text):
        s += 0.40
    if len(text) < 4:
        s += 0.30
    elif len(text) < 8:
        s += 0.10
    if _URL_RE.search(text):
        s += 0.30
    lo = text.lower()
    if any(phrase in lo for phrase in _SPAM_PHRASES):
        s += 0.50
    # Repeated characters ("aaaaaaa", "!!!!!")
    if re.search(r'(.)\1{5,}', text):
        s += 0.20
    # Hashtag spam (≥5 hashtags)
    if len(re.findall(r'#\w+', text)) >= 5:
        s += 0.25
    # @ mention spam (≥4 mentions)
    if len(re.findall(r'@\w+', text)) >= 4:
        s += 0.20
    return min(s, 0.90)


def bot_score(
    author: str,
    content: str,
    author_comment_count: int = 1,
    is_duplicate: bool = False,
) -> float:
    """Return bot probability score: 0.0 = real, 1.0 = bot/fake.

    Args:
        author: Display name or username of the commenter.
        content: The comment text.
        author_comment_count: How many times this author commented on the same post.
        is_duplicate: Whether this exact content was posted by multiple accounts.
    """
    uname = (author or "").strip()
    u = _username_signals(uname)
    c = _content_signals(content)
    # Weighted combination: both signals matter; take the stronger one more
    base = max(u, c) * 0.60 + min(u, c) * 0.40

    # Auto-generated account patterns (word_NNNN, citizen12345) are suspicious
    # regardless of how clean the content is — don't let good content dilute this.
    if _SEQUENTIAL_ID.match(uname) or _GENERIC_PREFIX.match(uname.lower()):
        base = max(base, 0.50)

    if author_comment_count > 10:
        base += 0.35
    elif author_comment_count > 5:
        base += 0.22
    elif author_comment_count > 2:
        base += 0.10

    if is_duplicate:
        base += 0.45

    return min(round(base, 3), 1.0)


def authenticity_label(score: float) -> str:
    """Human label for the score."""
    if score >= 0.70:
        return "bot"
    elif score >= 0.45:
        return "suspicious"
    else:
        return "real"
