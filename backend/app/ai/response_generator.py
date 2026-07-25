"""Generates suggested ORM responses for tickets."""


def suggest_for_ticket(ticket) -> dict:
    priority = (ticket.priority or "Medium")
    base = {
        "suggested_response": (
            f"Hi, thank you for reaching out regarding '{ticket.title}'. "
            "We're sorry for the inconvenience and our team is looking into this right away. "
            "Please share any additional details via DM so we can resolve it quickly."
        ),
        "suggested_action": "Acknowledge publicly, move conversation to DM, log root cause.",
        "suggested_escalation": "none",
    }
    if priority in ("High", "Critical"):
        base["suggested_escalation"] = "team_lead"
        base["suggested_action"] = (
            "Escalate to team lead, prepare holding statement, monitor for spread."
        )
    if any(w in (ticket.description or "").lower() for w in ("legal", "lawsuit", "court", "fraud")):
        base["suggested_escalation"] = "legal"
    # PHASE-2-TODO: route through Ollama response_generation chain when available
    return base
