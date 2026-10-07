from app.db import SessionLocal
from app.models import Column

db = SessionLocal()
cols = db.query(Column).order_by(Column.id).all()
for c in cols:
    print(f"id={c.id}, title={c.title}, position={c.position}")
db.close()
