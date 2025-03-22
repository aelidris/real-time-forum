document.addEventListener("DOMContentLoaded", () => {
    const nickname = localStorage.getItem("nickname") || "Guest";
    const socket = new WebSocket(`ws://localhost:8080/ws?nickname=${nickname}`);
  
    socket.onopen = () => console.log("Connected to WebSocket server");
    socket.onclose = () => console.log("Disconnected from WebSocket server");
  
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case "onlineUsers":
          updateOnlineUsers(data.users);
          break;
        case "notification":
          showNotification(data.sender);
          break;
        case "chatHistory":
          displayChatHistory(data.messages);
          break;
        default:
          if (data.receiver) {
            displayPrivateMessage(data);
          }
      }
    };
  
    const showNotification = (sender) => {
      const userElement = document.querySelector(`.online-user[data-nickname="${sender}"]`);
      if (userElement) {
        userElement.style.backgroundColor = "#ffeb3b";
        userElement.style.transition = "background-color 0.3s ease";
  
        let badge = userElement.querySelector(".unread-badge") || document.createElement("span");
        badge.className = "unread-badge";
        badge.textContent = (parseInt(badge.textContent) || 0) + 1;
        userElement.appendChild(badge);
  
        setTimeout(() => userElement.style.backgroundColor = "", 3000);
      }
    };
  
    const displayChatHistory = (messages) => {
      if (!messages?.length) return;
      const chatWith = messages[0].receiver === nickname ? messages[0].sender : messages[0].receiver;
      const messageList = document.getElementById(`messages-${chatWith}`);
      if (!messageList) return;
  
      messageList.innerHTML = messages.map(msg => {
        const displayName = msg.sender === nickname ? "You" : msg.sender;
        return `<li class="${msg.sender === nickname ? "sent-message" : "received-message"}">[${msg.timestamp}] ${displayName}: ${msg.content}</li>`;
      }).join("");
  
      messageList.scrollTop = messageList.scrollHeight;
    };
  
    const updateOnlineUsers = (users) => {
      const userList = document.getElementById("onlineUserList");
      userList.innerHTML = users.filter(user => user.nickname !== nickname).map(user => `
        <li class="online-user" data-nickname="${user.nickname}" onclick="openPrivateChat('${user.nickname}', '${user.firstName}', '${user.lastName}')">
          ${user.firstName} ${user.lastName}
        </li>
      `).join("");
    };
  
    window.openPrivateChat = (nickname, firstName, lastName) => {
      let chatBox = document.getElementById(`chat-${nickname}`) || createChatBox(nickname, firstName, lastName);
      chatBox.style.display = "block";
      resetUnreadCount(nickname);
    };
  
    const createChatBox = (nickname, firstName, lastName) => {
      const chatBox = document.createElement("div");
      chatBox.id = `chat-${nickname}`;
      chatBox.className = "private-chat";
      chatBox.innerHTML = `
        <div class="chat-header">
          <h4>Chat with ${firstName} ${lastName}</h4>
          <button class="close-chat" onclick="closeChat('${nickname}')">×</button>
        </div>
        <ul class="chat-messages" id="messages-${nickname}"></ul>
        <input type="text" id="input-${nickname}" placeholder="Type a message..." onkeypress="if(event.key==='Enter') sendPrivateMessage('${nickname}')">
        <button onclick="sendPrivateMessage('${nickname}')">Send</button>
      `;
      document.getElementById("chatContainer").appendChild(chatBox);
      return chatBox;
    };
  
    window.sendPrivateMessage = (receiver) => {
        const messageInput = document.getElementById(`input-${receiver}`);
        const message = messageInput.value.trim();
        if (message) {
          const data = {
            sender: nickname,
            receiver,
            content: message,
            timestamp: new Date().toLocaleTimeString(),
          };
          socket.send(JSON.stringify(data));
          displayPrivateMessage({ ...data, firstName: "", lastName: "" });
          messageInput.value = "";
      
          resetUnreadCount(receiver);
        }
      };
      
  
    const displayPrivateMessage = (data) => {
      const chatWith = data.sender === nickname ? data.receiver : data.sender;
      const chatBox = document.getElementById(`chat-${chatWith}`) || openPrivateChat(chatWith, data.firstName, data.lastName);
      const messageList = document.getElementById(`messages-${chatWith}`);
      if (!messageList) return;
  
      const displayName = data.sender === nickname ? "You" : `${data.firstName} ${data.lastName}`;
      messageList.innerHTML += `<li class="${data.sender === nickname ? "sent-message" : "received-message"}">[${data.timestamp}] ${displayName}: ${data.content}</li>`;
      messageList.scrollTop = messageList.scrollHeight;
    };
  
    window.closeChat = (nickname) => {
      const chatBox = document.getElementById(`chat-${nickname}`);
      if (chatBox) chatBox.style.display = "none";
    };
  
    const resetUnreadCount = (nickname) => {
        const userElement = document.querySelector(`.online-user[data-nickname="${nickname}"]`);
        if (userElement) {
          userElement.style.backgroundColor = ""; // Reset background color
          const badge = userElement.querySelector(".unread-badge");
          if (badge) badge.remove(); // Clear the badge
        }
      };
  });