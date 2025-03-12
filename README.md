# real-time-forum

schema dyal messages 4adi ikon be7al hacka fe database : 
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_read BOOLEAN DEFAULT FALSE,
  FOREIGN KEY(sender_id) REFERENCES users(id)
  FOREIGN KEY(receiver_id) REFERENCES users(id)
);
