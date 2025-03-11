package models

import "time"

type Post struct {
	PostID     int
	Author     string
	Title      string
	Content    string
	Categories []string
	Comments   []CommentWithLike
	CreatedAt  time.Time // Add this field
}

type PostWithLike struct {
	Post
	IsLike       int
	LikeCount    int
	DislikeCount int
}

type Comment struct {
    CommentID  int
    Content    string
    CreatedAt  time.Time
    Author     string // Add this field
}

type CommentWithLike struct {
	Comment
	IsLike       int
	LikeCount    int
	DislikeCount int
}
