function initializeChatSystem(nickname = localStorage.getItem("nickname")) {
    if (!nickname) return;
    
    // Reset initialization state on each call
    window.chatSystemInitialized = false;
    
    if (window.chatSystemInitialized) {
        console.log("Chat system already initialized");
        return;
    }

    window.chatSystemInitialized = true;
 
    let socket = null;
    let allUsers = [];
    let onlineUsers = [];
    const userActivity = {};
    const unreadCounts = {};
    let currentOpenChat = null;

    // Show loading state
    const userList = document.getElementById("onlineUserList");
    if (userList) {
        userList.innerHTML = '<li class="loading">Loading users...</li>';
    }
    
    // First fetch all users
    fetchAllUsers(nickname)
      .then(() => {
        // Then establish WebSocket connection
        initializeWebSocket(nickname);
      })
      .catch(error => {
        console.error('Error initializing chat:', error);
        const userList = document.getElementById("onlineUserList");
        if (userList) {
          userList.innerHTML = '<li class="error">Failed to load users. Please try again.</li>';
        }
      });
    
    // Define all the helper functions that were in your DOMContentLoaded
    function fetchAllUsers(nickname) {
      return new Promise((resolve, reject) => {
        fetch(`/get_all_users?nickname=${encodeURIComponent(nickname)}`)
          .then(response => {
            if (!response.ok) {
              throw new Error(`Server responded with ${response.status}`);
            }
            return response.json();
          })
          .then(users => {
            allUsers = users;
            resolve(users);
          })
          .catch(error => {
            console.error('Error fetching users:', error);
            reject(error);
          });
      });
    }
    
    function initializeWebSocket(nickname) {
      socket = new WebSocket(`ws://localhost:4422/ws?nickname=${nickname}`);

      // Fetch notifications when page loads
      fetch(`/get-notifications?nickname=${nickname}`)
      .then(response => response.json())
      .then(notifications => {
          notifications.forEach(notif => {
              console.log("Unread from:", notif.sender);
          });
      });

      socket.onopen = () => {
        console.log("Connected to WebSocket server");
        // Request online users explicitly after connection
        socket.send(JSON.stringify({
            type: "requestOnlineUsers"
        }));
    };
    
    socket.onclose = (event) => {
        console.log("Disconnected from WebSocket server", event.reason);
        
        if (event.reason === "User logged out") {
            // Visual feedback for offline status
            document.querySelectorAll('.status-dot').forEach(dot => {
              dot.classList.remove('online');
              dot.classList.add('offline');
              dot.title = 'Offline';
            });
          }
    };
    
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        switch (data.type) {
            case "userRegistered":
            const newUser = data.user;
            if (!allUsers.some(u => u.nickname === newUser.nickname)) {
                allUsers.push({
                    nickname: newUser.nickname,
                    firstName: newUser.firstName,
                    lastName: newUser.lastName,
                    isOnline: false
                });
                updateOnlineUsersList();
            }
            break;
          case "onlineUsers":
            onlineUsers = data.users;
            updateOnlineUsersList();
            break;
          case "notification":
            showNotification(data.sender);
            break;
          case "conversation_data":
            window.conversationData = data.data;
            updateOnlineUsersList();
            break;
          default:
            if (data.receiver) {
              // Only update lastActivity for actual messages
              userActivity[data.sender] = Date.now();
              displayPrivateMessage(data);
              updateOnlineUsersList();
            }
        }
      };
    
    socket.onerror = (error) => {
        console.error("WebSocket error:", error);
    };
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
    
    const showNotification = (sender) => {
        // Update unread count
        unreadCounts[sender] = (unreadCounts[sender] || 0) + 1;
        
        // Update last activity time
        userActivity[sender] = Date.now();
        
        // Find the user element
        const userElement = document.querySelector(`.online-user[data-nickname="${sender}"]`);
        
        if (userElement) {
            // Highlight the user
            userElement.style.backgroundColor = "#f1a564";
            userElement.style.transition = "background-color 0.3s ease";
            
            // Update badge
            const existingBadges = userElement.querySelectorAll(".unread-badge");
            existingBadges.forEach(badge => badge.remove());
            
            if (unreadCounts[sender] > 0) {
                const badge = document.createElement("span");
                badge.className = "unread-badge";
                badge.textContent = unreadCounts[sender];
                userElement.appendChild(badge);
            }
            
            setTimeout(() => {
                userElement.style.backgroundColor = "";
            }, 3000);
            
            // Trigger full list update instead of manual reordering
            updateOnlineUsersList();
        }
    };
    
    let isLoading = false;
    let allMessagesLoaded = false;
    let currentOffset = 0;

    async function fetchHistoricalMessages(otherNickname, offset = 0, append = false) {
        const limit = 10;
        const messageList = document.getElementById(`messages-${otherNickname}`);
        if (!messageList) return;

        if (!append) {
            messageList.innerHTML = '<li class="loading-message">Loading messages...</li>';
            currentOffset = 0;
            allMessagesLoaded = false;
        } 

        else if (append && !isLoading && !allMessagesLoaded) {
            const loadingIndicator = document.createElement('li');
            loadingIndicator.className = 'loading-message';
            loadingIndicator.textContent = 'Loading more messages...';
            messageList.insertBefore(loadingIndicator, messageList.firstChild);
        }

        if (isLoading || allMessagesLoaded ) return;

        isLoading = true;

        fetch(`/fetch_messages?nickname=${encodeURIComponent(nickname)}&otherUser=${encodeURIComponent(otherNickname)}&offset=${offset}&limit=${limit}`)
        .then(response => response.json())
        .then(data => {     
            console.log(data);

            if ((Array.isArray(data) && data.length === 0)) {
                allMessagesLoaded = true;
                return;
            }

            const messages = Array.isArray(data) ? data : [];

            displayMessages(messages, messageList, append);

            currentOffset += messages.length;

            if (messages.length < limit) {
                allMessagesLoaded = true;
            }
        })
        .catch(error => {
            console.error('Error loading messages:', error);
        })
        .finally(() => {
            isLoading = false;
        });
    }

function displayMessages(messages, messageList, append) {
    // Remove loading indicator
    const loadingIndicator = messageList.querySelector('.loading-message');
    if (loadingIndicator) messageList.removeChild(loadingIndicator);

    // Sort messages chronologically
    messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Create message elements
    const messageElements = messages.map(msg => {
        const msgElement = document.createElement('li');
        msgElement.className = msg.sender === nickname ? 'sent-message' : 'received-message';
        const displayName = msg.sender === nickname ? 'You' : `${msg.firstName} ${msg.lastName}`;
        msgElement.innerHTML = `[${msg.timestamp}] ${displayName}: ${msg.content}`;
        return msgElement;
    });

    if (append) {
        // Save scroll state before adding messages
        const scrollPos = messageList.scrollTop;
        const scrollHeight = messageList.scrollHeight;
        
        // Add messages to top in reverse order (oldest first)
        messageElements.reverse().forEach(msg => {
            messageList.insertBefore(msg, messageList.firstChild);
        });
        
        // Restore scroll position relative to new content
        messageList.scrollTop = scrollPos + (messageList.scrollHeight - scrollHeight);
    } else {
        // Initial load - add to bottom (newest first)
        messageList.innerHTML = '';
        messageElements.forEach(msg => {
            messageList.appendChild(msg);
        });
        messageList.scrollTop = messageList.scrollHeight;
    }
}

function setupScrollHandler(nickname) {
    const messageList = document.getElementById(`messages-${nickname}`);
    if (!messageList) return;
    
    let scrollDebounceTimer = null;
    
    messageList.addEventListener('scroll', () => {
        // Clear any pending debounce
        if (scrollDebounceTimer) {
            clearTimeout(scrollDebounceTimer);
        }
        
        // Set new debounce
        scrollDebounceTimer = setTimeout(() => {
            // Check if we're near top and should load more
            if (messageList.scrollTop < 50 && !isLoading && !allMessagesLoaded) {
                fetchHistoricalMessages(nickname, currentOffset, true);
            }
        }, 250);
    });
}
    
    
    window.openPrivateChat = async (nickname, firstName, lastName) => {

        const recieverOfNoti = localStorage.getItem("nickname") 
        try {
            await fetch('/mark-read', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    receiver: recieverOfNoti, 
                    sender: nickname              
                })
            });
    
            if (currentOpenChat) {
                window.closeChat(currentOpenChat);
            }
    
            const chatBox = document.getElementById(`chat-${nickname}`) || 
            createChatBox(nickname, firstName, lastName);
            
            chatBox.style.display = "block";
            currentOpenChat = nickname;
            
            await fetchHistoricalMessages(nickname);
            setupScrollHandler(nickname);
            resetUnreadCount(nickname);
    
        } catch (error) {
            console.error("Chat opening failed:", error);
            showToast("Failed to open chat");
        }
    };
    
    const createChatBox = (nickname, firstName, lastName) => {
        const chatBox = document.createElement("div");
        chatBox.id = `chat-${nickname}`;
        chatBox.className = "private-chat";
        chatBox.innerHTML = `
          <div class="chat-header">
            <h4>Chat with ${firstName} ${lastName}</h4>
            <button class="close-chat">×</button>
          </div>
          <ul class="chat-messages" id="messages-${nickname}"></ul>
          <input type="text" id="input-${nickname}" placeholder="Type a message...">
          <button class="send-message">Send</button>
        `;
        
        const input = chatBox.querySelector(`#input-${nickname}`);
        const sendButton = chatBox.querySelector('.send-message');
        const closeButton = chatBox.querySelector('.close-chat');
        
        input.addEventListener('keypress', (event) => handleKeyPress(event, nickname));
        sendButton.addEventListener('click', () => sendPrivateMessage(nickname));
        closeButton.addEventListener('click', () => closeChat(nickname));
        
        document.getElementById("chatContainer").appendChild(chatBox);
        return chatBox;
    };
    
    function handleKeyPress(event, nickname) {
        if (event.key === 'Enter') {
            event.preventDefault();
                if (window.sendMessageTimeout) {
                clearTimeout(window.sendMessageTimeout);
            }
            window.sendMessageTimeout = setTimeout(() => {
                sendPrivateMessage(nickname);
            }, 500);
        }
    }


    window.sendPrivateMessage = (receiver) => {
        const messageInput = document.getElementById(`input-${receiver}`);
        const message = messageInput.value.trim();
        
        if (message && socket && socket.readyState === WebSocket.OPEN) {
            const data = {
                sender: nickname,
                receiver,
                content: message,
                timestamp: new Date().toLocaleTimeString(),
            };
            
            socket.send(JSON.stringify(data));
            
            messageInput.value = "";
            
            displayPrivateMessage({ 
                ...data, 
                firstName: "You", 
                lastName: "" 
            });
            
            // Update activity and UI
            userActivity[receiver] = Date.now();
            updateOnlineUsersList(); // This will move the user to "Active Conversations" if needed
            resetUnreadCount(receiver);
        } else if (!message) {
            console.log("Empty message, not sending");
        } else {
            console.error("WebSocket not connected, cannot send message");
            alert("Connection lost. Please refresh the page to reconnect.");
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

    // Check if we have any online users not in allUsers (newly registered)
    onlineUsers.forEach(onlineUser => {
      if (!allUsers.some(user => user.nickname === onlineUser.nickname)) {
        combinedUsers.push({
          nickname: onlineUser.nickname,
          firstName: onlineUser.firstName,
          lastName: onlineUser.lastName,
          isOnline: true,
          lastActivity: Date.now(),
          unread: 0
        });
      }
    });

    updateOnlineUsers(combinedUsers);
};

const updateOnlineUsers = (users) => {
    const userList = document.getElementById("onlineUserList");
    if (!userList) return;

    const convData = window.conversationData || { with_conversations: [] };
    const withConvs = new Set(convData.with_conversations || []);

    // Split users into groups
    const withConvUsers = users.filter(user => 
        user.nickname !== nickname && withConvs.has(user.nickname)
    );
    const withoutConvUsers = users.filter(user => 
        user.nickname !== nickname && !withConvs.has(user.nickname)
    );

    // Sort active conversations by last message time (not connection time)
    const sortedWithConv = withConvUsers.sort((a, b) => 
        (b.lastActivity || 0) - (a.lastActivity || 0)
    );

    // Sort other users by last activity (if any) then alphabetically
    const sortedWithoutConv = withoutConvUsers.sort((a, b) => {
        // If both have activity, sort by most recent
        if (a.lastActivity && b.lastActivity) {
            return b.lastActivity - a.lastActivity;
        }
        // If only one has activity, put that first
        if (a.lastActivity) return -1;
        if (b.lastActivity) return 1;
        // Otherwise sort alphabetically
        return a.firstName.localeCompare(b.firstName, undefined, { sensitivity: 'base' });
    });

    // Clear and rebuild list
    userList.innerHTML = '';

    // Add active conversations
    if (sortedWithConv.length > 0) {
        const header = document.createElement('li');
        header.className = 'section-header';
        header.textContent = 'Active Conversations';
        userList.appendChild(header);

        sortedWithConv.forEach(user => createUserElement(user));
    }

    // Add other users
    if (sortedWithoutConv.length > 0) {
        const header = document.createElement('li');
        header.className = 'section-header';
        header.textContent = sortedWithConv.length > 0 ? 'Other Users' : 'All Users';
        userList.appendChild(header);

        sortedWithoutConv.forEach(user => createUserElement(user));
    }
};

// Helper function to create consistent user list items
function createUserElement(user) {
    const userElement = document.createElement('li');
    userElement.className = 'online-user';
    userElement.dataset.nickname = user.nickname;

    // Status indicator
    const statusDot = document.createElement('span');
    statusDot.className = `status-dot ${user.isOnline ? 'online' : 'offline'}`;
    statusDot.title = user.isOnline ? 'Online' : `Last seen: ${formatLastSeen(user.lastSeen)}`;

    // Name display
    const nameContainer = document.createElement('div');
    nameContainer.className = 'user-name-container';
    nameContainer.innerHTML = `
        <span class="user-first-name">${user.firstName}</span>
        <span class="user-last-name">${user.lastName}</span>
    `;

    // Unread badge
    if (user.unread > 0) {
        const badge = document.createElement('span');
        badge.className = 'unread-badge';
        badge.textContent = user.unread;
        userElement.appendChild(badge);
    }

    userElement.append(statusDot, nameContainer);
    userElement.onclick = () => {
        openPrivateChat(user.nickname, user.firstName, user.lastName);
        resetUnreadCount(user.nickname);
    };

    document.getElementById("onlineUserList").appendChild(userElement);
}
    
const displayPrivateMessage = (data) => {
    if (!data || !data.sender || !data.receiver) {
        console.warn('Invalid message data received');
        return;
    }

    const chatWith = data.sender === nickname ? data.receiver : data.sender;
    const messageList = document.getElementById(`messages-${chatWith}`);
    
    // Update the last activity time for this user
    if (chatWith) {
        userActivity[chatWith] = Date.now();
    }

    // Add the message to the chat if it exists
    if (messageList) {
        const displayName = data.sender === nickname 
            ? "You" 
            : `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'Unknown';
        
        messageList.innerHTML += `
            <li class="${data.sender === nickname ? "sent-message" : "received-message"}">
                [${data.timestamp || 'No timestamp'}] ${displayName}: ${data.content || ''}
            </li>`;
        messageList.scrollTop = messageList.scrollHeight;
    }

    // Initialize conversation data if it doesn't exist
    window.conversationData = window.conversationData || { with_conversations: [] };
    
    // Safely access the conversations array
    const conversations = window.conversationData.with_conversations || [];
    
    // Add user to conversations if not already there
    if (chatWith && !conversations.includes(chatWith)) {
        conversations.push(chatWith);
        window.conversationData.with_conversations = conversations;
        
        // Notify server about the new conversation
        if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: "update_conversations",
                with_conversations: conversations
            }));
        }
    }

    // Always update the UI to reflect recent activity
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
    
    // Poll for user status updates every 30 seconds
    const userStatusInterval = setInterval(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: "requestOnlineUsers"
            }));
        }
    }, 30000);
    
    // Clean up interval on page unload
    window.addEventListener('beforeunload', () => {
        clearInterval(userStatusInterval);
    });
  }

  // Initialize on DOMContentLoaded if nickname exists
document.addEventListener("DOMContentLoaded", () => {
    const nickname = localStorage.getItem("nickname");
    if (nickname) {
        initializeChatSystem(nickname);
        
        // Show chat interface and hide login
        document.getElementById("loginContainer").style.display = "none";
        document.getElementById("chatContainer").style.display = "block";
    }
});

// Make initializeChatSystem available globally for programmatic login
window.initializeChatSystem = initializeChatSystem;