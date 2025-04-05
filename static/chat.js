document.addEventListener("DOMContentLoaded", () => {
    const nickname = localStorage.getItem("nickname");
    console.log("nickname from chat.js:", nickname);
    
    let socket = null;
    
    // All global variables
    let allUsers = []; // Store all users
    let onlineUsers = []; // Store currently online users
    // Track last message times and unread counts
    const userActivity = {};
    const unreadCounts = {};
    let currentOpenChat = null;
    
    // Initialize the application with proper sequence
    initializeChat();
    
    function initializeChat() {
        // Show loading indicator
        const userList = document.getElementById("onlineUserList");
        if (userList) {
            userList.innerHTML = '<li class="loading">Loading users...</li>';
        }
        
        // First fetch all users
        fetchAllUsers()
            .then(() => {
                // Then establish WebSocket connection
                initializeWebSocket();
            })
            .catch(error => {
                console.error('Error initializing chat:', error);
                // Show error in user list
                if (userList) {
                    userList.innerHTML = '<li class="error">Failed to load users. Please try again.</li>';
                }
            });
    }
    
    function initializeWebSocket() {
        socket = new WebSocket(`ws://localhost:8080/ws?nickname=${nickname}`);
        
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
        
        socket.onerror = (error) => {
            console.error("WebSocket error:", error);
        };
    }
    
    function fetchAllUsers() {
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
    
    function handleLogout() {
        // Close the WebSocket connection properly
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.close(1000, "User logged out");
        }
        
        // Immediately update UI to show offline status
        const userElements = document.querySelectorAll('.online-user');
        userElements.forEach(el => {
            const statusDot = el.querySelector('.status-dot');
            if (statusDot) {
                statusDot.classList.remove('online');
                statusDot.classList.add('offline');
                statusDot.title = 'Last seen: Just now';
            }
        });
        
        // Clear local data
        localStorage.removeItem("nickname");
        window.location.href = "/"; // Or your preferred redirect
    }
    
    // Modify your existing logout button click handler
    document.querySelector("#logoutButton")?.addEventListener("click", (e) => {
        e.preventDefault();
        handleLogout();
        
        // Optional: Notify server about logout
        fetch('/logout', {
            method: 'POST',
            credentials: 'include'
        }).catch(err => console.error('Logout API error:', err));
    });
    
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

    function fetchHistoricalMessages(otherNickname, offset = 0, append = false) {
        const limit = 10;
        const messageList = document.getElementById(`messages-${otherNickname}`);
      
        // Reset state on initial load
        if (!append) {
          messageList.innerHTML = '';
          messageList.setAttribute('data-loaded-count', '0');
          messageList.removeAttribute('data-all-loaded');
        }
      
        // Fetch messages
        fetch(`/fetch_messages?nickname=${encodeURIComponent(nickname)}&otherUser=${encodeURIComponent(otherNickname)}&offset=${offset}&limit=${limit}`)
          .then(response => response.json())
          .then(messages => {
            // Sort messages by timestamp and then by a secondary identifier (like message ID or sequence)
            messages.sort((a, b) => {
                const timeDiff = new Date(a.timestamp) - new Date(b.timestamp);
                if (timeDiff !== 0) return timeDiff;
                
                // If timestamps are equal, use a secondary sort criterion
                // This could be a database ID, sequence number, or any other unique identifier
                // If your messages have an 'id' field, use that:
                if (a.id && b.id) return a.id - b.id;
                
                // Fallback: compare content if no IDs exist (not ideal but works as last resort)
                return a.content.localeCompare(b.content);
            });
      
            // Update message list
            if (append && messages.length > 0) {
              const currentCount = parseInt(messageList.getAttribute('data-loaded-count')) || 0;
              messageList.setAttribute('data-loaded-count', currentCount + messages.length);
            }
      
            // Set "all loaded" flag if no more messages
            if (messages.length < limit) {
              messageList.setAttribute('data-all-loaded', 'true');
            }
          })
          .catch(error => console.error('Error:', error));
      }
    
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
        let chatBox = document.getElementById(`chat-${chatWith}`);
        
        // If chat box doesn't exist, create it
        if (!chatBox) {
            // Find user info from allUsers
            const userInfo = allUsers.find(user => user.nickname === chatWith);
            if (userInfo) {
                openPrivateChat(chatWith, userInfo.firstName, userInfo.lastName);
            } else {
                // Fallback if user info not found
                openPrivateChat(chatWith, data.firstName || chatWith, data.lastName || "");
            }
            chatBox = document.getElementById(`chat-${chatWith}`);
        }
        
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
});