# Crypto Call Test Checklist

## MUST PASS BEFORE RELEASE

### 1. Video Call Test
- [ ] Open app in two browser tabs/devices
- [ ] Add contact in Tab A with Tab B's Call ID
- [ ] Start VIDEO call from Tab A to Tab B
- [ ] Accept call in Tab B
- [ ] Verify video and audio work both ways
- [ ] End call and verify both sides return to main screen

### 2. Audio-only Call Test
- [ ] Start AUDIO-only call (no video)
- [ ] Verify audio works both ways
- [ ] Verify no video streams are active

### 3. Biometric Lock Test (if device supports)
- [ ] Go to Settings > Privacy & Security
- [ ] Toggle "Biometric Lock" ON
- [ ] Reload the page
- [ ] Verify lock screen appears
- [ ] Tap "Unlock" and authenticate with Face ID / Touch ID
- [ ] Verify app unlocks successfully
- [ ] Go to Settings, toggle Biometric Lock OFF
- [ ] Reload page
- [ ] Verify no lock screen appears

### 4. TURN Server Test (optional)
- [ ] Set environment variables: TURN_URL, TURN_USER, TURN_PASS
- [ ] Restart server
- [ ] Go to Settings > Network
- [ ] Verify "ICE Mode" shows "TURN + STUN (Full NAT Support)"
- [ ] Without TURN env vars, verify app still works (STUN-only mode)

### 5. Network Reconnect Test
- [ ] Start a call between two devices
- [ ] Briefly disconnect network on one device (airplane mode)
- [ ] Reconnect network
- [ ] Verify UI shows "Reconnecting..." during disconnect
- [ ] Verify call attempts to reconnect when network returns

### 6. Empty States & Onboarding
- [ ] Clear localStorage to simulate new user
- [ ] Reload app
- [ ] Verify Contacts tab is shown by default (not Calls)
- [ ] Verify "No Contacts Yet" message with "Add Contact" button
- [ ] Go to Calls tab
- [ ] Verify "No Recent Calls" message with "Start a Call" button

### 7. PWA Installation
- [ ] Open app in mobile browser (Safari iOS / Chrome Android)
- [ ] Add to Home Screen
- [ ] Open from Home Screen icon
- [ ] Verify app opens in standalone mode (no browser UI)
- [ ] Verify app icon and name appear correctly

### 8. FAB (Floating Action Button)
- [ ] On Calls or Contacts tab, tap the green + FAB
- [ ] Verify quick actions appear: "Add Contact", "Share My QR"
- [ ] Tap "Add Contact" - navigates to Add tab
- [ ] Tap "Share My QR" - shows QR code

### 9. Avatar Generation
- [ ] Add a contact
- [ ] Verify contact shows a colored avatar with initials
- [ ] Verify avatar color is consistent (based on address)

### 10. UI Labels Check
- [ ] Go to Settings > Advanced Identity
- [ ] Verify label says "Call ID" (not "Call Address")
- [ ] Verify header shows "Private Mode" if display name is "Anonymous"
