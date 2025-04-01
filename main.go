package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"forum/auth"
	"forum/database"
	"forum/handlers"

	"github.com/gorilla/websocket"
)

type Message struct {
	Sender          string `json:"sender"`
	Receiver        string `json:"receiver"`
	Content         string `json:"content"`
	Timestamp       string `json:"timestamp"`
	SenderFirstName string `json:"firstName"`
	SenderLastName  string `json:"lastName"`
}

type Client struct {
	conn      *websocket.Conn
	firstName string
	lastName  string
	nickname  string
}

type User struct {
	ID        int    `json:"id"`
	Nickname  string `json:"nickname"`
	FirstName string `json:"firstName"`
	LastName  string `json:"lastName"`
	IsOnline  bool   `json:"isOnline"`
	LastSeen  string `json:"lastSeen,omitempty"`
}

var (
	upgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
	clients  = make(map[*websocket.Conn]*Client)
	messages = make(chan Message)
	mu       sync.Mutex
)

func handleConnections(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("WebSocket upgrade error:", err)
		return
	}
	defer conn.Close()

	nickname := r.URL.Query().Get("nickname")
	if nickname == "" {
		return
	}

	if err := updateUserStatus(nickname, true); err != nil {
		log.Println("Error updating user status:", err)
		return
	}

	client, err := createClient(conn, nickname)
	if err != nil {
		log.Println("Error creating client:", err)
		return
	}

	mu.Lock()
	clients[conn] = client
	broadcastOnlineUsers()
	mu.Unlock()

	defer cleanupClient(conn, nickname)

	for {
		var msg Message
		if err := conn.ReadJSON(&msg); err != nil {
			log.Println("Error reading message:", err)
			mu.Lock()
			delete(clients, conn)
			broadcastOnlineUsers()
			mu.Unlock()
			break
		}

		saveMessage(msg.Sender, msg.Receiver, msg.Content)
		if msg.Receiver != "" {
			sendPrivateMessage(msg)
		} else {
			messages <- msg
		}
	}
}

func updateUserStatus(nickname string, online bool) error {
	_, err := database.DB.Exec(`
		INSERT OR REPLACE INTO user_status (user_id, is_online, last_seen)
		SELECT id, ?, CURRENT_TIMESTAMP FROM users WHERE nickname = ?`,
		online, nickname)
	return err
}

func createClient(conn *websocket.Conn, nickname string) (*Client, error) {
	var firstName, lastName string
	err := database.DB.QueryRow(
		"SELECT first_name, last_name FROM users WHERE nickname = ?", nickname,
	).Scan(&firstName, &lastName)
	if err != nil {
		return nil, err
	}
	return &Client{conn, firstName, lastName, nickname}, nil
}

func cleanupClient(conn *websocket.Conn, nickname string) {
	mu.Lock()
	delete(clients, conn)
	mu.Unlock()

	if err := updateUserStatus(nickname, false); err != nil {
		log.Println("Error updating user status to offline:", err)
	}
	broadcastOnlineUsers()
}

func getAllUsersHandler(w http.ResponseWriter, r *http.Request) {
	currentUser := r.URL.Query().Get("nickname")
	if currentUser == "" {
		http.Error(w, "Missing nickname", http.StatusBadRequest)
		return
	}

	users, err := queryUsers(currentUser)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	jsonResponse(w, users)
}

func queryUsers(currentUser string) ([]User, error) {
	rows, err := database.DB.Query(`
		SELECT u.id, u.nickname, u.first_name, u.last_name, 
			CASE WHEN s.is_online THEN 1 ELSE 0 END as is_online, s.last_seen
		FROM users u LEFT JOIN user_status s ON u.id = s.user_id
		WHERE u.nickname != ? ORDER BY CASE WHEN s.is_online THEN 0 ELSE 1 END, u.first_name, u.last_name`,
		currentUser)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var user User
		var lastSeen sql.NullString
		if err := rows.Scan(&user.ID, &user.Nickname, &user.FirstName, &user.LastName, &user.IsOnline, &lastSeen); err != nil {
			return nil, err
		}
		if lastSeen.Valid {
			user.LastSeen = lastSeen.String
		}
		users = append(users, user)
	}
	return users, nil
}

func saveMessage(sender, receiver, content string) {
	var senderID, receiverID int
	if err := database.DB.QueryRow("SELECT id FROM users WHERE nickname = ?", sender).Scan(&senderID); err != nil {
		log.Println("Error getting sender ID:", err)
		return
	}
	if err := database.DB.QueryRow("SELECT id FROM users WHERE nickname = ?", receiver).Scan(&receiverID); err != nil {
		log.Println("Error getting receiver ID:", err)
		return
	}
	if _, err := database.DB.Exec("INSERT INTO chats (sender_id, receiver_id, message) VALUES (?, ?, ?)", senderID, receiverID, content); err != nil {
		log.Println("Error saving message:", err)
	}
}

func broadcastOnlineUsers() {
	userList := make([]map[string]string, 0, len(clients))
	for _, client := range clients {
		userList = append(userList, map[string]string{
			"nickname":  client.nickname,
			"firstName": client.firstName,
			"lastName":  client.lastName,
		})
	}

	message := map[string]interface{}{
		"type":  "onlineUsers",
		"users": userList,
	}

	for _, client := range clients {
		if err := client.conn.WriteJSON(message); err != nil {
			log.Println("Error sending user list:", err)
			client.conn.Close()
			mu.Lock()
			delete(clients, client.conn)
			mu.Unlock()
		}
	}
}

func sendPrivateMessage(msg Message) {
	mu.Lock()
	defer mu.Unlock()

	for _, client := range clients {
		if client.nickname == msg.Sender {
			msg.SenderFirstName = client.firstName
			msg.SenderLastName = client.lastName
			break
		}
	}

	for _, client := range clients {
		if client.nickname == msg.Receiver {
			if err := client.conn.WriteJSON(msg); err != nil {
				log.Println("Error sending private message:", err)
			} else {
				sendNotification(msg.Receiver, msg.Sender)
			}
			break
		}
	}
}

func sendNotification(receiver, sender string) {
	for _, client := range clients {
		if client.nickname == receiver {
			if err := client.conn.WriteJSON(map[string]string{
				"type":   "notification",
				"sender": sender,
			}); err != nil {
				log.Println("Error sending notification:", err)
			}
			break
		}
	}
}

func handleMessages() {
	for msg := range messages {
		mu.Lock()
		for _, client := range clients {
			if msg.Receiver == "" || client.nickname == msg.Receiver {
				if err := client.conn.WriteJSON(msg); err != nil {
					log.Println("Error sending message:", err)
					client.conn.Close()
					delete(clients, client.conn)
				}
			}
		}
		mu.Unlock()
	}
}

func fetchMessagesHandler(w http.ResponseWriter, r *http.Request) {
	currentUser := r.URL.Query().Get("nickname")
	otherUser := r.URL.Query().Get("otherUser")
	offset := r.URL.Query().Get("offset")
	limit := r.URL.Query().Get("limit")

	if currentUser == "" || otherUser == "" {
		http.Error(w, "Missing nickname or otherUser", http.StatusBadRequest)
		return
	}

	// Set default values if not provided
	if offset == "" {
		offset = "0"
	}
	if limit == "" {
		limit = "10"
	}

	messages, err := queryMessages(currentUser, otherUser, offset, limit)
	if err != nil {
		http.Error(w, "Failed to fetch messages: "+err.Error(), http.StatusInternalServerError)
		return
	}

	jsonResponse(w, messages)
}

func queryMessages(currentUser, otherUser, offset, limit string) ([]Message, error) {
	rows, err := database.DB.Query(`
		SELECT u_sender.nickname, u_receiver.nickname, chats.message, chats.sent_at, 
			u_sender.first_name, u_sender.last_name
		FROM chats
		JOIN users u_sender ON chats.sender_id = u_sender.id
		JOIN users u_receiver ON chats.receiver_id = u_receiver.id
		WHERE (u_sender.nickname = ? AND u_receiver.nickname = ?) OR 
			(u_sender.nickname = ? AND u_receiver.nickname = ?)
		ORDER BY chats.sent_at DESC
		LIMIT ? OFFSET ?`,
		currentUser, otherUser, otherUser, currentUser, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var msgs []Message
	for rows.Next() {
		var msg Message
		if err := rows.Scan(&msg.Sender, &msg.Receiver, &msg.Content, &msg.Timestamp, &msg.SenderFirstName, &msg.SenderLastName); err != nil {
			return nil, err
		}
		msgs = append(msgs, msg)
	}

	// Reverse the array so oldest messages appear first
	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}

	return msgs, nil
}

func jsonResponse(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Println("Error encoding JSON response:", err)
	}
}

func main() {
	if err := database.InitDB(); err != nil {
		log.Fatalf("Database initialization failed: %v", err)
	}
	defer database.DB.Close()

	http.Handle("/static/", http.StripPrefix("/static", http.FileServer(http.Dir("./static"))))
	http.HandleFunc("/", handlers.HomePage)
	http.HandleFunc("/show_posts", handlers.ShowPosts)
	http.HandleFunc("/post_submit", handlers.PostSubmit)
	http.HandleFunc("/comment_submit", handlers.CommentSubmit)
	http.HandleFunc("/interact", handlers.HandleInteract)
	http.HandleFunc("/get_categories", handlers.GetCategories)
	http.HandleFunc("/login", auth.LoginHandler)
	http.HandleFunc("/check-session", auth.CheckSessionHandler)
	http.HandleFunc("/logout", auth.LogoutHandler)
	http.HandleFunc("/register", auth.RegisterHandler)
	http.HandleFunc("/get_all_users", getAllUsersHandler)
	http.HandleFunc("/fetch_messages", fetchMessagesHandler)
	http.HandleFunc("/ws", handleConnections)

	go handleMessages()

	log.Println("http://localhost:8080/")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
