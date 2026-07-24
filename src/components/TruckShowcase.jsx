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
          <button type="button" onClick={onInquire} style={{ alignSelf: 'flex-start', background: 'var(--ink)', color: '#fff', border: 'none', padding: '0.85rem 1.5rem', borderRadius: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
            Inquire Delivery
          </button>
        )}
      </div>

      <div className="fleet-grid">
        {fleet.map((truck) => (
          <div key={truck.id} className="fleet-card">
            {truck.image && (
              <div className="fleet-card-image" style={{ margin: '-1.25rem -1.25rem 1rem', borderRadius: '16px 16px 0 0', overflow: 'hidden', height: '200px', background: 'var(--soft)' }}>
                <img src={truck.image} alt={truck.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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

      <div className="fleet-lanes" style={{ marginTop: '4rem', padding: '2rem', background: 'var(--soft-green)', borderRadius: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', color: 'var(--ink)' }}>
          <MapPin size={24} color="var(--green)" />
          <h3 style={{ margin: 0 }}>Common Service Lanes</h3>
        </div>
        <div className="lane-list" aria-label="Common service lanes" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
          {lanes.map((lane) => (
            <span key={lane} style={{ background: '#fff', padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid rgba(22, 163, 74, 0.2)', fontSize: '0.95rem', fontWeight: '500' }}>
              {lane}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export default TruckShowcase;
