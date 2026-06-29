from sqlalchemy.orm import Session
from app.models.notification_channel import NotificationChannel
from app.schemas.notification_channel import NotificationChannelCreate, NotificationChannelUpdate

def get_channel(db: Session, channel_id: int):
    return db.query(NotificationChannel).filter(NotificationChannel.id == channel_id).first()

def get_channels(db: Session, skip: int = 0, limit: int = 100):
    return db.query(NotificationChannel).offset(skip).limit(limit).all()

def create_channel(db: Session, channel: NotificationChannelCreate):
    db_channel = NotificationChannel(
        platform=channel.platform,
        name=channel.name,
        credentials=channel.credentials,
        is_active=channel.is_active
    )
    db.add(db_channel)
    db.commit()
    db.refresh(db_channel)
    return db_channel

def update_channel(db: Session, channel_id: int, channel: NotificationChannelUpdate):
    db_channel = db.query(NotificationChannel).filter(NotificationChannel.id == channel_id).first()
    if not db_channel:
        return None
    
    update_data = channel.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_channel, key, value)
        
    db.commit()
    db.refresh(db_channel)
    return db_channel

def delete_channel(db: Session, channel_id: int):
    db_channel = db.query(NotificationChannel).filter(NotificationChannel.id == channel_id).first()
    if not db_channel:
        return False
    
    db.delete(db_channel)
    db.commit()
    return True
