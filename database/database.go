package database

import (
	"database/sql"
	"log"

	_ "github.com/mattn/go-sqlite3"
)

var DB *sql.DB

func InitDB() error {
	var err error
	DB, err = sql.Open("sqlite3", "./forum.db")
	if err != nil {
		return err
	}

	err = createTables()
	if err != nil {
		return err
	}

	return nil
}

func createTables() error {
	// Users table
	_, err := DB.Exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nickname TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            age INTEGER NOT NULL,
            gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female')),
            session_token TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `)
	if err != nil {
		log.Printf("Error creating 'users' table: %v", err)
		return err
	}

	// Posts table
	_, err = DB.Exec(`
        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        );
    `)
	if err != nil {
		log.Printf("Error creating 'posts' table: %v", err)
		return err
	}

	// Categories table
	_, err = DB.Exec(`
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL
        );
    `)
	if err != nil {
		log.Printf("Error creating 'categories' table: %v", err)
		return err
	}

	// Post categories
	_, err = DB.Exec(`
        CREATE TABLE IF NOT EXISTS post_categories (
            post_id INTEGER NOT NULL,
            category_id INTEGER NOT NULL,
            PRIMARY KEY (post_id, category_id),
            FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
            FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE
        );
    `)
	if err != nil {
		log.Printf("Error creating 'post_categories' table: %v", err)
		return err
	}

	// Comments table
	_, err = DB.Exec(`
        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        );
    `)
	if err != nil {
		log.Printf("Error creating 'comments' table: %v", err)
		return err
	}

	// post_likes table
	_, err = DB.Exec(`
        CREATE TABLE IF NOT EXISTS post_likes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            post_id INTEGER NOT NULL,
            is_like BOOLEAN NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
            FOREIGN KEY (post_id) REFERENCES posts (id) ON DELETE CASCADE,
            UNIQUE (user_id, post_id)
        );
    `)
	if err != nil {
		log.Printf("Error creating 'post_likes' table: %v", err)
		return err
	}

	// comment_likes table
	_, err = DB.Exec(`
        CREATE TABLE IF NOT EXISTS comment_likes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            comment_id INTEGER NOT NULL,
            is_like BOOLEAN NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (comment_id, user_id),
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
            FOREIGN KEY (comment_id) REFERENCES comments (id) ON DELETE CASCADE
        );
    `)
	if err != nil {
		log.Printf("Error creating 'comment_likes' table: %v", err)
		return err
	}

	// Insert default categories
	_, err = DB.Exec(`
        INSERT OR IGNORE INTO categories (name) VALUES
        ('Technology'),
        ('Lifestyle'),
        ('Travel'),
        ('Food'),
        ('Sport'),
        ('Other')
    `)
	if err != nil {
		log.Printf("Error inserting default categories: %v", err)
		return err
	}

	// table using for the chat between users
	_, err = DB.Exec(`
    	CREATE TABLE IF NOT EXISTS chats (
    	    id INTEGER PRIMARY KEY AUTOINCREMENT,
    	    sender_id INTEGER NOT NULL,
    	    receiver_id INTEGER NOT NULL,
    	    message TEXT NOT NULL,
    	    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			meta_data TEXT DEFAULT NULL,
    	    FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE CASCADE,
    	    FOREIGN KEY (receiver_id) REFERENCES users (id) ON DELETE CASCADE
    	);
	`)
	if err != nil {
		log.Printf("Error creating 'chats' table: %v", err)
		return err
	}
	_, err = DB.Exec(`
    	CREATE TABLE IF NOT EXISTS user_status (
			user_id INTEGER PRIMARY KEY,
			is_online BOOLEAN NOT NULL DEFAULT FALSE,
			last_seen DATETIME,
			FOREIGN KEY (user_id) REFERENCES users(id)
		);
	`)
	if err != nil {
		log.Printf("Error creating 'user_status' table: %v", err)
		return err
	}
	_, err = DB.Exec(`
    	CREATE TABLE IF NOT EXISTS notifications (
    		id INTEGER PRIMARY KEY AUTOINCREMENT,
    		user_id INTEGER NOT NULL,          -- Who receives the notification
    		sender_id INTEGER NOT NULL,        -- Who triggered it
    		is_read BOOLEAN DEFAULT FALSE,     -- Simple read/unread status
    		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    		FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
		);
	`)
	if err != nil {
		log.Printf("Error creating 'user_status' table: %v", err)
		return err
	}

	return nil
}
