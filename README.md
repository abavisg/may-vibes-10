# Gmail Newsletter Unsubscriber

A Chrome extension that helps you easily find and manage unsubscribe links for newsletters directly from your Gmail inbox using the Gmail API.

## Features

- Scans the latest emails in your Gmail inbox using the Gmail API (fetches headers like `List-Unsubscribe`, `From`, `Subject`)
- Finds emails with the `List-Unsubscribe` header
- Displays a list of potential newsletters in the extension popup
- Prioritizes opening web-based unsubscribe links (HTTP/HTTPS) when clicking a list item or the unsubscribe button
- Falls back to mailto links if no web link is available or functional
- Automatically moves unsubscribed emails to a dedicated "Unsubscribed" folder in Gmail (creates the folder if it doesn't exist)
- Removes emails from the displayed list after moving them to the "Unsubscribed" folder
- Allows you to move emails back to your inbox from the "Unsubscribed" folder if needed
- When moving emails back to inbox, you can scan again to see them in the newsletter list
- Allows you to ignore specific senders so their emails don't appear in future scan results
- Provides a way to view and unignore previously ignored senders via a dedicated section in the popup
- Unignoring a sender immediately updates the main list to show their emails if they were in the last scan results
- Persists scan results in local storage (`chrome.storage.local`) so the popup loads faster with the last found newsletters
- Displays scan progress in the popup while fetching and processing emails

## Installation

### From Chrome Web Store
*Coming soon*

### Manual Installation (Developer Mode)
1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the root project directory (`may-vibes-10`) where `manifest.json` is located. Do NOT select the `src` folder.
5. The extension icon should appear in your Chrome toolbar
6. Grant OAuth permission when prompted by the extension to allow it to read your Gmail inbox

## How to Use

1. Click the Gmail Newsletter Unsubscriber extension icon in your Chrome toolbar
2. The popup will open, displaying the results from the last scan (if available)
3. Click "Scan Inbox" to perform a new scan of the latest emails in your inbox
4. Observe the progress indicator as the scan runs
5. The list will populate with emails found to have a `List-Unsubscribe` header
6. Click on a newsletter item or its "Unsubscribe" button. The extension will:
   - Open the unsubscribe link (preferably a web link) in a new tab
   - Automatically move the email to the "Unsubscribed" folder
   - Remove the item from the displayed list
7. To view recently moved emails, click the "View Recently Moved" button
8. From the Recently Moved list, you can move emails back to your inbox by clicking "Move back to Inbox"
9. If you want to stop seeing emails from a specific sender in the scan results, click the "Ignore Sender" button next to their entry
10. To view or manage ignored senders, click the "View Ignored Senders" button. From the ignored senders list, you can click "Unignore" to make their emails reappear in the main list

## Privacy

This extension:
- Uses the Chrome `identity` API for OAuth2 authentication with the Gmail API
- Uses the Gmail API with:
  - `gmail.readonly` scope to fetch email headers (specifically `List-Unsubscribe`, `From`, and `Subject`) for scanning purposes
  - `gmail.modify` scope to create the "Unsubscribed" folder and move emails to it
- Does not read the full body content of your emails
- Does not send your email data or unsubscribe links to any external servers
- Stores ignored senders and the latest scan results in your browser's local storage (`chrome.storage.local`)

## Limitations

- Relies on the presence and correct formatting of the `List-Unsubscribe` header in emails
- May not work with all newsletters, especially those that don't follow standard email practices
- Gmail's interface changes may affect the extension's functionality

## Development

This extension is built using vanilla JavaScript and Chrome Extension APIs (including `identity` and `storage`) and interacts with the Gmail API.

### Project Structure:
- `/` (Root Directory): Contains the `manifest.json` and `README.md`
- `src/`: Contains all the core extension code and assets
  - `background.js`: Handles OAuth, Gmail API calls, processing email headers (using `format=full`), sending progress updates, and saving results to storage
  - `popup.html` & `popup.js`: Manages the extension popup UI, displaying results, handling user interactions (unsubscribe, ignore, view ignored), loading saved results, displaying scan progress, and handling messages from the background script
  - `content.js`: (Currently not actively used for the API scanning approach but remains in the project structure)
  - `images/`: Contains extension icons and potentially other UI images

### Scan Limit Configuration
The number of emails scanned by the extension is currently limited to 50 for performance. You can adjust this limit by modifying the `maxResults` variable in the `fetchMessageList` function located in `src/background.js`.

### About manifest.json and .gitignore
The `manifest.json` file is crucial for any Chrome extension. It acts as a configuration file, providing essential information to Chrome, such as the extension's name, version, permissions, background scripts, UI files (like the popup), and more. It must be located at the top level of the folder you load in `chrome://extensions/`.

We've added `manifest.json` to the `.gitignore` file. This is primarily done to prevent sensitive information (like OAuth client IDs or API keys, if they were not for a public extension) from being accidentally committed to a public repository. While the client ID for a Chrome extension is generally less sensitive, including `manifest.json` in `.gitignore` is a common practice for projects involving APIs to encourage using environment variables or other secure methods for handling credentials in different environments.

### Console Warnings (Optional)
You might occasionally see a warning in the Service Worker console like `Could not send progress update, popup likely closed...` if you close the extension popup while a scan is still in progress. This is expected behavior and indicates that the background script is attempting to send progress updates but the popup is not available to receive them. The scan will continue and complete in the background, and the results will be saved.

## Tech Stack

- Vanilla JavaScript
- Chrome Extension APIs (`identity`, `storage`, `scripting`, `runtime`, `action`, `tabs`)
- Gmail API
- HTML
- CSS

### Future Improvements
- Add support for batch unsubscribing
- Add statistics on unsubscribed newsletters

## License

This project is licensed under the MIT License.