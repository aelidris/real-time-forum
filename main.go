package main

import (
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
	Sender    string `json:"sender"`
	Receiver  string `json:"receiver"` // Added for private messaging
	Content   string `json:"content"`
	Timestamp string `json:"timestamp"`
	SenderFirstName string `json:"firstName"`  // ✅ New field
    SenderLastName  string `json:"lastName"`   // ✅ New field
}

// Define the Client struct
type Client struct {
	conn      *websocket.Conn
	firstName string
	lastName  string
	username  string
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

	// Get username from query params
	username := r.URL.Query().Get("username")

	// Fetch first & last name from the database
	var firstName, lastName string
	err = database.DB.QueryRow("SELECT first_name, last_name FROM users WHERE username = ?", username).Scan(&firstName, &lastName)
	if err != nil {
		fmt.Println("User not found in database:", err)
		return
	}

	// Create and store client
	client := &Client{
		conn:      conn,
		username:  username,
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

func saveMessage(senderUsername, receiverUsername, content string) {
    var senderID, receiverID int

    // Get sender ID
    err := database.DB.QueryRow("SELECT id FROM users WHERE username = ?", senderUsername).Scan(&senderID)
    if err != nil {
        fmt.Println("Error getting sender ID:", err)
        return
    }

    // Get receiver ID
    err = database.DB.QueryRow("SELECT id FROM users WHERE username = ?", receiverUsername).Scan(&receiverID)
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
			"username":  client.username,
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
        if client.username == msg.Sender {
            senderFirstName = client.firstName
            senderLastName = client.lastName
            break
        }
    }

    // Add sender’s first and last name to the message
    msg.SenderFirstName = senderFirstName
    msg.SenderLastName = senderLastName

    for _, client := range clients {
        if client.username == msg.Receiver {
            err := client.conn.WriteJSON(msg)
            if err != nil {
                fmt.Println("Error sending private message:", err)
            }
            break
        }
    }

	for _, client := range clients {
        if client.username == msg.Receiver || client.username == msg.Sender {
            // Fetch updated chat history
            messages, err := getChatHistory(msg.Sender, msg.Receiver)
            if err != nil {
                fmt.Println("Error fetching chat history:", err)
                return
            }

            response := map[string]interface{}{
                "type":     "chatHistory",
                "messages": messages,
            }

            err = client.conn.WriteJSON(response)
            if err != nil {
                fmt.Println("Error sending private message:", err)
                client.conn.Close()
                delete(clients, client.conn)
            }
        }
    }
}

func getChatHistory(senderUsername, receiverUsername string) ([]Message, error) {
    var senderID, receiverID int

    // Get sender ID
    err := database.DB.QueryRow("SELECT id FROM users WHERE username = ?", senderUsername).Scan(&senderID)
    if err != nil {
        return nil, err
    }

    // Get receiver ID
    err = database.DB.QueryRow("SELECT id FROM users WHERE username = ?", receiverUsername).Scan(&receiverID)
    if err != nil {
        return nil, err
    }

    // Fetch messages from the database
    rows, err := database.DB.Query(`
        SELECT sender_id, receiver_id, message, sent_at 
        FROM chats 
        WHERE (sender_id = ? AND receiver_id = ?) 
        OR (sender_id = ? AND receiver_id = ?) 
        ORDER BY sent_at ASC`, senderID, receiverID, receiverID, senderID)

    if err != nil {
        return nil, err
    }
    defer rows.Close()

    var messages []Message
    for rows.Next() {
        var msg Message
        var senderID, receiverID int

        err := rows.Scan(&senderID, &receiverID, &msg.Content, &msg.Timestamp)
        if err != nil {
            return nil, err
        }

        // Convert sender ID back to username
        database.DB.QueryRow("SELECT username FROM users WHERE id = ?", senderID).Scan(&msg.Sender)
        database.DB.QueryRow("SELECT username FROM users WHERE id = ?", receiverID).Scan(&msg.Receiver)

        messages = append(messages, msg)
    }

    return messages, nil
}



func handleMessages() {
    for {
        msg := <-broadcast // Receive a message from the channel

        var senderFirstName, senderLastName string

        // Find sender’s first and last name
        for _, client := range clients {
            if client.username == msg.Sender {
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
            } else if client.username == msg.Receiver {
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
	http.HandleFunc("/api/online-users", handlers.GetOnlineUsersHandler)
	http.HandleFunc("/login", auth.LoginHandler)
	http.HandleFunc("/check-session", auth.CheckSessionHandler)
	http.HandleFunc("/logout", auth.LogoutHandler)
	http.HandleFunc("/register", auth.RegisterHandler)

	http.HandleFunc("/ws", handleConnections)
	go handleMessages() // Run message handling in a separate goroutine

	log.Println("Server started on :8080")
	fmt.Println("http://localhost:8080/")
	err := http.ListenAndServe(":8080", nil)
	if err != nil {
		log.Fatal(err)
	}
}
