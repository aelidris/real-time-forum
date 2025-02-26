document.addEventListener("DOMContentLoaded", function () {
    const username = localStorage.getItem("username") || "Guest";
    const socket = new WebSocket(`ws://localhost:8080/ws?username=${username}`);

    socket.onopen = function () {
        console.log("Connected to WebSocket server");
    };

    socket.onmessage = function (event) {
        const message = JSON.parse(event.data);
        displayMessage(message.sender, message.content, message.timestamp);
    };

    socket.onclose = function () {
        console.log("Disconnected from WebSocket server");
    };

    document.getElementById("chatForm").addEventListener("submit", function (event) {
        event.preventDefault();
        const messageInput = document.getElementById("chatMessage");
        const message = messageInput.value.trim();

        if (message) {
            const data = {
                sender: username,
                content: message,
                timestamp: new Date().toLocaleTimeString(),
            };
            socket.send(JSON.stringify(data));
            messageInput.value = "";
        }
    });

    function displayMessage(sender, content, timestamp) {
        const chatBox = document.getElementById("chatMessages");
        const messageElement = document.createElement("li");
        messageElement.textContent = `[${timestamp}] ${sender}: ${content}`;
        chatBox.appendChild(messageElement);
    }
});
