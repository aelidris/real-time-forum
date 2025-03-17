document.addEventListener("DOMContentLoaded", function () {
  const chatContainer = document.getElementById("chatContainer");
  const chatUserName = document.getElementById("chatUserName");
  const chatMessages = document.getElementById("chatMessages");
  const chatInput = document.getElementById("chatInput");
  const sendMessageButton = document.getElementById("sendMessageButton");

  const closeChatButton = document.getElementById("closeChatButton");
  const postsAndFilterContainer = document.getElementById("postsAndFilterContainer");

  const contactsList = document.querySelector(".contacts-list");

  // WebSocket connection
  let socket;

  // Fetch users from the Go backend
  fetch("http://localhost:8000/api/users")
    .then((response) => response.json())
    .then((users) => {
      // Clear any existing placeholder contacts
      contactsList.innerHTML = "";

      // Populate the contacts list
      users.forEach((user) => {
        const contact = document.createElement("div");
        contact.classList.add("contact");

        // Add user icon
        const userIcon = document.createElement("ion-icon");
        userIcon.setAttribute("name", "person-circle-outline");
        contact.appendChild(userIcon);

        // Add user name
        const userName = document.createElement("span");
        userName.textContent = `${user.first_name} ${user.last_name}`; // Combine first and last name
        contact.appendChild(userName);

        // Add click event to open chat
        contact.addEventListener("click", () => {
          chatUserName.textContent = `${user.first_name} ${user.last_name}`; // Set chat header
          chatContainer.style.display = "block"; // Show chat
          postsAndFilterContainer.style.display = "none"; // Hide posts
          chatMessages.innerHTML = ""; // Clear chat messages

          // Initialize WebSocket connection when a contact is clicked
          if (socket) {
            socket.close(); // Close existing WebSocket connection if any
          }
          socket = new WebSocket("ws://localhost:8000/ws");

          // Handle WebSocket connection
          socket.onopen = function () {
            console.log("WebSocket connection established");
          };

          socket.onmessage = function (event) {
            console.log("Received message:", event.data);
            const message = document.createElement("div");
            message.classList.add("message", "received");
            message.textContent = event.data;
            chatMessages.appendChild(message);
            chatMessages.scrollTop = chatMessages.scrollHeight;
          };

          socket.onerror = function (error) {
            console.error("WebSocket error:", error);
          };

          socket.onclose = function () {
            console.log("WebSocket connection closed");
          };
        });

        // Append the contact to the list
        contactsList.appendChild(contact);
      });
    })
    .catch((error) => {
      console.error("Error fetching users:", error);
    });

  // Close chat when the close button is clicked
  closeChatButton.addEventListener("click", () => {
    chatContainer.style.display = "none"; // Hide the chat container
    postsAndFilterContainer.style.display = "block"; // Show the posts and filter container

    if (socket) {
      socket.close(); // Close the WebSocket connection when the chat is closed
    }
  });

  // Send a message when the send button is clicked
  sendMessageButton.addEventListener("click", () => {
    const messageText = chatInput.value.trim();
    if (messageText && socket) {
      console.log("Sending message:", messageText); // Log the message being sent
      socket.send(messageText);

      // Add the message to the chat
      const messageElement = document.createElement("div");
      messageElement.classList.add("message", "sent");
      messageElement.textContent = messageText;
      chatMessages.appendChild(messageElement);

      // Clear the input
      chatInput.value = "";

      // Scroll to the bottom of the chat
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  });

  // Send a message when pressing Enter
  chatInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      sendMessageButton.click();
    }
  });
});