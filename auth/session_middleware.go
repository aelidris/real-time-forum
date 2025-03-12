package auth

import (
    "database/sql"
    "fmt"
    "log"
    "net/http"
    "time"
    
    "forum/database"
)

var sessionStore = make(map[string]string)
func RequireLogin(w http.ResponseWriter, r *http.Request) (string, string, bool, error) {
	cookie, _ := r.Cookie("session_token")
	if cookie == nil {
		return "", "guest", false, nil
	}

	var nickname, sessionToken string
	err := database.DB.QueryRow(
		"SELECT nickname, session_token FROM users WHERE session_token = ?", 
		cookie.Value,
	).Scan(&nickname, &sessionToken)
	
	if err == sql.ErrNoRows {
		for _, cookie := range r.Cookies() {
			http.SetCookie(w, &http.Cookie{
				Name:    cookie.Name,
				Value:   "",
				Expires: time.Now().Add(-1 * time.Hour),
			})
		}
		return "", "guest", false, err
	} else if err != nil {
		log.Printf("Database error: %v", err)
		http.Error(w, "Internal server error.", http.StatusInternalServerError)
		return "", "guest", false, err
	}

	return nickname, sessionToken, true, nil
}

func CheckSessionHandler(w http.ResponseWriter, r *http.Request) {
	_, _, loggedIn, err := RequireLogin(w, r)
	if err != nil {
		fmt.Println("Error in RequiredLogin:", err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if loggedIn {
		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, `{"loggedIn": true}`)
	} else {
		w.WriteHeader(http.StatusOK)
		fmt.Fprintln(w, `{"loggedIn": false}`)
	}
}