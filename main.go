package main

import (
	"log"
	"net/http"

	"forum/auth"
	"forum/database"
	"forum/handlers"
)

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
	http.HandleFunc("/get_all_users", handlers.GetAllUsersHandler)
	http.HandleFunc("/fetch_messages", handlers.FetchMessagesHandler)
	http.HandleFunc("/ws", handlers.HandleConnections)

	go handlers.HandleMessages()

	log.Println("http://localhost:8080/")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
