// Function to toggle the visibility of comments section
function toggleComments(postID) {
  const commentsSection = document.getElementById(`comments-${postID}`);
  commentsSection.style.display =
    commentsSection.style.display === "none" ? "block" : "none";
}

// Function to submit a comment
async function submitComment(event, postID) {
  event.preventDefault();

  const form = document.getElementById(`commentForm-${postID}`);
  const formData = new FormData(form);
  formData.append("post_id", postID);

  try {
    await fetch("/comment_submit", {
      method: "POST",
      body: formData,
    });

    const response = await fetch("/show_posts");
    let result = await response.json();
    result = result.reverse();

    let curPost = document.getElementsByClassName(`post${postID}`)[0];
    let comments = result[postID - 1].Comments;

    // Update comment count with icon
    const commentButton = curPost.getElementsByClassName("comment-button")[0];
    commentButton.innerHTML = `
      <ion-icon name="chatbubble-outline"></ion-icon>
      <span>Comments (${comments.length})</span>
    `;

    // Update comments section
    curPost.getElementsByClassName("comments-section")[0].innerHTML = `
      <div class="comments-section" id="comments-${postID}">
        <form class="comment-form" id="commentForm-${postID}" onsubmit="submitComment(event, ${postID})">
          <input type="hidden" name="post_id" value="${postID}">
          <textarea placeholder="Write a comment..." name="comment" required></textarea>
          <button type="submit" class="button-icon">
            <ion-icon name="add-circle-outline"></ion-icon>
            Add Comment
          </button>
        </form>
        ${comments.length > 0 ? comments.map((comment) => `
          <div class="comment">
            <div class="comment-header">
              <img src="/static/profile.png" width="32" height="32" class="comment-avatar">
              <div class="comment-author-time">
                <span class="comment-author">${comment.Author}</span>
                <span class="comment-time">${formatTimeAgo(new Date(comment.CreatedAt))}</span>
              </div>
            </div>
            <div class="comment-content">${comment.Content}</div>
            <div class="stats">
              <span id="likecomment${comment.CommentID}">${comment.LikeCount}</span> likes ·
              <span id="dislikescomment${comment.CommentID}">${comment.DislikeCount}</span> dislikes
            </div>
            <div class="interaction-bar">
              <button id="comment-like-btn-${comment.CommentID}" 
                class="interaction-button ${comment.IsLike === 1 ? "active" : ""}"
                onclick="submitLikeDislike({ commentID: '${comment.CommentID}', isLike: true })">
                <ion-icon name="thumbs-up-outline"></ion-icon>
                <span>Like</span>
              </button>
              <button id="comment-dislike-btn-${comment.CommentID}" 
                class="interaction-button ${comment.IsLike === 2 ? "active" : ""}"
                onclick="submitLikeDislike({ commentID: '${comment.CommentID}', isLike: false })">
                <ion-icon name="thumbs-down-outline"></ion-icon>
                <span>Dislike</span>
              </button>
            </div>
          </div>
        `).join("") : "<p>No comments yet.</p>"}
      </div>
    `;

    form.reset();
  } catch (error) {
    console.error("Error submitting comment:", error);
    alert("Failed to submit comment");
  }
}

function formatTimeAgo(date) {
  const now = new Date();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  if (seconds > 10) return `${seconds}s ago`;
  return "just now";
}