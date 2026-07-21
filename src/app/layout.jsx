/* oxlint-disable react/only-export-components */
import 'leaflet/dist/leaflet.css';
import '../index.css';
import '../App.css';

export const metadata = {
  title: 'AHV Trucking Services',
  description: 'Mobile-first Philippine trucking inquiry app for AHV Trucking Services.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
