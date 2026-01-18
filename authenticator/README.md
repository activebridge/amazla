# Authenticator for Zepp OS

TOTP Authenticator app for Zepp OS smartwatches. Generate two-factor authentication codes directly on your wrist.

## Features

### Watch App
- Display TOTP codes with countdown timer
- Swipe between accounts
- Auto-refresh every 30 seconds
- Works offline (no phone connection needed)
- Support for round and square screens

### Phone Settings
- Import from QR code screenshots (single or multiple)
- Import from Google Authenticator export
- Import from JSON (Aegis, 2FAS, andOTP, Raivo)
- Paste otpauth:// URLs directly
- Search accounts by name
- Drag to reorder accounts
- Swipe to delete

## Supported Import Formats

| Format | Support |
|--------|---------|
| Google Authenticator QR | Yes |
| otpauth://totp/ URLs | Yes |
| otpauth://hotp/ URLs | Yes |
| otpauth-migration:// | Yes |
| Aegis JSON | Yes |
| 2FAS JSON | Yes |
| andOTP JSON | Yes |
| Raivo JSON | Yes |

## How to Import

### From Google Authenticator
1. Open Google Authenticator app
2. Tap menu (three dots) -> Transfer accounts -> Export
3. Select accounts to export
4. Take a screenshot of the QR code
5. In Zepp app settings, tap + -> Import from File
6. Select the screenshot

### From QR Code Screenshot
1. Screenshot any TOTP QR code
2. Tap + -> Import from File
3. Select one or multiple screenshots
4. Accounts are imported automatically

### From URL
1. Copy the otpauth:// URL
2. Tap + button
3. Paste URL in the input field

### From JSON Export
1. Export accounts from your authenticator app
2. Tap + -> Import from File
3. Select the JSON file

## Development

### Prerequisites
- Node.js
- Zepp CLI (`npm install -g @aspect/cli`)

### Setup
```bash
cd authenticator
npm install
```

### Build
```bash
zeus build
```

### Preview
```bash
zeus preview
```

## Project Structure

```
authenticator/
├── app.js              # App entry point
├── app.json            # App configuration
├── app-side/           # Phone-side app logic
├── page/               # Watch pages
│   ├── index.page.js   # Main page
│   ├── components/     # Watch UI components
│   │   ├── list.js     # Account list
│   │   ├── card.js     # Account card
│   │   ├── timer.r.layout.js  # Round screen timer
│   │   └── timer.s.layout.js  # Square screen timer
│   └── libs/           # Watch utilities
│       └── totp.js     # TOTP generation
├── setting/            # Phone settings page
│   ├── index.js        # Settings entry
│   ├── components/     # Settings UI components
│   ├── libs/           # Settings utilities
│   │   ├── migration.js    # Import parsing
│   │   ├── search.js       # Search functionality
│   │   ├── sortable.js     # Drag reorder
│   │   └── urlInput.js     # URL input handling
│   └── models/         # Data models
└── assets/             # Images and icons
    ├── default.r/      # Round screen assets
    └── default.s/      # Square screen assets
```

## Version History

### 3.0.0
- Complete redesign
- Multiple file upload
- Search functionality
- Drag to reorder
- Square screen support
- Progress bar timer for square screens

## License

MIT
