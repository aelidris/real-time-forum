document.getElementById("postForm").addEventListener("submit", function (event) {
  event.preventDefault();
  const errorElement = document.getElementById("postError") || document.createElement("div");
  
  // Clear previous errors
  errorElement.textContent = "";
  errorElement.style.display = "none";

  const selectedCategories = document.querySelectorAll('input[name="category"]:checked');
  if (selectedCategories.length === 0) {
    showPostError("Please select at least one category.");
    return;
  }

  const formData = new FormData(this);

  fetch("/post_submit", {
    method: "POST",
    body: formData,
  })
  .then(async (response) => {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Post submission failed");
    return data;
  })
  .then(() => {
    postsPerPage = 5;
    loadPosts();
    this.reset();
    document.getElementById("postPopup").classList.remove("show");
  })
  .catch((error) => {
    showPostError(error.message);
    console.error("Post error:", error);
  });
});

let currentIndex = 0;
let postsPerPage = 5;
let selectedCategory = null;
let allPosts = [];

async function loadPosts() {
  try {
    const params = new URLSearchParams();
    if (selectedCategory && selectedCategory !== 'all') params.append('category', selectedCategory);

    const response = await fetch(`/show_posts?${params.toString()}`);
    if (!response.ok) throw new Error(await response.text());

    allPosts = await response.json();
    const allPostsContainer = document.getElementById("allPosts");
    
    allPostsContainer.innerHTML = "";
    currentIndex = 0;
    
    if (allPosts.length === 0) {
      allPostsContainer.innerHTML = `
        <div class="info-message">
          <strong>No posts found</strong>
        </div>
      `;
      return;
    }

    loadMorePosts();
  } catch (error) {
    document.getElementById("allPosts").innerHTML = `
      <div class="error-message">
        Error loading posts: ${error.message}
      </div>
    `;
    console.error("Load posts error:", error);
  }
}

function loadMorePosts() {
  const allPostsContainer = document.getElementById("allPosts");
  const loadMoreBtn = document.getElementById("loadMoreBtn");

  for (let i = currentIndex; i < currentIndex + postsPerPage && i < allPosts.length; i++) {
    try {
      const postElement = createPostElement(allPosts[i]);
      allPostsContainer.appendChild(postElement);
    } catch (err) {
      console.error("Error creating post element:", err, allPosts[i]);
    }
  }

  currentIndex += postsPerPage;
  loadMoreBtn.style.display = currentIndex >= allPosts.length ? "none" : "block";
}

document.getElementById("loadMoreBtn").addEventListener("click", loadMorePosts);

function createPostElement(postData) {
  const postDiv = document.createElement("div");
  postDiv.classList.add(`post${postData.PostID}`, "post");

  const timeAgo = formatTimeAgo(new Date(postData.CreatedAt));
  const commentCount = Array.isArray(postData.Comments) ? postData.Comments.length : 0;

  postDiv.innerHTML = `
    <div class="post-header">
      <img src="/static/profile.png" width="36" height="36" class="post-avatar" alt="user avatar">
      <div class="author-time-container">
        <span class="author">${postData.Author}</span>
        <span class="post-time">${timeAgo}</span>
      </div>
    </div>
    <h2 class="post-title">${postData.Title}</h2>
    <div class="post-categories">
      ${postData.Categories.map(cat => `<span class="category-tag">${cat}</span>`).join("")}
    </div>
    <div class="post-content">${postData.Content}</div>
    <div class="stats">
      <span id="like${postData.PostID}">${postData.LikeCount}</span> likes ·
      <span id="dislikes${postData.PostID}">${postData.DislikeCount}</span> dislikes
    </div>
    <div class="interaction-bar">
      <button id="post-like-btn-${postData.PostID}" class="interaction-button ${postData.IsLike === 1 ? "active" : ""}"
        onclick="submitLikeDislike({ postID: '${postData.PostID}', isLike: true })">
        <ion-icon name="thumbs-up-outline"></ion-icon>
        <span>Like</span>
      </button>
      <button id="post-dislike-btn-${postData.PostID}" class="interaction-button ${postData.IsLike === 2 ? "active" : ""}"
        onclick="submitLikeDislike({ postID: '${postData.PostID}', isLike: false })">
        <ion-icon name="thumbs-down-outline"></ion-icon>
        <span>Dislike</span>
      </button>
      <button class="interaction-button comment-button" onclick="toggleComments('${postData.PostID}')">
        <ion-icon name="chatbubble-outline"></ion-icon>
        <span>Comments (${commentCount})</span>
      </button>
    </div>
    <div class="comments-section" id="comments-${postData.PostID}" style="display: none;">
      <form class="comment-form" id="commentForm-${postData.PostID}" onsubmit="submitComment(event, ${postData.PostID})">
        <input type="hidden" name="post_id" value="${postData.PostID}">
        <textarea placeholder="Write a comment..." name="comment" required></textarea>
        <button type="submit">Add Comment</button>
      </form>
      ${commentCount > 0 ? postData.Comments.map(comment => `
        <div class="comment">
          <div class="comment-header">
            <img src="/static/profile.png" width="32" height="32" class="comment-avatar">
            <div class="author-time-container">
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
            <button id="comment-like-btn-${comment.CommentID}" class="interaction-button ${comment.IsLike === 1 ? "active" : ""}"
              onclick="submitLikeDislike({ commentID: '${comment.CommentID}', isLike: true })">
              <ion-icon name="thumbs-up-outline"></ion-icon>
              <span>Like</span>
            </button>
            <button id="comment-dislike-btn-${comment.CommentID}" class="interaction-button ${comment.IsLike === 2 ? "active" : ""}"
              onclick="submitLikeDislike({ commentID: '${comment.CommentID}', isLike: false })">
              <ion-icon name="thumbs-down-outline"></ion-icon>
              <span>Dislike</span>
            </button>
          </div>
        </div>
      `).join("") : "<p>No comments yet.</p>"}
    </div>
  `;

  return postDiv;
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

document.getElementById("categoryFilter").addEventListener("change", function () {
  selectedCategory = this.value === "all" ? null : this.value;
  postsPerPage = 5;
  loadPosts();
});

function showPostError(message) {
  const errorContainer = document.getElementById("postError") || createErrorContainer();
  errorContainer.textContent = message;
  errorContainer.style.display = "block";
  errorContainer.scrollIntoView({ behavior: "smooth", block: "center" });
}

function createErrorContainer() {
  const container = document.createElement("div");
  container.id = "postError";
  container.className = "error-message";
  document.querySelector(".post-form").prepend(container);
  return container;
}