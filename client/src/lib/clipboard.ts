import { toast } from 'sonner';

export async function copyToClipboard(text: string, successMessage?: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      if (successMessage) {
        toast.success(successMessage);
      }
      return true;
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (successful) {
          if (successMessage) {
            toast.success(successMessage);
          }
          return true;
        } else {
          toast.error('Failed to copy. Please copy manually.');
          return false;
        }
      } catch (err) {
        document.body.removeChild(textArea);
        toast.error('Failed to copy. Please copy manually.');
        return false;
      }
    }
  } catch (err) {
    console.error('Clipboard error:', err);
    toast.error('Failed to copy. Please copy manually.');
    return false;
  }
}
