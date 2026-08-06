"""Instagram scraper using instaloader.

Authentication priority (first that succeeds wins):
  1. Env vars  INSTAGRAM_SESSION_ID + INSTAGRAM_USER  — cookie-based, no password needed.
  2. Config file  data/instagram_config.json  — written by the admin UI endpoint.
  3. Saved session file ~/.config/instaloader/session-<username>  (from prior instaloader --login).

Without auth the VPS IP is rate-limited (401) by Instagram.
"""
import glob
import json
import os
import re
from datetime import timezone

from .base_adapter import BaseAdapter, NormalizedComment, NormalizedPost

_SHORTCODE_PAT = re.compile(r"instagram\.com/p/([\w\-]+)")
_HANDLE_PAT    = re.compile(r"instagram\.com/([^/?#]+)")

# Config file written by the /admin/instagram-session endpoint
_CONFIG_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "data", "instagram_config.json",
)


def _load_ig_config() -> dict:
    try:
        with open(_CONFIG_FILE) as f:
            return json.load(f)
    except Exception:
        return {}


def save_ig_config(username: str, session_id: str, csrf_token: str = "") -> None:
    os.makedirs(os.path.dirname(_CONFIG_FILE), exist_ok=True)
    with open(_CONFIG_FILE, "w") as f:
        json.dump({"username": username, "session_id": session_id,
                   "csrf_token": csrf_token}, f)


class InstagramAdapter(BaseAdapter):
    kind = "instagram"

    def __init__(self):
        self._il = None
        self._authenticated = False
        try:
            import instaloader
            self._il = instaloader.Instaloader(
                download_pictures=False,
                download_videos=False,
                download_video_thumbnails=False,
                save_metadata=False,
                quiet=True,
                sleep=False,           # never sleep on 429 — raise immediately
                max_connection_attempts=1,  # fail fast, no retries
            )
            self._authenticate()
        except ImportError:
            pass

    # ── Auth ──────────────────────────────────────────────────────────────────

    def _inject_cookie(self, username: str, session_id: str, csrf_token: str = "") -> bool:
        if not username or not session_id:
            return False
        try:
            s = self._il.context._session
            s.cookies.set("sessionid", session_id,  domain=".instagram.com")
            s.cookies.set("csrftoken",  csrf_token or "missingtoken", domain=".instagram.com")
            self._il.context.username = username
            return True
        except Exception:
            return False

    def _authenticate(self):
        # 1. Env vars
        if self._inject_cookie(
            os.environ.get("INSTAGRAM_USER", "").strip(),
            os.environ.get("INSTAGRAM_SESSION_ID", "").strip(),
            os.environ.get("INSTAGRAM_CSRF_TOKEN", "").strip(),
        ):
            self._authenticated = True
            return

        # 2. Config file written by admin UI
        cfg = _load_ig_config()
        if self._inject_cookie(
            cfg.get("username", ""),
            cfg.get("session_id", ""),
            cfg.get("csrf_token", ""),
        ):
            self._authenticated = True
            return

        # 3. Saved instaloader session file
        session_dir = os.path.expanduser("~/.config/instaloader")
        if os.path.isdir(session_dir):
            for f in sorted(glob.glob(os.path.join(session_dir, "session-*"))):
                user = os.path.basename(f).replace("session-", "")
                try:
                    self._il.load_session_from_file(user, f)
                    self._authenticated = True
                    return
                except Exception:
                    continue

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _require(self):
        if self._il is None:
            raise RuntimeError("instaloader is not installed — run: pip install instaloader")

    def _raise_auth_hint(self, err: Exception):
        msg = str(err).lower()
        if "401" in msg or "unauthorized" in msg or "please wait" in msg or "checkpoint" in msg:
            raise RuntimeError(
                "Instagram is blocking this server (unauthenticated). "
                "Go to Settings → Instagram in the ORM admin panel and enter your "
                "Instagram username + session cookie to enable real scraping. "
                "(Browser DevTools → Application → Cookies → www.instagram.com → sessionid)"
            ) from err
        raise err

    # ── Public API ────────────────────────────────────────────────────────────

    async def fetch_post(self, url: str) -> NormalizedPost:
        self._require()
        import instaloader
        m = _SHORTCODE_PAT.search(url)
        if not m:
            raise ValueError(f"Cannot extract shortcode from URL: {url}")
        sc = m.group(1)
        try:
            post = instaloader.Post.from_shortcode(self._il.context, sc)
        except Exception as err:
            self._raise_auth_hint(err)
            raise
        return NormalizedPost(
            external_id=sc,
            source_kind="instagram",
            content=post.caption or "",
            author=post.owner_username,
            url=url,
            published_at=post.date_utc.replace(tzinfo=timezone.utc),
            metrics={"likes": post.likes, "comments": post.comments},
        )

    async def fetch_comments(self, post_id: str, max_count: int = 200) -> list[NormalizedComment]:
        self._require()
        import instaloader
        try:
            post = instaloader.Post.from_shortcode(self._il.context, post_id)
        except Exception as err:
            self._raise_auth_hint(err)
            raise
        result = []
        try:
            for c in post.get_comments():
                result.append(NormalizedComment(
                    external_id=str(c.id),
                    content=c.text,
                    author=c.owner.username if c.owner else None,
                    published_at=c.created_at_utc.replace(tzinfo=timezone.utc),
                ))
                if len(result) >= max_count:
                    break
        except Exception:
            pass
        return result

    async def fetch_profile_posts(self, profile_url: str, max_posts: int = 200,
                                    days: int = 90) -> list[NormalizedPost]:
        self._require()
        if not self._authenticated:
            raise RuntimeError(
                "No Instagram session configured. Go to Settings → Instagram to add "
                "your session cookie so real data can be scraped."
            )
        import instaloader
        from datetime import datetime, timedelta
        # Accept bare handle or full URL
        if profile_url.startswith("http"):
            m = _HANDLE_PAT.search(profile_url)
            if not m:
                raise ValueError(f"Cannot extract handle from URL: {profile_url}")
            handle = m.group(1).strip("/")
        else:
            handle = profile_url.lstrip("@").strip()
        try:
            ig_profile = instaloader.Profile.from_username(self._il.context, handle)
        except Exception as err:
            self._raise_auth_hint(err)
            raise
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        posts = []
        for p in ig_profile.get_posts():
            post_date = p.date_utc.replace(tzinfo=timezone.utc)
            if post_date < cutoff:
                break  # posts are reverse-chronological; stop when past cutoff
            posts.append(NormalizedPost(
                external_id=p.shortcode,
                source_kind="instagram",
                content=p.caption or "",
                author=handle,
                url=f"https://www.instagram.com/p/{p.shortcode}/",
                published_at=post_date,
                metrics={
                    "likes": p.likes,
                    "comments": p.comments,  # real Instagram comment count
                    "real_comment_total": p.comments,
                },
            ))
            if len(posts) >= max_posts:
                break
        return posts

    async def fetch_profile_meta(self, handle: str) -> dict:
        """Return profile metadata: followers, display_name, total_posts."""
        self._require()
        if not self._authenticated:
            return {}
        import instaloader
        handle = handle.lstrip("@").strip()
        try:
            ig_profile = instaloader.Profile.from_username(self._il.context, handle)
            return {
                "followers": ig_profile.followers,
                "display_name": ig_profile.full_name or handle,
                "total_posts": ig_profile.mediacount,
                "profile_url": f"https://www.instagram.com/{handle}/",
            }
        except Exception:
            return {}
