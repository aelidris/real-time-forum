document.getElementById("loginForm").addEventListener("submit", function (event) {
  event.preventDefault();
  const errorElement = document.getElementById("loginMessage");
  errorElement.textContent = "";
  errorElement.style.display = "none";

  const formData = new FormData(this);
  const identifier = formData.get("email");
  const password = formData.get("password");

  if (!identifier || !password) {
    showError(errorElement, "nickname/Email and password are required.");
    return;
  }

  fetch("/login", {
    method: "POST",
    body: formData,
  })
    .then(handleResponse)
    .then(data => {
      if (data.message) {
        this.reset();
        window.handleAuthSuccess();
      }
    })
    .catch(error => {
      showError(errorElement, error.error || "Login failed. Please check your credentials.");
    });
});

document.getElementById("registerForm").addEventListener("submit", function (event) {
  event.preventDefault();
  clearErrors();

  const formData = new FormData(this);
  const password = formData.get("password");
  const confirmPassword = document.getElementById("confirmPassword").value;
  const passwordError = document.getElementById("passwordError");

  // Client-side validation
  let isValid = true;

  // Password match check
  if (password !== confirmPassword) {
    showError(passwordError, "Passwords do not match!");
    isValid = false;
  }

  // Required fields check
  const requiredFields = [
    'nickname', 'email', 'first_name', 'last_name', 
    'age', 'gender', 'password'
  ];

  requiredFields.forEach(field => {
    const value = formData.get(field);
    const inputId = `register${capitalize(field)}`;
    const inputElement = document.getElementById(inputId);
    
    if (!inputElement) {
      console.error(`Element not found: ${inputId}`);
      return;
    }

    const errorElement = inputElement.nextElementSibling;
    if (!errorElement || !errorElement.classList.contains("error-message")) {
      console.error(`Missing error element for: ${inputId}`);
      return;
    }

    if (!value?.trim()) {
      showError(errorElement, "This field is required");
      isValid = false;
    }
  });

  if (!isValid) return;

  fetch("/register", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(formData),
  })
    .then(handleResponse)
    .then(data => {
      if (data.message) {
        this.reset();
        document.getElementById("confirmPassword").value = "";
        switchToLoginTab();
        showSuccess("Registration successful! Please login.");
      }
    })
    .catch(error => {
      if (error.fields) {
        Object.entries(error.fields).forEach(([field, message]) => {
          const inputId = `register${capitalize(field)}`;
          const inputElement = document.getElementById(inputId);
          if (inputElement) {
            const errorElement = inputElement.nextElementSibling;
            if (errorElement) {
              showError(errorElement, message);
            }
          }
        });
      } else {
        showError(document.getElementById("passwordError"), error.error || "Registration failed. Please try again.");
      }
    });
});

function handleResponse(response) {
  return response.json().then(data => {
    if (!response.ok) throw data;
    return data;
  });
}

function clearErrors() {
  document.querySelectorAll(".error-message").forEach(el => {
    el.textContent = "";
    el.style.display = "none";
  });
}

function showError(element, message) {
  if (!element) return;
  element.textContent = message;
  element.style.display = "block";
  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function showSuccess(message) {
  const successElement = document.createElement("div");
  successElement.className = "auth-message success";
  successElement.textContent = message;
  
  const authHeader = document.querySelector(".auth-header");
  authHeader.insertAdjacentElement("afterend", successElement);
  
  setTimeout(() => successElement.remove(), 3000);
}

function switchToLoginTab() {
  document.querySelectorAll(".auth-tabs button").forEach(tab => {
    if (tab.dataset.form === "login") {
      tab.click();
    }
  });
}

function capitalize(string) {
  return string
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}
