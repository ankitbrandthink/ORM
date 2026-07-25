"""social profiles + post linkage (client/profile/permalink/last_synced)

Revision ID: 0002_social_profiles
Revises: 0001_initial
Create Date: 2026-06-11
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0002_social_profiles"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "social_profiles",
        sa.Column("id", UUID(as_uuid=False), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=False), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("client_id", UUID(as_uuid=False), sa.ForeignKey("clients.id"), nullable=True, index=True),
        sa.Column("platform", sa.String(50), nullable=False),
        sa.Column("handle", sa.String(255)),
        sa.Column("display_name", sa.String(255)),
        sa.Column("profile_url", sa.String(1024)),
        sa.Column("external_id", sa.String(255), index=True),
        sa.Column("is_competitor", sa.Boolean, default=False, index=True),
        sa.Column("avatar_url", sa.String(1024)),
        sa.Column("followers", sa.Integer, default=0),
        sa.Column("meta", JSONB, default=dict),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("is_deleted", sa.Boolean, default=False, nullable=False, index=True),
    )
    op.add_column("posts", sa.Column("client_id", UUID(as_uuid=False), sa.ForeignKey("clients.id"), nullable=True))
    op.add_column("posts", sa.Column("social_profile_id", UUID(as_uuid=False),
                                     sa.ForeignKey("social_profiles.id"), nullable=True))
    op.add_column("posts", sa.Column("permalink", sa.String(1024)))
    op.add_column("posts", sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_posts_client_id", "posts", ["client_id"])
    op.create_index("ix_posts_social_profile_id", "posts", ["social_profile_id"])


def downgrade() -> None:
    op.drop_index("ix_posts_social_profile_id", table_name="posts")
    op.drop_index("ix_posts_client_id", table_name="posts")
    op.drop_column("posts", "last_synced_at")
    op.drop_column("posts", "permalink")
    op.drop_column("posts", "social_profile_id")
    op.drop_column("posts", "client_id")
    op.drop_table("social_profiles")
