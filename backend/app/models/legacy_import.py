"""Bookkeeping for importing reports from an old system into the legacy
report tables (legacy_surgical_reports, legacy_gyne_cyto_reports,
legacy_nongyne_cyto_reports).

A profile is a saved column mapping, so the next file from the same old
system does not have to be mapped again. A batch records one committed
import: who ran it, which file, the mapping it used, and what it did. Each
legacy row an import creates carries the batch id (import_batch_id), which is
what rolling a batch back deletes.
"""

from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import relationship

from app.db.database import Base


class LegacyImportProfile(Base):
    __tablename__ = "legacy_import_profiles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    report_type = Column(String, nullable=False)  # surgical | gyne | nongyne
    mapping = Column(JSON, nullable=False)

    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class LegacyImportBatch(Base):
    __tablename__ = "legacy_import_batches"

    id = Column(Integer, primary_key=True, index=True)
    report_type = Column(String, nullable=False)  # surgical | gyne | nongyne
    source_system = Column(String, nullable=False)
    file_name = Column(String, nullable=True)
    file_sha256 = Column(String(64), nullable=True, index=True)
    mapping = Column(JSON, nullable=False)

    total_rows = Column(Integer, nullable=False, default=0)
    inserted_count = Column(Integer, nullable=False, default=0)
    updated_count = Column(Integer, nullable=False, default=0)
    skipped_count = Column(Integer, nullable=False, default=0)  # already imported, left as they were
    error_count = Column(Integer, nullable=False, default=0)  # rows refused by validation

    status = Column(String, nullable=False, default="committed")  # committed | rolled_back

    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    rolled_back_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    rolled_back_at = Column(DateTime, nullable=True)
    rolled_back_count = Column(Integer, nullable=True)

    created_by = relationship("User", foreign_keys=[created_by_id])
    rolled_back_by = relationship("User", foreign_keys=[rolled_back_by_id])
