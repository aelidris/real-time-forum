document.addEventListener("DOMContentLoaded", function () {
    const contacts = document.querySelectorAll(".contact");
    const chatContainer = document.getElementById("chatContainer");
    const chatUserName = document.getElementById("chatUserName");
    const chatMessages = document.getElementById("chatMessages");
    const chatInput = document.getElementById("chatInput");
    const sendMessageButton = document.getElementById("sendMessageButton");
    const closeChatButton = document.getElementById("closeChatButton");
    const postsAndFilterContainer = document.getElementById("postsAndFilterContainer");
  
    // Show chat when a contact is clicked
    contacts.forEach((contact) => {
      contact.addEventListener("click", () => {
        const userName = contact.querySelector("span").textContent;
        chatUserName.textContent = userName; // Set the chat header to the user's name
        chatContainer.style.display = "block"; // Show the chat container
        postsAndFilterContainer.style.display = "none"; // Hide the posts and filter container
        chatMessages.innerHTML = ""; // Clear previous chat messages
      });
    });
  
    // Close chat when the close button is clicked
    closeChatButton.addEventListener("click", () => {
      chatContainer.style.display = "none"; // Hide the chat container
      postsAndFilterContainer.style.display = "block"; // Show the posts and filter container
    });
  
    // Send a message when the send button is clicked
    sendMessageButton.addEventListener("click", () => {
      const messageText = chatInput.value.trim();
      if (messageText) {
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