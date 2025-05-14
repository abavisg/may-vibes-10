// Listen for extension installation
chrome.runtime.onInstalled.addListener(function() {
  console.log('Gmail Newsletter Unsubscriber installed');
});

// Listen for clicks on the extension icon
chrome.action.onClicked.addListener((tab) => {
  // We don't need to handle this as we use a popup
  console.log('Extension icon clicked');
});

// This ensures the content script is loaded when navigating within Gmail
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('mail.google.com')) {
    console.log('Gmail tab updated, ensuring content script is loaded');
    
    // Check if we need to inject the content script
    chrome.scripting.executeScript({
      target: {tabId: tabId},
      func: () => {
        // This will run in the context of the page
        return window.__GMAIL_UNSUBSCRIBER_LOADED || false;
      }
    })
    .then((results) => {
      const isLoaded = results[0].result;
      
      if (!isLoaded) {
        console.log('Content script not detected, injecting...');
        // Inject the content script
        chrome.scripting.executeScript({
          target: {tabId: tabId},
          files: ['content.js']
        })
        .then(() => {
          console.log('Content script injected successfully');
        })
        .catch((error) => {
          console.error('Error injecting content script:', error);
        });
      } else {
        console.log('Content script already loaded');
      }
    })
    .catch((error) => {
      console.error('Error checking content script status:', error);
      
      // Inject anyway as fallback
      chrome.scripting.executeScript({
        target: {tabId: tabId},
        files: ['content.js']
      })
      .catch((error) => {
        console.error('Error injecting content script (fallback):', error);
      });
    });
  }
});

// Listen for messages from the popup or other parts of the extension
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    console.log('Background script received message:', request);

    if (request.action === 'scanInboxForUnsubscribe') {
      console.log('Scanning inbox for unsubscribe links...');
      
      // Fix: properly handle the Promise and send response
      scanInboxForUnsubscribe()
        .then(result => {
          console.log('Scan complete, sending response to popup:', result);
          sendResponse(result);
        })
        .catch(error => {
          console.error('Error in scanInboxForUnsubscribe:', error);
          sendResponse({ 
            success: false, 
            message: error?.message || 'Error communicating with Gmail API' 
          });
        });
      
      return true; // Required for asynchronous sendResponse
    } else if (request.action === 'moveEmailToTrash') {
      console.log(`Received request to move message ${request.messageId} to Unsubscribed folder.`);
      // Get auth token first, then use it to move the message
      getAuthToken({ 'interactive': false })
        .then(token => moveMessageToMoved(token, { messageId: request.messageId, sender: request.sender, subject: request.subject }))
        .then(() => sendResponse({ success: true }))
        .catch(error => {
          console.error('Error moving message to Unsubscribed folder:', error);
          sendResponse({ success: false, message: error?.message || 'Error moving message to Unsubscribed folder' });
        });
      return true; // Required for asynchronous sendResponse
    } else if (request.action === 'moveEmailToInbox') {
      console.log(`Received request to move message ${request.messageId} to Inbox.`);
      // Get auth token first, then use it to move the message
      getAuthToken({ 'interactive': false })
        .then(token => moveMessageFromTrashToInbox(token, request.messageId))
        .then(() => sendResponse({ success: true }))
        .catch(error => {
          console.error('Error moving message to inbox:', error);
          sendResponse({ success: false, message: error?.message || 'Error moving message' });
        });
      return true; // Required for asynchronous sendResponse
    }
  }
);

/**
 * Handles the OAuth2 authentication flow and calls the Gmail API.
 */
async function scanInboxForUnsubscribe() {
  console.log('scanInboxForUnsubscribe function started.');
  try {
    console.log('Attempting to get auth token...');
    const token = await getAuthToken({'interactive': true});
    console.log('Auth token obtained.');

    if (!token) {
      console.error('Failed to obtain auth token: Token is null or undefined.');
      return { success: false, message: 'Authentication failed: Could not obtain token.' };
    }

    console.log('Fetching message list from Gmail API...');
    const messageList = await fetchMessageList(token);
    console.log(`Fetched ${messageList.length} message IDs.`);

    const unsubscribeInfoList = [];
    const totalMessages = messageList.length;

    // Fetch headers for each message and find unsubscribe links
    console.log('Fetching message headers and parsing for unsubscribe links...');
    for (let i = 0; i < totalMessages; i++) {
      const messageId = messageList[i];
      
      // Send progress update to popup
      const progress = Math.floor(((i + 1) / totalMessages) * 100);
      const progressMessage = `Scanning message ${i + 1} of ${totalMessages} (${progress}%)`;
      chrome.runtime.sendMessage({ action: 'updateProgress', message: progressMessage }, function() {
        // Check chrome.runtime.lastError to see if the message was received
        if (chrome.runtime.lastError) {
          // This likely means the popup is closed. Log a warning instead of an error.
          console.warn('Could not send progress update, popup likely closed.', chrome.runtime.lastError.message);
        } else {
          console.log('Progress update sent:', progressMessage);
        }
      });

      const unsubscribeInfo = await fetchAndParseMessage(token, messageId);
      if (unsubscribeInfo) {
        unsubscribeInfoList.push(unsubscribeInfo);
        console.log('Found unsubscribe info:', unsubscribeInfo);
      }
    }

    console.log('Scan complete. Total unsubscribable messages found:', unsubscribeInfoList.length);
    
    // Save results to chrome.storage.local
    chrome.storage.local.set({ 'unsubscribableEmails': unsubscribeInfoList }, function() {
      console.log('Unsubscribable emails saved to storage.', unsubscribeInfoList);
    });

    // Log the successful response before returning
    console.log('Returning successful response from scanInboxForUnsubscribe:', { success: true, unsubscribeLinks: unsubscribeInfoList });
    return { success: true, unsubscribeLinks: unsubscribeInfoList };

  } catch (error) {
    console.error('Error during inbox scan:', error);
    // Log the error object explicitly before returning
    console.log('Returning error response from scanInboxForUnsubscribe:', error);
    return { success: false, message: 'Error scanning inbox: ' + error.message };
  }
}

/**
 * Obtains an OAuth2 access token using chrome.identity.
 * @param {object} options - Options for getAuthToken (e.g., interactive).
 * @returns {Promise<string|null>} - The access token or null if failed.
 */
function getAuthToken(options) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken(options, function(token) {
      if (chrome.runtime.lastError) {
        console.error('chrome.identity.getAuthToken error:', chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
      } else {
        resolve(token);
      }
    });
  });
}

/**
 * Fetches a list of message IDs from the Gmail API.
 * @param {string} token - OAuth2 access token.
 * @returns {Promise<string[]>} - Array of message IDs.
 */
async function fetchMessageList(token) {
  const maxResults = 50; // Fetch up to 50 messages
  // Modify query to only include inbox emails and exclude those labeled as "Unsubscribed"
  const url = `https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=is:inbox -label:Unsubscribed`

  console.log('Fetching messages with query:', 'is:inbox -label:Unsubscribed');
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('Error fetching message list:', response.status, error);
    throw new Error(`Failed to fetch message list: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.messages ? data.messages.map(msg => msg.id) : [];
}

/**
 * Fetches message details and parses for List-Unsubscribe header.
 * @param {string} token - OAuth2 access token.
 * @param {string} messageId - The ID of the message.
 * @returns {Promise<object|null>} - Object with unsubscribe info or null if not found.
 */
async function fetchAndParseMessage(token, messageId) {
  // Fetch full message data including all headers
  const url = `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    // Log error but don't stop the whole scan for one message failure
    console.error(`Error fetching message ${messageId}:`, response.status, await response.text());
    return null;
  }

  const message = await response.json();

  // Log the entire message object for inspection
  console.log(`Message ${messageId}: Full API response object:`, message);

  let listUnsubscribeHeader = null;
  let fromHeader = null;
  let subjectHeader = null;

  // Get the headers array - for format=full, they should be in message.payload.headers
  const headers = message.payload && message.payload.headers ? message.payload.headers : null;

  if (headers) {
    console.log(`Message ${messageId}: Found headers array with ${headers.length} headers.`);
    for (const header of headers) {
      const headerNameLower = header.name.toLowerCase();
      
      if (headerNameLower === 'list-unsubscribe') {
        listUnsubscribeHeader = header.value;
        console.log(`Message ${messageId}: Found List-Unsubscribe header:`, listUnsubscribeHeader);
      } else if (headerNameLower === 'from') {
        fromHeader = header.value;
      } else if (headerNameLower === 'subject') {
        subjectHeader = header.value;
      }
    }
  } else {
    console.log(`Message ${messageId}: No headers array found in expected locations.`);
  }

  // Log sender and subject for every message scanned
  console.log(`Scanned Message ID: ${messageId}, From: ${fromHeader || 'Unknown'}, Subject: ${subjectHeader || 'No Subject'}`);

  if (listUnsubscribeHeader) {
    // Parse the List-Unsubscribe header value
    // It can be in various formats, often includes mailto: and/or http(s): URLs
    const unsubscribeLinks = parseListUnsubscribeHeader(listUnsubscribeHeader);

    if (unsubscribeLinks.length > 0) {
      // Log the subject for debugging (already logged above, but keep for clarity)
      // console.log(`Message ${messageId}: Subject with unsubscribe: ${subjectHeader}`);
      return {
        messageId: messageId,
        sender: fromHeader || 'Unknown Sender',
        subject: subjectHeader || 'No Subject',
        unsubscribeLinks: unsubscribeLinks
      };
    }
  }

  return null; // No List-Unsubscribe header or no valid links found
}

/**
 * Parses the value of the List-Unsubscribe header.
 * @param {string} headerValue - The raw header value string.
 * @returns {string[]} - Array of parsed unsubscribe links (mailto or http/https).
 */
function parseListUnsubscribeHeader(headerValue) {
  console.log('Parsing header value:', headerValue);
  const links = [];
  // Split by comma and trim whitespace
  const entries = headerValue.split(',').map(entry => entry.trim());

  for (const entry of entries) {
    // Extract URLs or mailto addresses within angle brackets
    const match = entry.match(/<(.*)>/);
    if (match && match[1]) {
      console.log('Found link within angle brackets:', match[1]);
      links.push(match[1]);
    } else {
        // Handle cases where there are no angle brackets (less common but possible)
        console.log('Found link without angle brackets:', entry);
        links.push(entry);
    }
  }
  
  // Filter for valid protocols
  const validLinks = links.filter(link => link.startsWith('mailto:') || link.startsWith('http://') || link.startsWith('https://'));
  console.log('Parsed and filtered links:', validLinks);
  return validLinks;
}

/**
 * Adds a message info object to the list of recently moved emails in storage.
 * @param {string} messageId - The ID of the message.
 * @param {string} sender - The sender of the email.
 * @param {string} subject - The subject of the email.
 */
async function addRecentlyMovedMessage(messageId, sender, subject) {
  chrome.storage.local.get(['recentlyMovedEmails'], function(result) {
    const recentlyMovedEmails = result.recentlyMovedEmails || [];
    // Check if an entry with this messageId already exists
    const existingIndex = recentlyMovedEmails.findIndex(item => item.messageId === messageId);

    if (existingIndex === -1) {
      // Add new entry
      recentlyMovedEmails.push({ messageId, sender, subject });
      // Keep the list size manageable, e.g., last 50 moved emails
      const maxMoved = 50;
      if (recentlyMovedEmails.length > maxMoved) {
        recentlyMovedEmails.splice(0, recentlyMovedEmails.length - maxMoved);
      }
      chrome.storage.local.set({ 'recentlyMovedEmails': recentlyMovedEmails }, function() {
        console.log('Added message to recently moved list:', { messageId, sender, subject });
      });
    } else {
      console.log('Message ID already in recently moved list:', messageId);
    }
  });
}

/**
 * Removes a message ID from the list of recently moved emails in storage.
 * @param {string} messageId - The ID of the message.
 */
async function removeRecentlyMovedMessage(messageId) {
  chrome.storage.local.get(['recentlyMovedEmails'], function(result) {
    let recentlyMovedEmails = result.recentlyMovedEmails || [];
    const originalLength = recentlyMovedEmails.length;
    recentlyMovedEmails = recentlyMovedEmails.filter(item => item.messageId !== messageId);

    if (recentlyMovedEmails.length < originalLength) {
      chrome.storage.local.set({ 'recentlyMovedEmails': recentlyMovedEmails }, function() {
        console.log('Removed message ID from recently moved list:', messageId);
      });
    } else {
      console.log('Message ID not found in recently moved list:', messageId);
    }
  });
}

/**
 * Checks if the "Unsubscribed" label exists in the user's Gmail account.
 * @param {string} token - OAuth2 access token.
 * @returns {Promise<string|null>} - The ID of the label if it exists, null otherwise.
 */
async function checkUnsubscribedLabelExists(token) {
  console.log('Checking if Unsubscribed label exists...');
  const url = 'https://www.googleapis.com/gmail/v1/users/me/labels';

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('Error fetching labels:', response.status, error);
    throw new Error(`Failed to fetch labels: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const labels = data.labels || [];
  const unsubscribedLabel = labels.find(label => label.name === 'Unsubscribed');
  
  if (unsubscribedLabel) {
    console.log('Unsubscribed label found with ID:', unsubscribedLabel.id);
    return unsubscribedLabel.id;
  }
  
  console.log('Unsubscribed label does not exist');
  return null;
}

/**
 * Creates a new "Unsubscribed" label in the user's Gmail account.
 * @param {string} token - OAuth2 access token.
 * @returns {Promise<string>} - The ID of the newly created label.
 */
async function createUnsubscribedLabel(token) {
  console.log('Creating Unsubscribed label...');
  const url = 'https://www.googleapis.com/gmail/v1/users/me/labels';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Unsubscribed',
      labelListVisibility: 'labelShow', // Make label visible in the label list
      messageListVisibility: 'show'     // Show messages with this label in the message list
    })
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('Error creating Unsubscribed label:', response.status, error);
    throw new Error(`Failed to create Unsubscribed label: ${response.status} ${response.statusText}`);
  }

  const labelData = await response.json();
  console.log('Unsubscribed label created with ID:', labelData.id);
  return labelData.id;
}

/**
 * Gets or creates the "Unsubscribed" label in the user's Gmail account.
 * @param {string} token - OAuth2 access token.
 * @returns {Promise<string>} - The ID of the existing or newly created label.
 */
async function getOrCreateUnsubscribedLabel(token) {
  console.log('Starting getOrCreateUnsubscribedLabel...');
  try {
    let labelId = await checkUnsubscribedLabelExists(token);
    
    if (!labelId) {
      console.log('Label does not exist, creating it...');
      labelId = await createUnsubscribedLabel(token);
    } else {
      console.log('Label already exists with ID:', labelId);
    }
    
    console.log('Returning label ID:', labelId);
    return labelId;
  } catch (error) {
    console.error('Error in getOrCreateUnsubscribedLabel:', error);
    throw error;
  }
}

/**
 * Moves a message to the Unsubscribed folder using the Gmail API.
 * @param {string} token - OAuth2 access token.
 * @param {object} messageInfo - Object containing messageId, sender, and subject.
 * @returns {Promise<object>} - API response confirming the modification.
 */
async function moveMessageToMoved(token, messageInfo) {
  const { messageId, sender, subject } = messageInfo;
  console.log(`Attempting to move message ${messageId} to Unsubscribed folder.`);
  
  try {
    // Get or create the Unsubscribed label
    console.log('Getting or creating Unsubscribed label...');
    const unsubscribedLabelId = await getOrCreateUnsubscribedLabel(token);
    console.log('Got Unsubscribed label ID:', unsubscribedLabelId);
    
    console.log(`Preparing API request to move message ${messageId} to Unsubscribed folder`);
    const url = `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`;

    const modifyPayload = {
      addLabelIds: [unsubscribedLabelId], // Add the Unsubscribed label
      removeLabelIds: ['INBOX'] // Remove from inbox
    };
    console.log('Modify payload:', JSON.stringify(modifyPayload));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(modifyPayload)
    });

    if (!response.ok) {
      const error = await response.json();
      console.error(`Error moving message ${messageId} to Unsubscribed folder:`, response.status, error);
      throw new Error(`Failed to move message ${messageId} to Unsubscribed folder: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log(`Message ${messageId} moved to Unsubscribed folder successfully.`, result);
    console.log(`Labels applied to message:`, result.labelIds);

    // Add the message info to the recently moved list in storage
    addRecentlyMovedMessage(messageId, sender, subject);
    
    // Also remove the message from the unsubscribable emails list in storage
    removeFromUnsubscribableEmails(messageId);

    return result;
  } catch (error) {
    console.error(`Error in moveMessageToMoved:`, error);
    throw error;
  }
}

/**
 * Removes a message from the unsubscribable emails list in storage.
 * @param {string} messageId - The ID of the message to remove.
 */
function removeFromUnsubscribableEmails(messageId) {
  chrome.storage.local.get(['unsubscribableEmails'], function(result) {
    const unsubscribableEmails = result.unsubscribableEmails || [];
    const filteredEmails = unsubscribableEmails.filter(email => email.messageId !== messageId);
    
    if (filteredEmails.length < unsubscribableEmails.length) {
      chrome.storage.local.set({ 'unsubscribableEmails': filteredEmails }, function() {
        console.log(`Removed message ${messageId} from unsubscribable emails in storage`);
      });
    }
  });
}

/**
 * Moves a message from the Unsubscribed folder back to the Inbox using the Gmail API.
 * @param {string} token - OAuth2 access token.
 * @param {string} messageId - The ID of the message.
 * @returns {Promise<object>} - API response confirming the modification.
 */
async function moveMessageFromTrashToInbox(token, messageId) {
  console.log(`Attempting to move message ${messageId} from Unsubscribed folder to Inbox.`);
  
  try {
    // Get the Unsubscribed label ID
    const unsubscribedLabelId = await checkUnsubscribedLabelExists(token);
    
    // If label doesn't exist, there's nothing to remove
    if (!unsubscribedLabelId) {
      console.log('Unsubscribed label not found, only adding INBOX label');
      
      const url = `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          addLabelIds: ['INBOX']
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        console.error(`Error moving message ${messageId} to Inbox:`, response.status, error);
        throw new Error(`Failed to move message ${messageId} to Inbox: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log(`Message ${messageId} moved to Inbox successfully.`, result);
      
      // Remove the message ID from the recently moved list in storage
      removeRecentlyMovedMessage(messageId);
      
      return result;
    }
    
    const url = `https://www.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        addLabelIds: ['INBOX'], // Add back to Inbox
        removeLabelIds: [unsubscribedLabelId] // Remove from Unsubscribed folder
      })
    });

    if (!response.ok) {
      const error = await response.json();
      console.error(`Error moving message ${messageId} from Unsubscribed folder to Inbox:`, response.status, error);
      throw new Error(`Failed to move message ${messageId} from Unsubscribed folder to Inbox: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    console.log(`Message ${messageId} moved from Unsubscribed folder to Inbox successfully.`, result);
    console.log(`Labels applied to message:`, result.labelIds);

    // Remove the message ID from the recently moved list in storage
    removeRecentlyMovedMessage(messageId);

    return result;
  } catch (error) {
    console.error(`Error in moveMessageFromTrashToInbox:`, error);
    throw error;
  }
} 