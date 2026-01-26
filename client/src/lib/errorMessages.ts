/**
 * User-friendly error messages for call and messaging errors
 * Maps technical error codes to clear, actionable user messages
 */

export interface ErrorDetails {
  title: string;
  message: string;
  actionable?: string;
  duration?: number;
}

export const ERROR_MESSAGES: Record<string, ErrorDetails> = {
  // Free Tier / Rate Limiting Errors
  LIMIT_DAILY_CALLS: {
    title: 'Daily Call Limit Reached',
    message: 'You\'ve used your 5 free outbound calls for today.',
    actionable: 'Upgrade to Premium for unlimited calls, or wait until tomorrow.',
    duration: 6000
  },
  LIMIT_MONTHLY_MINUTES: {
    title: 'Monthly Minutes Used',
    message: 'You\'ve used all 60 minutes of your free monthly calling time.',
    actionable: 'Upgrade to Premium for unlimited calling minutes.',
    duration: 6000
  },
  LIMIT_CALL_DURATION: {
    title: 'Call Duration Limit',
    message: 'Free calls are limited to 15 minutes.',
    actionable: 'Upgrade to Premium for unlimited call duration.',
    duration: 5000
  },
  LIMIT_HOURLY_ATTEMPTS: {
    title: 'Too Many Call Attempts',
    message: 'You\'ve reached the maximum call attempts for this hour.',
    actionable: 'Please wait a bit or upgrade to Premium for unlimited attempts.',
    duration: 6000
  },
  LIMIT_FAILED_STARTS: {
    title: 'Too Many Failed Attempts',
    message: 'Too many failed call attempts today.',
    actionable: 'Please try again tomorrow or upgrade to Premium.',
    duration: 6000
  },
  NOT_APPROVED_CONTACT: {
    title: 'Contact Not Added',
    message: 'Free accounts can only call contacts.',
    actionable: 'Add them as a contact first, or upgrade to call anyone.',
    duration: 6000
  },
  GROUP_CALLS_NOT_ALLOWED: {
    title: 'Group Calls Unavailable',
    message: 'Group calls require a Premium plan.',
    actionable: 'Upgrade to unlock group calling.',
    duration: 5000
  },
  EXTERNAL_LINKS_NOT_ALLOWED: {
    title: 'External Links Unavailable',
    message: 'External call links require a Premium plan.',
    actionable: 'Upgrade to unlock this feature.',
    duration: 5000
  },
  RATE_LIMITED: {
    title: 'Rate Limit Reached',
    message: 'You\'re making too many requests.',
    actionable: 'Please slow down and try again in a moment.',
    duration: 5000
  },
  INBOUND_NOT_ALLOWED: {
    title: 'Inbound Calls Blocked',
    message: 'You cannot receive calls at this time.',
    actionable: 'Check your account settings or contact support.',
    duration: 5000
  },
  
  // Permission Errors
  PERMISSION_DENIED: {
    title: 'Permission Denied',
    message: 'Camera or microphone access was denied.',
    actionable: 'Go to your browser settings and allow camera/microphone access, then try again.',
    duration: 7000
  },
  CAMERA_PERMISSION_DENIED: {
    title: 'Camera Access Denied',
    message: 'Video calls require camera access.',
    actionable: 'Enable camera in browser settings, or switch to audio-only call.',
    duration: 6000
  },
  MICROPHONE_PERMISSION_DENIED: {
    title: 'Microphone Access Denied',
    message: 'Calls require microphone access.',
    actionable: 'Go to browser settings → Privacy → Microphone, then enable access for this site.',
    duration: 7000
  },
  
  // Connection Errors
  TURN_SERVER_UNAVAILABLE: {
    title: 'Connection Server Unavailable',
    message: 'Unable to connect to relay server.',
    actionable: 'Retrying with fallback servers...',
    duration: 5000
  },
  ICE_CONNECTION_FAILED: {
    title: 'Connection Failed',
    message: 'Unable to establish peer connection.',
    actionable: 'Check your network connection and try again.',
    duration: 6000
  },
  WEBSOCKET_DISCONNECTED: {
    title: 'Connection Lost',
    message: 'WebSocket connection was lost.',
    actionable: 'Reconnecting automatically...',
    duration: 4000
  },
  PEER_CONNECTION_TIMEOUT: {
    title: 'Connection Timeout',
    message: 'Could not connect within the time limit.',
    actionable: 'Check your network and try again.',
    duration: 5000
  },
  
  // Token / Auth Errors
  TOKEN_EXPIRED: {
    title: 'Session Expired',
    message: 'Your session has expired.',
    actionable: 'Retrying with fresh credentials...',
    duration: 4000
  },
  TIMESTAMP_EXPIRED: {
    title: 'Request Expired',
    message: 'Call request took too long.',
    actionable: 'Retrying automatically...',
    duration: 4000
  },
  CLOCK_DRIFT: {
    title: 'Time Sync Issue',
    message: 'Your device clock may be out of sync.',
    actionable: 'Syncing time with server...',
    duration: 4000
  },
  NONCE_EXPIRED: {
    title: 'Request Expired',
    message: 'Call request expired.',
    actionable: 'Retrying with new credentials...',
    duration: 4000
  },
  
  // Call State Errors
  CALL_UNAVAILABLE: {
    title: 'Recipient Unavailable',
    message: 'The person you\'re calling is currently unavailable.',
    actionable: 'They will see your missed call notification.',
    duration: 5000
  },
  RECIPIENT_BUSY: {
    title: 'Line Busy',
    message: 'The person you\'re calling is on another call.',
    actionable: 'Try again later or leave a voicemail.',
    duration: 5000
  },
  FREEZE_MODE_REQUEST: {
    title: 'Call Request Sent',
    message: 'Recipient has Freeze Mode enabled.',
    actionable: 'They will be notified of your call request.',
    duration: 6000
  },
  DND_ACTIVE: {
    title: 'Do Not Disturb',
    message: 'Recipient has Do Not Disturb enabled.',
    actionable: 'Your call has been sent to voicemail.',
    duration: 5000
  },
  
  // Message Errors
  MESSAGE_TOO_LARGE: {
    title: 'Message Too Large',
    message: 'This message exceeds the maximum size limit.',
    actionable: 'Try sending a smaller file or compress it first.',
    duration: 5000
  },
  STORAGE_QUOTA_EXCEEDED: {
    title: 'Storage Full',
    message: 'Local storage is full.',
    actionable: 'Clear some old messages to free up space.',
    duration: 5000
  },
  MESSAGE_SEND_FAILED: {
    title: 'Message Not Sent',
    message: 'Failed to send your message.',
    actionable: 'Check your connection. Message will retry automatically.',
    duration: 5000
  },
  
  // Generic Errors
  NETWORK_ERROR: {
    title: 'Network Error',
    message: 'Unable to connect to the server.',
    actionable: 'Check your internet connection and try again.',
    duration: 5000
  },
  UNKNOWN_ERROR: {
    title: 'Something Went Wrong',
    message: 'An unexpected error occurred.',
    actionable: 'Please try again. Contact support if the issue persists.',
    duration: 5000
  }
};

/**
 * Get user-friendly error message for an error code
 */
export function getErrorMessage(errorCode: string): ErrorDetails {
  return ERROR_MESSAGES[errorCode] || ERROR_MESSAGES.UNKNOWN_ERROR;
}

/**
 * Get a short message for toast notifications
 */
export function getToastMessage(errorCode: string): string {
  const error = getErrorMessage(errorCode);
  if (error.actionable) {
    return `${error.message} ${error.actionable}`;
  }
  return error.message;
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(errorCode: string): boolean {
  const retryableErrors = [
    'TOKEN_EXPIRED',
    'TIMESTAMP_EXPIRED', 
    'CLOCK_DRIFT',
    'NONCE_EXPIRED',
    'WEBSOCKET_DISCONNECTED',
    'TURN_SERVER_UNAVAILABLE',
    'NETWORK_ERROR'
  ];
  return retryableErrors.includes(errorCode);
}

/**
 * Check if an error requires user action
 */
export function requiresUserAction(errorCode: string): boolean {
  const userActionErrors = [
    'PERMISSION_DENIED',
    'CAMERA_PERMISSION_DENIED',
    'MICROPHONE_PERMISSION_DENIED',
    'STORAGE_QUOTA_EXCEEDED',
    'MESSAGE_TOO_LARGE'
  ];
  return userActionErrors.includes(errorCode);
}
