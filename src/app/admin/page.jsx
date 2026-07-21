/* oxlint-disable react/only-export-components */
import App from '../../App.jsx';

export const metadata = {
  title: 'AHV Admin Dashboard',
  description: 'Admin dashboard for AHV Trucking Services inquiries.',
};

export default function AdminPage() {
  return <App adminOnly />;
}
