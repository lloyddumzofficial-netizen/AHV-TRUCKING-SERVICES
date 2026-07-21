"use client";

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { CheckCircle2, ImagePlus, LockKeyhole, Package, Send, Trash2, UserRound } from 'lucide-react';
import CustomerInquiryList from './CustomerInquiryList.jsx';
import { CARGO_OPTIONS } from '../data/cargoOptions.js';
import { createInquiry, uploadCargoImages } from '../lib/inquiries/api.js';
import { calculateDistanceKm } from '../lib/inquiries/distance.js';
import { compressImageFile } from '../lib/inquiries/imageCompression.js';
import { createInquiryReference } from '../lib/inquiries/reference.js';
import { isProfileComplete } from '../lib/profile/api.js';

const PhilippinesMapPicker = dynamic(() => import('./PhilippinesMapPicker.jsx'), {
  ssr: false,
  loading: () => <div className="map-loading">Loading Philippine map...</div>,
});

const INITIAL_FORM = {
  name: '',
  phone: '',
  pickupAddress: '',
  deliveryAddress: '',
  cargoType: CARGO_OPTIONS[0],
  weight: '',
  quantity: '1',
  notes: '',
};

function InquiryForm({ onInquirySubmit, submittedInquiry, session, profile }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [pickup, setPickup] = useState(null);
  const [delivery, setDelivery] = useState(null);
  const [activeMarker, setActiveMarker] = useState('pickup');
  const [images, setImages] = useState([]);
  const [submitStatus, setSubmitStatus] = useState('');
  const profileComplete = isProfileComplete(profile);
  const routeDistance = useMemo(() => calculateDistanceKm(pickup, delivery), [delivery, pickup]);

  const canSubmit = useMemo(
    () => Boolean(session?.access_token && profileComplete && form.name && form.phone && form.pickupAddress && form.deliveryAddress && pickup && delivery),
    [delivery, form.deliveryAddress, form.name, form.phone, form.pickupAddress, pickup, profileComplete, session],
  );

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleImageChange = async (event) => {
    const files = Array.from(event.target.files || []);
    setSubmitStatus(files.length > 0 ? 'Preparing image previews...' : '');

    const nextImages = await Promise.all(files.map(async (file) => {
      try {
        const compressedFile = await compressImageFile(file);
        return {
          id: `${compressedFile.name}-${compressedFile.lastModified}-${crypto.randomUUID()}`,
          name: compressedFile.name,
          originalName: file.name,
          file: compressedFile,
          url: URL.createObjectURL(compressedFile),
        };
      } catch {
        return {
          id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
          name: file.name,
          file,
          url: URL.createObjectURL(file),
        };
      }
    }));

    setImages((current) => [...current, ...nextImages]);
    setSubmitStatus('');
    event.target.value = '';
  };

  const removeImage = (id) => {
    setImages((current) => {
      const imageToRemove = current.find((image) => image.id === id);
      if (imageToRemove) {
        URL.revokeObjectURL(imageToRemove.url);
      }
      return current.filter((image) => image.id !== id);
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!session?.access_token) {
      setSubmitStatus('Please sign in before submitting a trucking inquiry.');
      return;
    }

    if (!profileComplete) {
      setSubmitStatus('Complete your profile before submitting a trucking inquiry.');
      return;
    }

    const reference = createInquiryReference();
    setSubmitStatus('Uploading cargo images and saving inquiry...');

    try {
      const uploadedImages = await uploadCargoImages(session.access_token, reference, images);
      const inquiry = {
        ...form,
        pickup,
        delivery,
        reference,
        routeDistance,
        images: uploadedImages,
        submittedAt: new Date().toLocaleString(),
      };

      await createInquiry(session.access_token, inquiry);
      onInquirySubmit(inquiry);
      setSubmitStatus('Inquiry saved to the live backend.');
      document.getElementById('inquiry-summary')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (submitError) {
      setSubmitStatus(submitError.message);
    }
  };

  return (
    <section className="inquiry-section" id="inquiry">
      <div className="section-heading inquiry-heading">
        <p className="eyebrow">Inquiry flow</p>
        <h2>Mark the pickup and delivery point.</h2>
        <p>
          Search or tap the Philippine map for the product location and delivery destination. AHV admins will review the exact truck route after submission.
        </p>
      </div>

      {!session && (
        <div className="backend-required">
          <LockKeyhole size={18} />
          <span>Sign in above to submit a trucking inquiry to the live backend.</span>
        </div>
      )}

      {session && !profileComplete && (
        <div className="backend-required">
          <LockKeyhole size={18} />
          <span>Complete the required profile onboarding before submitting a trucking inquiry.</span>
        </div>
      )}

      <form className="inquiry-form" onSubmit={handleSubmit}>
        <section className="form-step">
          <div className="step-title">
            <UserRound size={20} />
            <div>
              <span>Step 1</span>
              <h3>Contact details</h3>
            </div>
          </div>

          <div className="field-grid">
            <label>
              Full name
              <input
                value={form.name}
                onChange={(event) => updateField('name', event.target.value)}
                placeholder="Full name or business contact"
                required
              />
            </label>
            <label>
              Mobile number
              <input
                type="tel"
                value={form.phone}
                onChange={(event) => updateField('phone', event.target.value)}
                placeholder="Mobile or operations contact number"
                required
              />
            </label>
          </div>
        </section>

        <section className="form-step">
          <div className="step-title">
            <Package size={20} />
            <div>
              <span>Step 2</span>
              <h3>Pickup and delivery locations</h3>
            </div>
          </div>

          <PhilippinesMapPicker
            pickup={pickup}
            delivery={delivery}
            setPickup={setPickup}
            setDelivery={setDelivery}
            activeMarker={activeMarker}
            setActiveMarker={setActiveMarker}
            routeDistance={routeDistance}
            setPickupAddress={(address) => updateField('pickupAddress', address)}
            setDeliveryAddress={(address) => updateField('deliveryAddress', address)}
          />

          <div className="field-grid">
            <label>
              Pickup address
              <input
                value={form.pickupAddress}
                onChange={(event) => updateField('pickupAddress', event.target.value)}
                placeholder="Pickup address or port/warehouse"
                required
              />
            </label>
            <label>
              Delivery address
              <input
                value={form.deliveryAddress}
                onChange={(event) => updateField('deliveryAddress', event.target.value)}
                placeholder="Delivery address or destination hub"
                required
              />
            </label>
          </div>
        </section>

        <section className="form-step">
          <div className="step-title">
            <Package size={20} />
            <div>
              <span>Step 3</span>
              <h3>Cargo details</h3>
            </div>
          </div>

          <div className="field-grid">
            <label>
              Cargo type
              <select value={form.cargoType} onChange={(event) => updateField('cargoType', event.target.value)}>
                {CARGO_OPTIONS.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
            <label>
              Estimated weight, kg
              <input
                type="number"
                min="1"
                value={form.weight}
                onChange={(event) => updateField('weight', event.target.value)}
                placeholder="Estimated cargo weight"
              />
            </label>
            <label>
              Quantity
              <input
                type="number"
                min="1"
                value={form.quantity}
                onChange={(event) => updateField('quantity', event.target.value)}
              />
            </label>
          </div>

          <label className="full-field">
            Notes and handling instructions
            <textarea
              value={form.notes}
              onChange={(event) => updateField('notes', event.target.value)}
              placeholder="Cargo dimensions, fragile items, warehouse schedule, or port pickup details"
              rows="4"
            />
          </label>
        </section>

        <section className="form-step">
          <div className="step-title">
            <ImagePlus size={20} />
            <div>
              <span>Step 4</span>
              <h3>Parcel images</h3>
            </div>
          </div>

          <label className="upload-zone">
            <ImagePlus size={28} />
            <strong>Upload parcel or cargo photos</strong>
            <span>Photos help AHV estimate size and truck fit.</span>
            <input type="file" accept="image/*" multiple onChange={handleImageChange} />
          </label>

          {images.length > 0 && (
            <div className="image-preview-grid">
              {images.map((image) => (
                <div className="image-preview" key={image.id}>
                  <img src={image.url} alt={image.name} />
                  <button type="button" onClick={() => removeImage(image.id)} aria-label={`Remove ${image.name}`}>
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <button className="submit-button" disabled={!canSubmit} type="submit">
          <Send size={18} />
          Save Inquiry to Backend
        </button>
        {submitStatus && <p className="submit-status">{submitStatus}</p>}
      </form>

      {submittedInquiry && (
        <section className="inquiry-summary" id="inquiry-summary">
          <div className="summary-title">
            <CheckCircle2 size={22} />
            <div>
              <span>{submittedInquiry.reference}</span>
              <h3>Inquiry summary</h3>
            </div>
          </div>

          <div className="status-strip">
            <span>Saved live</span>
            <span>Needs dispatcher review</span>
            <span>Truck fit: Isuzu Giga Wingvan</span>
          </div>

          <div className="summary-grid">
            <p><strong>Name:</strong> {submittedInquiry.name}</p>
            <p><strong>Phone:</strong> {submittedInquiry.phone}</p>
            <p><strong>Pickup:</strong> {submittedInquiry.pickupAddress}</p>
            <p><strong>Delivery:</strong> {submittedInquiry.deliveryAddress}</p>
            <p><strong>Cargo:</strong> {submittedInquiry.cargoType}</p>
            <p><strong>Weight:</strong> {submittedInquiry.weight || 'Not specified'} kg</p>
            <p><strong>Quantity:</strong> {submittedInquiry.quantity}</p>
            <p><strong>Distance:</strong> {submittedInquiry.routeDistance?.toLocaleString() || 'Not estimated'} km</p>
            <p><strong>Submitted:</strong> {submittedInquiry.submittedAt}</p>
          </div>

          <div className="summary-route">
            <span>Pickup marker: {submittedInquiry.pickup.lat}, {submittedInquiry.pickup.lng}</span>
            <span>Delivery marker: {submittedInquiry.delivery.lat}, {submittedInquiry.delivery.lng}</span>
                  <span>Ops note: AHV admins will confirm exact road, port, ferry, and receiving schedule before final quote.</span>
          </div>

          {submittedInquiry.notes && <p className="summary-notes">{submittedInquiry.notes}</p>}

          {submittedInquiry.images.length > 0 && (
            <div className="summary-images">
              {submittedInquiry.images.map((image) => (
                <img key={image.url} src={image.url} alt={image.name} />
              ))}
            </div>
          )}
        </section>
      )}

      <CustomerInquiryList session={session} limit={3} compact />
    </section>
  );
}

export default InquiryForm;
