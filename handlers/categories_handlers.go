package handlers

import (
	"encoding/json"
	"log"
	"net/http"

	"forum/database"
)

func GetCategories(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	rows, err := database.DB.Query("SELECT name FROM categories")
	if err != nil {
		log.Printf("Error querying categories: %v", err)
		http.Error(w, "Error retrieving categories", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var categories []string
	for rows.Next() {
		var category string
		if err := rows.Scan(&category); err != nil {
			log.Printf("Error scanning category: %v", err)
			http.Error(w, "Error processing categories", http.StatusInternalServerError)
			return
		}
		categories = append(categories, category)
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(categories); err != nil {
		log.Printf("Error encoding categories to JSON: %v", err)
		http.Error(w, "Error encoding response", http.StatusInternalServerError)
	}
	// fmt.Println(categories)
}
