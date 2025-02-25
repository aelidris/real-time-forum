package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"

	"forum/auth"
	"forum/database"
)

func HandleInteract(w http.ResponseWriter, r *http.Request) {
	_, sessionToken, loggedIn, _ := auth.RequireLogin(w, r)
	if !loggedIn {
		http.Error(w, "Unauthorized: User is not logged in", http.StatusUnauthorized)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Invalid request method", http.StatusMethodNotAllowed)
		return
	}

	isLikeStr := r.FormValue("is_like")
	postIDStr := r.FormValue("post_id")
	commentIDStr := r.FormValue("comment_id")

	var isLike *bool
	if isLikeStr != "" {
		parsedIsLike, err := strconv.ParseBool(isLikeStr)
		if err != nil {
			http.Error(w, "Invalid is_like value", http.StatusBadRequest)
			return
		}
		isLike = &parsedIsLike
	}

	var userID int
	err := database.DB.QueryRow("SELECT id FROM users WHERE session_token = ?", sessionToken).Scan(&userID)
	if err != nil {
		log.Printf("Error fetching user ID: %v", err)
		http.Error(w, "Unauthorized: Invalid session", http.StatusUnauthorized)
		return
	}

	var response map[string]interface{}
	if postIDStr != "" {
		response = handlePostLike(userID, postIDStr, isLike)
	} else if commentIDStr != "" {
		response = handleCommentLike(userID, commentIDStr, isLike)
	} else {
		http.Error(w, "Either post_id or comment_id must be specified", http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func handlePostLike(userID int, postIDStr string, isLike *bool) map[string]interface{} {
	postID, err := strconv.Atoi(postIDStr)
	if err != nil {
		log.Printf("Invalid post ID: %v", err)
		return map[string]interface{}{
			"error": "Invalid post ID",
		}
	}
	// Check if the post id exists in the comments table
	var exists bool
	err = database.DB.QueryRow("SELECT EXISTS (SELECT 1 FROM posts WHERE id = ?)", postID).Scan(&exists)
	if err != nil {
		log.Printf("Error checking post existence: %v", err)
		return map[string]interface{}{
			"error": "Failed to validate post ID",
		}
	}

	if !exists {
		fmt.Println("post ID does not exist")
		return map[string]interface{}{
			"error": "post ID does not exist",
		}
	}

	if isLike == nil {
		_, err = database.DB.Exec("DELETE FROM post_likes WHERE user_id = ? AND post_id = ?", userID, postID)
		if err != nil {
			log.Printf("Error deleting post like: %v", err)
			return map[string]interface{}{
				"error": "Invalid comment ID",
			}
		}
		return map[string]interface{}{
			"message":       "Like removed",
			"updatedIsLike": nil,
		}
	} else {
		query := `
		            INSERT INTO post_likes (user_id, post_id, is_like, created_at)
					VALUES (?, ?, ?, CURRENT_TIMESTAMP)
					ON CONFLICT(user_id, post_id)
					DO UPDATE SET 
		    		is_like = excluded.is_like, 
		    		created_at = CURRENT_TIMESTAMP
					`
		_, err = database.DB.Exec(query, userID, postID, isLike)
		if err != nil {
			return map[string]interface{}{
				"error": "Failed to submit interaction",
			}
		}
		log.Println("Interaction added/updated successfully")

		return map[string]interface{}{
			"message":       "Interaction updated successfully",
			"updatedIsLike": *isLike,
		}
	}
}

func handleCommentLike(userID int, commentIDStr string, isLike *bool) map[string]interface{} {
	commentID, err := strconv.Atoi(commentIDStr)
	if err != nil {
		log.Printf("Invalid comment ID: %v", err)
		return map[string]interface{}{
			"error": "Invalid comment ID",
		}
	}
	// Check if the comment_id exists in the comments table
	var exists bool
	err = database.DB.QueryRow("SELECT EXISTS (SELECT 1 FROM comments WHERE id = ?)", commentID).Scan(&exists)
	if err != nil {
		log.Printf("Error checking comment existence: %v", err)
		return map[string]interface{}{
			"error": "Failed to validate comment ID",
		}
	}

	if !exists {
		fmt.Println("Comment ID does not exist")
		return map[string]interface{}{
			"error": "Comment ID does not exist",
		}
	}

	if isLike == nil {
		_, err = database.DB.Exec("DELETE FROM comment_likes WHERE user_id = ? AND comment_id = ?", userID, commentID)
		if err != nil {
			log.Printf("Error deleting comment like: %v", err)
			return map[string]interface{}{
				"error": "Failed to remove comment like",
			}
		}
		return map[string]interface{}{
			"message":       "Like removed",
			"updatedIsLike": nil,
		}
	} else {

		query := `
            INSERT INTO comment_likes (user_id, comment_id, is_like, created_at)
			VALUES (?, ?, ?, CURRENT_TIMESTAMP)
			ON CONFLICT(user_id, comment_id)
			DO UPDATE SET 
    		is_like = excluded.is_like, 
    		created_at = CURRENT_TIMESTAMP
			`
		_, err = database.DB.Exec(query, userID, commentID, isLike)
		if err != nil {
			log.Printf("Error inserting/updating comment like: %v", err)
			return map[string]interface{}{
				"error": "Failed to submit interaction",
			}
		}
		log.Printf("Executing comment like query with userID: %d, commentID: %d, isLike: %v", userID, commentID, isLike)

		log.Println("Interaction added/updated successfully")
		return map[string]interface{}{
			"message":       "Interaction updated successfully",
			"updatedIsLike": *isLike,
		}
	}
}
