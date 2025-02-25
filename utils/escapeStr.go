package utils

import "html"

// escapes special characters in a string to prevent HTML injection

func EscapeString(s string) string {
	return html.EscapeString(s)
}
