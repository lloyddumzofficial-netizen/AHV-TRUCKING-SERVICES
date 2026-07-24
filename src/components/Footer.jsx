import { MapPin, MapPinned, Phone, Route, ShieldCheck, Truck } from 'lucide-react';

const FOOTER_BADGES = [
  { icon: MapPin, label: 'Nationwide PH Coverage', sub: 'Luzon • Visayas • Mindanao' },
  { icon: ShieldCheck, label: 'Verified Carrier', sub: 'AHV-registered fleet units' },
  { icon: Route, label: 'GPS Live Tracking', sub: 'Real-time driver location' },
];

const FOOTER_LANES = [
  'Manila to Mindanao',
  'Mindanao to Luzon',
  'Luzon to Visayas',
  'Visayas to Mindanao',
];

function Footer({ phone, phoneLabel }) {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer" id="contact">
      <div className="footer-badges">
        {FOOTER_BADGES.map(({ icon: Icon, label, sub }) => (
          <div key={label} className="footer-badge">
            <Icon size={20} />
            <div>
              <strong>{label}</strong>
              <span>{sub}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="footer-main">
        <div className="footer-brand-block">
          <div className="footer-brand">
            <Truck size={22} />
            <strong>AHV Trucking Services</strong>
          </div>
          <p>Local nationwide trucking inquiries for Luzon, Visayas, and Mindanao routes. Fast, verified, and GPS-tracked.</p>
          <div className="footer-links">
            {phone && (
              <a href={`tel:${phone}`}>
                <Phone size={15} />
                {phoneLabel || phone}
              </a>
            )}
            <a href="#inquiry">
              <MapPinned size={15} />
              Create route inquiry
            </a>
          </div>
        </div>

        <div className="footer-lanes-block">
          <p className="footer-lanes-title">Common Service Lanes</p>
          <ul className="footer-lanes-list">
            {FOOTER_LANES.map((lane) => (
              <li key={lane}>
                <Route size={13} />
                {lane}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="footer-bottom">
        <small>© {year} AHV Trucking Services. All rights reserved.</small>
        <small>Powered by AHV dispatch operations.</small>
      </div>
    </footer>
  );
}

export default Footer;
