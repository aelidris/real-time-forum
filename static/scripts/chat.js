function initializeChatSystem(nickname = localStorag.getItem('nickname')) {    
    if (!nickname) return;
    
    const TAB_ID = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
     window.addEventListener('storage', (event) => {
        if (event.key === 'chat_message_update' && event.newValue) {
            const data = JSON.parse(event.newValue);  
            if (data.tabId !== TAB_ID) {
                if (data.type === 'new_message') {
                    displayPrivateMessage(data.message);
                    updateOnlineUsersList();
                }
            }
        }
        if (event.key === 'chat_notification_update' && event.newValue) {
            const data = JSON.parse(event.newValue);
            
            if (data.tabId !== TAB_ID) { 
                unreadCounts[data.sender] = data.unreadCount;
                userActivity[data.sender] = data.lastActivity;
                const userElement = document.querySelector(`.online-user[data-nickname="${data.sender}"]`);   
                if (userElement) {
                    const existingBadges = userElement.querySelectorAll(".unread-badge");
                    existingBadges.forEach(badge => badge.remove());
                    
                    if (unreadCounts[data.sender] > 0) {
                        const badge = document.createElement("span");
                        badge.className = "unread-badge";
                        badge.textContent = unreadCounts[data.sender];
                        userElement.appendChild(badge);
                    }
                    updateOnlineUsersList();
                }
            }
        }
    });
 
    let socket = null;
    let allUsers = [];
    let onlineUsers = [];
    const userActivity = {};
    const unreadCounts = {};
    let currentOpenChat = null;

    const userList = document.getElementById("onlineUserList");
    if (userList) {
        userList.innerHTML = '<li class="loading">Loading users...</li>';
    }
    
    fetchAllUsers(nickname)
      .then(() => {
        initializeWebSocket(nickname);
      })
      .catch(error => {
        console.error('Error initializing chat:', error);
        const userList = document.getElementById("onlineUserList");
        if (userList) {
          userList.innerHTML = '<li class="error">Failed to load users. Please try again.</li>';
        }
      });
    
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

      fetch(`/get-notifications?nickname=${nickname}`)
      .then(response => response.json())
      .then(notifications => {
        if (notifications !== null){
            notifications.forEach(notif => {
                console.log("Unread from:", notif.sender);
            });
        }
      });

      socket.onopen = () => {
        console.log("Connected to WebSocket server");
        socket.send(JSON.stringify({
            type: "requestOnlineUsers"
        }));
    };
    
    socket.onclose = (event) => {
        console.log("Disconnected from WebSocket server", event.reason);
        if (event.reason === "User logged out") {
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
              userActivity[data.sender] = Date.now();
              displayPrivateMessage(data);
              updateOnlineUsersList();
              localStorage.setItem('chat_message_update', JSON.stringify({
                tabId: TAB_ID,
                type: 'new_message',
                message: data
                }));
                localStorage.removeItem('chat_message_update'); // Clear the event
            }
        }
      };
    
    socket.onerror = (error) => {
        console.error("WebSocket error:", error);
    };
    }

    const showNotification = (sender) => {
        unreadCounts[sender] = (unreadCounts[sender] || 0) + 1;  
        userActivity[sender] = Date.now();
        const userElement = document.querySelector(`.online-user[data-nickname="${sender}"]`);
        if (userElement) {
            userElement.style.backgroundColor = "#f1a564";
            userElement.style.transition = "background-color 0.3s ease";
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
            
            updateOnlineUsersList();
        }

        localStorage.setItem('chat_notification_update', JSON.stringify({
            tabId: TAB_ID, 
            sender: sender,
            unreadCount: unreadCounts[sender],
            lastActivity: userActivity[sender]
        }));
        localStorage.removeItem('chat_notification_update'); 
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
    const loadingIndicator = messageList.querySelector('.loading-message');
    if (loadingIndicator) messageList.removeChild(loadingIndicator);
    messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const messageElements = messages.map(msg => {
        const msgElement = document.createElement('li');
        msgElement.className = msg.sender === nickname ? 'sent-message' : 'received-message';
        const displayName = msg.sender === nickname ? 'You' : `${msg.firstName} ${msg.lastName}`;
        msgElement.innerHTML = `[${msg.timestamp}] ${displayName}: ${msg.content}`;
        return msgElement;
    });

    if (append) {
        const scrollPos = messageList.scrollTop;
        const scrollHeight = messageList.scrollHeight;     
        messageElements.reverse().forEach(msg => {
            messageList.insertBefore(msg, messageList.firstChild);
        });       
        messageList.scrollTop = scrollPos + (messageList.scrollHeight - scrollHeight);
    } else {
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
        if (scrollDebounceTimer) {
            clearTimeout(scrollDebounceTimer);
        }
        scrollDebounceTimer = setTimeout(async () => {
            if (messageList.scrollTop < 50 && !isLoading && !allMessagesLoaded) {
                await fetchHistoricalMessages(nickname, currentOffset, true);
            }
        }, 500);
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
            <div class="typing-container"></div>
            <ul class="chat-messages" id="messages-${nickname}"></ul>
            <div class="chat-input-container"> <!-- New container div -->
              <input type="text" id="input-${nickname}" placeholder="Type a message...">
              <button class="send-message">Send</button>
            </div>
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
            sendPrivateMessage(nickname);
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
            
            userActivity[receiver] = Date.now();
            updateOnlineUsersList(); 
            resetUnreadCount(receiver);
        } else if (!message) {
            console.log("Empty message, not sending");
        } else {
            console.error("WebSocket not connected, cannot send message");
            alert("Connection lost. Please refresh the page to reconnect.");
        }
    };
    
    const updateOnlineUsersList = () => {
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
    const withConvUsers = users.filter(user => 
        user.nickname !== nickname && withConvs.has(user.nickname)
    );
    const withoutConvUsers = users.filter(user => 
        user.nickname !== nickname && !withConvs.has(user.nickname)
    );
    const sortedWithConv = withConvUsers.sort((a, b) => 
        (b.lastActivity || 0) - (a.lastActivity || 0)
    );
    const sortedWithoutConv = withoutConvUsers.sort((a, b) => {
        if (a.lastActivity && b.lastActivity) {
            return b.lastActivity - a.lastActivity;
        }
        if (a.lastActivity) return -1;
        if (b.lastActivity) return 1;
        return a.firstName.localeCompare(b.firstName, undefined, { sensitivity: 'base' });
    });

    userList.innerHTML = '';

    if (sortedWithConv.length > 0) {
        const header = document.createElement('li');
        header.className = 'section-header';
        header.textContent = 'Active Conversations';
        userList.appendChild(header);

        sortedWithConv.forEach(user => createUserElement(user));
    }

    if (sortedWithoutConv.length > 0) {
        const header = document.createElement('li');
        header.className = 'section-header';
        header.textContent = sortedWithConv.length > 0 ? 'Other Users' : 'All Users';
        userList.appendChild(header);

        sortedWithoutConv.forEach(user => createUserElement(user));
    }
};

function createUserElement(user) {
    const userElement = document.createElement('li');
    userElement.className = 'online-user';
    userElement.dataset.nickname = user.nickname;
    const statusDot = document.createElement('span');
    statusDot.className = `status-dot ${user.isOnline ? 'online' : 'offline'}`;
    const nameContainer = document.createElement('div');
    nameContainer.className = 'user-name-container';
    nameContainer.innerHTML = `
        <span class="user-first-name">${user.firstName}</span>
        <span class="user-last-name">${user.lastName}</span>
    `;

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

function EscapeString(unsafeStr) {
    return unsafeStr
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

const displayPrivateMessage = (data) => {
    if (!data || !data.sender || !data.receiver) {
        console.warn('Invalid message data received');
        return;
    }
    data.content = EscapeString(data.content)
    const chatWith = data.sender === nickname ? data.receiver : data.sender;
    const messageList = document.getElementById(`messages-${chatWith}`);
    
    if (chatWith) {
        userActivity[chatWith] = Date.now();
    }

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

    window.conversationData = window.conversationData || { with_conversations: [] };    
    const conversations = window.conversationData.with_conversations || [];
    
    if (chatWith && !conversations.includes(chatWith)) {
        conversations.push(chatWith);
        window.conversationData.with_conversations = conversations;
        
        if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: "update_conversations",
                with_conversations: conversations
            }));
        }
    }

    updateOnlineUsersList();
};
    
    window.closeChat = (nickname) => {
        const chatBox = document.getElementById(`chat-${nickname}`);
        if (chatBox) chatBox.style.display = "none";
        currentOpenChat = null; 
    };
    
    const resetUnreadCount = (nickname) => {
        unreadCounts[nickname] = 0; 
        const userElement = document.querySelector(`.online-user[data-nickname="${nickname}"]`);
        if (userElement) {
            const badge = userElement.querySelector(".unread-badge");
            if (badge) badge.remove();
        }
    };
    
    const userStatusInterval = setInterval(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: "requestOnlineUsers"
            }));
        }
    }, 30000);
    
    window.addEventListener('beforeunload', () => {
        clearInterval(userStatusInterval);
    });
  }

document.addEventListener("DOMContentLoaded", () => {
    const nickname = localStorage.getItem("nickname");
    if (nickname) {
        initializeChatSystem(nickname);       
        document.getElementById("loginContainer").style.display = "none";
        document.getElementById("chatContainer").style.display = "block";
    }
});

window.initializeChatSystem = initializeChatSystem;