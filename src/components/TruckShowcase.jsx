import { CheckCircle2, Ruler, Weight, Truck, MapPin } from 'lucide-react';

function TruckShowcase({ fleet = [], lanes = [], onInquire }) {
  return (
    <section className="fleet-section" id="truck" style={{ paddingTop: '1rem' }}>
      <div className="section-heading" style={{ marginBottom: '3rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <p className="eyebrow">Our Fleet</p>
          <h2>Available AHV Trucking Units</h2>
          <p>
            We provide a range of vehicles tailored for cargo forwarding, bulk parcel movement, and business deliveries across the Philippine islands. Choose the right truck for your needs.
          </p>
        </div>
        {onInquire && (
          <button type="button" onClick={onInquire} className="fleet-inquire-button">
            Inquire Delivery
          </button>
        )}
      </div>

      <div className="fleet-grid">
        {fleet.map((truck) => (
          <div key={truck.id} className="fleet-card">
            {truck.image && (
              <div className="fleet-card-image">
                <img src={truck.image} alt={truck.name} />
              </div>
            )}
            <div className="fleet-card-header">
              <Truck size={24} className="fleet-icon" />
              <div>
                <h3>{truck.type}</h3>
                <span className="fleet-model">{truck.name}</span>
              </div>
            </div>

            <div className="fleet-specs">
              <div className="spec-item">
                <Weight size={18} />
                <div>
                  <span>Capacity</span>
                  <strong>{truck.capacity}</strong>
                </div>
              </div>
              <div className="spec-item">
                <Ruler size={18} />
                <div>
                  <span>Dimensions</span>
                  <strong>{truck.dimensions}</strong>
                </div>
              </div>
            </div>

            <div className="fleet-best-for">
              <strong>Best for:</strong> {truck.bestFor}
            </div>

            <div className="fleet-highlights">
              {truck.highlights.map((item) => (
                <div key={item} className="highlight-item">
                  <CheckCircle2 size={16} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="fleet-lanes">
        <div className="fleet-lanes-head">
          <MapPin size={24} />
          <h3>Common Service Lanes</h3>
        </div>
        <div className="lane-list" aria-label="Common service lanes">
          {lanes.map((lane) => (
            <span key={lane} className="lane-chip">
              {lane}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export default TruckShowcase;
