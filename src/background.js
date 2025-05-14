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
      scanInboxForUnsubscribe().then(sendResponse);
      return true; // Required for asynchronous sendResponse
    }
  }
);

/**
 * Handles the OAuth2 authentication flow and calls the Gmail API.
 */
async function scanInboxForUnsubscribe() {
  try {
    console.log('Attempting to get auth token...');
    const token = await getAuthToken({'interactive': true});
    console.log('Auth token obtained.');

    if (!token) {
      console.error('Failed to obtain auth token.');
      return { success: false, message: 'Authentication failed.' };
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

    return { success: true, unsubscribeLinks: unsubscribeInfoList };

  } catch (error) {
    console.error('Error during inbox scan:', error);
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
  const maxResults = 250; // Fetch up to 250 messages
  const url = `https://www.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=is:inbox`

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