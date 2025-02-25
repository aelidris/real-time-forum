async function submitLikeDislike({ postID = null, commentID = null, isLike }) {
  // console.log("likeBtn ID:", `like-btn-${commentID || postID}`);

  if (!postID && !commentID) {
    console.error("Either postID or commentID is required");
    return;
  }

  const likeBtnID = postID
    ? `post-like-btn-${postID}`
    : `comment-like-btn-${commentID}`;
  const dislikeBtnID = postID
    ? `post-dislike-btn-${postID}`
    : `comment-dislike-btn-${commentID}`;
  const likeBtn = document.getElementById(likeBtnID);
  const dislikeBtn = document.getElementById(dislikeBtnID);
  const likespan = document.getElementById("like" + (postID));
  const dislikeSpan = document.getElementById("dislikes" + (postID));
  let likeCospan = document.getElementById("likecomment" + (commentID));
  let dislikeCospan = document.getElementById("dislikescomment" + (commentID));
  

  // Disable buttons to prevent rapid clicks
  likeBtn.disabled = true;
  dislikeBtn.disabled = true;

  try {
    // Determine new state based on current button status
    let newLikeCount = parseInt(likespan.textContent, 10) || 0;
    let newDislikeCount = parseInt(dislikeSpan.textContent, 10) || 0;

    if (isLike === true) {
      if (likeBtn.classList.contains("active")) {
        // If Like is already active, deactivate it
        newLikeCount--;
        isLike = null;
      } else {
        // If Like is not active, activate it
        newLikeCount++;
        if (dislikeBtn.classList.contains("active")) {
          // Deactivate Dislike if it's active
          newDislikeCount--;
        }
      }
    } else if (isLike === false) {
      if (dislikeBtn.classList.contains("active")) {
        // If Dislike is already active, deactivate it
        newDislikeCount--;
        isLike = null;
      } else {
        // If Dislike is not active, activate it
        newDislikeCount++;
        if (likeBtn.classList.contains("active")) {
          // Deactivate Like if it's active
          newLikeCount--;
        }
      }
    }

    // Prepare form data
    const formData = new URLSearchParams();
    if (postID) formData.append("post_id", postID);
    // if (commentID) formData.append("comment_id", commentID);
    formData.append("is_like", isLike === null ? "" : isLike);

    // Send request to the backend
    const response = await fetch("/interact", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });

    if (response.ok) {
      const { updatedIsLike } = await response.json();

      // Update the UI with the new counts
      if (likespan) likespan.textContent = newLikeCount;
      if (dislikeSpan) dislikeSpan.textContent = newDislikeCount;

      // Update button states
      toggleButtons(likeBtnID, dislikeBtnID, updatedIsLike);

      // console.log(
      //   `Updated counts: likeCount=${newLikeCount}, dislikeCount=${newDislikeCount}`
      // );
    } else {
      console.error("Backend error:", await response.text());
      alert("Failed to submit interaction. Please try again.");
    }
  } catch (error) {
    // console.error("Error submitting like/dislike:", error);
    // alert("Something went wrong. Please try again.");
  } finally {
    // Re-enable buttons
    likeBtn.disabled = false;
    dislikeBtn.disabled = false;
  }

  try {
    let newLikeCount = parseInt(likeCospan.textContent, 10) || 0;
    let newDislikeCount = parseInt(dislikeCospan.textContent, 10) || 0;

    if (isLike === true) {
      if (likeBtn.classList.contains("active")) {
       
        newLikeCount--;
        isLike = null;
      } else {
        newLikeCount++;
        if (dislikeBtn.classList.contains("active")) {
         
          newDislikeCount--;
        }
      }
    } else if (isLike === false) {
      if (dislikeBtn.classList.contains("active")) {
        newDislikeCount--;
        isLike = null;
      } else {
      
        newDislikeCount++;
        if (likeBtn.classList.contains("active")) {
         
          newLikeCount--;
        }
      }
    }
   
    const formData = new URLSearchParams();
    if (commentID) formData.append("comment_id", commentID);
    formData.append("is_like", isLike === null ? "" : isLike);

    const response = await fetch("/interact", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });

    if (response.ok) {
      const { updatedIsLike } = await response.json();

     
      if (likeCospan) likeCospan.textContent = newLikeCount;
      if (dislikeCospan) dislikeCospan.textContent = newDislikeCount;

     
      toggleButtons(likeBtnID, dislikeBtnID, updatedIsLike);
      // loadPosts();
      // console.log(
      //   `Updated counts: likeCount=${newLikeCount}, dislikeCount=${newDislikeCount}`
      // );
    } else {
      console.error("Backend error:", await response.text());
      alert("Failed to submit interaction. Please try again.");
    }
  } catch (error) {
    // console.error("Error submitting like/dislike:", error);
    // alert("Something went wrong. Please try again.");
   
  } finally {
    likeBtn.disabled = false;
    dislikeBtn.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadPosts();
});

function toggleButtons(likeBtnID, dislikeBtnID, updatedIsLike) {
  const likeBtn = document.getElementById(likeBtnID);
  const dislikeBtn = document.getElementById(dislikeBtnID);

  if (updatedIsLike === true) {
    likeBtn.classList.add("active");
    dislikeBtn.classList.remove("active");
  } else if (updatedIsLike === false) {
    dislikeBtn.classList.add("active");
    likeBtn.classList.remove("active");
  } else {
    likeBtn.classList.remove("active");
    dislikeBtn.classList.remove("active");
  }
}
