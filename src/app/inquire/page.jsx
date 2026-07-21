/* oxlint-disable react/only-export-components */
import App from '../../App.jsx';

export const metadata = {
  title: 'Create AHV Trucking Inquiry',
  description: 'Submit pickup, delivery, cargo, and image details for AHV Trucking Services.',
};

export default function InquirePage() {
  return <App initialView="inquire" />;
}
