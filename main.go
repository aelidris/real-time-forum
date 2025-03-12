package main

import (
	"fmt"
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

	fmt.Println("http://localhost:8000/")
	err := http.ListenAndServe(":8000", nil)
	if err != nil {
		log.Fatal(err)
	}
}
