package models

import "time"

type Post struct {
	PostID     int
	Author     string
	Title      string
	Content    string
	Categories []string
	Comments   []CommentWithLike
	CreatedAt  time.Time 
}

type PostWithLike struct {
	Post
	IsLike       int
	LikeCount    int
	DislikeCount int
}

type Comment struct {
	CommentID int
	Content   string
	CreatedAt time.Time
	Author    string 
}

type CommentWithLike struct {
	Comment
	IsLike       int
	LikeCount    int
	DislikeCount int
}
