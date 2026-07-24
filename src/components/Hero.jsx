import { ArrowRight, Camera, CheckCircle2, MapPin, PackageCheck, Route, ShieldCheck, UserRound } from 'lucide-react';

const HOW_IT_WORKS = [
  {
    step: 1,
    icon: UserRound,
    title: 'Sign in & set up profile',
    desc: 'Create a free account and complete your profile with your name, phone, and photo for AHV admin verification.',
  },
  {
    step: 2,
    icon: MapPin,
    title: 'Submit pickup & cargo details',
    desc: 'Pin pickup and delivery locations on the PH map, describe your cargo, and attach parcel photos.',
  },
  {
    step: 3,
    icon: CheckCircle2,
    title: 'AHV reviews & sends quote',
    desc: 'Our dispatchers review your route, confirm truck fit, and send you a price quote with pickup schedule.',
  },
];

function Hero({ truck, lanes, onInquire, onViewTruck, onMyInquiries }) {
  return (
    <section className="hero-section" id="home">
      <div className="hero-copy">
        <p className="eyebrow">Local nationwide trucking inquiry</p>
        <h1>Move your cargo from port to province.</h1>
        <p className="hero-text">
          For goods arriving in Manila, Cebu, Davao, or any major hub, AHV helps you request the right local truck route across Luzon, Visayas, and Mindanao.
        </p>

        <div className="hero-actions">
          <button className="primary-action" type="button" onClick={onInquire}>
            Inquire Delivery
            <ArrowRight size={18} />
          </button>
          {onMyInquiries && (
            <button className="secondary-action" type="button" onClick={onMyInquiries} style={{ borderColor: 'var(--green)', color: 'var(--green)' }}>
              Track My Inquiries
            </button>
          )}
          <button className="secondary-action" type="button" onClick={onViewTruck}>
            View Trucks
          </button>
        </div>

        <div className="route-strip" aria-label="Available sample routes">
          {lanes.map((lane) => (
            <span key={lane}>
              <Route size={14} />
              {lane}
            </span>
          ))}
        </div>

        {/* How It Works strip */}
        <div className="how-it-works" aria-label="How AHV inquiry works">
          {HOW_IT_WORKS.map(({ step, icon: Icon, title, desc }) => (
            <div key={step} className="how-step">
              <div className="how-step-icon">
                <Icon size={18} />
                <span className="how-step-num">{step}</span>
              </div>
              <div className="how-step-body">
                <strong>{title}</strong>
                <p>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="hero-visual" aria-label={`${truck.name} ${truck.type}`}>
        <div className="truck-photo-panel">
          <img src="/UPSCALES.jpg" alt="AHV green trucking service unit" />
        </div>
        <div className="truck-badge">
          <PackageCheck size={18} />
          <span>{truck.name}</span>
          <strong>{truck.type}</strong>
        </div>
        <div className="coverage-card">
          <MapPin size={18} />
          <span>PH-wide pickup and delivery markers</span>
        </div>
        <div className="trust-card">
          <ShieldCheck size={18} />
          <span>Parcel photos, kg estimate, and route details in one request</span>
        </div>
      </div>
    </section>
  );
}

export default Hero;
