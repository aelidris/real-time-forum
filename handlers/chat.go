package handlers

import (
	"encoding/json"
	"forum/database"
	"net/http"
)

// User represents a user in the database
type User struct {
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
}

// GetUsers fetches all users from the database
func GetUsers(w http.ResponseWriter, r *http.Request) {
	// Query the database for first_name and last_name
	rows, err := database.DB.Query("SELECT first_name, last_name FROM users")
	if err != nil {
		http.Error(w, "Failed to query the database", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	// Iterate over the rows and create a list of users
	var users []User
	for rows.Next() {
		var user User
		if err := rows.Scan(&user.FirstName, &user.LastName); err != nil {
			http.Error(w, "Failed to scan database rows", http.StatusInternalServerError)
			return
		}
		users = append(users, user)
	}

	// Check for errors after iteration
	if err := rows.Err(); err != nil {
		http.Error(w, "Error after iterating rows", http.StatusInternalServerError)
		return
	}

	// Return the users as JSON
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}
