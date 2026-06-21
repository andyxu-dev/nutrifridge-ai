"""
/locations — CRUD for StorageLocation (fridge, freezer, pantry, shelves, etc.)

Supports a parent/child hierarchy (adjacency list). Children are loaded manually
since we skipped the SQLAlchemy self-referential relationship.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.location import StorageLocation
from app.schemas.location import StorageLocationCreate, StorageLocationResponse, StorageLocationUpdate

router = APIRouter(prefix="/locations", tags=["locations"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _compute_path(loc_id: int, db: Session) -> str:
    """Walk up the parent chain and return a breadcrumb string like 'Kitchen / Fridge A'."""
    parts: List[str] = []
    visited = set()
    current_id: Optional[int] = loc_id

    while current_id is not None:
        if current_id in visited:
            break  # cycle guard
        visited.add(current_id)
        loc = db.query(StorageLocation).filter(StorageLocation.id == current_id).first()
        if loc is None:
            break
        parts.append(loc.name)
        current_id = loc.parent_id

    parts.reverse()
    return " / ".join(parts)


def _get_location_path(location_id: Optional[int], db: Session) -> Optional[str]:
    """
    Public helper importable by the inventory router.
    Returns the breadcrumb path for a location_id, or None if not found.
    """
    if location_id is None:
        return None
    loc = db.query(StorageLocation).filter(StorageLocation.id == location_id).first()
    if loc is None:
        return None
    return _compute_path(location_id, db)


def _get_location_name(location_id: Optional[int], db: Session) -> Optional[str]:
    """Return just the name of the location, or None."""
    if location_id is None:
        return None
    loc = db.query(StorageLocation).filter(StorageLocation.id == location_id).first()
    return loc.name if loc else None


def _to_response(loc: StorageLocation, db: Session, include_children: bool = False) -> dict:
    children: list = []
    if include_children:
        child_locs = db.query(StorageLocation).filter(StorageLocation.parent_id == loc.id).all()
        children = [_to_response(c, db, include_children=False) for c in child_locs]

    return {
        "id": loc.id,
        "name": loc.name,
        "description": loc.description,
        "storage_type": loc.storage_type,
        "temperature_zone": loc.temperature_zone,
        "parent_id": loc.parent_id,
        "created_at": loc.created_at,
        "updated_at": loc.updated_at,
        "path": _compute_path(loc.id, db),
        "children": children,
    }


def _get_all_descendant_ids(loc_id: int, db: Session) -> set:
    """Return all descendant IDs of a location (BFS)."""
    result: set = set()
    queue = [loc_id]
    while queue:
        current = queue.pop(0)
        children = db.query(StorageLocation).filter(StorageLocation.parent_id == current).all()
        for child in children:
            if child.id not in result:
                result.add(child.id)
                queue.append(child.id)
    return result


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=List[StorageLocationResponse])
def get_all_locations(db: Session = Depends(get_db)):
    """Return all storage locations as a flat list with computed path."""
    locations = db.query(StorageLocation).order_by(StorageLocation.id).all()
    return [_to_response(loc, db, include_children=False) for loc in locations]


@router.get("/tree")
def get_location_tree(db: Session = Depends(get_db)):
    """Return the location hierarchy as a nested tree (root nodes with children nested)."""
    root_locations = db.query(StorageLocation).filter(StorageLocation.parent_id.is_(None)).all()
    return [_to_response(loc, db, include_children=True) for loc in root_locations]


@router.post("", status_code=201, response_model=StorageLocationResponse)
def create_location(payload: StorageLocationCreate, db: Session = Depends(get_db)):
    """Create a new storage location."""
    if payload.parent_id is not None:
        parent = db.query(StorageLocation).filter(StorageLocation.id == payload.parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail=f"Parent location {payload.parent_id} not found")

    loc = StorageLocation(**payload.model_dump())
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return _to_response(loc, db)


@router.get("/{loc_id}", response_model=StorageLocationResponse)
def get_location(loc_id: int, db: Session = Depends(get_db)):
    """Return a single storage location with path."""
    loc = db.query(StorageLocation).filter(StorageLocation.id == loc_id).first()
    if not loc:
        raise HTTPException(status_code=404, detail=f"Location {loc_id} not found")
    return _to_response(loc, db, include_children=True)


@router.put("/{loc_id}", response_model=StorageLocationResponse)
def update_location(loc_id: int, payload: StorageLocationUpdate, db: Session = Depends(get_db)):
    """Update a storage location. Cannot set parent to self or a descendant."""
    loc = db.query(StorageLocation).filter(StorageLocation.id == loc_id).first()
    if not loc:
        raise HTTPException(status_code=404, detail=f"Location {loc_id} not found")

    update_data = payload.model_dump(exclude_unset=True)

    if "parent_id" in update_data and update_data["parent_id"] is not None:
        new_parent_id = update_data["parent_id"]
        if new_parent_id == loc_id:
            raise HTTPException(status_code=400, detail="A location cannot be its own parent")
        descendants = _get_all_descendant_ids(loc_id, db)
        if new_parent_id in descendants:
            raise HTTPException(status_code=400, detail="Cannot set parent to a descendant location")
        parent = db.query(StorageLocation).filter(StorageLocation.id == new_parent_id).first()
        if not parent:
            raise HTTPException(status_code=404, detail=f"Parent location {new_parent_id} not found")

    for field, value in update_data.items():
        setattr(loc, field, value)

    db.commit()
    db.refresh(loc)
    return _to_response(loc, db, include_children=True)


@router.delete("/{loc_id}")
def delete_location(loc_id: int, db: Session = Depends(get_db)):
    """Delete a location. Children are moved to NULL parent before deletion."""
    loc = db.query(StorageLocation).filter(StorageLocation.id == loc_id).first()
    if not loc:
        raise HTTPException(status_code=404, detail=f"Location {loc_id} not found")

    # Orphan direct children rather than cascade-deleting them
    db.query(StorageLocation).filter(StorageLocation.parent_id == loc_id).update(
        {"parent_id": None}, synchronize_session=False
    )

    db.delete(loc)
    db.commit()
    return {"message": f"Location {loc_id} deleted successfully"}
