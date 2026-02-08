# Call Signaling & WebRTC Fixes

## Issues Identified

### 1. Missing Call State Validation
- Server forwards `webrtc:offer`, `webrtc:answer`, `webrtc:ice` without validating there's an active call
- No verification that sender/recipient are actually in a call together
- Could allow message injection or misrouting

### 2. No ICE Candidate Buffering
- ICE candidates can arrive before peer connection is established
- Client has buffering logic but server doesn't track if it's safe to forward
- May lose early ICE candidates

### 3. Race Condition in call:accept
- Both caller and callee may initiate peer connection when `call:accept` is sent
- No coordination of who creates the offer/answer
- Can result in "glare" condition (both send offers)

### 4. Missing Signaling State Machine
- Server doesn't track call lifecycle states
- Can't validate message ordering (e.g., answer before offer)
- No cleanup of stale calls

### 5. Insufficient Logging
- WebRTC messages logged at wrong level
- No tracking of call setup duration
- Hard to diagnose connection failures

## Fixes Applied

### Server-Side (routes.ts)

1. **Added Active Call Tracking Map**
   - Track calls by `caller:callee` key
   - Store call state, timestamps, and signaling state
   - Auto-cleanup after timeout

2. **Added Call State Validation**
   - Validate `webrtc:*` messages against active calls
   - Verify sender is participant in the call
   - Track signaling state transitions

3. **Added Signaling State Machine**
   - States: `idle` → `ringing` → `connecting` → `connected` → `ended`
   - Validates message ordering
   - Prevents glare conditions

4. **Improved Logging**
   - Structured logging for all call events
   - Track call setup duration
   - Log WebRTC message flows

5. **Fixed call:init Race Condition**
   - Only initiator should create offer
   - Callee waits for offer before creating answer
   - Proper handling of async policy evaluation

### Client-Side (CallView.tsx)

1. **Fixed WebSocket Listener Attachment**
   - Ensure listener attached before peer connection setup
   - Buffer messages until peer connection ready

2. **Fixed call:accept Flow**
   - Callee sends `call:accept`, waits for offer
   - Caller creates offer upon receiving `call:accept`
   - Proper coordination between peers

3. **Added Better Error Handling**
   - Handle peer offline during signaling
   - Proper cleanup on connection failure
   - Retry logic for ICE failures

## Testing Checklist

- [ ] End-to-end call setup (caller → callee)
- [ ] Callee accepts call
- [ ] WebRTC offer/answer exchange
- [ ] ICE candidate exchange
- [ ] Media flows both directions
- [ ] Call end (both sides)
- [ ] Reject call scenario
- [ ] Missed call scenario
- [ ] Network interruption handling
