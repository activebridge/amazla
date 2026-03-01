# Barcode Type Guide for Users

## How to Add Your Card

**The app now auto-detects the barcode type!** Just type your card number and the app will automatically choose the right format.

### Auto-Detection Rules

| Your Card Number | Auto-Detected Type | Example |
|-----------------|-------------------|---------|
| 13 digits only | **EAN-13** | `0123456789012` |
| 8-20 digits | **EAN-13** (padded) | `123456789012` |
| Letters + numbers (no special chars) | **CODE 39** | `ABC123`, `MEMBER456` |
| Contains special characters | **CODE 128** | `Member#2024`, `Test!123` |
| URLs or very long text | **QR Code** | `https://example.com` |

### If Auto-Detection Gets It Wrong

1. **Click the "Type" button** to manually cycle through formats:
   - EAN-13 → CODE 39 → CODE 128 → QR Code

2. **Test on your watch** - display the barcode and try scanning it

3. **If it doesn't scan:**
   - Click "Type" button to try next format
   - Try again with scanner

## Visual Identification Guide

### How to Tell What Barcode Your Physical Card Uses

**EAN-13** (Numeric barcodes)
- ✓ All numbers (no letters)
- ✓ Usually 13 digits
- ✓ Common on: Grocery store cards, simple loyalty cards
- Example: `0123456789012`

**CODE 39** (Alphanumeric barcodes)
- ✓ Mix of LETTERS and NUMBERS
- ✓ May have dashes or spaces
- ✓ Starts/ends with asterisk (*) on physical card
- ✓ Common on: Library cards, gym memberships, older loyalty cards
- Example: `*MEMBER123*` (enter as: `MEMBER123`)

**CODE 128** (Full ASCII barcodes)
- ✓ Can include special characters (!@#$%)
- ✓ More compact than CODE 39
- ✓ Common on: Modern loyalty cards, shipping labels
- Example: `Member#2024`

**QR Code**
- ✓ Square pattern (not bars)
- ✓ Contains URLs or lots of data
- ✓ Common on: Tickets, modern apps
- Example: `https://example.com/card/123`

## Troubleshooting

### "My barcode won't scan"

1. **Make sure watch brightness is at 100%** (the app does this automatically)
2. **Hold watch steady** against scanner
3. **Try different barcode types** using the Type button
4. **Check your card number** - make sure you typed it correctly

### "I don't know what type my card is"

**Don't worry!** The app auto-detects based on your input:
- Just type the number exactly as shown on your card
- The app will pick the best format
- If it doesn't work, click "Type" to try others

### "Type keeps changing when I type"

This is **auto-detection working**! The app updates the type as you type:
- Typing numbers → switches to EAN-13
- Adding letters → switches to CODE 39
- Adding special chars → switches to CODE 128

You can still **manually override** by clicking the Type button.

## Tips

- **Most loyalty cards** use EAN-13 (numbers only) or CODE 39 (alphanumeric)
- **Start with auto-detection** - it works for 90% of cards
- **Test immediately** - display the card on your watch and scan it
- **Numbers with letters?** Probably CODE 39
- **Just numbers?** Probably EAN-13
