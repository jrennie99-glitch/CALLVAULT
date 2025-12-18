import { generateInitials, stringToGradient } from '@/lib/avatar';

interface AvatarProps {
  name?: string;
  address: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Avatar({ name, address, size = 'md' }: AvatarProps) {
  const sizeClasses = {
    sm: 'w-10 h-10 text-sm',
    md: 'w-12 h-12 text-base',
    lg: 'w-24 h-24 text-2xl'
  };
  
  const gradient = stringToGradient(address);
  const initials = name ? generateInitials(name) : address.slice(5, 7).toUpperCase();
  
  return (
    <div 
      className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-semibold text-white flex-shrink-0`}
      style={{ background: `linear-gradient(135deg, ${gradient.from}, ${gradient.to})` }}
    >
      {initials}
    </div>
  );
}
