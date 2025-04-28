package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"forum/database"
)

var sessionStore = make(map[string]string)

func RequireLogin(w http.ResponseWriter, r *http.Request) (string, string, bool, error) {
	cookie, err := r.Cookie("session_token")
	if err != nil || cookie == nil {
		return "", "guest", false, nil
	}

	var nickname, sessionToken string
	err = database.DB.QueryRow(
		"SELECT nickname, session_token FROM users WHERE session_token = ?",
		cookie.Value,
	).Scan(&nickname, &sessionToken)
	if err != nil {
		if err == sql.ErrNoRows {
			http.SetCookie(w, &http.Cookie{
				Name:    "session_token",
				Value:   "",
				Expires: time.Now().Add(-1 * time.Hour), 
				Path:    "/",
			})
			return "", "guest", false, nil
		}

		log.Printf("Database error: %v", err)
		return "", "guest", false, err
	}

	return nickname, sessionToken, true, nil
}

func CheckSessionHandler(w http.ResponseWriter, r *http.Request) {
	_, _, loggedIn, err := RequireLogin(w, r)
	if err != nil {
		log.Printf("Error in RequireLogin: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"loggedIn": loggedIn})
}
