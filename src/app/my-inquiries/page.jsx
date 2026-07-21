/* oxlint-disable react/only-export-components */
import App from '../../App.jsx';

export const metadata = {
  title: 'My AHV Inquiries',
  description: 'View customer inquiry status and AHV trucking updates.',
};

export default function MyInquiriesPage() {
  return <App initialView="my-inquiries" />;
}
