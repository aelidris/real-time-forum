// Function to initialize chat system programmatically
function initializeChatSystem(nickname = localStorage.getItem("nickname")) {
    if (!nickname) return;
    
    // Reset initialization state on each call
    window.chatSystemInitialized = false;
    
    if (window.chatSystemInitialized) {
        console.log("Chat system already initialized");
        return;
    }

    window.chatSystemInitialized = true;

    // Execute the same initialization code that would run on DOMContentLoaded
    console.log("Initializing chat system for nickname:", nickname);
    
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
      socket = new WebSocket(`ws://localhost:8080/ws?nickname=${nickname}`);
      
      // ... rest of your WebSocket initialization code ...
      // (Copy all the socket event handlers from your original code)
      socket.onopen = () => {
        console.log("Connected to WebSocket server");
        // Request online users explicitly after connection
        socket.send(JSON.stringify({
            type: "requestOnlineUsers"
        }));
    };
    
    socket.onclose = (event) => {
        console.log("Disconnected from WebSocket server", event.reason);
        
        // Update all status dots to offline if this was our own logout
        if (event.reason === "User logged out") {
            document.querySelectorAll('.status-dot').forEach(dot => {
                dot.classList.remove('online');
                dot.classList.add('offline');
            });
        }
    };
    
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        switch (data.type) {
            case "onlineUsers":
                onlineUsers = data.users;
                // Store current timestamp for all online users
                const now = Date.now();
                onlineUsers.forEach(u => userActivity[u.nickname] = now);
                updateOnlineUsersList();
                break;
            case "notification":
                showNotification(data.sender);
                break;
                case "conversation_data":
                    window.conversationData = data.data;
                    console.log("Conversation data updated:", data.data);
                    updateOnlineUsersList();
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
    
    socket.onerror = (error) => {
        console.error("WebSocket error:", error);
    };
    }
    
    
    // Make sure to attach the logout handler
    document.querySelector("#logoutButton")?.addEventListener("click", (e) => {
      e.preventDefault();
      handleLogout();
      
      fetch('/logout', {
        method: 'POST',
        credentials: 'include'
      }).catch(err => console.error('Logout API error:', err));
    });
    
    function handleLogout() {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close(1000, "User logged out");
      }
      
      localStorage.removeItem("nickname");
      window.location.href = "/";
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
    
// Message loading system with reliable counting
let isLoading = false;
let allMessagesLoaded = false;
let currentOffset = 0;

function fetchHistoricalMessages(otherNickname, offset = 0, append = false) {
    const limit = 10;
    const messageList = document.getElementById(`messages-${otherNickname}`);
    if (!messageList) return;

    // Reset state for initial load
    if (!append) {
        messageList.innerHTML = '<li class="loading-message">Loading messages...</li>';
        currentOffset = 0;
        allMessagesLoaded = false;
    } 
    // Show loading indicator for appended messages
    else if (append && !isLoading && !allMessagesLoaded) {
        const loadingIndicator = document.createElement('li');
        loadingIndicator.className = 'loading-message';
        loadingIndicator.textContent = 'Loading more messages...';
        messageList.insertBefore(loadingIndicator, messageList.firstChild);
    }

    // Don't load if already loading or all messages loaded
    if (isLoading || allMessagesLoaded) return;

    isLoading = true;

    fetch(`/fetch_messages?nickname=${encodeURIComponent(nickname)}&otherUser=${encodeURIComponent(otherNickname)}&offset=${offset}&limit=${limit}`)
    .then(response => {
        if (!response.ok) {
            // Handle 404 or no messages differently from other errors
            if (response.status === 404) {
                return { noMoreMessages: true };
            }
            throw new Error(`Server returned ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        // Handle "no messages" response
        if (data.noMoreMessages || (Array.isArray(data) && data.length === 0)) {
            allMessagesLoaded = true;
            showNoMoreMessages(messageList, append);
            return;
        }

        const messages = Array.isArray(data) ? data : [];
        
        // Process and display messages
        displayMessages(messages, messageList, append);
        
        // Update offset for next load
        currentOffset += messages.length;
        
        // Check if we've reached the end
        if (messages.length < limit) {
            allMessagesLoaded = true;
            if (messages.length === 0) {
                showNoMoreMessages(messageList, append);
            }
        }
    })
    .catch(error => {
        console.error('Error loading messages:', error);
        showErrorMessage(messageList, error, append);
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

function showNoMoreMessages(messageList, append) {
    const noMoreMsg = document.createElement('li');
    noMoreMsg.className = 'info-message';
    noMoreMsg.textContent = 'No more messages';
    
    if (append) {
        // Remove loading indicator if exists
        const loadingIndicator = messageList.querySelector('.loading-message');
        if (loadingIndicator) messageList.removeChild(loadingIndicator);
        
        messageList.insertBefore(noMoreMsg, messageList.firstChild);
    } else {
        messageList.innerHTML = '';
        messageList.appendChild(noMoreMsg);
    }
}

function showErrorMessage(messageList, error, append) {
    const errorElement = document.createElement('li');
    errorElement.className = 'error-message';
    errorElement.textContent = `Error: ${error.message}`;
    
    if (append) {
        // Replace loading indicator with error
        const loadingIndicator = messageList.querySelector('.loading-message');
        if (loadingIndicator) {
            messageList.replaceChild(errorElement, loadingIndicator);
        } else {
            messageList.insertBefore(errorElement, messageList.firstChild);
        }
    } else {
        messageList.innerHTML = '';
        messageList.appendChild(errorElement);
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
    
    
    // Make these functions globally available
    window.openPrivateChat = (nickname, firstName, lastName) => {
        // Close the currently open chat (if any)
        if (currentOpenChat) {
            window.closeChat(currentOpenChat);

        }
        
        // Open the new chat
        let chatBox = document.getElementById(`chat-${nickname}`) || createChatBox(nickname, firstName, lastName);
        chatBox.style.display = "block";
        
        // Fetch initial messages (last 10)
        fetchHistoricalMessages(nickname);
        
        // Setup scroll handler for infinite loading
        setupScrollHandler(nickname);
        
        // Update the currently open chat
        currentOpenChat = nickname;
        
        // Reset unread count
        resetUnreadCount(nickname);
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
        
        // Add event listeners properly
        const input = chatBox.querySelector(`#input-${nickname}`);
        const sendButton = chatBox.querySelector('.send-message');
        const closeButton = chatBox.querySelector('.close-chat');
        
        input.addEventListener('keypress', (event) => handleKeyPress(event, nickname));
        sendButton.addEventListener('click', () => sendPrivateMessage(nickname));
        closeButton.addEventListener('click', () => closeChat(nickname));
        
        document.getElementById("chatContainer").appendChild(chatBox);
        return chatBox;
    };
    
    // This can be a module-scoped function now
    function handleKeyPress(event, nickname) {
        if (event.key === 'Enter') {
            event.preventDefault();
            
            // Clear any previous timeout
            if (window.sendMessageTimeout) {
                clearTimeout(window.sendMessageTimeout);
            }
            
            // Set new timeout with 500ms delay
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
        
        updateOnlineUsers(combinedUsers);
    };
    
    const updateOnlineUsers = (users) => {
        const userList = document.getElementById("onlineUserList");
        if (!userList) return;
    
        // Get conversation data if available
        const convData = window.conversationData || {};
        const withConvs = new Set(convData.with_conversations || []);
        const withoutConvUsers = users.filter(user => 
            user.nickname !== nickname && !withConvs.has(user.nickname)
        );
        const withConvUsers = users.filter(user => 
            user.nickname !== nickname && withConvs.has(user.nickname)
        );
    
        // Sort with conversation priority, then online status, then activity
        const sortUsers = (userArray) => {
            return userArray.sort((a, b) => {
                // Online users first within groups
                if (a.isOnline && !b.isOnline) return -1;
                if (!a.isOnline && b.isOnline) return 1;
    
                // Then by most recent activity
                return (b.lastActivity || 0) - (a.lastActivity || 0);
            });
        };
    
        const sortedWithConv = sortUsers(withConvUsers);
        const sortedWithoutConv = withoutConvUsers;
    
        // Clear and rebuild the list
        userList.innerHTML = '';
    
        // Add conversation groups with headers if needed
        const addUserGroup = (users, headerText) => {
            if (users.length === 0) return;
            
            if (headerText) {
                const header = document.createElement('li');
                header.className = 'section-header';
                header.textContent = headerText;
                userList.appendChild(header);
            }
    
            users.forEach(user => {
                // Create user element
                const userElement = document.createElement('li');
                userElement.className = 'online-user';
                userElement.dataset.nickname = user.nickname;
    
                // Status indicator
                const statusDot = document.createElement('span');
                statusDot.className = `status-dot ${user.isOnline ? 'online' : 'offline'}`;
                statusDot.title = user.isOnline ? 'Online' : 
                    `Last seen: ${formatLastSeen(user.lastSeen)}`;
    
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
    
                userList.appendChild(userElement);
            });
        };
    
        // Add both groups with appropriate headers
        addUserGroup(sortedWithConv, sortedWithConv.length ? 'Active Conversations' : null);
        addUserGroup(sortedWithoutConv, 
        sortedWithConv.length && sortedWithoutConv.length ? 'Other Users' : null);
    };
    
    const displayPrivateMessage = (data) => {
        const chatWith = data.sender === nickname ? data.receiver : data.sender;
        
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