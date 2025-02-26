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
        } else if (data.receiver) {
            displayPrivateMessage(data.sender, data.receiver, data.content, data.timestamp);
        } else {
            displayMessage(data.sender, data.content, data.timestamp);
        }
    };

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
                userElement.addEventListener("click", () => openPrivateChat(user.username, user.firstName, user.lastName));
                userList.appendChild(userElement);
            }
        });
    }

    function openPrivateChat(username, firstName, lastName) {
        let chatBox = document.getElementById(`chat-${username}`);
        if (!chatBox) {
            chatBox = document.createElement("div");
            chatBox.id = `chat-${username}`;
            chatBox.className = "private-chat";
            chatBox.innerHTML = `
                <h4>Chat with ${firstName} ${lastName}</h4>
                <ul class="chat-messages" id="messages-${username}"></ul>
                <input type="text" id="input-${username}" placeholder="Type a message...">
                <button onclick="sendPrivateMessage('${username}')">Send</button>
            `;
            document.body.appendChild(chatBox);
        }
    }

    window.sendPrivateMessage = function (receiver) {
        const messageInput = document.getElementById(`input-${receiver}`);
        const message = messageInput.value.trim();

        if (message) {
            const data = {
                sender: username,
                receiver: receiver,
                content: message,
                timestamp: new Date().toLocaleTimeString(),
            };
            socket.send(JSON.stringify(data));
            messageInput.value = "";
        }
    };

    function displayPrivateMessage(sender, receiver, content, timestamp) {
        let chatBox = document.getElementById(`chat-${sender}`);
        if (!chatBox) {
            openPrivateChat(sender, sender, ""); 
        }
        const messageList = document.getElementById(`messages-${sender}`);
        const messageElement = document.createElement("li");
        messageElement.textContent = `[${timestamp}] ${sender}: ${content}`;
        messageList.appendChild(messageElement);
    }
});
