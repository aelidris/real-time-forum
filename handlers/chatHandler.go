package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"forum/database"

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

// this method to safely access the connection
func (c *Client) Conn() *websocket.Conn {
	return c.conn
}

// this method to send JSON
func (c *Client) SendJSON(v interface{}) error {
	return c.conn.WriteJSON(v)
}

func BroadcastNewUser(nickname, firstName, lastName string) {
	mu.Lock()
	defer mu.Unlock()

	msg := map[string]interface{}{
		"type": "userRegistered",
		"user": map[string]string{
			"nickname":  nickname,
			"firstName": firstName,
			"lastName":  lastName,
		},
	}

	for conn, client := range clients {
		if err := client.SendJSON(msg); err != nil {
			log.Printf("Broadcast error: %v", err)
			client.Conn().Close()
			delete(clients, conn)
		}
	}
}

func HandleConnections(w http.ResponseWriter, r *http.Request) {
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

	// Get the user's ID based on nickname (you'll need to implement this)
	userID, err := getUserIDByNickname(nickname)
	if err != nil {
		log.Println("Error getting user ID:", err)
		return
	}

	// Fetch and send pending notifications on connection
	notifications, err := fetchUnreadNotifications(nickname)
	if err != nil {
		log.Println("Error fetching notifications:", err)
	} else {
		for _, notif := range notifications {
			// Send each notification
			if err := conn.WriteJSON(notif); err != nil {
				log.Printf("Failed to send pending notification to %s: %v", nickname, err)
				continue
			}
		}
	}

	// Get users who have conversations with this user
	usersWithConversations, err := getUsersWithConversations(userID)
	if err != nil {
		log.Println("Error getting conversation users:", err)
	} else {
		log.Printf("User %s has conversations with: %v\n", nickname, usersWithConversations)
	}

	// Get users who don't have conversations with this user
	usersWithoutConversations, err := getUsersWithoutConversations(userID)
	if err != nil {
		log.Println("Error getting non-conversation users:", err)
	} else {
		log.Printf("User %s has no conversations with: %v\n", nickname, usersWithoutConversations)
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

	// Send conversation data to the client
	conn.WriteJSON(map[string]interface{}{
		"type": "conversation_data",
		"data": map[string]interface{}{
			"with_conversations":    usersWithConversations,
			"without_conversations": usersWithoutConversations,
		},
	})

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

// Get user ID from nickname
func getUserIDByNickname(nickname string) (int, error) {
	var id int
	err := database.DB.QueryRow("SELECT id FROM users WHERE nickname = ?", nickname).Scan(&id)
	if err != nil {
		return 0, err
	}
	return id, nil
}

func fetchUnreadNotifications(nickname string) ([]map[string]interface{}, error) {
	rows, err := database.DB.Query(`
        SELECT 
            n.id,
            u.nickname as sender
        FROM notifications n
        JOIN users u ON n.sender_id = u.id
        WHERE n.user_id = (SELECT id FROM users WHERE nickname = ?)
        ORDER BY n.created_at DESC`,
		nickname)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var notifications []map[string]interface{}
	for rows.Next() {
		var id int
		var sender string
		if err := rows.Scan(&id, &sender); err != nil {
			return nil, err
		}
		notifications = append(notifications, map[string]interface{}{
			"type":   "notification",
			"sender": sender,
			"db_id":  id, // For marking as read later
		})
	}
	return notifications, nil
}

func MarkNotificationsRead(w http.ResponseWriter, r *http.Request) {
	var request struct {
		Receiver string `json:"receiver"`
		Sender   string `json:"sender"`
	}

	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// DELETE instead of UPDATE
	_, err := database.DB.Exec(`
        DELETE FROM notifications 
        WHERE user_id = (SELECT id FROM users WHERE nickname = ?)
        AND sender_id = (SELECT id FROM users WHERE nickname = ?)`,
		request.Receiver, request.Sender)
	if err != nil {
		http.Error(w, "Deletion failed", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func GetNotifications(w http.ResponseWriter, r *http.Request) {
	nickname := r.URL.Query().Get("nickname")

	// ONLY return truly unread notifications
	rows, err := database.DB.Query(`
		SELECT n.id, u.nickname as sender
		FROM notifications n
		JOIN users u ON n.sender_id = u.id
		WHERE n.user_id = (SELECT id FROM users WHERE nickname = ?)
		AND n.is_read = FALSE  // Critical: Only unread!
		ORDER BY n.created_at DESC`,
		nickname)
	if err != nil {
		log.Println("Error getting unread notifications users:", err)
		return
	}
	defer rows.Close()

	notifications, err := fetchUnreadNotifications(nickname) // Use your existing function
	if err != nil {
		http.Error(w, "Failed to fetch notifications", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(notifications)
}

// Get users who have conversations with the given user
func getUsersWithConversations(userID int) ([]string, error) {
	query := `
        SELECT DISTINCT u.nickname 
        FROM users u
        JOIN chats c ON u.id = c.sender_id OR u.id = c.receiver_id
        WHERE (c.sender_id = ? OR c.receiver_id = ?) AND u.id != ?
    `
	rows, err := database.DB.Query(query, userID, userID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var nicknames []string
	for rows.Next() {
		var nickname string
		if err := rows.Scan(&nickname); err != nil {
			return nil, err
		}
		nicknames = append(nicknames, nickname)
	}
	return nicknames, nil
}

// Get users who don't have conversations with the given user
func getUsersWithoutConversations(userID int) ([]string, error) {
	query := `
        SELECT u.nickname 
        FROM users u
        WHERE u.id != ? AND u.id NOT IN (
            SELECT DISTINCT CASE 
                WHEN c.sender_id = ? THEN c.receiver_id 
                ELSE c.sender_id 
            END
            FROM chats c
            WHERE c.sender_id = ? OR c.receiver_id = ?
        )
    `
	rows, err := database.DB.Query(query, userID, userID, userID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var nicknames []string
	for rows.Next() {
		var nickname string
		if err := rows.Scan(&nickname); err != nil {
			return nil, err
		}
		nicknames = append(nicknames, nickname)
	}
	return nicknames, nil
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

func GetAllUsersHandler(w http.ResponseWriter, r *http.Request) {
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

	_, err := database.DB.Exec(`
		INSERT INTO notifications (user_id, sender_id) 
		VALUES (
			(SELECT id FROM users WHERE nickname = ?), 
			(SELECT id FROM users WHERE nickname = ?)
		)`,
		msg.Receiver, msg.Sender)
	if err != nil {
		log.Println("failed to store notification: ", err)
		return
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
			} else {
				// Mark as read if successfully delivered
				database.DB.Exec(`
                    UPDATE notifications 
                    SET is_read = true 
                    WHERE user_id = (SELECT id FROM users WHERE nickname = ?)
                    AND sender_id = (SELECT id FROM users WHERE nickname = ?)`,
					receiver, sender)
			}
			break
		}
	}
}

func HandleMessages() {
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

func FetchMessagesHandler(w http.ResponseWriter, r *http.Request) {
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
