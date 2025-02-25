package models

type Post struct {
  PostID     int
  Author     string
  Title      string
  Content    string
  Categories []string
  Comments   []CommentWithLike
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
}

type CommentWithLike struct {
  Comment
  IsLike       int
  LikeCount    int
  DislikeCount int
}