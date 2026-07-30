import { useState } from 'react';
import { ArrowRight, Bell, CheckCircle2, ClipboardList, Headphones, MapPin, PackageCheck, Plus, ShieldCheck, UserRound, Truck } from 'lucide-react';

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

function Hero({
  truck,
  lanes,
  onInquire,
  onViewTruck,
  onMyInquiries,
  onTrackReference,
  onSupport,
  onNotifications,
}) {
  const [trackingInput, setTrackingInput] = useState('');

  const submitTracking = () => {
    onTrackReference?.(trackingInput);
  };

  return (
    <section className="hero-section" id="home">
      <div className="hero-copy">
        <p className="eyebrow"><span className="eyebrow-line"></span>LOCAL NATIONWIDE TRUCKING INQUIRY</p>
        <h1>Port cargo. <span className="highlight-green">Province delivery.</span></h1>
        <p className="hero-text">
          Request the right AHV truck for goods arriving in Manila, Cebu, Davao, or any major hub, then track every quote and delivery update in one place.
        </p>

        <div className="hero-actions">
          <button className="primary-action" type="button" onClick={onInquire}>
            <div className="btn-left"><Truck size={18} /> Inquire Delivery</div>
            <ArrowRight size={18} />
          </button>
          {onMyInquiries && (
            <button className="secondary-action" type="button" onClick={onMyInquiries}>
              <div className="btn-left"><MapPin size={18} /> Track My Inquiries</div>
              <ArrowRight size={18} />
            </button>
          )}
          <button className="tertiary-action" type="button" onClick={onViewTruck}>
            <div className="btn-left"><Truck size={18} /> View Trucks</div>
            <ArrowRight size={18} />
          </button>
        </div>

        <div className="hero-proof-grid" aria-label="AHV service highlights">
          <div>
            <strong>PH-wide</strong>
            <span>Luzon, Visayas, Mindanao</span>
          </div>
          <div>
            <strong>15T</strong>
            <span>Wingvan capacity</span>
          </div>
          <div>
            <strong>Live</strong>
            <span>Status tracking</span>
          </div>
        </div>

      </div>

      <div className="hero-visual" aria-label={`${truck.name} ${truck.type}`}>
        <div className="hero-app-mockup">
          <div className="mobile-dashboard-hero">
            <div className="mobile-dashboard-copy">
              <span>Good morning,</span>
              <strong>AHV Trucker!</strong>
              <p>Move more. Deliver more. We'll handle the rest.</p>
              <button type="button" onClick={onInquire}>
                <Plus size={18} />
                Start New Trip
                <ArrowRight size={17} />
              </button>
            </div>
            <img src="/Truck.png" alt="AHV green logistics truck" />
          </div>

          {/* The rating / total-trips / years-service tiles and the "AHV Express"
              trip list were hardcoded fiction — a 4.8 rating, 120 trips, and
              AHV-2507-00xx trip IDs shown as if they were this user's shipments.
              On mobile they were the ONLY thing rendered, because the real hero
              copy was display:none. Removed; the shortcuts below are real. */}

          <div className="mobile-track-card">
            <div>
              <strong>Track your shipment</strong>
              <p>Get real-time updates of your cargo anytime, anywhere.</p>
            </div>
            <input
              aria-label="Tracking ID"
              placeholder="Enter Tracking ID"
              type="text"
              value={trackingInput}
              onChange={(event) => setTrackingInput(event.target.value.toUpperCase())}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submitTracking();
                }
              }}
            />
            <button type="button" onClick={submitTracking}>
              <MapPin size={17} />
              Track Now
            </button>
          </div>

          <div className="mobile-quick-access" aria-label="Quick access">
            <button type="button" onClick={onMyInquiries}>
              <ClipboardList size={23} />
              My Inquiries
            </button>
            <button type="button" onClick={onInquire}>
              <PackageCheck size={23} />
              Request Quote
            </button>
            <button type="button" onClick={onSupport}>
              <Headphones size={23} />
              Support
            </button>
            <button type="button" onClick={onNotifications}>
              <Bell size={23} />
              Alerts
            </button>
          </div>
        </div>

        <div className="truck-photo-panel">
          <img src="/Truck.png" alt="AHV white trucking service unit" />
          <div className="hero-mobile-fleet-chip">
            <Truck size={14} />
            <span>{truck.type}</span>
          </div>
          <div className="hero-mobile-route-card">
            <span>Manila port</span>
            <ArrowRight size={13} />
            <span>Province</span>
          </div>
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

      <div className="hero-supporting-content">
        <div className="popular-routes-header">
          <h3>POPULAR ROUTES</h3>
          <button className="view-all-routes" type="button">View all routes <ArrowRight size={14} /></button>
        </div>

        <div className="route-strip" aria-label="Available sample routes">
          {lanes.map((lane) => (
            <div key={lane} className="route-card">
              <div className="route-icon"><MapPin size={16} /></div>
              <span>{lane}</span>
              <ArrowRight size={16} className="route-arrow" />
            </div>
          ))}
        </div>

        <div className="how-it-works" aria-label="How AHV inquiry works">
          {HOW_IT_WORKS.map(({ step, icon: Icon, title, desc }) => (
            <div key={step} className="how-step">
              <div className="how-step-icon">
                <Icon size={20} />
                <span className="how-step-num">{step}</span>
              </div>
              <div className="how-step-body">
                <strong>{title}</strong>
                <p>{desc}</p>
              </div>
              <ArrowRight size={16} className="how-step-arrow" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default Hero;
