document.addEventListener('DOMContentLoaded', function() {
  const statusElement = document.getElementById('status');
  const newsletterListElement = document.getElementById('newsletter-list');
  const scanButton = document.getElementById('scan-btn');
  const viewIgnoredButton = document.getElementById('view-ignored-btn');
  const ignoredSendersSection = document.getElementById('ignored-senders-section');
  const ignoredSendersListElement = document.getElementById('ignored-senders-list');
  const hideIgnoredButton = document.getElementById('hide-ignored-btn');
  const progressStatusElement = document.getElementById('progress-status');
  
  // New elements for Recently Moved section
  const viewMovedButton = document.getElementById('view-moved-btn');
  const recentlyMovedSection = document.getElementById('recently-moved-section');
  const recentlyMovedListElement = document.getElementById('recently-moved-list');
  const hideMovedButton = document.getElementById('hide-moved-btn');
  
  // Main section element
  const mainSection = document.getElementById('main-section');
  
  let ignoredSenders = [];
  let recentlyMovedEmails = []; // To store recently moved emails from storage
  
  console.log('Popup initialized');
  
  // Load ignored senders and saved unsubscribe results on startup
  loadIgnoredSenders();
  loadSavedResults(); // This loads the last scan results
  loadRecentlyMoved(); // Load recently moved emails
  
  // Event listener for the Scan Inbox button
  scanButton.addEventListener('click', handleScanInboxClick);
  
  // Event listener for View Ignored Senders button
  viewIgnoredButton.addEventListener('click', function() {
    console.log('View Ignored Senders button clicked');
    
    // Show ignored senders section
    ignoredSendersSection.style.display = 'block';
    
    // Hide main section
    mainSection.style.display = 'none';
    
    // Hide the Recently Moved section if it's visible
    if (recentlyMovedSection) {
      recentlyMovedSection.style.display = 'none';
    }
    
    displayIgnoredSenders(); // Populate the list
  });
  
  // Event listener for Hide button in ignored senders section
  hideIgnoredButton.addEventListener('click', function() {
    console.log('Hide Ignored Senders button clicked');
    
    // Hide ignored senders section
    ignoredSendersSection.style.display = 'none';
    
    // Show main section again
    mainSection.style.display = 'block';
  });
  
  // Event listener for View Recently Moved button
  viewMovedButton.addEventListener('click', function() {
    console.log('View Recently Moved button clicked');
    
    // Show recently moved section
    if (recentlyMovedSection) {
      recentlyMovedSection.style.display = 'block';
    }
    
    // Hide main section
    mainSection.style.display = 'none';
    
    // Hide ignored senders section if it's visible
    if (ignoredSendersSection) {
      ignoredSendersSection.style.display = 'none';
    }
    
    displayRecentlyMoved(); // Populate the list
  });
  
  // Event listener for Hide button in recently moved section
  hideMovedButton.addEventListener('click', function() {
    console.log('Hide Recently Moved button clicked');
    
    // Hide the recently moved section
    if (recentlyMovedSection) {
      recentlyMovedSection.style.display = 'none';
    }
    
    // Show main section again
    mainSection.style.display = 'block';
  });
  
  // Add click listener to each newsletter item
  newsletterListElement.addEventListener('click', function(event) {
    const target = event.target.closest('li');
    if (!target) return;

    const messageId = target.dataset.messageId;
    const unsubscribeLinks = JSON.parse(target.dataset.unsubscribeLinks); // Retrieve parsed links
    const sender = target.dataset.sender; // Get sender from data attribute
    const subject = target.dataset.subject; // Get subject from data attribute

    console.log('Clicked on item with messageId:', messageId);
    console.log('Unsubscribe links:', unsubscribeLinks);
    console.log('Sender:', sender);
    console.log('Subject:', subject);

    if (unsubscribeLinks && unsubscribeLinks.length > 0) {
      // Prioritize http/https links
      const httpLink = unsubscribeLinks.find(link => link.startsWith('http://') || link.startsWith('https://'));
      
      if (httpLink) {
        console.log('Opening HTTP/S link:', httpLink);
        chrome.tabs.create({ url: httpLink });

        // Store reference to the list item that was clicked
        const listItemToRemove = target;

        // Send message to background to move the email to Unsubscribed folder, include sender and subject
        chrome.runtime.sendMessage({ action: 'moveEmailToTrash', messageId: messageId, sender: sender, subject: subject }, function(response) {
          if (chrome.runtime.lastError) {
            console.error('Error sending message to move email to Unsubscribed folder:', chrome.runtime.lastError);
          } else if (response && response.success) {
            console.log('Message sent to move email to Unsubscribed folder successfully.', messageId);
            
            // Remove the item from the displayed list
            if (listItemToRemove && listItemToRemove.parentNode) {
              listItemToRemove.remove();
              console.log('Removed list item from UI');
              
              // Update status if list becomes empty
              setTimeout(() => {
                if (newsletterListElement.children.length === 0) {
                  statusElement.textContent = 'No unsubscribable newsletters found.';
                  newsletterListElement.innerHTML = '<li class="no-results">No unsubscribable emails found in the last 50 messages.</li>';
                } else {
                  // Update the count in the status
                  const currentCount = newsletterListElement.querySelectorAll('li:not(.no-results)').length;
                  statusElement.textContent = `Found ${currentCount} potential newsletter(s)`;
                }
              }, 100);
            } else {
              console.error('Could not find list item to remove or it was already removed');
            }
          } else if (response && response.message) {
            console.error('Background script reported error moving email:', response.message);
          }
        });

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
    progressStatusElement.textContent = 'Starting scan...';
    progressStatusElement.style.display = 'block'; // Show the progress element
    newsletterListElement.innerHTML = ''; // Clear previous results
    scanButton.disabled = true; // Disable button while scanning
    
    console.log('Sending message to background script to scan inbox...');
    chrome.runtime.sendMessage({ action: 'scanInboxForUnsubscribe' }, function(response) {
      console.log('Received response from background script:', response);
      scanButton.disabled = false; // Re-enable button
      
      if (chrome.runtime.lastError) {
        console.error('Error from background script:', chrome.runtime.lastError);
        // If chrome.runtime.lastError exists, there was an issue with the message.
        statusElement.textContent = 'Error: Could not receive scan results from background.';
        newsletterListElement.innerHTML = '<li class="no-results">Error scanning inbox: ' + chrome.runtime.lastError.message + '</li>';
        // Log the full lastError object for debugging
        console.log('chrome.runtime.lastError object:', chrome.runtime.lastError);
        progressStatusElement.style.display = 'none'; // Hide on error
        return;
      }
      
      if (!response) {
        console.error('Empty response received from background script');
        statusElement.textContent = 'Error: Empty response from background script';
        newsletterListElement.innerHTML = '<li class="no-results">Error communicating with background script</li>';
        progressStatusElement.style.display = 'none'; // Hide on error
        return;
      }
      
      if (!response.success) {
        statusElement.textContent = 'Scan failed';
        newsletterListElement.innerHTML = `<li class="no-results">${response.message || 'Unknown error during scan.'}</li>`;
        progressStatusElement.style.display = 'none'; // Hide on error
        return;
      }
      
      displayResults(response.unsubscribeLinks);
      progressStatusElement.style.display = 'none'; // Hide on success
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
      listItem.dataset.sender = item.sender; // Add sender to data attribute
      listItem.dataset.subject = item.subject; // Add subject to data attribute
      
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
        // Prevent the event from bubbling up to the list item
        event.stopPropagation();
        
        // Prioritize http/https links for the button as well
        const httpLink = item.unsubscribeLinks.find(link => link.startsWith('http://') || link.startsWith('https://'));
        
        if (httpLink) {
          console.log('Opening HTTP/S link via button:', httpLink);
          chrome.tabs.create({ url: httpLink });

          // Get the parent list item
          const parentListItem = this.closest('li');
          
          // Send message to background to move the email to Unsubscribed folder, include sender and subject
          chrome.runtime.sendMessage({ action: 'moveEmailToTrash', messageId: item.messageId, sender: item.sender, subject: item.subject }, function(response) {
            if (chrome.runtime.lastError) {
              console.error('Error sending message to move email to Unsubscribed folder:', chrome.runtime.lastError);
            } else if (response && response.success) {
              console.log('Message sent to move email to Unsubscribed folder successfully.', item.messageId);
              
              // Remove the item from the displayed list
              if (parentListItem) {
                parentListItem.remove();
                console.log('Removed list item from UI');
                
                // Update status if list becomes empty
                setTimeout(() => {
                  if (newsletterListElement.children.length === 0) {
                    statusElement.textContent = 'No unsubscribable newsletters found.';
                    newsletterListElement.innerHTML = '<li class="no-results">No unsubscribable emails found in the last 50 messages.</li>';
                  } else {
                    // Update the count in the status
                    const currentCount = newsletterListElement.querySelectorAll('li:not(.no-results)').length;
                    statusElement.textContent = `Found ${currentCount} potential newsletter(s)`;
                  }
                }, 100);
              } else {
                console.error('Could not find parent list item to remove');
              }
            } else if (response && response.message) {
              console.error('Background script reported error moving email:', response.message);
            }
          });

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
        displayIgnoredSenders(); // Refresh the displayed ignored list
        
        // Also, re-display the main list using the last saved scan results
        // This makes unignored emails reappear in the main list immediately.
        loadSavedResults(); // loadSavedResults will call displayResults internally
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

  /**
   * Loads recently moved emails from chrome.storage.local.
   */
  function loadRecentlyMoved() {
    chrome.storage.local.get(['recentlyMovedEmails'], function(result) {
      recentlyMovedEmails = result.recentlyMovedEmails || [];
      console.log('Loaded recently moved emails:', recentlyMovedEmails);
      // Note: We don't display them immediately, only when the button is clicked
    });
  }

  /**
   * Displays the list of recently moved emails in the UI.
   */
  function displayRecentlyMoved() {
    recentlyMovedListElement.innerHTML = ''; // Clear previous list

    if (recentlyMovedEmails.length === 0) {
      recentlyMovedListElement.innerHTML = '<li class="no-results">No emails recently moved.</li>';
      return;
    }

    recentlyMovedEmails.forEach(item => {
      const listItem = document.createElement('li');
      listItem.className = 'recently-moved-item'; // Use recently-moved-item class
      listItem.dataset.messageId = item.messageId; // Store message ID

      const senderSubjectElement = document.createElement('div');
      senderSubjectElement.textContent = `From: ${item.sender}, Subject: ${item.subject}`;
      senderSubjectElement.style.marginBottom = '5px';

      const moveBackButton = document.createElement('button');
      moveBackButton.textContent = 'Move back to Inbox';
      moveBackButton.className = 'move-back-btn'; // Add a specific class
      moveBackButton.addEventListener('click', function() {
        console.log('Move back button clicked for messageId:', item.messageId);
        // Send message to background to move the email back to inbox
        chrome.runtime.sendMessage({ action: 'moveEmailToInbox', messageId: item.messageId }, function(response) {
          if (chrome.runtime.lastError) {
            console.error('Error sending message to move email back to inbox:', chrome.runtime.lastError);
          } else if (response && response.success) {
            console.log('Message sent to move email back to inbox successfully.', item.messageId);
            // Remove item from display and update storage
            listItem.remove();
            // Also remove from the in-memory array so display updates correctly next time
            recentlyMovedEmails = recentlyMovedEmails.filter(email => email.messageId !== item.messageId);
            // No need to explicitly call removeRecentlyMovedMessage here, background script does it on successful move

            // Update status if list becomes empty
            if (recentlyMovedListElement.children.length === 0) {
                 recentlyMovedListElement.innerHTML = '<li class="no-results">No emails recently moved.</li>';
            }
            
            // If we're currently showing the newsletter scan results, refresh them to include this email
            if (mainSection.style.display === 'block') {
              // Add a slight delay to ensure Gmail API has updated
              setTimeout(handleScanInboxClick, 1000);
            }
          } else if (response && response.message) {
            console.error('Background script reported error moving email back:', response.message);
            alert('Error moving email back to inbox: ' + response.message);
          }
        });
      });

      listItem.appendChild(senderSubjectElement);
      listItem.appendChild(moveBackButton);
      recentlyMovedListElement.appendChild(listItem);
    });
  }

  // Listen for progress updates from the background script
  chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
      if (request.action === 'updateProgress') {
        console.log('Popup received updateProgress message:', request.message);
        progressStatusElement.textContent = request.message;
      }
      // Add logging for other message types if needed for debugging
      // else {
      //   console.log('Popup received other message:', request);
      // }
    }
  );
}); 