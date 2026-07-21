import { MapPinned, Phone, Truck } from 'lucide-react';

function Footer({ phone, phoneLabel }) {
  return (
    <footer className="site-footer" id="contact">
      <div className="footer-brand">
        <Truck size={24} />
        <strong>AHV Trucking Services</strong>
      </div>
      <p>Local nationwide trucking inquiries for Luzon, Visayas, and Mindanao routes.</p>
      <div className="footer-links">
        {phone && (
          <a href={`tel:${phone}`}>
            <Phone size={16} />
            {phoneLabel || phone}
          </a>
        )}
        <a href="#inquiry">
          <MapPinned size={16} />
          Create route inquiry
        </a>
      </div>
    </footer>
  );
}

export default Footer;
