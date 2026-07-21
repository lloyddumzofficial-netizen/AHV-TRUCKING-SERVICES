/* oxlint-disable react/only-export-components */
import App from '../../../App.jsx';

export async function generateMetadata({ params }) {
  const { reference } = await params;

  return {
    title: `${reference} | AHV Tracking`,
    description: 'Protected AHV Trucking Services inquiry tracking page.',
  };
}

export default async function TrackingPage({ params }) {
  const { reference } = await params;

  return <App initialView="track" initialReference={reference} />;
}
