document.addEventListener('DOMContentLoaded', function() {
  const statusElement = document.getElementById('status');
  const newsletterListElement = document.getElementById('newsletter-list');
  const scanButton = document.getElementById('scan-btn');
  const viewIgnoredButton = document.getElementById('view-ignored-btn');
  const ignoredSendersSection = document.getElementById('ignored-senders-section');
  const ignoredSendersListElement = document.getElementById('ignored-senders-list');
  const hideIgnoredButton = document.getElementById('hide-ignored-btn');
  
  let ignoredSenders = [];
  
  console.log('Popup initialized');
  
  // Load ignored senders and saved unsubscribe results on startup
  loadIgnoredSenders();
  loadSavedResults();
  
  // Event listener for the Scan Inbox button
  scanButton.addEventListener('click', handleScanInboxClick);
  
  // Event listener for View Ignored Senders button
  viewIgnoredButton.addEventListener('click', function() {
    console.log('View Ignored Senders button clicked');
    ignoredSendersSection.style.display = 'block';
    // Hide other sections if necessary (optional, for a cleaner UI)
    // document.getElementById('main-content').style.display = 'none'; 
    displayIgnoredSenders(); // Populate the list
  });
  
  // Event listener for Hide button in ignored senders section
  hideIgnoredButton.addEventListener('click', function() {
    console.log('Hide Ignored Senders button clicked');
    ignoredSendersSection.style.display = 'none';
    // Show other sections again (optional)
    // document.getElementById('main-content').style.display = 'block';
  });
  
  // Add click listener to each newsletter item
  newsletterListElement.addEventListener('click', function(event) {
    const target = event.target.closest('li');
    if (!target) return;

    const messageId = target.dataset.messageId;
    const unsubscribeLinks = JSON.parse(target.dataset.unsubscribeLinks); // Retrieve parsed links

    console.log('Clicked on item with messageId:', messageId);
    console.log('Unsubscribe links:', unsubscribeLinks);

    if (unsubscribeLinks && unsubscribeLinks.length > 0) {
      // Prioritize http/https links
      const httpLink = unsubscribeLinks.find(link => link.startsWith('http://') || link.startsWith('https://'));
      
      if (httpLink) {
        console.log('Opening HTTP/S link:', httpLink);
        chrome.tabs.create({ url: httpLink });
      } else {
        // If no http/https, open the first mailto link found
        const mailtoLink = unsubscribeLinks.find(link => link.startsWith('mailto:'));
        if (mailtoLink) {
          console.log('Opening mailto link:', mailtoLink);
          // Use chrome.tabs.create for mailto links as well,
          // it will prompt the user or open the default mail client
          chrome.tabs.create({ url: mailtoLink });
        } else {
          console.warn('No actionable unsubscribe link found for messageId:', messageId);
          alert('No actionable unsubscribe link found for this email.');
        }
      }
    } else {
      console.warn('No unsubscribe links available for messageId:', messageId);
      alert('No unsubscribe link found for this email.');
    }
  });
  
  /**
   * Handles the click event for the Scan Inbox button.
   */
  function handleScanInboxClick() {
    statusElement.textContent = 'Scanning inbox...';
    newsletterListElement.innerHTML = ''; // Clear previous results
    scanButton.disabled = true; // Disable button while scanning
    
    console.log('Sending message to background script to scan inbox...');
    chrome.runtime.sendMessage({ action: 'scanInboxForUnsubscribe' }, function(response) {
      console.log('Received response from background script:', response);
      scanButton.disabled = false; // Re-enable button
      
      if (chrome.runtime.lastError) {
        console.error('Error from background script:', chrome.runtime.lastError);
        statusElement.textContent = 'Error: ' + chrome.runtime.lastError.message;
        newsletterListElement.innerHTML = '<li class="no-results">Error scanning inbox.</li>';
        return;
      }
      
      if (!response || !response.success) {
        statusElement.textContent = 'Scan failed';
        newsletterListElement.innerHTML = `<li class="no-results">${response.message || 'Unknown error during scan.'}</li>`;
        return;
      }
      
      displayResults(response.unsubscribeLinks);
    });
  }
  
  /**
   * Displays the scan results in the popup UI.
   * @param {Array<object>} unsubscribeInfoList - List of objects with unsubscribe info.
   */
  function displayResults(unsubscribeInfoList) {
    newsletterListElement.innerHTML = ''; // Clear placeholder
    
    if (unsubscribeInfoList.length === 0) {
      statusElement.textContent = 'No unsubscribable newsletters found.';
      newsletterListElement.innerHTML = '<li class="no-results">No unsubscribable emails found in the last 200 messages.</li>';
      return;
    }
    
    statusElement.textContent = `Found ${unsubscribeInfoList.length} potential newsletter(s)`;
    
    unsubscribeInfoList.forEach(item => {
      // Check if the sender is ignored
      if (ignoredSenders.includes(item.sender)) {
        console.log(`Ignoring sender: ${item.sender}`);
        return; // Skip this item if sender is ignored
      }
      
      const listItem = document.createElement('li');
      listItem.className = 'newsletter-item';
      listItem.dataset.messageId = item.messageId;
      listItem.dataset.unsubscribeLinks = JSON.stringify(item.unsubscribeLinks);
      
      const senderElement = document.createElement('div');
      senderElement.className = 'sender';
      senderElement.textContent = `Sender: ${item.sender}`;
      
      const subjectElement = document.createElement('div');
      subjectElement.className = 'subject';
      subjectElement.textContent = `Subject: ${item.subject}`;
      
      const methodElement = document.createElement('div');
      methodElement.className = 'unsubscribe-method';
      methodElement.textContent = `Method: ${item.unsubscribeLinks.map(link => link.startsWith('mailto:') ? 'Email' : 'Web').join(', ')}`;
      
      const actionsElement = document.createElement('div');
      actionsElement.className = 'actions';
      
      // Unsubscribe button
      const unsubscribeButton = document.createElement('button');
      unsubscribeButton.className = 'unsubscribe-btn';
      unsubscribeButton.textContent = 'Unsubscribe';
      unsubscribeButton.addEventListener('click', function(event) {
        // Prioritize http/https links for the button as well
        const httpLink = item.unsubscribeLinks.find(link => link.startsWith('http://') || link.startsWith('https://'));
        
        if (httpLink) {
          console.log('Opening HTTP/S link via button:', httpLink);
          chrome.tabs.create({ url: httpLink });
        } else {
          // Fallback to mailto if no http/https link is found
          const mailtoLink = item.unsubscribeLinks.find(link => link.startsWith('mailto:'));
          if (mailtoLink) {
            console.log('Opening mailto link via button:', mailtoLink);
            chrome.tabs.create({ url: mailtoLink }); // Use chrome.tabs.create for mailto
          } else {
            console.warn('No actionable unsubscribe link found for messageId (button click):', item.messageId);
            alert('No actionable unsubscribe link found for this email.');
          }
        }
        
        // Prevent the list item click handler from also firing
        event.stopPropagation();
      });
      
      // Ignore button
      const ignoreButton = document.createElement('button');
      ignoreButton.className = 'ignore-btn';
      ignoreButton.textContent = 'Ignore Sender';
      ignoreButton.addEventListener('click', function(event) {
        event.stopPropagation(); // Prevent click from bubbling up to the list item
        addIgnoredSender(item.sender);
        listItem.remove(); // Remove from the displayed list
        // Update status if list becomes empty
        if (newsletterListElement.children.length === 0) {
             statusElement.textContent = 'No unsubscribable newsletters found.';
             newsletterListElement.innerHTML = '<li class="no-results">No unsubscribable emails found in the last 200 messages or all found senders are ignored.</li>';
        }
      });
      
      actionsElement.appendChild(unsubscribeButton);
      actionsElement.appendChild(ignoreButton);
      
      listItem.appendChild(senderElement);
      listItem.appendChild(subjectElement);
      listItem.appendChild(methodElement);
      listItem.appendChild(actionsElement);
      
      newsletterListElement.appendChild(listItem);
    });
    
    // If all found senders were ignored, show the no results message
    if (newsletterListElement.children.length === 0) {
         statusElement.textContent = 'No unsubscribable newsletters found.';
         newsletterListElement.innerHTML = '<li class="no-results">No unsubscribable emails found in the last 200 messages or all found senders are ignored.</li>';
    }
  }
  
  /**
   * Loads ignored senders from chrome.storage.local.
   */
  function loadIgnoredSenders() {
    chrome.storage.local.get(['ignoredSenders'], function(result) {
      ignoredSenders = result.ignoredSenders || [];
      console.log('Loaded ignored senders:', ignoredSenders);
    });
  }
  
  /**
   * Adds a sender to the ignored list in chrome.storage.local.
   * @param {string} senderEmail - The email address of the sender to ignore.
   */
  function addIgnoredSender(senderEmail) {
    if (!ignoredSenders.includes(senderEmail)) {
      ignoredSenders.push(senderEmail);
      chrome.storage.local.set({ ignoredSenders: ignoredSenders }, function() {
        console.log('Sender ignored:', senderEmail);
      });
    }
  }
  
  /**
   * Displays the list of ignored senders in the UI.
   */
  function displayIgnoredSenders() {
    ignoredSendersListElement.innerHTML = ''; // Clear previous list
    
    if (ignoredSenders.length === 0) {
      ignoredSendersListElement.innerHTML = '<li class="no-results">No senders currently ignored.</li>';
      return;
    }
    
    ignoredSenders.forEach(sender => {
      const listItem = document.createElement('li');
      listItem.className = 'ignored-sender-item';
      
      const senderText = document.createElement('span');
      senderText.textContent = sender;
      
      const unignoreButton = document.createElement('button');
      unignoreButton.className = 'unignore-btn';
      unignoreButton.textContent = 'Unignore';
      unignoreButton.addEventListener('click', function() {
        removeIgnoredSender(sender);
      });
      
      listItem.appendChild(senderText);
      listItem.appendChild(unignoreButton);
      ignoredSendersListElement.appendChild(listItem);
    });
  }
  
  /**
   * Removes a sender from the ignored list in chrome.storage.local.
   * @param {string} senderEmail - The email address of the sender to un-ignore.
   */
  function removeIgnoredSender(senderEmail) {
    const index = ignoredSenders.indexOf(senderEmail);
    if (index > -1) {
      ignoredSenders.splice(index, 1);
      chrome.storage.local.set({ ignoredSenders: ignoredSenders }, function() {
        console.log('Sender un-ignored:', senderEmail);
        displayIgnoredSenders(); // Refresh the displayed list
        // Optionally, re-scan or update the main list if needed
      });
    }
  }
  
  /**
   * Loads saved unsubscribe results from chrome.storage.local and displays them.
   */
  function loadSavedResults() {
    chrome.storage.local.get(['unsubscribableEmails'], function(result) {
      const savedEmails = result.unsubscribableEmails || [];
      console.log('Loaded saved unsubscribable emails:', savedEmails);
      
      if (savedEmails.length > 0) {
        displayResults(savedEmails);
        statusElement.textContent = `Displaying ${savedEmails.length} previously found newsletter(s). Click Scan Inbox for updates.`;
      } else {
        // Display initial message if no saved results
        statusElement.textContent = 'Click Scan Inbox to find newsletters...';
        newsletterListElement.innerHTML = '<li class="no-results">No unsubscribable emails found yet.</li>';
      }
    });
  }
}); 