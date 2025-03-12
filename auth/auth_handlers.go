package auth

import (
    "database/sql"
    "encoding/json"
    "fmt"
    "log"
    "net/http"
    "strings"
    "strconv"
    "time"
    
    "github.com/gofrs/uuid/v5"
    "golang.org/x/crypto/bcrypt"
    
    "forum/database"
    "forum/utils"
)

func LoginHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method != http.MethodPost {
		response := map[string]string{"error": "Method not allowed"}
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(response)
		return
	}

	identifier := utils.EscapeString(r.FormValue("email"))
	password := utils.EscapeString(r.FormValue("password"))
	lowerIdentifier := strings.ToLower(identifier)

	const maxIdentifier = 100
	const maxPassword = 100

	if len(identifier) > maxIdentifier {
		response := map[string]string{"error": fmt.Sprintf("Nickname/Email cannot be longer than %d characters", maxIdentifier)}
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(response)
		return
	}

	if len(password) > maxPassword {
		response := map[string]string{"error": fmt.Sprintf("Password cannot be longer than %d characters", maxPassword)}
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(response)
		return
	}

	var userID int
	var storedPassword, sessionToken, nickname string
	err := database.DB.QueryRow(
		"SELECT id, password, session_token, nickname FROM users WHERE email = ? OR nickname = ?",
		lowerIdentifier,
		identifier,
	).Scan(&userID, &storedPassword, &sessionToken, &nickname)
	
	if err != nil {
		if err == sql.ErrNoRows {
			response := map[string]string{"error": "Invalid nickname/email or password"}
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(response)
		} else {
			log.Printf("Database error: %v", err)
			response := map[string]string{"error": "Internal server error"}
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(response)
		}
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(storedPassword), []byte(password)); err != nil {
		response := map[string]string{"error": "Invalid username/email or password"}
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(response)
		return
	}

	newSessionToken, _ := uuid.NewV4()
	sessionToken = newSessionToken.String()

	_, err = database.DB.Exec(
		"UPDATE users SET session_token = ? WHERE id = ?",
		sessionToken,
		userID,
	)
	if err != nil {
		log.Printf("Error updating session token: %v", err)
		response := map[string]string{"error": "Internal server error"}
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(response)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:    "session_token",
		Value:   sessionToken,
		Expires: time.Now().Add(1 * time.Hour),
	})

	response := map[string]string{
		"message":  "Login successful!",
		"nickname": nickname,
	}
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

func RegisterHandler(w http.ResponseWriter, r *http.Request) {
	response := make(map[string]string)

	if r.Method != http.MethodPost {
		response = map[string]string{"error": "Method not allowed"}
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(response)
		return
	}

	err := r.ParseForm()
	if err != nil {
		http.Error(w, "Failed to parse form data", http.StatusBadRequest)
		return
	}

	nickname := utils.EscapeString(r.FormValue("nickname"))
	email := utils.EscapeString(r.FormValue("email"))
	password := utils.EscapeString(r.FormValue("password"))
	firstName := utils.EscapeString(r.FormValue("first_name"))
	lastName := utils.EscapeString(r.FormValue("last_name"))
	ageStr := r.FormValue("age")
	gender := utils.EscapeString(r.FormValue("gender"))

	age, err := strconv.Atoi(ageStr)
	if err != nil {
		response = map[string]string{"error": "Invalid age value"}
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(response)
		return
	}

	errors, valid := ValidateInput(nickname, email, password, firstName, lastName, age, gender)
	if !valid {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":  "Validation error",
			"fields": errors,
		})
		return
	}

	var existingNickname, existingEmail string
	err = database.DB.QueryRow(
		"SELECT nickname, email FROM users WHERE email = ? OR nickname = ?", 
		email, 
		nickname,
	).Scan(&existingNickname, &existingEmail)
	
	if err == nil {
		var conflictField, conflictMessage string
		if existingNickname == nickname {
			conflictField = "nickname"
			conflictMessage = "Nickname already exists"
		} else if existingEmail == email {
			conflictField = "email"
			conflictMessage = "Email already exists"
		}

		response = map[string]string{
			"error": conflictMessage, 
			"field": conflictField,
		}
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(response)
		return
	} else if err != sql.ErrNoRows {
		log.Printf("Database error: %v", err)
		response = map[string]string{"error": "Database error"}
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(response)
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		response = map[string]string{"error": "Error hashing password"}
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(response)
		return
	}

	sessionToken, _ := uuid.NewV4()

	_, err = database.DB.Exec(
		"INSERT INTO users (nickname, email, password, first_name, last_name, age, gender, session_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
		nickname,
		email,
		hashedPassword,
		firstName,
		lastName,
		age,
		gender,
		sessionToken,
	)
	if err != nil {
		log.Printf("Error inserting user: %v", err)
		response = map[string]string{"error": "Registration failed"}
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(response)
		return
	}

	response = map[string]string{"message": "Registration successful! Please log in."}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

func LogoutHandler(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("session_token")
	if err != nil {
		http.Error(w, "You are not logged in", http.StatusBadRequest)
		return
	}

	delete(sessionStore, cookie.Value)

	http.SetCookie(w, &http.Cookie{
		Name:    "session_token",
		Value:   "guest",
		Expires: time.Now().Add(-1 * time.Hour),
	})
	http.Redirect(w, r, "/", http.StatusSeeOther)
	fmt.Fprintln(w, "You have been logged out.")
}
