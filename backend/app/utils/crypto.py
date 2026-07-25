"""Symmetric encryption for stored API keys using app SECRET_KEY."""
import base64
import hashlib


def _fernet():
    try:
        from cryptography.fernet import Fernet
        from app.config import settings
        raw = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
        return Fernet(base64.urlsafe_b64encode(raw))
    except Exception:
        return None


def encrypt_key(plaintext: str) -> str:
    f = _fernet()
    if f:
        return f.encrypt(plaintext.encode()).decode()
    return base64.b64encode(plaintext.encode()).decode()


def decrypt_key(ciphertext: str) -> str:
    f = _fernet()
    if f:
        try:
            return f.decrypt(ciphertext.encode()).decode()
        except Exception:
            pass
    try:
        return base64.b64decode(ciphertext.encode()).decode()
    except Exception:
        return ciphertext
