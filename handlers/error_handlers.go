package handlers

import (
	"fmt"
	"net/http"
)

func ErrorPage(w http.ResponseWriter, statusCode int, message string) {
	w.WriteHeader(statusCode)
	tmpl := fmt.Sprintf(`<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>%d - %s</title>
            <style>
                :root {
                    --bg-dark: #121212;
                    --text-light: #e0e0e0;
                    --accent: #bb86fc;
                }
                body {
                    background: var(--bg-dark);
                    color: var(--text-light);
                    font-family: 'Segoe UI', system-ui, sans-serif;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                    margin: 0;
                    text-align: center;
                }
                h1 {
                    font-size: 4rem;
                    margin: 0;
                    color: var(--accent);
                }
                p {
                    font-size: 1.2rem;
                    opacity: 0.8;
                }
                a {
                    color: var(--accent);
                    text-decoration: none;
                    margin-top: 2rem;
                    padding: 0.75rem 1.5rem;
                    border: 1px solid var(--accent);
                    border-radius: 4px;
                    transition: all 0.3s ease;
                }
                a:hover {
                    background: var(--accent);
                    color: var(--bg-dark);
                }
                .container {
                    max-width: 600px;
                    padding: 2rem;
                }
                .emoji {
                    font-size: 5rem;
                    margin-bottom: 1rem;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="emoji">🔍</div>
                <h1>%d - %s</h1>
                <p>The page you're looking for doesn't exist.</p>
                <a href="/">Go Home</a>
            </div>
        </body>
        </html>`, statusCode, message, statusCode, message)

	w.Header().Set("Content-Type", "text/html")
	w.Write([]byte(tmpl))
}
