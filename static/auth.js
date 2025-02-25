document.getElementById("logoutButton").addEventListener("click", () => {
  fetch("/logout", {
    method: "POST",
    credentials: "include", // Ensure cookies are sent
  })
    .then((response) => {
      if (response.ok) {
        if (response.redirected) {
          loadPosts();
          window.location.href = response.url;
        }
      } else {
        console.error("Logout failed with status:", response.status);
      }
    });      
});
/************************************************** */
document
  .getElementById("loginForm")
  .addEventListener("submit", function (event) {
    event.preventDefault();

    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;
    const errorElement = document.getElementById("loginMessage");

    if (!email || !password) {
      errorElement.textContent = "Email or Nickname and password are required.";
      errorElement.style.display = "block";
      return;
    } else {
      errorElement.style.display = "none";
    }

    const formData = new FormData(this);

    fetch("/login", {
      method: "POST",
      body: formData,
    })
      .then((response) => {
        return response.json().then((data) => {
          if (!response.ok) {
            throw data;
          }
          return data;
        });
      })
      .then((data) => {
        alert(data.message);
        document.getElementById("loginForm").reset();
        setTimeout(() => {
          window.location.href = "/";
        }, 500);
      })
      .catch((error) => {
        console.log("Error object:", error);

        if (error && error.error) {
          errorElement.textContent = error.error;
          errorElement.style.display = "block";
        } else {
          alert("An unexpected error occurred. Check the console for details.");
        }
      });
  });

/************************************* */
document
  .getElementById("registerForm")
  .addEventListener("submit", function (event) {
    event.preventDefault();

    // Reset all error messages before new validation
    document.querySelectorAll(".form-group small").forEach((element) => {
      element.textContent = "";
      element.style.display = "none";
    });

    const formData = new FormData(this);

    // Extract form values
    const password = document.getElementById("registerPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;
    const errorElement = document.getElementById("passwordError");

    if (password !== confirmPassword) {
      errorElement.textContent = "Passwords do not match!";
      errorElement.style.display = "block";
      return;
    }

    // Convert FormData to an object for debugging
    let formDataObject = {};
    formData.forEach((value, key) => {
      formDataObject[key] = value;
    });

    console.log("Form Data:", JSON.stringify(formDataObject)); // Debugging

    fetch("/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(formData).toString(),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.error === "Validation error" && data.fields) {
          Object.entries(data.fields).forEach(([field, message]) => {
            const fieldId = `register${capitalize(field)}`;
            const errorElement = document.getElementById(fieldId)?.nextElementSibling;
            
            if (errorElement) {
              errorElement.textContent = message;
              errorElement.style.display = "block";
            } else {
              console.warn(`No error element found for ${fieldId}`);
            }
          });
        } else if (data.error) {
          alert(data.error);
        } else {
          alert(data.message);
          this.reset();
        }
      })
      .catch((error) => {
        console.error("Request error:", error);
        alert("An error occurred.");
      });
  });

function capitalize(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

/****************************************** */
