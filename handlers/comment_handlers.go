package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"forum/auth"
	"forum/database"
	"forum/models"
	"forum/utils"

	_ "github.com/mattn/go-sqlite3"
)

func ShowComments(postID int, w http.ResponseWriter, r *http.Request) ([]models.CommentWithLike, error) {
	UName, sessionToken, _, err := auth.RequireLogin(w, r)
	if err != nil {
		fmt.Println("Error in cookie :", err)
		http.Error(w, "Unauthorized access. Please log in.", http.StatusUnauthorized)
		return nil, err
	}

	commentStmt := "SELECT id, content FROM comments WHERE post_id = ? ORDER BY created_at DESC"
	commentRows, err := database.DB.Query(commentStmt, postID)
	if err != nil {
		return nil, fmt.Errorf("error querying comments: %v", err)
	}
	defer commentRows.Close()

	var comments []models.CommentWithLike
	for commentRows.Next() {
		var c models.Comment
		var commentWithLike models.CommentWithLike
		var commentID int
		err = commentRows.Scan(&commentID, &c.Content)
		if err != nil {
			log.Printf("Error scanning comment: %v", err)
			continue
		}
		if sessionToken != "guest" {

			var userID int
			// var sessionToken string
			err = database.DB.QueryRow("SELECT id FROM users WHERE username = ? AND session_token = ?", UName, sessionToken).Scan(&userID)
			if err != nil {
				http.Error(w, "error rrr", http.StatusUnauthorized)
				return nil, err
			}

			// Retrieve like status for the current comment
			var isLike sql.NullBool
			err = database.DB.QueryRow(`
            SELECT is_like FROM comment_likes 
            WHERE comment_id = ? AND user_id = ?
        `, commentID, userID).Scan(&isLike)

			if err != nil && err != sql.ErrNoRows {
				log.Printf("Error retrieving like status for comment %d: %v", commentID, err)
				continue
			}

			// Set IsLike based on the query result
			if isLike.Valid {
				if isLike.Bool {
					commentWithLike.IsLike = 1
				} else {
					commentWithLike.IsLike = 2
				}
			} else {
				commentWithLike.IsLike = -1
			}
		}
		// Retrieve like and dislike counts for the current comment
		err = database.DB.QueryRow(`
            SELECT 
                COUNT(CASE WHEN is_like = true THEN 1 END) AS like_count,
                COUNT(CASE WHEN is_like = false THEN 1 END) AS dislike_count
            FROM comment_likes
            WHERE comment_id = ?
        `, commentID).Scan(&commentWithLike.LikeCount, &commentWithLike.DislikeCount)
		if err != nil {
			log.Printf("Error retrieving like/dislike counts for comment %d: %v", commentID, err)
			continue
		}

		commentWithLike.Comment = c
		commentWithLike.CommentID = commentID

		comments = append(comments, commentWithLike)
	}

	return comments, nil
}

func CommentSubmit(w http.ResponseWriter, r *http.Request) {
	_, sessionToken, loggedIn, _ := auth.RequireLogin(w, r)
	response := make(map[string]interface{})

	if !loggedIn {
		fmt.Println("user not loggedin !!!")

		http.Error(w, "Unauthorized: User is not logged in", http.StatusUnauthorized)
		w.WriteHeader(http.StatusUnauthorized)

		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "invalid request method ", http.StatusMethodNotAllowed)
		return
	}

	comment := utils.EscapeString(r.FormValue("comment"))
	postIDStr := r.FormValue("post_id")

	if comment == "" {
		http.Error(w, "Comment field is empty", http.StatusBadRequest)
		return
	}
	postID, err := strconv.Atoi(postIDStr)
	if err != nil {
		http.Error(w, "Invalid post ID", http.StatusBadRequest)
		return
	}
	// fmt.Println(postID)

	// Check if the post id exists in the posts table
	var exists bool
	err = database.DB.QueryRow("SELECT EXISTS (SELECT 1 FROM posts WHERE id = ?)", postID).Scan(&exists)
	if err != nil {
		log.Printf("Error checking post existence: %v", err)
		response = map[string]interface{}{
			"error": "Failed to validate post ID",
		}
	}

	if !exists {
		fmt.Println("post ID does not exist")
		response = map[string]interface{}{
			"error": "post ID does not exist",
		}
		return
	}

	isertCommentQuery := `
		INSERT INTO comments (user_id,post_id,content,created_at)
		SELECT id, ?, ?, ? FROM users WHERE session_token = ?
	`
	_, err = database.DB.Exec(isertCommentQuery, postID, comment, time.Now(), sessionToken)
	if err != nil {
		http.Error(w, "Failed to submit comment", http.StatusInternalServerError)
		log.Printf("Error inserting comment: %v", err)
		return
	}

	log.Printf("Comment submitted successfully for post ID: %d", postID)
	w.Header().Set("Content-Type", "application/json")
	err = json.NewEncoder(w).Encode(response)
	if err != nil {
		log.Printf("Error encoding JSON response: %v", err)
		http.Error(w, "Error processing posts", http.StatusInternalServerError)
		return
	}
}
