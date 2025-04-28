package utils

import "html"

func EscapeString(s string) string {
	return html.EscapeString(s)
}
