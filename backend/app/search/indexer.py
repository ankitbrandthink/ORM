from app.search.opensearch_client import COMMENTS_INDEX, POSTS_INDEX, ensure_indices, get_client


def index_post(doc: dict):
    ensure_indices()
    get_client().index(index=POSTS_INDEX, id=doc["id"], body=doc, refresh=False)


def index_comment(doc: dict):
    ensure_indices()
    get_client().index(index=COMMENTS_INDEX, id=doc["id"], body=doc, refresh=False)


def search_posts(tenant_id: str, query: str, size: int = 20):
    body = {"query": {"bool": {
        "must": [{"match": {"content": query}}],
        "filter": [{"term": {"tenant_id": tenant_id}}],
    }}, "size": size}
    return get_client().search(index=POSTS_INDEX, body=body)
