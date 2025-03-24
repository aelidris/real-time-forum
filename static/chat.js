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

            console.log("data that came to onmessage socket", data);
            
            displayPrivateMessage(data);
            
          }
      }
    };
  
    // Track last message times and unread counts
    const userActivity = {};
    const unreadCounts = {};

    const showNotification = (sender) => {
      // Update unread count
      unreadCounts[sender] = (unreadCounts[sender] || 0) + 1;
      
      // Find the user element in the sorted list
      const userElement = document.querySelector(`.online-user[data-nickname="${sender}"]`);
      
      if (userElement) {
          // Highlight the user
          userElement.style.backgroundColor = "#f1a564";
          userElement.style.transition = "background-color 0.3s ease";
          
          // Remove any existing badges first
          const existingBadges = userElement.querySelectorAll(".unread-badge");
          existingBadges.forEach(badge => badge.remove());
          
          // Create new badge with updated count
          if (unreadCounts[sender] > 0) {
              const badge = document.createElement("span");
              badge.className = "unread-badge";
              badge.textContent = unreadCounts[sender];
              userElement.appendChild(badge);
          }
          
          // Remove highlight after 3 seconds
          setTimeout(() => {
              userElement.style.backgroundColor = "";
          }, 3000);
          
          // Move user to top of the list (most recent activity)
          userActivity[sender] = Date.now();
          const userList = document.getElementById("onlineUserList");
          if (userElement.parentNode === userList) {
              userList.prepend(userElement);
          }
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
  
  
    window.openPrivateChat = (nickname, firstName, lastName) => {
      let chatBox = document.getElementById(`chat-${nickname}`) || createChatBox(nickname, firstName, lastName);
      chatBox.style.display = "block";
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
          displayPrivateMessage({ ...data, firstName, lastName});
          messageInput.value = "";
      
          resetUnreadCount(receiver);
        }
      };
      
  
    
    const updateOnlineUsers = (users) => {
      
      const userList = document.getElementById("onlineUserList");
      
      const userData = users
          .filter(user => user.nickname !== nickname)
          .map(user => ({
              ...user,
              lastActivity: userActivity[user.nickname] || 0,
              unread: unreadCounts[user.nickname] || 0
          }));
      
      // Sort by last activity (most recent first), then by name
      userData.sort((a, b) => {
          if (a.lastActivity && b.lastActivity) {
              return b.lastActivity - a.lastActivity;
          }
          if (a.lastActivity) return -1;
          if (b.lastActivity) return 1;
          return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
      });
      
      // Clear the list
      userList.innerHTML = '';
      
      // Add sorted users to the list with notifications
      userData.forEach(user => {
          const userElement = document.createElement('li');
          userElement.className = 'online-user';
          userElement.dataset.nickname = user.nickname;
          
          // Add container for name (separate from badge)
          const nameContainer = document.createElement('div');
          nameContainer.className = 'user-name-container';
          nameContainer.innerHTML = `
              <span class="user-first-name">${user.firstName}</span>
              <span class="user-last-name">${user.lastName}</span>
          `;
          userElement.appendChild(nameContainer);
          
          // Add unread badge if needed
          if (user.unread > 0) {
              const badge = document.createElement("span");
              badge.className = "unread-badge";
              badge.textContent = user.unread;
              userElement.appendChild(badge);
          }
          
          userElement.onclick = () => {
              openPrivateChat(user.nickname, user.firstName, user.lastName);
              resetUnreadCount(user.nickname);
          };
          
          userList.appendChild(userElement);
      });
  };

    const displayPrivateMessage = (data) => {
        const chatWith = data.sender === nickname ? data.receiver : data.sender;
        const chatBox = document.getElementById(`chat-${chatWith}`) || openPrivateChat(chatWith, data.firstName, data.lastName);
        const messageList = document.getElementById(`messages-${chatWith}`);
        if (!messageList) return;

        // Update the last activity time for this user (current timestamp)
        userActivity[chatWith] = Date.now();

        // If message is received and chat is not open, show notification
        if (data.sender !== nickname && !document.getElementById(`chat-${chatWith}`)?.style.display === "block") {
          showNotification(data.sender);
      }
        
        const displayName = data.sender === nickname ? "You" : `${data.firstName} ${data.lastName}`;
        messageList.innerHTML += `<li class="${data.sender === nickname ? "sent-message" : "received-message"}">[${data.timestamp}] ${displayName}: ${data.content}</li>`;
        messageList.scrollTop = messageList.scrollHeight;
        
        // Re-sort the online users list
        const onlineUsers = Array.from(document.querySelectorAll('.online-user'))
        .map(el => {
            const firstNameEl = el.querySelector('.user-first-name');
            const lastNameEl = el.querySelector('.user-last-name');

            return {
                nickname: el.dataset.nickname,
                firstName: firstNameEl ? firstNameEl.textContent : '',
                lastName: lastNameEl ? lastNameEl.textContent : ''
            };
            });
            
        updateOnlineUsers(onlineUsers);
    };
  
    window.closeChat = (nickname) => {
      const chatBox = document.getElementById(`chat-${nickname}`);
      if (chatBox) chatBox.style.display = "none";
    };
  
    const resetUnreadCount = (nickname) => {
      unreadCounts[nickname] = 0; // Set to 0 instead of deleting to maintain the key
      const userElement = document.querySelector(`.online-user[data-nickname="${nickname}"]`);
      if (userElement) {
          const badge = userElement.querySelector(".unread-badge");
          if (badge) badge.remove();
      }
  };
  });