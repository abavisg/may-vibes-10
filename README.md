# Gmail Newsletter Unsubscriber

A Chrome extension that helps you easily find and manage unsubscribe links for newsletters directly from your Gmail inbox using the Gmail API.

## Features

- Scans the latest emails in your Gmail inbox using the Gmail API
- Finds emails with the `List-Unsubscribe` header
- Displays a list of potential newsletters in the extension popup
- Prioritizes opening web-based unsubscribe links (HTTP/HTTPS)
- Falls back to mailto links if no web link is available or functional
- Allows you to ignore specific senders so they don't appear in future scan results
- Provides a way to view and unignore previously ignored senders
- Persists scan results in local storage so the popup loads faster

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
4. The list will populate with emails found to have a `List-Unsubscribe` header
5. Click on a newsletter item or its "Unsubscribe" button. The extension will attempt to open the unsubscribe link (preferably a web link) in a new tab
6. If you want to stop seeing emails from a specific sender in the scan results, click the "Ignore Sender" button next to their entry
7. To view or manage ignored senders, click the "View Ignored Senders" button. You can "Unignore" senders from this list

## Privacy

This extension:
- Uses the Chrome `identity` API for OAuth2 authentication with the Gmail API
- Uses the Gmail API with `gmail.readonly` scope to fetch email headers (specifically `List-Unsubscribe`, `From`, and `Subject`) for scanning purposes
- Does not read the full body content of your emails
- Does not send your email data or unsubscribe links to any external servers
- Stores ignored senders and the latest scan results in your browser's local storage (`chrome.storage.local`)

## Limitations

- Can only detect unsubscribe links that are clearly labeled or use common keywords
- May not work with all newsletters, especially those that don't follow standard practices
- Gmail's interface changes may affect the extension's functionality

## Development

This extension is built using vanilla JavaScript and Chrome Extension APIs (including `identity` and `storage`) and interacts with the Gmail API.

### Project Structure:
- `/` (Root Directory): Contains the `manifest.json` and `README.md`
- `src/`: Contains all the core extension code and assets
  - `background.js`: Handles OAuth, Gmail API calls, and saving results to storage
  - `popup.html` & `popup.js`: Manages the extension popup UI, displaying results, handling user interactions (unsubscribe, ignore, view ignored), and loading saved results
  - `content.js`: (Currently not actively used for the API scanning approach but remains in the project structure)
  - `images/`: Contains extension icons and potentially other UI images

### Scan Limit Configuration
The number of emails scanned by the extension is limited to 20 by default for performance. You can adjust this limit by modifying the `maxResults` variable in the `fetchMessageList` function located in `src/background.js`.

### About manifest.json and .gitignore
The `manifest.json` file is crucial for any Chrome extension. It acts as a configuration file, providing essential information to Chrome, such as the extension's name, version, permissions, background scripts, UI files (like the popup), and more. It must be located at the top level of the folder you load in `chrome://extensions/`.

We've added `manifest.json` to the `.gitignore` file. This is primarily done to prevent sensitive information (like OAuth client IDs or API keys, if they were not for a public extension) from being accidentally committed to a public repository. While the client ID for a Chrome extension is generally less sensitive, including `manifest.json` in `.gitignore` is a common practice for projects involving APIs to encourage using environment variables or other secure methods for handling credentials in different environments.

### Future Improvements
- Add support for batch unsubscribing
- Improve UI for managing unsubscribe actions and ignored senders
- Add statistics on unsubscribed newsletters
- Add the ability to automatically move an email to a designated folder (e.g., "Unsubscribed") after successfully opening a web unsubscribe link.

## License

This project is licensed under the MIT License.