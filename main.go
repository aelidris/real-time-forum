package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"

	"forum/auth"
	"forum/database"
	"forum/handlers"

	"github.com/gorilla/websocket"
)

// Define the WebSocket message structure
type Message struct {
	Sender          string `json:"sender"`
	Receiver        string `json:"receiver"` // Added for private messaging
	Content         string `json:"content"`
	Timestamp       string `json:"timestamp"`
	SenderFirstName string `json:"firstName"` // ✅ New field
	SenderLastName  string `json:"lastName"`  // ✅ New field
}

// Define the Client struct
type Client struct {
	conn      *websocket.Conn
	firstName string
	lastName  string
	nickname  string
}

// Global variables
var (
	upgrader  = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
	clients   = make(map[*websocket.Conn]*Client) // Fixed map type
	broadcast = make(chan Message)                // Channel for broadcasting messages
	mu        sync.Mutex                          // Mutex for concurrent access
)

// Handle new WebSocket connections
func handleConnections(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		fmt.Println("WebSocket upgrade error:", err)
		return
	}
	defer conn.Close()

	// Get nickname from query params
	nickname := r.URL.Query().Get("nickname")

	// Fetch first & last name from the database
	var firstName, lastName string
	err = database.DB.QueryRow("SELECT first_name, last_name FROM users WHERE nickname = ?", nickname).Scan(&firstName, &lastName)
	if err != nil {
		fmt.Println("User not found in database:", err)
		return
	}

	// Create and store client
	client := &Client{
		conn:      conn,
		nickname:  nickname,
		firstName: firstName,
		lastName:  lastName,
	}

	mu.Lock()
	clients[conn] = client
	broadcastOnlineUsers() // Update user list
	mu.Unlock()

	for {
		var msg Message
		err := conn.ReadJSON(&msg)
		if err != nil {
			fmt.Println("Error reading message:", err)
			mu.Lock()
			delete(clients, conn)
			broadcastOnlineUsers() // Update user list
			mu.Unlock()
			break
		}

		// Store the message in the database
		saveMessage(msg.Sender, msg.Receiver, msg.Content)

		if msg.Receiver != "" {
			// Private message
			sendPrivateMessage(msg)
		} else {
			// Broadcast public message
			broadcast <- msg
		}
	}
}

func saveMessage(sendernickname, receivernickname, content string) {
	var senderID, receiverID int

	// Get sender ID
	err := database.DB.QueryRow("SELECT id FROM users WHERE nickname = ?", sendernickname).Scan(&senderID)
	if err != nil {
		fmt.Println("Error getting sender ID:", err)
		return
	}

	// Get receiver ID
	err = database.DB.QueryRow("SELECT id FROM users WHERE nickname = ?", receivernickname).Scan(&receiverID)
	if err != nil {
		fmt.Println("Error getting receiver ID:", err)
		return
	}

	// Insert message into database
	_, err = database.DB.Exec(`
        INSERT INTO chats (sender_id, receiver_id, message) 
        VALUES (?, ?, ?)`,
		senderID, receiverID, content,
	)
	if err != nil {
		fmt.Println("Error saving message:", err)
	}
}

// Broadcast the list of online users
func broadcastOnlineUsers() {
	var userList []map[string]string

	// Collect online users
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

	// Send the list to all connected clients
	for _, client := range clients {
		err := client.conn.WriteJSON(message)
		if err != nil {
			fmt.Println("Error sending user list:", err)
			client.conn.Close()
			mu.Lock()
			delete(clients, client.conn) // Close connection only if it's faulty
			mu.Unlock()
		}
	}
}

// Send a private message
func sendPrivateMessage(msg Message) {
	mu.Lock()
	defer mu.Unlock()

	var senderFirstName, senderLastName string

	// Find the sender’s first and last name from the connected clients
	for _, client := range clients {
		if client.nickname == msg.Sender {
			senderFirstName = client.firstName
			senderLastName = client.lastName
			break
		}
	}

	// Add sender’s first and last name to the message
	msg.SenderFirstName = senderFirstName
	msg.SenderLastName = senderLastName

	// Send the message to the receiver
	messageSent := false
	for _, client := range clients {
		if client.nickname == msg.Receiver {
			err := client.conn.WriteJSON(msg)
			if err != nil {
				fmt.Println("Error sending private message:", err)
			} else {
				messageSent = true
			}
			break
		}
	}

	// Send notification if the receiver is online
	if messageSent {
		for _, client := range clients {
			if client.nickname == msg.Receiver {
				notification := map[string]string{
					"type":   "notification",
					"sender": msg.Sender, // Send the sender's nickname
				}
				err := client.conn.WriteJSON(notification)
				if err != nil {
					fmt.Println("Error sending notification:", err)
				}
				break
			}
		}
	} else {
		// Store notification in database if user is offline
		err := saveNotificationToDB(msg.Receiver, msg.Sender) // Store the sender's nickname
		if err != nil {
			fmt.Println("Error storing notification:", err)
		}
	}

}

func saveNotificationToDB(receiver, sender string) error {
	_, err := database.DB.Exec("INSERT INTO notifications (receiver, message, seen) VALUES (?, ?, 0)",
		receiver, "New message from "+sender)
	return err
}

func handleMessages() {
	for {
		msg := <-broadcast // Receive a message from the channel

		var senderFirstName, senderLastName string

		// Find sender’s first and last name
		for _, client := range clients {
			if client.nickname == msg.Sender {
				senderFirstName = client.firstName
				senderLastName = client.lastName
				break
			}
		}

		// Attach sender's first and last name to the message
		msg.SenderFirstName = senderFirstName
		msg.SenderLastName = senderLastName

		mu.Lock()
		for _, client := range clients {
			if msg.Receiver == "" {
				// Public message - send to all clients
				err := client.conn.WriteJSON(msg)
				if err != nil {
					fmt.Println("Error sending public message:", err)
					client.conn.Close()
					delete(clients, client.conn)
				}
			} else if client.nickname == msg.Receiver {
				// Private message - send only to the receiver
				err := client.conn.WriteJSON(msg)
				if err != nil {
					fmt.Println("Error sending private message:", err)
					client.conn.Close()
					delete(clients, client.conn)
				}
			}
		}
		mu.Unlock()
	}
}

func fetchMessagesHandler(w http.ResponseWriter, r *http.Request) {
    // Get the current user's nickname and the other user's nickname
    currentUser := r.URL.Query().Get("nickname")
    otherUser := r.URL.Query().Get("otherUser")

    if currentUser == "" || otherUser == "" {
        http.Error(w, "Missing nickname or otherUser", http.StatusBadRequest)
        return
    }

    // Updated query to use sent_at column
    query := `
        SELECT 
            u_sender.nickname AS sender, 
            u_receiver.nickname AS receiver, 
            chats.message AS content, 
            chats.sent_at AS timestamp,
            u_sender.first_name AS sender_first_name,
            u_sender.last_name AS sender_last_name
        FROM chats
        JOIN users u_sender ON chats.sender_id = u_sender.id
        JOIN users u_receiver ON chats.receiver_id = u_receiver.id
        WHERE 
            (u_sender.nickname = ? AND u_receiver.nickname = ?) OR 
            (u_sender.nickname = ? AND u_receiver.nickname = ?)
        ORDER BY chats.sent_at
        LIMIT 100
    `

    // Prepare to store messages
    var messages []Message

    // Execute query
    rows, err := database.DB.Query(query, currentUser, otherUser, otherUser, currentUser)
    if err != nil {
        log.Printf("Database Query Error: %v", err)
        http.Error(w, "Failed to fetch messages: "+err.Error(), http.StatusInternalServerError)
        return
    }
    defer rows.Close()

    // Scan results
    for rows.Next() {
        var msg Message
        err := rows.Scan(
            &msg.Sender, 
            &msg.Receiver, 
            &msg.Content, 
            &msg.Timestamp,
            &msg.SenderFirstName,
            &msg.SenderLastName,
        )
        if err != nil {
            log.Printf("Row Scan Error: %v", err)
            http.Error(w, "Error processing messages: "+err.Error(), http.StatusInternalServerError)
            return
        }
        messages = append(messages, msg)
    }

    // Send messages as JSON response
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(messages)
}

func main() {
	if err := database.InitDB(); err != nil {
		log.Fatalf("Database initialization failed: %v", err)
	}
	defer database.DB.Close()

	fileServer := http.FileServer(http.Dir("./static"))
	http.Handle("/static/", http.StripPrefix("/static", fileServer))

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

	http.HandleFunc("/fetch_messages", fetchMessagesHandler)
	http.HandleFunc("/ws", handleConnections)
	go handleMessages() // Run message handling in a separate goroutine

	log.Println("Server started on :8080")
	fmt.Println("http://localhost:8080/")
	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		log.Fatal(err)
	}
}
