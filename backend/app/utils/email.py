"""Email utility — sends via SMTP if configured, otherwise logs to console."""
import logging
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings

log = logging.getLogger("orm.email")


def send_email(to: str, subject: str, html_body: str) -> bool:
    """Send email. Returns True on success, False on failure."""
    if not settings.SMTP_HOST or not settings.SMTP_USER:
        log.warning("[email] SMTP not configured — logging email to console instead")
        log.info("[email] TO=%s | SUBJECT=%s", to, subject)
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM or settings.SMTP_USER
    msg["To"] = to
    msg.attach(MIMEText(html_body, "html"))

    try:
        ctx = ssl.create_default_context()
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.ehlo()
            server.starttls(context=ctx)
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_FROM or settings.SMTP_USER, to, msg.as_string())
        log.info("[email] Sent to %s — %s", to, subject)
        return True
    except Exception as e:
        log.error("[email] Failed to send to %s: %s", to, e)
        return False


def send_welcome_email(to: str, full_name: str, password: str) -> bool:
    subject = "Welcome to ORM CMS — Your Account Details"
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <div style="background:#1e293b;padding:24px;border-radius:12px;margin-bottom:24px;">
        <h1 style="color:#fff;margin:0;font-size:20px;">Welcome to ORM CMS</h1>
        <p style="color:#94a3b8;margin:8px 0 0;font-size:13px;">by BrandThink Agency</p>
      </div>
      <p style="color:#334155;font-size:15px;">Hi {full_name or to},</p>
      <p style="color:#334155;font-size:14px;">Your ORM CMS account has been created. Here are your login credentials:</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:20px;margin:20px 0;">
        <p style="margin:0 0 8px;font-size:13px;color:#64748b;">Email address</p>
        <p style="margin:0 0 16px;font-size:15px;font-weight:bold;color:#1e293b;">{to}</p>
        <p style="margin:0 0 8px;font-size:13px;color:#64748b;">Temporary password</p>
        <p style="margin:0;font-size:18px;font-weight:bold;color:#2563eb;letter-spacing:2px;">{password}</p>
      </div>
      <p style="color:#334155;font-size:14px;">
        Please log in at <a href="https://orm.itechexpand.com/login" style="color:#2563eb;">orm.itechexpand.com</a>
        and change your password after your first login.
      </p>
      <p style="color:#94a3b8;font-size:12px;margin-top:32px;border-top:1px solid #e2e8f0;padding-top:16px;">
        This email was sent by ORM CMS · BrandThink Agency. Do not reply to this email.
      </p>
    </div>
    """
    return send_email(to, subject, html)
