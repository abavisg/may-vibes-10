// Set a flag to indicate the content script is loaded
window.__GMAIL_UNSUBSCRIBER_LOADED = true;

console.log('Gmail Newsletter Unsubscriber content script loaded');

// Listen for messages from the popup
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('Content script received message:', request);
  
  if (request.action === 'scanForUnsubscribe') {
    console.log('Starting scan for unsubscribe links...');
    
    // Add a check to see if a specific email is open
    if (!isEmailThreadOpen()) {
      console.log('No email thread is open');
      sendResponse({
        success: false,
        message: 'Please open a specific email thread to scan.'
      });
      return true; // Required for asynchronous sendResponse
    }
    
    scanForUnsubscribeLinks().then(result => {
      console.log('Scan complete, sending response:', result);
      sendResponse(result);
    }).catch(error => {
      console.error('Error during scan:', error);
      sendResponse({
        success: false,
        message: 'Error: ' + error.message
      });
    });
    return true; // Required for asynchronous sendResponse
  } else if (request.action === 'triggerNativeUnsubscribe') {
    console.log('Received request to trigger native unsubscribe');
    triggerNativeUnsubscribe().then(sendResponse);
    return true; // Required for asynchronous sendResponse
  }
});

/**
 * Checks if a specific email thread is currently open in Gmail.
 */
function isEmailThreadOpen() {
  // Look for elements that are typically only present in an open email thread
  // Examples: subject line, sender/recipient details area, email body content
  const subjectLineElement = document.querySelector('.hP'); // Subject line class
  const emailDetailsElement = document.querySelector('.gb_qb'); // Sender/recipient area in modern Gmail
  const oldEmailDetailsElement = document.querySelector('.message_header'); // Sender/recipient area in older Gmail layouts
  const emailBodyElement = document.querySelector('.gs'); // Email body content area
  
  const isOpen = !!subjectLineElement && (!!emailDetailsElement || !!oldEmailDetailsElement) && !!emailBodyElement;
  
  console.log('Checking if email thread is open. Subject found:', !!subjectLineElement, 'Details found (modern/old):', !!emailDetailsElement, !!oldEmailDetailsElement, 'Body found:', !!emailBodyElement, 'Result:', isOpen);
  
  // Also check if the URL is likely a thread URL pattern
  const url = document.location.href;
  const isThreadUrl = url.includes('#inbox') && url.includes('/fm/') ||
                      url.includes('#sent') && url.includes('/fm/') ||
                      url.includes('#starred') && url.includes('/fm/') ||
                      url.includes('#all') && url.includes('/fm/') ||
                      url.includes('#label/') && url.includes('/fm/') ||
                      url.includes('/search/') && url.includes('/fm/'); // Include search results view
  
  console.log('Checking URL for thread pattern:', url, 'Result:', isThreadUrl);
  
  // Consider the thread open if both element check and URL check pass
  return isOpen && isThreadUrl;
}

/**
 * Scans the currently open email for unsubscribe links and headers
 */
async function scanForUnsubscribeLinks() {
  // The isEmailThreadOpen check is now done before calling this function
  console.log('Scanning open email thread...');
  
  try {
    // Find the open email container - refine selectors for thread view
    console.log('Looking for email container within the thread...');
    const emailContainer = getEmailThreadContainer();
    console.log('Email thread container found:', !!emailContainer);
    
    if (!emailContainer) {
      return {
        success: false,
        message: 'Could not find the email content area.'
      };
    }

    // Extract the sender from the email
    console.log('Extracting sender...');
    const sender = extractSender(emailContainer);
    console.log('Sender:', sender);
    
    // Find all potential unsubscribe links in the email body
    console.log('Searching for unsubscribe links in body...');
    const bodyUnsubscribeLinks = findUnsubscribeLinksInBody(emailContainer);
    console.log('Body unsubscribe links found:', bodyUnsubscribeLinks);
    
    // Look for List-Unsubscribe header in email details if available
    console.log('Searching for List-Unsubscribe header...');
    const headerUnsubscribeLinks = await findUnsubscribeLinksInHeader();
    console.log('Header unsubscribe links found:', headerUnsubscribeLinks);
    
    // Combine all found unsubscribe links
    const allUnsubscribeLinks = [...headerUnsubscribeLinks, ...bodyUnsubscribeLinks];
    
    // Filter out duplicates
    const uniqueUnsubscribeLinks = [...new Set(allUnsubscribeLinks)];
    console.log('All unique unsubscribe links:', uniqueUnsubscribeLinks);
    
    return {
      success: true,
      unsubscribeLinks: uniqueUnsubscribeLinks,
      sender: sender || 'Unknown sender'
    };
  } catch (error) {
    console.error('Error scanning for unsubscribe links:', error);
    return {
      success: false,
      message: 'Error scanning email: ' + error.message
    };
  }
}

/**
 * Finds the container element of the currently open email thread.
 */
function getEmailThreadContainer() {
  // Selectors specific to an open email thread view
  const possibleSelectors = [
    '.gs', // Main email body content area
    '.adn', // Another common email container in thread view
    'div[role="main"] .a4W', // Main email content area in some layouts
    '.h7' // Often contains the email body
  ];
  
  console.log('Trying the following thread container selectors:', possibleSelectors);
  
  for (const selector of possibleSelectors) {
    const elements = document.querySelectorAll(selector);
    console.log(`Selector "${selector}" found ${elements.length} elements`);
    
    if (elements.length > 0) {
      // Return the first element found that seems like a container
      // In thread view, there's usually only one main body container
      return elements[0];
    }
  }
  
  console.log('No email thread container found with specified selectors');
  return null;
}

/**
 * Extracts the sender email from the open email
 */
function extractSender(emailContainer) {
  // Try different selectors to find the sender info within the thread view
  const senderSelectors = [
    '.gD', // Email address element
    'span[email]', // Direct email attribute on a span
    'span[data-hovercard-id]', // Another possible email container
    '.go', // Sender name/email wrapper
    '.ajX.ajY' // Another potential sender info area
  ];
  
  console.log('Trying sender selectors within the thread:', senderSelectors);
  
  for (const selector of senderSelectors) {
    const senderElement = emailContainer.querySelector(selector);
    if (senderElement) {
      console.log(`Found sender element with selector "${selector}":`, senderElement);
      
      // Try to get the email attribute first
      const email = senderElement.getAttribute('email') || 
                     senderElement.getAttribute('data-hovercard-id');
      
      if (email) return email;
      
      // If no email attribute, try the inner text and extract email
      if (senderElement.textContent) {
        const emailMatch = senderElement.textContent.match(/[\w.-]+@[\w.-]+\.\w+/);
        if (emailMatch) return emailMatch[0];
        
        // Fallback to text content if no email pattern found
        return senderElement.textContent.trim();
      }
    }
  }
  
  // If still no sender found, try a broader search within a likely header area
  console.log('No sender found with specific selectors, trying broader search in header area');
  const headerArea = document.querySelector('.gb_qb') || document.querySelector('.message_header');
  if (headerArea) {
     const emailPattern = /[\w.-]+@[\w.-]+\.\w+/;
     const headerText = headerArea.textContent;
     const emailMatch = headerText.match(emailPattern);
     if (emailMatch) {
       console.log('Found email via pattern matching in header:', emailMatch[0]);
       return emailMatch[0];
     }
  }
  
  console.log('Sender could not be reliably extracted.');
  return null;
}

/**
 * Finds unsubscribe links in the email body
 */
function findUnsubscribeLinksInBody(emailContainer) {
  const unsubscribeLinks = [];
  
  // Get all links in the email
  const links = emailContainer.querySelectorAll('a');
  console.log('Total links found in email:', links.length);
  
  const unsubscribeKeywords = [
    'unsubscribe',
    'opt out',
    'opt-out',
    'remove me',
    'stop receiving',
    'manage preferences',
    'email preferences',
    'subscription',
    'manage your account',
    'update profile',
    'subscription settings',
    'email settings',
    'preference center'
  ];
  
  // Check each link for unsubscribe-related text
  links.forEach(link => {
    const href = link.href;
    const text = link.textContent.toLowerCase();
    
    // Skip empty links or mail:to links without unsubscribe
    if (!href || (href.startsWith('mailto:') && !href.includes('unsubscribe'))) {
      return;
    }
    
    // Check if the link text contains unsubscribe keywords
    const matchingKeyword = unsubscribeKeywords.find(keyword => 
      text.includes(keyword)
    );
    
    // Check if the URL contains unsubscribe keywords
    const urlMatchingKeyword = unsubscribeKeywords.find(keyword => 
      href.toLowerCase().includes(keyword)
    );
    
    if (matchingKeyword || urlMatchingKeyword) {
      console.log('Found unsubscribe link:', {
        text: link.textContent,
        href: href,
        matchedKeyword: matchingKeyword || urlMatchingKeyword
      });
      unsubscribeLinks.push(href);
    }
  });
  
  return unsubscribeLinks;
}

/**
 * Looks for List-Unsubscribe header in email details
 * This is more challenging as Gmail doesn't expose headers directly in the UI
 */
async function findUnsubscribeLinksInHeader() {
  // Try to find the "Show original" menu item to access email headers
  try {
    console.log('Looking for Gmail\'s native unsubscribe button...');
    
    // Look for Gmail's native unsubscribe button which appears when List-Unsubscribe is present
    const nativeUnsubscribeButtons = Array.from(document.querySelectorAll('span, div, button'))
      .filter(el => el.textContent && el.textContent.trim().toLowerCase() === 'unsubscribe');
    
    console.log('Potential unsubscribe buttons found:', nativeUnsubscribeButtons.length);
    
    for (const button of nativeUnsubscribeButtons) {
      console.log('Checking potential unsubscribe button:', button);
      
      // Try to get the parent element which might be a button or link
      const unsubElement = button.closest('a') || 
                           button.closest('button') ||
                           button.closest('div[role="button"]') ||
                           button;
      
      if (unsubElement) {
        console.log('Found unsubscribe element:', unsubElement);
        
        // For links, we can get the href directly
        if (unsubElement.tagName === 'A' && unsubElement.href) {
          console.log('Found direct unsubscribe link:', unsubElement.href);
          return [unsubElement.href];
        }
        
        // For buttons, we need to check if there's an onclick handler or event
        console.log('Found button-like unsubscribe element, marking for detection');
        return ['#gmail-native-unsubscribe-button-detected'];
      }
    }
    
    // Also look for "one-click unsubscribe" text which often appears near unsubscribe buttons
    const oneClickTexts = Array.from(document.querySelectorAll('span, div'))
      .filter(el => el.textContent && el.textContent.toLowerCase().includes('one-click unsubscribe'));
    
    if (oneClickTexts.length > 0) {
      console.log('Found "one-click unsubscribe" text, searching nearby elements');
      for (const textEl of oneClickTexts) {
        // Look for nearby links or buttons
        const parent = textEl.parentElement;
        if (parent) {
          const links = parent.querySelectorAll('a');
          if (links.length > 0) {
            console.log('Found link near one-click text:', links[0].href);
            return [links[0].href];
          }
        }
      }
    }
  } catch (error) {
    console.error('Error finding header unsubscribe link:', error);
  }
  
  console.log('No header unsubscribe links found');
  return [];
}

/**
 * Triggers the native Gmail unsubscribe button click.
 */
async function triggerNativeUnsubscribe() {
  try {
    console.log('Attempting to find and click native unsubscribe button...');
    
    // Use the same logic as findUnsubscribeLinksInHeader to find the element
    const nativeUnsubscribeButtons = Array.from(document.querySelectorAll('span, div, button'))
      .filter(el => el.textContent && el.textContent.trim().toLowerCase() === 'unsubscribe');
    
    if (nativeUnsubscribeButtons.length > 0) {
      console.log('Found native unsubscribe button element:', nativeUnsubscribeButtons[0]);
      
      // Simulate a click on the element
      nativeUnsubscribeButtons[0].click();
      
      console.log('Native unsubscribe button clicked');
      
      return {
        success: true,
        message: 'Native unsubscribe action triggered.'
      };
    } else {
      console.log('Native unsubscribe button element not found.');
      return {
        success: false,
        message: 'Native unsubscribe button not found on the page.'
      };
    }
  } catch (error) {
    console.error('Error triggering native unsubscribe:', error);
    return {
      success: false,
      message: 'Error triggering native unsubscribe: ' + error.message
    };
  }
} 