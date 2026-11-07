import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'NOIR BARBER | Modern Grooming', description: 'Premium barbering and easy online booking.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="tr"><body>{children}</body></html>; }
