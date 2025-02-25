package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"strings"
	"time"

	"forum/auth"
	"forum/database"
	"forum/models"
	"forum/utils"

	_ "github.com/mattn/go-sqlite3"
)

func HomePage(w http.ResponseWriter, r *http.Request) {
	response := make(map[string]interface{})

	if r.Method != http.MethodGet {
		response["error"] = "Invalid request method."
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(response)
		return
	}

	if r.URL.Path != "/" {
		w.WriteHeader(http.StatusNotFound)
		tmpl := `<html>
                    <head><title>Page Not Found</title></head>
                    <body>
                        <h1>404 - Page Not Found</h1>
                    </body>
                 </html>`
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte(tmpl))
		return
	}

	tmpl, err := template.ParseFiles("./pages/index.html")
	if err != nil {
		log.Printf("Template parsing error: %v", err)
		http.Error(w, "Error parsing template", http.StatusInternalServerError)
		return
	}

	err = tmpl.Execute(w, nil)
	if err != nil {
		log.Printf("Error executing template: %v", err)
		http.Error(w, "Error rendering posts", http.StatusInternalServerError)
		return
	}
}

func ShowPosts(w http.ResponseWriter, r *http.Request) {
	response := make(map[string]interface{})

	if r.Method != http.MethodGet {
		response["error"] = "Invalid request method."
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(response)
		return
	}

	UName, sessionToken, _, err := auth.RequireLogin(w, r)
	if err != nil {
		response["error"] = "Unauthorized access. Please log in."
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(response)
		return
	}
	category := r.URL.Query().Get("category")
	ownership := r.URL.Query().Get("ownership")
	var postStmt string
	var postRows *sql.Rows

	if ownership == "my_posts" {
		postStmt = `
				SELECT p.id, p.title, p.content
				FROM Posts p
				INNER JOIN users u ON p.user_id = u.id
				WHERE u.session_token = ?
				ORDER BY p.created_at DESC
			`
		postRows, err = database.DB.Query(postStmt, sessionToken)

	} else if ownership == "liked_posts" {
		postStmt = `
				SELECT p.id, p.title, p.content
				FROM Posts p
				INNER JOIN post_likes pl ON p.id = pl.post_id
				INNER JOIN users u ON pl.user_id = u.id
				WHERE u.session_token = ? AND pl.is_like = true
				ORDER BY p.created_at DESC
			`
		postRows, err = database.DB.Query(postStmt, sessionToken)
	} else {
		if category == "all" || category == "" {
			postStmt = "SELECT id, title, content FROM Posts ORDER BY created_at DESC"
			postRows, err = database.DB.Query(postStmt)
		} else {
			postStmt = `
				SELECT p.id, p.title, p.content
				FROM Posts p
				INNER JOIN post_categories pc ON p.id = pc.post_id
				INNER JOIN categories c ON pc.category_id = c.id
				WHERE c.name = ?
				ORDER BY p.created_at DESC
			`
			postRows, err = database.DB.Query(postStmt, category)
		}
	}

	if err != nil {
		log.Printf("Error querying posts: %v", err)
		http.Error(w, "Error retrieving posts", http.StatusInternalServerError)
		return
	}
	defer postRows.Close()

	var posts []models.PostWithLike
	for postRows.Next() {
		var p models.Post
		var postWithLike models.PostWithLike
		var postID int
		err = postRows.Scan(&postID, &p.Title, &p.Content)
		if err != nil {
			log.Printf("Error scanning post: %v", err)
			continue
		}
		var userID int
		userIdStmt := "SELECT user_id from posts WHERE id = ?"
		err = database.DB.QueryRow(userIdStmt, postID).Scan(&userID)
		if err != nil {
			response["error"] = "Unauthorized access. Please log in."
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(response)
			return
		}
		authorStmt := "SELECT username from users WHERE id = ?"
		err = database.DB.QueryRow(authorStmt, userID).Scan(&p.Author)
		if err != nil {
			response["error"] = "Unauthorized access. Please log in."
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(response)
			return
		}

		/*****/
		if sessionToken != "guest" {
			var userID int
			// var sessionToken string
			err = database.DB.QueryRow("SELECT id FROM users WHERE username = ? AND session_token = ?", UName, sessionToken).Scan(&userID)
			if err != nil {
				response["error"] = "Unauthorized access. Please log in."
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(response)
				return
			}
			// Retrieve like status for the current post
			var isLike sql.NullBool

			err = database.DB.QueryRow(`
			SELECT is_like FROM post_likes 
			WHERE post_id = ? AND user_id = ?
		`, postID, userID).Scan(&isLike)

			if err != nil && err != sql.ErrNoRows {
				log.Printf("Error retrieving like status for post %d: %v", postID, err)
				continue
			}
			// Set IsLike based on the query result
			if isLike.Valid {
				if isLike.Bool {
					postWithLike.IsLike = 1
				} else {
					postWithLike.IsLike = 2
				}
			} else {
				postWithLike.IsLike = -1
			}
		}

		/***********/
		// Retrieve like and dislike counts for the current post
		err = database.DB.QueryRow(`
		 SELECT 
			 COUNT(CASE WHEN is_like = true THEN 1 END) AS like_count,
			 COUNT(CASE WHEN is_like = false THEN 1 END) AS dislike_count
		 FROM post_likes
		 WHERE post_id = ?
	 `, postID).Scan(&postWithLike.LikeCount, &postWithLike.DislikeCount)
		if err != nil {
			log.Printf("Error retrieving like/dislike counts for post %d: %v", postID, err)
			continue
		}

		catStmt := `
				SELECT c.name
				FROM categories c
				INNER JOIN post_categories pc ON c.id = pc.category_id
				WHERE pc.post_id = ?`
		catRows, err := database.DB.Query(catStmt, postID)
		if err != nil {
			log.Printf("Error querying categories for post %d: %v", postID, err)
			continue
		}

		var categories []string
		for catRows.Next() {
			var category string
			if err := catRows.Scan(&category); err != nil {
				log.Printf("Error scanning category for post %d: %v", postID, err)
				continue
			}
			categories = append(categories, category)
		}
		catRows.Close()

		comments, err := ShowComments(postID, w, r)
		if err != nil {
			log.Printf("Error retrieving comments for post %d: %v", postID, err)
			comments = []models.CommentWithLike{}
		}

		p.Categories = categories
		p.PostID = postID
		p.Comments = comments

		postWithLike.Post = p

		posts = append(posts, postWithLike)
	}

	if len(posts) == 0 {
		log.Println("No posts found.")
		posts = []models.PostWithLike{}
	}

	w.Header().Set("Content-Type", "application/json")
	err = json.NewEncoder(w).Encode(posts)
	if err != nil {
		log.Printf("Error encoding JSON response: %v", err)
		response["error"] = "Error processing posts"
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(response)
		return
	}
}

func PostSubmit(w http.ResponseWriter, r *http.Request) {
	username, sessionToken, loggedIn, _ := auth.RequireLogin(w, r)
	response := make(map[string]interface{})

	if !loggedIn {
		log.Println("User not logged in")
		response["error"] = "You need to log in to submit a post."
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(response)
		return
	}

	if r.Method != http.MethodPost {
		response["error"] = "Invalid request method."
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(response)
		return
	}

	title := utils.EscapeString(r.FormValue("title"))
	content := utils.EscapeString(r.FormValue("content"))
	categoryNames := r.Form["category"]

	const maxTitle = 100
	const maxContent = 1000

	if strings.TrimSpace(title) == "" || strings.TrimSpace(content) == "" || len(categoryNames) == 0 {
		response["error"] = "All fields (title, content, and category) are required."
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(response)
		return
	}

	if len(title) > maxTitle {
		response["error"] = fmt.Sprintf("Title cannot be longer than %d characters.", maxTitle)
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(response)
		return
	}

	if len(content) > maxContent {
		response["error"] = fmt.Sprintf("Content cannot be longer than %d characters.", maxContent)
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(response)
		return
	}

	//        check if the user exists
	var exists bool
	err := database.DB.QueryRow("SELECT EXISTS (SELECT 1 FROM users WHERE username = ?)", username).Scan(&exists)
	if err != nil {
		log.Printf("Error checking user existence: %v", err)
		response["error"] = "Failed to validate user."
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(response)
		return
	}

	if !exists {
		response["error"] = "User not found."
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(response)
		return
	}

	// Check the time of the last post
	var lastPostTime time.Time
	err = database.DB.QueryRow(`
		  SELECT created_at
		  FROM Posts
		  WHERE user_id = (SELECT id FROM users WHERE session_token = ?)
		  ORDER BY created_at DESC
		  LIMIT 1
	  `, sessionToken).Scan(&lastPostTime)

	if err != nil && err != sql.ErrNoRows {
		log.Printf("Error checking last post time: %v", err)
		response["error"] = "Failed to validate post frequency."
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(response)
		return
	}

	if err != sql.ErrNoRows {
		timeSinceLastPost := time.Since(lastPostTime)
		const postCooldown = 1 * time.Second
		if timeSinceLastPost < postCooldown {
			response["error"] = fmt.Sprintf(
				"You can only create a post every 1 seconds. Please wait %d seconds.",
				int(postCooldown.Seconds()-timeSinceLastPost.Seconds()),
			)
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(response)
			return
		}
	}

	//    transaction

	tx, err := database.DB.Begin()
	if err != nil {
		log.Printf("Error starting transaction: %v", err)
		response["error"] = "Database error during category linking."
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(response)
		return
	}

	insertPostQuery := `
        INSERT INTO Posts (user_id, title, content, created_at)
        SELECT id, ?, ?, ? FROM users WHERE session_token = ?
    `
	result, err := tx.Exec(insertPostQuery, title, content, time.Now(), sessionToken)
	if err != nil {

		log.Printf("Error inserting post: %v", err)
		response["error"] = "Failed to submit post."
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(response)
		tx.Rollback()
		return
	}

	// Get the ID of the newly inserted post
	postID, err := result.LastInsertId()
	if err != nil {
		log.Printf("Error retrieving post ID: %v", err)
		response["error"] = "Failed to retrieve post ID."
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(response)
		tx.Rollback()
		return
	}

	// insert post-category relationships
	for _, categoryName := range categoryNames {

		var categoryID int
		err := tx.QueryRow("SELECT id FROM categories WHERE name = ?", categoryName).Scan(&categoryID)
		if err == sql.ErrNoRows {
			response["error"] = fmt.Sprintf("Category '%s' not found.", categoryName)
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(response)
			tx.Rollback()
			return
		} else if err != nil {
			log.Printf("Error during category lookup: %v", err)
			response["error"] = "Database error during category lookup."
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(response)
			tx.Rollback()
			return
		}

		insertPostCategoryQuery := `
            INSERT INTO post_categories (post_id, category_id)
            VALUES (?, ?)
        `
		_, err = tx.Exec(insertPostCategoryQuery, postID, categoryID)
		if err != nil {
			log.Printf("Error inserting post-category link: %v", err)
			response["error"] = "Failed to link post with categories."
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(response)
			tx.Rollback()
			return
		}
	}

	err = tx.Commit()
	if err != nil {
		log.Printf("Error committing transaction: %v", err)
		response["error"] = "Failed to finalize post submission."
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(response)
		return
	}

	response["message"] = "Post submitted successfully."
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}
