package handlers

import (
	"encoding/json"
	"forum/database"
	"log"
	"net/http"
)

func GetOnlineUsersHandler(w http.ResponseWriter, r *http.Request) {
	// Get the session token from request headers or cookies
	sessionToken := r.Header.Get("Authorization") // Assuming token is sent in headers

	if sessionToken == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Query to fetch first_name and last_name, excluding the current user
	rows, err := database.DB.Query("SELECT first_name, last_name FROM users WHERE session_token != ?", sessionToken)
	if err != nil {
		log.Printf("Error fetching online users: %v", err)
		http.Error(w, "Failed to fetch online users", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var users []map[string]string

	for rows.Next() {
		var firstName, lastName string
		if err := rows.Scan(&firstName, &lastName); err != nil {
			log.Printf("Error scanning row: %v", err)
			continue
		}
		users = append(users, map[string]string{
			"first_name": firstName,
			"last_name":  lastName,
		})
	}

	// Return the users as JSON
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}
