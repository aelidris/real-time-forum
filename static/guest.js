document.addEventListener("DOMContentLoaded", () => {
  const authContainer = document.getElementById("authContainer");
  const mainContent = document.getElementById("mainContent");
  const authTabs = document.querySelectorAll(".auth-tabs button");
  const postPopup = document.getElementById("postPopup");
  const closePostPopup = document.getElementById("closePostPopup");
  const logoutButton = document.getElementById("logoutButton");
  const createPostButton = document.getElementById("createPostButton");

  // Session management
  function checkSession() {
    fetch("/check-session", {
      method: "GET",
      credentials: "same-origin"
    })
    .then(response => {
      if (!response.ok) throw new Error("Session check failed");
      return response.json();
    })
    .then(data => {
      if (data.loggedIn) {
        showMainContent();
      } else {
        showAuthForms();
      }
    })
    .catch(error => {
      console.error("Session error:", error);
      showAuthForms();
    });
  }

  function showMainContent() {
    authContainer.style.display = "none";
    mainContent.style.display = "block";
    updateAuthenticatedUI(true);
  }

  function showAuthForms() {
    authContainer.style.display = "flex";
    mainContent.style.display = "none";
    updateAuthenticatedUI(false);
  }

  function updateAuthenticatedUI(isLoggedIn) {
    const interactionButtons = document.querySelectorAll(".interaction-button:not(.comment-button)");
    const commentForms = document.querySelectorAll(".comment-form");
    
    if (isLoggedIn) {
      createPostButton.style.display = "inline-block";
      logoutButton.style.display = "inline-block";
      interactionButtons.forEach(btn => btn.disabled = false);
      commentForms.forEach(form => form.style.display = "block");
    } else {
      createPostButton.style.display = "none";
      logoutButton.style.display = "none";
      interactionButtons.forEach(btn => btn.disabled = true);
      commentForms.forEach(form => form.style.display = "none");
    }
  }

  // Auth tab switching
  authTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const formType = tab.dataset.form;
      
      // Update tabs
      authTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      
      // Update forms
      document.querySelectorAll(".auth-form").forEach(form => {
        form.classList.remove("active");
        if (form.id === `${formType}Form`) {
          form.classList.add("active");
        }
      });
    });
  });

  // Post popup controls
  createPostButton.addEventListener("click", () => {
    postPopup.classList.add("show");
  });

  closePostPopup.addEventListener("click", () => {
    postPopup.classList.remove("show");
  });

  postPopup.addEventListener("click", (e) => {
    if (e.target === postPopup) {
      postPopup.classList.remove("show");
    }
  });

  // Logout handler
  logoutButton.addEventListener("click", () => {
    fetch("/logout", {
      method: "POST",
      credentials: "include",
    })
    .then(response => {
      if (response.ok) {
        showAuthForms();
        window.scrollTo(0, 0);
      }
    })
    .catch(error => console.error("Logout failed:", error));
  });

  // Initial check
  checkSession();

  // Global auth success handler
  window.handleAuthSuccess = () => {
    checkSession();
    window.scrollTo(0, 0);
  };
});