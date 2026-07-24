"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { ImageOff, LocateFixed, MapPin, Navigation, RotateCcw, Search } from 'lucide-react';

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

function createEndpointLabel(label, tone) {
  return L.divIcon({
    className: `route-endpoint-label ${tone}`,
    html: `<span>${label}</span>`,
    iconSize: [94, 28],
    iconAnchor: [47, 40],
  });
}

function formatCoordinates(point) {
  if (!point) {
    return 'No marker selected';
  }

  return `${point.lat}, ${point.lng}`;
}

const INITIAL_SEARCH_STATE = {
  query: '',
  results: [],
  status: '',
};

function PhilippinesMapPicker({
  pickup,
  delivery,
  setPickup,
  setDelivery,
  activeMarker,
  setActiveMarker,
  routeDistance,
  setPickupAddress,
  setDeliveryAddress,
}) {
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const activeMarkerRef = useRef(activeMarker);
  const pickupMarkerRef = useRef(null);
  const deliveryMarkerRef = useRef(null);
  const pickupLabelRef = useRef(null);
  const deliveryLabelRef = useRef(null);
  const routeLayersRef = useRef([]);
  const [searchState, setSearchState] = useState({
    pickup: INITIAL_SEARCH_STATE,
    delivery: INITIAL_SEARCH_STATE,
  });
  const [placePreviews, setPlacePreviews] = useState({
    pickup: null,
    delivery: null,
  });
  const searchTimeoutRef = useRef({ pickup: null, delivery: null });

  const pickupIcon = useMemo(() => createMarkerIcon('#16a34a'), []);
  const deliveryIcon = useMemo(() => createMarkerIcon('#f97316'), []);

  useEffect(() => {
    activeMarkerRef.current = activeMarker;
  }, [activeMarker]);

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

    map.on('click', (event) => {
      const location = {
        lat: Number(event.latlng.lat.toFixed(6)),
        lng: Number(event.latlng.lng.toFixed(6)),
      };

      if (activeMarkerRef.current === 'pickup') {
        setPickup(location);
        return;
      }

      setDelivery(location);
    });

    mapRef.current = map;
    const resizeTimer = window.setTimeout(() => {
      if (mapRef.current === map && mapElementRef.current) {
        map.invalidateSize();
      }
    }, 100);

    return () => {
      window.clearTimeout(resizeTimer);
      map.remove();
      mapRef.current = null;
      pickupMarkerRef.current = null;
      deliveryMarkerRef.current = null;
      pickupLabelRef.current = null;
      deliveryLabelRef.current = null;
      routeLayersRef.current = [];
    };
  }, [setDelivery, setPickup]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    if (pickupMarkerRef.current) {
      pickupMarkerRef.current.remove();
      pickupMarkerRef.current = null;
    }

    if (pickupLabelRef.current) {
      pickupLabelRef.current.remove();
      pickupLabelRef.current = null;
    }

    if (pickup) {
      pickupMarkerRef.current = L.marker([pickup.lat, pickup.lng], { icon: pickupIcon })
        .bindPopup('Pickup location')
        .addTo(map);
      pickupLabelRef.current = L.marker([pickup.lat, pickup.lng], {
        icon: createEndpointLabel('PICKUP', 'pickup'),
        interactive: false,
      }).addTo(map);
      map.setView([pickup.lat, pickup.lng], Math.max(map.getZoom(), 9), { animate: true });
    }
  }, [pickup, pickupIcon]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    if (deliveryMarkerRef.current) {
      deliveryMarkerRef.current.remove();
      deliveryMarkerRef.current = null;
    }

    if (deliveryLabelRef.current) {
      deliveryLabelRef.current.remove();
      deliveryLabelRef.current = null;
    }

    if (delivery) {
      deliveryMarkerRef.current = L.marker([delivery.lat, delivery.lng], { icon: deliveryIcon })
        .bindPopup('Delivery location')
        .addTo(map);
      deliveryLabelRef.current = L.marker([delivery.lat, delivery.lng], {
        icon: createEndpointLabel('DELIVERY', 'delivery'),
        interactive: false,
      }).addTo(map);
      map.setView([delivery.lat, delivery.lng], Math.max(map.getZoom(), 9), { animate: true });
    }
  }, [delivery, deliveryIcon]);

  useEffect(() => {
    const map = mapRef.current;

    if (!map) {
      return;
    }

    routeLayersRef.current.forEach((layer) => layer.remove());
    routeLayersRef.current = [];

    if (pickup && delivery) {
      const routePoints = [
        [pickup.lat, pickup.lng],
        [delivery.lat, delivery.lng],
      ];
      const routeShadow = L.polyline(routePoints, {
        color: '#ffffff',
        weight: 10,
        opacity: 0.95,
      }).addTo(map);
      const routeMain = L.polyline(routePoints, {
        color: '#111827',
        weight: 5,
        opacity: 0.9,
      }).addTo(map);
      const routeDash = L.polyline(routePoints, {
        color: '#16a34a',
        weight: 3,
        opacity: 0.95,
        dashArray: '14 12',
      }).addTo(map);

      routeLayersRef.current = [routeShadow, routeMain, routeDash];
      map.fitBounds(L.latLngBounds(routePoints), {
        animate: true,
        padding: [42, 42],
        maxZoom: 9,
      });
    }
  }, [delivery, pickup]);

  const updateSearchState = (markerType, nextValue) => {
    setSearchState((current) => ({
      ...current,
      [markerType]: {
        ...current[markerType],
        ...nextValue,
      },
    }));
  };

  const searchPlaces = async (markerType, queryOverride) => {
    const query = (queryOverride !== undefined ? queryOverride : searchState[markerType].query).trim();

    if (!query) {
      updateSearchState(markerType, { results: [], status: 'Enter a place, pier, warehouse, city, or province.' });
      return;
    }

    updateSearchState(markerType, { status: 'Searching places...', results: [] });

    try {
      const response = await fetch(`/api/places/search?q=${encodeURIComponent(query)}`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Place search failed.');
      }

      updateSearchState(markerType, {
        results: payload.places || [],
        status: payload.places?.length ? '' : 'No Philippine places found. Try a more specific address.',
      });
    } catch (searchError) {
      updateSearchState(markerType, { status: searchError.message, results: [] });
    }
  };

  const handleQueryChange = (markerType, value) => {
    updateSearchState(markerType, { query: value });
    
    if (searchTimeoutRef.current[markerType]) {
      clearTimeout(searchTimeoutRef.current[markerType]);
    }
    
    if (value.trim()) {
      searchTimeoutRef.current[markerType] = setTimeout(() => {
        searchPlaces(markerType, value);
      }, 600);
    } else {
      updateSearchState(markerType, { results: [], status: 'Enter a place, pier, warehouse, city, or province.' });
    }
  };

  const loadPlacePhoto = async (markerType, place) => {
    setPlacePreviews((current) => ({
      ...current,
      [markerType]: {
        place,
        photo: null,
        status: 'Looking for nearby real photos...',
      },
    }));

    try {
      const params = new URLSearchParams({
        lat: String(place.lat),
        lng: String(place.lng),
      });

      if (place.photoName) {
        params.set('photoName', place.photoName);
      }

      const response = await fetch(`/api/places/photo?${params.toString()}`);
      const payload = await response.json();

      setPlacePreviews((current) => ({
        ...current,
        [markerType]: {
          place,
          photo: payload.photo || null,
          status: payload.photo ? '' : 'No public real photo found near this place.',
        },
      }));
    } catch {
      setPlacePreviews((current) => ({
        ...current,
        [markerType]: {
          place,
          photo: null,
          status: 'Could not load a public place photo.',
        },
      }));
    }
  };

  const selectPlace = (markerType, place) => {
    const point = { lat: place.lat, lng: place.lng };

    if (markerType === 'pickup') {
      setPickup(point);
      setPickupAddress(place.address);
    } else {
      setDelivery(point);
      setDeliveryAddress(place.address);
    }

    setActiveMarker(markerType === 'pickup' ? 'delivery' : 'pickup');
    updateSearchState(markerType, {
      query: place.name,
      results: [],
      status: '',
    });
    loadPlacePhoto(markerType, place);
  };

  const renderPlaceSearch = (markerType, label, placeholder) => {
    const state = searchState[markerType];
    const preview = placePreviews[markerType];

    return (
      <div className={`place-search-panel ${markerType}`}>
        <div className="place-search-form">
          <label>
            {label}
            <span>
              Search port, bodega, warehouse, city, pier, or exact address.
            </span>
          </label>
          <div className="place-search-row">
            <input
              value={state.query}
              onChange={(event) => handleQueryChange(markerType, event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  if (searchTimeoutRef.current[markerType]) {
                    clearTimeout(searchTimeoutRef.current[markerType]);
                  }
                  searchPlaces(markerType);
                }
              }}
              placeholder={placeholder}
            />
            <button type="button" aria-label={`Search ${label}`} onClick={() => searchPlaces(markerType)}>
              <Search size={18} />
            </button>
          </div>
        </div>

        {state.status && <p className="place-search-status">{state.status}</p>}

        {state.results.length > 0 && (
          <div className="place-results">
            {state.results.map((place) => (
              <button key={place.id} type="button" onClick={() => selectPlace(markerType, place)}>
                <strong>{place.name}</strong>
                <span>{place.address}</span>
              </button>
            ))}
          </div>
        )}

        {preview && (
          <div className="place-preview-card">
            {preview.photo ? (
              <a className="place-preview-image" href={preview.photo.sourceUrl} target="_blank" rel="noreferrer">
                <img src={preview.photo.imageUrl} alt={preview.photo.title} />
              </a>
            ) : (
              <div className="place-preview-empty">
                <ImageOff size={22} />
              </div>
            )}
            <div>
              <span>{markerType === 'pickup' ? 'Pickup preview' : 'Delivery preview'}</span>
              <strong>{preview.place.name}</strong>
              <small>{preview.status || `${preview.photo.title}${preview.photo.license ? ` - ${preview.photo.license}` : ''}`}</small>
              {preview.photo && (
                <em>
                  {preview.photo.source === 'google'
                    ? 'Real place image from Google Places.'
                    : 'Tap image to view the original source.'}
                </em>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="map-picker">
      <div className="map-instruction">
        <Navigation size={18} />
        <span>
          {activeMarker === 'pickup'
            ? 'Tap the map to set or update the pickup point.'
            : 'Tap the map to set or update the delivery destination.'}
        </span>
      </div>

      <div className="map-frame">
        <div
          ref={mapElementRef}
          aria-label="Philippine pickup and delivery map"
          className="philippines-map"
          role="application"
        />
      </div>

      <div className="map-toolbar">
        <button
          className={activeMarker === 'pickup' ? 'marker-mode active pickup' : 'marker-mode'}
          type="button"
          onClick={() => setActiveMarker('pickup')}
        >
          <LocateFixed size={17} />
          Pickup
        </button>
        <button
          className={activeMarker === 'delivery' ? 'marker-mode active delivery' : 'marker-mode'}
          type="button"
          onClick={() => setActiveMarker('delivery')}
        >
          <MapPin size={17} />
          Delivery
        </button>
        <button
          aria-label="Reset map markers"
          className="marker-reset"
          type="button"
          onClick={() => {
            setPickup(null);
            setDelivery(null);
            setActiveMarker('pickup');
          }}
        >
          <RotateCcw size={17} />
        </button>
      </div>

      <div className="place-search-grid">
        {renderPlaceSearch('pickup', 'Pickup place search', 'e.g. Manila International Container Port')}
        {renderPlaceSearch('delivery', 'Delivery place search', 'e.g. Davao warehouse, Cagayan de Oro pier')}
      </div>

      <div className="coordinate-grid">
        <div>
          <span>Pickup coordinates</span>
          <strong>{formatCoordinates(pickup)}</strong>
        </div>
        <div>
          <span>Delivery coordinates</span>
          <strong>{formatCoordinates(delivery)}</strong>
        </div>
      </div>

      <div className="route-estimate">
        <span>Client route marker summary</span>
        <strong>
          {routeDistance
            ? `${routeDistance.toLocaleString()} km direct marker distance`
            : 'Set both pickup and delivery markers'}
        </strong>
        <small>AHV admins will review the truck route, road access, port or ferry path, and schedule after submission.</small>
      </div>
    </div>
  );
}

export default PhilippinesMapPicker;
