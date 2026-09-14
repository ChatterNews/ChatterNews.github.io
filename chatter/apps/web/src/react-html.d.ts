import 'react';

declare module 'react' {
  interface InputHTMLAttributes<T> {
    /** Firefox's vertical range hint; other browsers use writing-mode. */
    orient?: string;
  }
}
