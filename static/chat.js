document.addEventListener("DOMContentLoaded", function () {
    const username = localStorage.getItem("username") || "Guest";
    const socket = new WebSocket(`ws://localhost:8080/ws?username=${username}`);

    socket.onopen = function () {
        console.log("Connected to WebSocket server");
    };

    socket.onmessage = function (event) {
        const data = JSON.parse(event.data);

        if (data.type === "onlineUsers") {
            updateOnlineUsers(data.users);
        } else if (data.type === "notification") {            
            showNotification(data.sender);
        } else if (data.type === "chatHistory") {
            displayChatHistory(data.messages); // ✅ Show chat history            
        } else if (data.receiver) {
            displayPrivateMessage(
                data.sender, 
                data.receiver, 
                data.content, 
                data.timestamp,
                data.firstName,  // ✅ Now passing first name
                data.lastName    // ✅ Now passing last name
            );
        } else {
            displayMessage(data.sender, data.content, data.timestamp);
        }
    };

    function showNotification(senderUsername) {
        alert("A new message received!");
    }
    
    

    // Function to display chat history
    function displayChatHistory(messages) {
    if (!messages || messages.length === 0) return;

    const chatWith = messages[0].receiver === username ? messages[0].sender : messages[0].receiver;
    let messageList = document.getElementById(`messages-${chatWith}`);
    if (!messageList) return;

    messageList.innerHTML = ""; // Clear old messages

    messages.forEach(msg => {
        displayPrivateMessage(msg.sender, msg.receiver, msg.content, msg.timestamp);
    });
    }

    socket.onclose = function () {
        console.log("Disconnected from WebSocket server");
    };

    function updateOnlineUsers(users) {
        const userList = document.getElementById("onlineUserList");
        userList.innerHTML = ""; // Clear existing list

        users.forEach((user) => {
            if (user.username !== username) { // Don't show current user
                const userElement = document.createElement("li");
                userElement.textContent = `${user.firstName} ${user.lastName}`;
                userElement.dataset.username = user.username;
                userElement.classList.add("online-user"); // Apply CSS class
                userElement.addEventListener("click", () => openPrivateChat(user.username, user.firstName, user.lastName));
                userList.appendChild(userElement);
            }
        });
    }

    function openPrivateChat(username, firstName, lastName) {
        let chatBox = document.getElementById(`chat-${username}`);

        // If chat box does not exist, create a new one
        if (!chatBox) {
            chatBox = document.createElement("div");
            chatBox.id = `chat-${username}`;
            chatBox.className = "private-chat";
            chatBox.innerHTML = `
                <div class="chat-header">
                    <h4>Chat with ${firstName} ${lastName}</h4>
                    <button class="close-chat" onclick="closeChat('${username}')">×</button>
                </div>
                <ul class="chat-messages" id="messages-${username}"></ul>
                <input type="text" id="input-${username}" placeholder="Type a message...">
                <button onclick="sendPrivateMessage('${username}', '${firstName}', '${lastName}')">Send</button>
            `;

            document.getElementById("chatContainer").appendChild(chatBox);

            // Add event listener to send message when Enter is pressed
            const messageInput = document.getElementById(`input-${username}`);
            messageInput.addEventListener("keypress", function (event) {
                if (event.key === "Enter") {
                    sendPrivateMessage(username);
                }
            });
        }

        // Bring the chat box to the front if it already exists
        chatBox.style.display = "block";
    }

    window.sendPrivateMessage = function (receiver, firstName, lastName) {
        const messageInput = document.getElementById(`input-${receiver}`);
        const message = messageInput.value.trim();
        console.log(message);
        
        if (message) {
            const data = {
                sender: username,
                receiver: receiver,
                content: message,
                timestamp: new Date().toLocaleTimeString(),
                firstName: firstName, // ✅ Include first name
                lastName: lastName    // ✅ Include last name
            };

            // Send the message to the WebSocket server
            socket.send(JSON.stringify(data));

            // Display the message in the sender's own chat box immediately
            displayPrivateMessage(username, receiver, message, data.timestamp, firstName, lastName);

            // Clear the input field
            messageInput.value = "";
        }
    };

    function displayPrivateMessage(sender, receiver, content, timestamp, firstName, lastName) {
        let chatWith = sender === username ? receiver : sender; // Choose correct chat box ID
        let chatBox = document.getElementById(`chat-${chatWith}`);

        if (!chatBox) {
            openPrivateChat(chatWith, firstName, lastName);
        }

        const messageList = document.getElementById(`messages-${chatWith}`);
        if (!messageList) return;

        const displayName = sender === username ? "You" : `${firstName} ${lastName}`; // ✅ Use full name instead of username

        const messageElement = document.createElement("li");
        messageElement.textContent = `[${timestamp}] ${displayName}: ${content}`;
        messageElement.classList.add(sender === username ? "sent-message" : "received-message"); // Apply CSS classes

        messageList.appendChild(messageElement);

        // Auto-scroll to the latest message
        messageList.scrollTop = messageList.scrollHeight;
    }

    window.closeChat = function (username) {
        const chatBox = document.getElementById(`chat-${username}`);
        if (chatBox) {
            chatBox.style.display = "none"; // Hide the chat instead of deleting it
        }
    };
});
