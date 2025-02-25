//Function to toggle the visibility of comments section
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
  // console.log(formData);

  let comments = [];
  try {
    const _ = await fetch("/comment_submit", {
      method: "POST",
      body: formData,
    });
    // const result = await response.text();
    // console.log(result);

    // alert("Comment submitted successfully!");
    form.reset();
    // loadPosts();
  } catch (error) {
    console.error("Error submitting comment:", error);
    alert("Failed to submit comment");
  }

  try {
    const response = await fetch("/show_posts");
    let result = await response.json();
    result = result.reverse();
    // console.log("postsAll::::::", result);

    let curPost = document.getElementsByClassName(`post${postID}`)[0];
    // console.log("currentpost:::::", curPost);

    comments = result[postID-1].Comments;
    // console.log(postID);
    // console.log("curPostComments:::", comments);

    curPost.getElementsByClassName("interaction-button comment-button")[0].innerText = `💬 Comments (${comments.length})`;
    curPost.getElementsByClassName("comments-section")[0].innerHTML = `
    <div class="comments-section" id="comments-${postID
      }">
        <form class="comment-form"  style="display : block" id="commentForm-${postID
      }" onsubmit="submitComment(event, ${postID})">
          <input type="hidden" name="post_id" value="${postID}">
          <textarea placeholder="Write a comment..." name="comment" required></textarea>
          <button type="submit">Add Comment</button>
        </form>
        ${comments.length > 0
        ? comments.map(
          (comment) => `
        <div class="comment">
          <div class="comment-content">${comment.Content}</div>

          <div class="stats">
          <span id="likecomment${comment.CommentID}">${comment.LikeCount}</span> likes · 
          <span id="dislikescomment${comment.CommentID}">${comment.DislikeCount}</span> dislikes
          </div>
          
          <div class="interaction-bar">
          <button id="comment-like-btn-${comment.CommentID
            }" class="interaction-button ${comment.IsLike === 1 ? "active" : ""
            }"
          onclick="submitLikeDislike({ commentID: '${comment.CommentID
            }', isLike: true })">👍 Like</button>
        <button id="comment-dislike-btn-${comment.CommentID
            }" class="interaction-button ${comment.IsLike === 2 ? "active" : ""}"
          onclick="submitLikeDislike({ commentID: '${comment.CommentID
            }', isLike: false })">👎 Dislike</button>
                </div>
        </div>
      `
        ).join("")
        : "<p>No comments yet.</p>"
      }
      </div>
    `


  } catch (error) {
    console.error("Error fetching data:", error);
    alert("Failed to fetch data");
  }
}
