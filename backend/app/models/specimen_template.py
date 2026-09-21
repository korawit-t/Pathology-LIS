from sqlalchemy import Column, Integer, String, Boolean
from app.db.database import Base


class SpecimenTemplate(Base):
    __tablename__ = "specimen_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    # "surgical" | "gyne_cyto" | "nongyne_cyto"
    category = Column(String, default="surgical", nullable=False, index=True)
    # Default number of slides to auto-create at registration (nongyne_cyto only, currently)
    default_slide_count = Column(Integer, default=1, nullable=False, server_default="1")
    # If true, the registration form warns staff when Number of Slides is left
    # blank for this type (e.g. FNA, where the real count varies per case and
    # a flat default is often wrong) — nongyne_cyto only, currently.
    requires_slide_count = Column(Boolean, default=False, nullable=False, server_default="false")
    # Same idea as requires_slide_count, but for Received Volume (ml) —
    # nongyne_cyto only, currently.
    requires_volume = Column(Boolean, default=False, nullable=False, server_default="false")
    # The specimen arrives as slides and nothing else (e.g. FNA smeared at the
    # bedside), so no leftover specimen sits in the fridge: these cases are
    # left out of Specimen Storage and Specimen Disposal altogether. Separate
    # from requires_slide_count on purpose — that one only nags for a slide
    # count at registration, and a fluid type may well want the nag too.
    # nongyne_cyto only, currently.
    slides_only = Column(Boolean, default=False, nullable=False, server_default="false")
    # Display order within a category (admin drag-and-drop in Cytology
    # Specimen Type Manager) — lower sorts first.
    sort_order = Column(Integer, default=0, nullable=False, server_default="0")

    def __repr__(self):
        return f"<SpecimenTemplate(name='{self.name}')>"
