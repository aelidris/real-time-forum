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

var (
	upgrader  = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}
	clients   = make(map[*websocket.Conn]string) // Stores connections with usernames
	broadcast = make(chan Message)               // Channel for broadcasting messages
	mu        sync.Mutex                         // Mutex for concurrent access
)

type Message struct {
	Sender    string `json:"sender"`
	Content   string `json:"content"`
	Timestamp string `json:"timestamp"`
}

func handleConnections(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		fmt.Println("WebSocket upgrade error:", err)
		return
	}
	defer conn.Close()

	username := r.URL.Query().Get("username") // Get username from query params
	mu.Lock()
	clients[conn] = username
	mu.Unlock()

	for {
		var msg Message
		err := conn.ReadJSON(&msg)
		if err != nil {
			fmt.Println("Error reading message:", err)
			mu.Lock()
			delete(clients, conn)
			mu.Unlock()
			break
		}
		broadcast <- msg
	}
}

func handleMessages() {
	for {
		msg := <-broadcast
		mu.Lock()
		for client := range clients {
			err := client.WriteJSON(msg)
			if err != nil {
				fmt.Println("Error sending message:", err)
				client.Close()
				delete(clients, client)
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
