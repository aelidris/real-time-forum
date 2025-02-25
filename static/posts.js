document.getElementById("postForm").addEventListener("submit", function (event) {
  event.preventDefault();

  // Check if at least one category is selected
  const selectedCategories = document.querySelectorAll(
    'input[name="category"]:checked'
  );
  if (selectedCategories.length === 0) {
    alert("Please select at least one category.");
    return;
  }

  const formData = new FormData(this);
  // console.log("post form data", formData);


  fetch("/post_submit", {
    method: "POST",
    body: formData,
  })
    .then(async (response) => {
      if (!response.ok) {
        return response.json().then((data) => {
          throw new Error(data.error || "An unknown error occurred.");
        });
      }
      return response.json();
    })
    .then(() => {
      // alert("Post submitted successfully!");
      postsPerPage = 5;
      loadPosts();
      this.reset();

       // Close the post popup after successful submission
       document.getElementById("postPopup").classList.remove("show");
       
    })
    .catch((error) => {
      console.error("Error:", error);
      alert(error.message || "An error occurred while submitting the post.");
    });
});

/******************************************** */

let currentIndex = 0;
var postsPerPage = 5;
let selectedCategory = null;
let selectedOwnership = null;
let allPosts = [];

async function loadPosts() {
  try {

    const params = new URLSearchParams();

    if (selectedCategory && selectedCategory !== 'all') {
      params.append('category', selectedCategory);
    }

    if (selectedOwnership && selectedOwnership !== 'all') {
      params.append('ownership', selectedOwnership);
    }

    const response = await fetch(`/show_posts?${params.toString()}`);

    if (!response.ok) {
      const errorData = await response.json();
      // throw new Error("Failed to fetch data");
      throw new Error(errorData.error || "Failed to fetch data");
    }

    // const contentType = response.headers.get("content-type");
    // if (!contentType || !contentType.includes("application/json")) {
    //   throw new Error("Expected JSON, but got HTML");
    // }

    allPosts = await response.json();
    // console.log(allPosts);

    const allPostsContainer = document.getElementById("allPosts");
    if (!allPostsContainer) {
      console.error("Element with id 'allPosts' not found!");
      return;
    }

    if (allPosts.length === 0) {
      allPostsContainer.innerHTML = `
      // <p style = "color:red"; >No posts found.</p>`;
      allPostsContainer.innerHTML = `
      <div style="
        padding: 20px; 
        margin: 20px;
        background-color: #ffecec; 
        color: #d8000c; 
        border: 1px solid #d8000c; 
        border-radius: 5px; 
        text-align: center;
      ">
        <strong>Error:</strong> No posts found.
      </div>
    `;

      return;
    }

    allPostsContainer.innerHTML = "";
    currentIndex = 0;
    loadMorePosts();
  } catch (error) {
    console.error("Error loading posts:", error);
    // console.log("test")
    // console.log("error" ,error)
    console.error("Failed to load posts test: " + error.message);
  }
}
function loadMorePosts() {
  const allPostsContainer = document.getElementById("allPosts");
  const loadMoreBtn = document.getElementById("loadMoreBtn");

  for (
    let i = currentIndex;
    i < currentIndex + postsPerPage && i < allPosts.length;
    i++
  ) {
    try {
      const postElement = createPostElement(allPosts[i]);
      allPostsContainer.appendChild(postElement);
    } catch (err) {
      console.error("Error creating post element:", err, allPosts[i]);
    }
  }

  currentIndex += postsPerPage;

  if (currentIndex >= allPosts.length) {
    loadMoreBtn.style.display = "none";
  } else {
    loadMoreBtn.style.display = "block";
  }
}

document.getElementById("loadMoreBtn").addEventListener("click", loadMorePosts);

loadPosts();

//   create a post element
function createPostElement(postData) {
  // console.log(postData);

  const postDiv = document.createElement("div");
  postDiv.classList.add(`post${postData.PostID}`, "post");

  // Handle null Comments gracefully
  const commentCount = Array.isArray(postData.Comments)
    ? postData.Comments.length
    : 0;


  postDiv.innerHTML = `
      <div class="post-header"> 
      <img src="./static/profile.png" width="36" height="36" border-radius=18px alt="user-pic">
      <h4 class="author">${postData.Author}</h4>
      </div>
      <h2 class="post-title">${postData.Title}</h2>
      <div class="post-categories">
        ${postData.Categories.map(
    (cat) => `<span class="category-tag">${cat}</span>`
  ).join("")}
      </div>
      <div class="post-content">${postData.Content}</div>

      <div class="stats">
      <span id="like${postData.PostID}">${postData.LikeCount}</span> likes · 
      <span id="dislikes${postData.PostID}">${postData.DislikeCount}</span> dislikes 
      </div>

      <div class="interaction-bar">
        <button id="post-like-btn-${postData.PostID
    }" class="interaction-button ${postData.IsLike === 1 ? "active" : ""}"
          onclick="submitLikeDislike({ postID: '${postData.PostID
    }', isLike: true })">👍 Like</button>
        <button id="post-dislike-btn-${postData.PostID
    }" class="interaction-button ${postData.IsLike === 2 ? "active" : ""}"
          onclick="submitLikeDislike({ postID: '${postData.PostID
    }', isLike: false })">👎 Dislike</button>
        <button class="interaction-button comment-button" onclick="toggleComments('${postData.PostID
    }')">
          💬 Comments (${commentCount})
        </button>
      </div>
      <div class="comments-section" id="comments-${postData.PostID
    }" style="display: none;">
        <form class="comment-form"  style="display : block" id="commentForm-${postData.PostID
    }" onsubmit="submitComment(event, ${postData.PostID})">
          <input type="hidden" name="post_id" value="${postData.PostID}">
          <textarea placeholder="Write a comment..." name="comment" required></textarea>
          <button type="submit">Add Comment</button>
        </form>
        ${commentCount > 0
      ? postData.Comments.map(
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
    `;

  return postDiv;
}

document.getElementById("categoryFilter").addEventListener("change", function () {
  selectedCategory = this.value === "all" ? null : this.value;
  selectedOwnership = this.value === null;
  const categoy = document.getElementById("ownershipFilter")
  categoy.value = "all";
  postsPerPage = 5;
  loadPosts();
  console.log("selectedCategory", selectedCategory);

});

document.getElementById("ownershipFilter").addEventListener("change", function () {
  selectedOwnership = this.value === "all" ? null : this.value;
  selectedCategory = this.value === null;
  const categoy = document.getElementById("categoryFilter")
  categoy.value = "all";
  postsPerPage = 5;
  loadPosts();
  console.log("selectedOwnership", selectedOwnership);

});

async function filterPostsByOwnership(ownership) {
  try {
    const response = await fetch(`/show_posts?ownership=${ownership}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const posts = await response.json();

    const allPostsContainer = document.getElementById("allPosts");
    if (!allPostsContainer) {
      console.error("Element with id 'allPosts' not found!");
      return;
    }

    allPostsContainer.innerHTML = "";

    if (posts.length === 0) {
      console.log("No posts found for the selected posts.");
      // allPostsContainer.innerHTML = "<p>No posts found.</p>";
      allPostsContainer.innerHTML = `
      <div style="
        padding: 20px; 
        background-color: #ffecec; 
        color: #d8000c; 
        border: 1px solid #d8000c; 
        border-radius: 5px; 
        text-align: center;
      ">
        <strong>Error:</strong> No posts found.
      </div>
    `;

      return;
    }

    posts.forEach((post) => {
      const postElement = createPostElement(post);
      allPostsContainer.appendChild(postElement);
    });

    allPosts = [];
    currentIndex = 0;
    loadMorePosts();

  } catch (error) {
    console.error("Error filtering:", error);
    alert("failed to filter posts.");
  }
}


async function filterPostsByCategory(category) {
  try {
    const response = await fetch(`/show_posts?category=${category}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const posts = await response.json();

    const allPostsContainer = document.getElementById("allPosts");
    if (!allPostsContainer) {
      console.error("Element with id 'allPosts' not found!");
      return;
    }
    // console.log(category);


    allPostsContainer.innerHTML = "";

    if (posts.length === 0) {
      console.log("No posts found for the selected category.");
      allPostsContainer.innerHTML = `
      <style>
      p{
      color: red;
      }
      </style>
      <p>No posts found for the selected category.</p>`
      return;
    }

    posts.forEach((post) => {
      const postElement = createPostElement(post);
      allPostsContainer.appendChild(postElement);
    });


    allPosts = [];
    currentIndex = 0;
    loadMorePosts();

  } catch (error) {
    console.error("Error filtering posts by category:", error);
    alert("Failed to filter posts by category.");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const ownershipFilterContainer = document.getElementById("ownershipFilterContainer");


  fetch("/check-session", {
    method: "GET",
    credentials: "same-origin",
  })
    .then((response) => {
      if (response.ok) {
        return response.json();
      } else {
        throw new Error("Failed to check session");
      }
    })
    .then((data) => {
      if (!data.loggedIn) {
        ownershipFilterContainer.style.display = "none";
      } else {
        ownershipFilterContainer.style.display = "block";
      }
    })
    .catch((error) => {
      console.error("Error checking session:", error);
      ownershipFilterContainer.style.display = "none";
    });
});


