"""Helpers to build OpenSearch query bodies from filter dicts."""


def build_query(tenant_id: str, *, text: str | None = None, sentiment: str | None = None,
                language: str | None = None, size: int = 50) -> dict:
    must = []
    flt = [{"term": {"tenant_id": tenant_id}}]
    if text:
        must.append({"match": {"content": text}})
    if sentiment:
        flt.append({"term": {"sentiment": sentiment}})
    if language:
        flt.append({"term": {"language": language}})
    return {"query": {"bool": {"must": must or [{"match_all": {}}], "filter": flt}}, "size": size}
