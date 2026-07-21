import { CheckCircle2, Gauge, PackageOpen, Truck } from 'lucide-react';

function TruckShowcase({ truck, lanes }) {
  return (
    <section className="truck-section" id="truck">
      <div className="section-heading">
        <p className="eyebrow">Featured client truck</p>
        <h2>{truck.name} {truck.type}</h2>
        <p>
          The main service unit is presented as a green wingvan for cargo forwarding, bulk parcel movement, and business deliveries across Philippine islands.
        </p>
      </div>

      <div className="truck-showcase">
        <div className="truck-image-card">
          <span className="truck-color-tag">{truck.color}</span>
          <img src={truck.image} alt={`${truck.name} ${truck.type}`} />
        </div>

        <div className="truck-details">
          <div className="detail-card">
            <Truck size={22} />
            <span>Vehicle</span>
            <strong>{truck.name}</strong>
          </div>
          <div className="detail-card">
            <PackageOpen size={22} />
            <span>Body</span>
            <strong>{truck.type}</strong>
          </div>
          <div className="detail-card">
            <Gauge size={22} />
            <span>Use Case</span>
            <strong>Inter-island cargo forwarding</strong>
          </div>
        </div>
      </div>

      <div className="truck-highlights">
        {truck.highlights.map((item) => (
          <div key={item} className="highlight-item">
            <CheckCircle2 size={18} />
            <span>{item}</span>
          </div>
        ))}
      </div>

      <div className="lane-list" aria-label="Common service lanes">
        {lanes.map((lane) => (
          <span key={lane}>{lane}</span>
        ))}
      </div>
    </section>
  );
}

export default TruckShowcase;
