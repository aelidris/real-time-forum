document.addEventListener("DOMContentLoaded", () => {
    const nickname = localStorage.getItem("nickname") || "Guest";
    const socket = new WebSocket(`ws://localhost:8080/ws?nickname=${nickname}`);
  
    socket.onopen = () => console.log("Connected to WebSocket server");
    socket.onclose = () => console.log("Disconnected from WebSocket server");
  
    let allUsers = []; // Store all users
    let onlineUsers = []; // Store currently online users
    // Track last message times and unread counts
    const userActivity = {};
    const unreadCounts = {};
    
    // Fetch all users when page loads
    fetchAllUsers();
    
    function fetchAllUsers() {
        fetch(`/get_all_users?nickname=${encodeURIComponent(nickname)}`)
            .then(response => response.json())
            .then(users => {
                allUsers = users;
                updateOnlineUsersList();
            })
            .catch(error => console.error('Error fetching users:', error));
    }
    
 
    
    function formatLastSeen(timestamp) {
        if (!timestamp) return 'Never';
        const now = new Date();
        const lastSeen = new Date(timestamp);
        const diffMinutes = Math.floor((now - lastSeen) / (1000 * 60));
        
        if (diffMinutes < 1) return 'Just now';
        if (diffMinutes < 60) return `${diffMinutes} min ago`;
        if (diffMinutes < 1440) return `${Math.floor(diffMinutes/60)} hours ago`;
        return `${Math.floor(diffMinutes/1440)} days ago`;
    }
    
    
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        switch (data.type) {
            case "onlineUsers":
                onlineUsers = data.users;
                updateOnlineUsersList();
                break;
            case "notification":
                showNotification(data.sender);
                break;
            default:
                if (data.receiver) {
                    // Update last activity when receiving a message
                    userActivity[data.sender] = Date.now();
                    displayPrivateMessage(data);
                    updateOnlineUsersList();
                }
        }
    };
   
    

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

  
  
    let currentOpenChat = null;

    function fetchHistoricalMessages(otherNickname) {
      const nickname = localStorage.getItem("nickname") || "Guest";
      
      // Log the fetch attempt
      console.log(`Attempting to fetch messages for user: ${nickname}, other user: ${otherNickname}`);
  
      fetch(`/fetch_messages?nickname=${encodeURIComponent(nickname)}&otherUser=${encodeURIComponent(otherNickname)}`, {
          method: 'GET',
          headers: {
              'Content-Type': 'application/json'
          }
      })
      .then(response => response.json())
      .then(messages => {
          console.log('Fetched messages:', messages);
  
          // Clear existing messages
          const messageList = document.getElementById(`messages-${otherNickname}`);
          if (messageList) {
              messageList.innerHTML = ''; // Clear existing messages
  
              // Display historical messages
              messages.forEach(msg => {
                  const displayName = msg.sender === nickname ? "You" : `${msg.firstName} ${msg.lastName}`;
                  const messageClass = msg.sender === nickname ? "sent-message" : "received-message";
                  
                  messageList.innerHTML += `
                      <li class="${messageClass}">
                          [${msg.timestamp}] ${displayName}: ${msg.content}
                      </li>
                  `;
              });
  
              // Scroll to bottom
              messageList.scrollTop = messageList.scrollHeight;
          }
      })
      .catch(error => {
          console.error('Detailed Error fetching messages:', error);
          
          // Optional: Show error to user
          const messageList = document.getElementById(`messages-${otherNickname}`);
          if (messageList) {
              messageList.innerHTML = `<li class="error-message">Failed to load messages: ${error.message}</li>`;
          }
      });
  }

  // Modify openPrivateChat to fetch historical messages
  window.openPrivateChat = (nickname, firstName, lastName) => {
      // Close the currently open chat (if any)
      if (currentOpenChat) {
          window.closeChat(currentOpenChat);
      }

      // Open the new chat
      let chatBox = document.getElementById(`chat-${nickname}`) || createChatBox(nickname, firstName, lastName);
      chatBox.style.display = "block";

      // Fetch historical messages for this chat
      fetchHistoricalMessages(nickname);

      // Update the currently open chat
      currentOpenChat = nickname;
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
          
          // Display the message in sender's UI immediately
          displayPrivateMessage({ 
              ...data, 
              firstName: "You", 
              lastName: "" 
          });
          
          messageInput.value = "";
          
          // Force update sender's contact list
          userActivity[receiver] = Date.now();
          updateOnlineUsersList(); // This will re-sort contacts
          
          resetUnreadCount(receiver);
      }
  };
      
  const updateOnlineUsersList = () => {
    // Combine online status with all users data
    const combinedUsers = allUsers.map(user => {
        const isOnline = onlineUsers.some(u => u.nickname === user.nickname);
        const lastActivity = userActivity[user.nickname] || 0;
        const unread = unreadCounts[user.nickname] || 0;
        
        return {
            ...user,
            isOnline,
            lastActivity,
            unread
        };
    });
    
    updateOnlineUsers(combinedUsers);
};
    
const updateOnlineUsers = (users) => {
    const userList = document.getElementById("onlineUserList");
    
    // Sort users: online first, then by last activity, then by name
    users.sort((a, b) => {
        // Online users first
        if (a.isOnline && !b.isOnline) return -1;
        if (!a.isOnline && b.isOnline) return 1;
        
        // Then by last activity (most recent first)
        if (a.lastActivity && b.lastActivity) {
            return b.lastActivity - a.lastActivity;
        }
        if (a.lastActivity) return -1;
        if (b.lastActivity) return 1;
        
        // Finally by name
        return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
    });
    
    // Clear the list
    userList.innerHTML = '';
    
    // Add sorted users to the list
    users.forEach(user => {
        if (user.nickname === nickname) return; // Skip self
        
        const userElement = document.createElement('li');
        userElement.className = 'online-user';
        userElement.dataset.nickname = user.nickname;
        
        // Add status indicator
        const statusIndicator = document.createElement('span');
        statusIndicator.className = `status-dot ${user.isOnline ? 'online' : 'offline'}`;
        statusIndicator.title = user.isOnline ? 'Online' : 
            `Last seen: ${user.lastSeen ? formatLastSeen(user.lastSeen) : 'Never'}`;
        
        // Add container for name
        const nameContainer = document.createElement('div');
        nameContainer.className = 'user-name-container';
        nameContainer.innerHTML = `
            <span class="user-first-name">${user.firstName}</span>
            <span class="user-last-name">${user.lastName}</span>
        `;
        
        // Add unread badge if needed
        let badgeElement = null;
        if (user.unread > 0) {
            badgeElement = document.createElement("span");
            badgeElement.className = "unread-badge";
            badgeElement.textContent = user.unread;
        }
        
        // Assemble the elements
        userElement.appendChild(statusIndicator);
        userElement.appendChild(nameContainer);
        if (badgeElement) userElement.appendChild(badgeElement);
        
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
    
    // Update the online users list for both sender and receiver
    updateOnlineUsersList();
    
};
  
window.closeChat = (nickname) => {
  const chatBox = document.getElementById(`chat-${nickname}`);
  if (chatBox) chatBox.style.display = "none";
  currentOpenChat = null; // Reset the tracker
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