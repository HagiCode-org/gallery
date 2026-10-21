import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Joins class names and lets the later of two conflicting Tailwind utilities win.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
