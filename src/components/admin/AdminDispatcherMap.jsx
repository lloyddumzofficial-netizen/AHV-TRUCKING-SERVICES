"use client";

import { useEffect, useRef } from 'react';
import L from 'leaflet';

const PHILIPPINES_CENTER = [12.8797, 121.774];
const PHILIPPINES_BOUNDS = [
  [4.3, 114.0],
  [21.5, 127.4],
];

function createMarkerIcon(color) {
  return L.divIcon({
    className: 'route-marker',
    html: `<span style="background:${color}"></span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function AdminDispatcherMap({ inquiries = [] }) {
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef([]);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) {
      return undefined;
    }

    const map = L.map(mapElementRef.current, {
      center: PHILIPPINES_CENTER,
      zoom: 5,
      minZoom: 5,
      maxZoom: 12,
      maxBounds: PHILIPPINES_BOUNDS,
      scrollWheelZoom: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      layersRef.current = [];
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    layersRef.current.forEach((layer) => layer.remove());
    layersRef.current = [];

    const pickupIcon = createMarkerIcon('#16a34a'); // Green
    const deliveryIcon = createMarkerIcon('#f97316'); // Orange

    inquiries.forEach((inquiry) => {
      if (!inquiry.pickup_lat || !inquiry.pickup_lng || !inquiry.delivery_lat || !inquiry.delivery_lng) {
        return;
      }

      const pickupPoint = [inquiry.pickup_lat, inquiry.pickup_lng];
      const deliveryPoint = [inquiry.delivery_lat, inquiry.delivery_lng];

      const pickupMarker = L.marker(pickupPoint, { icon: pickupIcon })
        .bindPopup(`<b>Pickup: ${inquiry.reference}</b><br/>${inquiry.customer_name}`)
        .addTo(map);

      const deliveryMarker = L.marker(deliveryPoint, { icon: deliveryIcon })
        .bindPopup(`<b>Delivery: ${inquiry.reference}</b><br/>${inquiry.customer_name}`)
        .addTo(map);

      const routeLine = L.polyline([pickupPoint, deliveryPoint], {
        color: '#111827',
        weight: 3,
        opacity: 0.6,
        dashArray: '10 10',
      }).addTo(map);

      layersRef.current.push(pickupMarker, deliveryMarker, routeLine);
    });

    // Optionally fit bounds if there are inquiries
    if (inquiries.length > 0 && layersRef.current.length > 0) {
      const group = new L.featureGroup(layersRef.current);
      map.fitBounds(group.getBounds(), { padding: [40, 40], maxZoom: 8 });
    } else {
      map.setView(PHILIPPINES_CENTER, 5);
    }
  }, [inquiries]);

  return (
    <div className="admin-dispatcher-map">
      <div className="map-frame">
        <div
          ref={mapElementRef}
          aria-label="Admin Dispatcher Map"
          className="philippines-map"
          role="application"
        />
      </div>
    </div>
  );
}

export default AdminDispatcherMap;
