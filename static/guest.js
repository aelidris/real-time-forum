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
    mainContent.style.display = "flex";
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
  // Enhanced Logout handler with state synchronization
logoutButton.addEventListener("click", async (e) => {
  e.preventDefault();
  
  // Add loading state
  const originalText = logoutButton.textContent;
  logoutButton.disabled = true;
  logoutButton.textContent = "Logging out...";

  try {
    // Close WebSocket connection gracefully
    if (window.chatSystem?.socket) {
      window.chatSystem.socket.close(1000, "User logged out");
      // Wait briefly for close to complete
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Send logout request
    const response = await fetch("/logout", {
      method: "POST",
      credentials: "include"
    });

    if (!response.ok) throw new Error("Logout failed");

    // Clear client-side state
    localStorage.removeItem("nickname");
    window.chatSystem = null;

    // Reset UI completely
    showAuthForms();
    window.scrollTo(0, 0);
    
    // Force server state sync with a soft reload
    setTimeout(() => {
      window.location.reload();
    }, 300);
    
  } catch (error) {
    console.error("Logout error:", error);
    // Fallback to hard reload if something went wrong
    window.location.href = "/";
  } finally {
    logoutButton.textContent = originalText;
    logoutButton.disabled = false;
  }
});


  // Initial check
  checkSession();

  // Global auth success handler
  window.handleAuthSuccess = () => {
    checkSession();
    window.scrollTo(0, 0);
  };
});