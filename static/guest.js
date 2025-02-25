document.addEventListener("DOMContentLoaded", () => {
  const loginToggle = document.getElementById("loginToggle");
  const authPopup = document.getElementById("authPopup");
  const closePopup = document.getElementById("closePopup");
  const authTabs = document.querySelectorAll(".auth-tabs button");
  const authForms = document.querySelectorAll(".auth-form");
  const logoutButton = document.getElementById("logoutButton");
  const createPostButton = document.getElementById("createPostButton");
  const postPopup = document.getElementById("postPopup");
  const closePostPopup = document.getElementById("closePostPopup");

  function updateUI() {
    const commentsSection = document.querySelectorAll(".comment-form");
    const disableInteraction = document.querySelectorAll(".interaction-button:not(.comment-button)");

    fetch("/check-session", {
      method: "GET",
      credentials: "same-origin",
    })
      .then((response) => {
        if (response.ok) return response.json();
        return response.json().then(data => { throw new Error(data.message || "Unauthorized") });
      })
      .then((data) => {
        if (data.loggedIn) {
          console.log("User is logged in.");
          commentsSection.forEach(section => section.style.display = "block");
          createPostButton.style.display = "inline-block";
          logoutButton.style.display = "inline-block";
          loginToggle.style.display = "none";
          disableInteraction.forEach(button => button.disabled = false);
        } else {
          console.log("User is not logged in.");
          commentsSection.forEach(section => section.style.display = "none");
          createPostButton.style.display = "none";
          logoutButton.style.display = "none";
          loginToggle.style.display = "inline-block";
          disableInteraction.forEach(button => button.disabled = true);
          postPopup.classList.remove("show");
        }
      })
      .catch((error) => {
        console.error("Session check failed:", error);
        commentsSection.forEach(section => section.style.display = "none");
        createPostButton.style.display = "none";
        logoutButton.style.display = "none";
        loginToggle.style.display = "inline-block";
        disableInteraction.forEach(button => button.disabled = true);
        postPopup.classList.remove("show");
      });
  }

  // MutationObserver for dynamic content
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      if (mutation.type === 'childList') updateUI();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Initial UI update
  updateUI();

  // Auth popup controls
  loginToggle.addEventListener("click", () => authPopup.classList.add("show"));
  closePopup.addEventListener("click", () => authPopup.classList.remove("show"));
  authPopup.addEventListener("click", (e) => {
    if (e.target === authPopup) authPopup.classList.remove("show");
  });

  // Post popup controls
  createPostButton.addEventListener("click", () => postPopup.classList.add("show"));
  closePostPopup.addEventListener("click", () => postPopup.classList.remove("show"));
  postPopup.addEventListener("click", (e) => {
    if (e.target === postPopup) postPopup.classList.remove("show");
  });

  // Tab switching
  authTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const formType = tab.dataset.form;
      authTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      authForms.forEach(form => {
        form.classList.toggle("active", form.id === `${formType}Form`);
      });
    });
  });
});