"use client";

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { CheckCircle2, ImagePlus, LockKeyhole, Package, Send, Trash2, UserRound, Loader2, Camera } from 'lucide-react';
import CustomerInquiryList from './CustomerInquiryList.jsx';
import { CARGO_OPTIONS } from '../data/cargoOptions.js';
import { createInquiry, uploadCargoImages } from '../lib/inquiries/api.js';
import { calculateDistanceKm } from '../lib/inquiries/distance.js';
import { compressImageFile } from '../lib/inquiries/imageCompression.js';
import { createInquiryReference } from '../lib/inquiries/reference.js';
import { isProfileComplete } from '../lib/profile/api.js';
import AuthPanel from './AuthPanel.jsx';

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

function InquiryForm({ onInquirySubmit, submittedInquiry, session, setSession, profile, onViewMyInquiries }) {
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [pickup, setPickup] = useState(null);
  const [delivery, setDelivery] = useState(null);
  const [activeMarker, setActiveMarker] = useState('pickup');
  const [images, setImages] = useState([]);
  const [submitStatus, setSubmitStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const profileComplete = isProfileComplete(profile);
  const routeDistance = useMemo(() => calculateDistanceKm(pickup, delivery), [delivery, pickup]);

  const canProceedToStep2 = form.name.trim() !== '' && form.phone.trim() !== '';
  const canProceedToStep3 = form.pickupAddress.trim() !== '' && form.deliveryAddress.trim() !== '' && pickup && delivery;
  const canProceedToStep4 = form.cargoType !== '' && form.quantity !== '';

  const nextStep = () => setCurrentStep((prev) => Math.min(prev + 1, 4));
  const prevStep = () => setCurrentStep((prev) => Math.max(prev - 1, 1));

  const canSubmit = useMemo(
    () => Boolean(
      session?.access_token && 
      profileComplete && 
      form.name && 
      form.phone && 
      form.pickupAddress && 
      form.deliveryAddress && 
      pickup && 
      delivery && 
      images.length > 0 &&
      (!routeDistance || routeDistance >= 1) // Enforce minimum 1km distance
    ),
    [session?.access_token, profileComplete, form, pickup, delivery, images.length, routeDistance],
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

    if (routeDistance !== null && routeDistance < 1) {
      setSubmitStatus('The pickup and delivery locations are too close. Minimum route distance is 1 km.');
      return;
    }

    const reference = createInquiryReference();
    setSubmitStatus('Uploading cargo images and saving inquiry...');
    setIsSubmitting(true);

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
      setShowSuccessModal(true);
    } catch (submitError) {
      setSubmitStatus(submitError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="inquiry-section" id="inquiry">
      <div className="section-heading inquiry-heading">
        <p className="eyebrow">Create Inquiry</p>
        <h2>Tell AHV where to pick up and deliver.</h2>
        <p>
          Sign in, complete your profile, then submit pickup, delivery, cargo details, and photos. AHV admins will review the exact truck route after submission.
        </p>
        
        <div style={{ marginTop: '2rem' }}>
          <AuthPanel session={session} setSession={setSession} />
        </div>
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

      {/* Progress Indicator */}
      <div className="step-progress">
        <div className="step-indicator">
          <span className={currentStep >= 1 ? 'active' : ''}>1</span>
          <div className="step-line" />
          <span className={currentStep >= 2 ? 'active' : ''}>2</span>
          <div className="step-line" />
          <span className={currentStep >= 3 ? 'active' : ''}>3</span>
          <div className="step-line" />
          <span className={currentStep >= 4 ? 'active' : ''}>4</span>
        </div>
        <p className="step-label">
          {currentStep === 1 && 'Step 1: Contact details'}
          {currentStep === 2 && 'Step 2: Locations'}
          {currentStep === 3 && 'Step 3: Cargo details'}
          {currentStep === 4 && 'Step 4: Parcel images'}
        </p>
      </div>

      <form className="inquiry-form" onSubmit={handleSubmit}>
        {currentStep === 1 && (
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
                  minLength={4}
                  maxLength={100}
                  pattern=".*[a-zA-Z].*"
                  title="Full name must contain at least one letter and be at least 4 characters long."
                  required
                />
              </label>
              <label>
                Mobile number
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(event) => updateField('phone', event.target.value)}
                  placeholder="09XXXXXXXXX or +639XXXXXXXXX"
                  pattern="^(09|\+639)\d{9}$"
                  title="Please enter a valid Philippine mobile number (e.g., 09123456789 or +639123456789)"
                  required
                />
              </label>
            </div>
          </section>
        )}

        {currentStep === 2 && (
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
        )}

        {currentStep === 3 && (
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
        )}

        {currentStep === 4 && (
          <section className="form-step">
            <div className="step-title">
              <ImagePlus size={20} />
              <div>
                <span>Step 4</span>
                <h3>Parcel images <span style={{ color: '#ef4444', fontSize: '0.75rem', fontWeight: '600', marginLeft: '0.5rem', padding: '2px 6px', background: '#fee2e2', borderRadius: '4px' }}>Required</span></h3>
              </div>
            </div>

            <div className="upload-options" style={{ marginBottom: '1.5rem' }}>
              <p style={{ marginBottom: '0.75rem', color: 'var(--muted)', fontSize: '0.9rem' }}>
                At least one photo is required to help AHV estimate size and truck fit.
              </p>
              <div className="upload-buttons" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <label className="upload-zone" style={{ minHeight: '120px', padding: '1rem' }}>
                  <Camera size={24} />
                  <strong style={{ fontSize: '0.9rem' }}>Take Photo</strong>
                  <input type="file" accept="image/*" capture="environment" onChange={handleImageChange} />
                </label>
                <label className="upload-zone" style={{ minHeight: '120px', padding: '1rem' }}>
                  <ImagePlus size={24} />
                  <strong style={{ fontSize: '0.9rem' }}>Upload Image</strong>
                  <input type="file" accept="image/*" multiple onChange={handleImageChange} />
                </label>
              </div>
            </div>

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
        )}

        <div className="step-nav">
          {currentStep > 1 && (
            <button type="button" className="step-nav-button back" onClick={prevStep}>
              Back
            </button>
          )}
          {currentStep < 4 ? (
            <button 
              type="button" 
              className="step-nav-button next" 
              onClick={nextStep}
              disabled={
                (currentStep === 1 && !canProceedToStep2) ||
                (currentStep === 2 && !canProceedToStep3) ||
                (currentStep === 3 && !canProceedToStep4)
              }
              style={{ marginLeft: 'auto', padding: '0.85rem 2rem', fontSize: '1rem', borderRadius: '12px', background: 'var(--ink)', color: '#fff', border: 'none', fontWeight: 'bold' }}
            >
              Continue
            </button>
          ) : (
            <button type="submit" className="step-nav-button next submit-btn" disabled={!canSubmit || isSubmitting} style={{ marginLeft: 'auto', padding: '0.85rem 2.5rem', fontSize: '1.1rem', borderRadius: '12px', background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)', color: '#fff', boxShadow: '0 8px 20px -8px rgba(22,163,74,0.6)', border: 'none', display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: 'bold' }}>
              {isSubmitting ? (
                <>
                  <Loader2 className="spinner" size={20} />
                  Processing...
                </>
              ) : (
                <>
                  <Send size={20} />
                  Submit Inquiry
                </>
              )}
            </button>
          )}
        </div>

        {submitStatus && !showSuccessModal && (
          <div className="submit-status" style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--soft)', borderRadius: '8px', color: 'var(--muted)', fontWeight: '500', textAlign: 'center' }}>
            {submitStatus}
          </div>
        )}
      </form>

      {/* SUCCESS MODAL OVERLAY */}
      {showSuccessModal && (
        <div className="profile-modal-backdrop" style={{ zIndex: 9999 }}>
          <section className="profile-panel onboarding-modal" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
            <div style={{ background: 'var(--soft-green)', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', color: 'var(--green)' }}>
              <CheckCircle2 size={40} />
            </div>
            <h2 style={{ marginBottom: '1rem', fontSize: '1.8rem', color: 'var(--ink)' }}>Inquiry Submitted!</h2>
            <p style={{ color: 'var(--muted)', marginBottom: '2rem', lineHeight: 1.6, fontSize: '1.05rem' }}>
              Thank you for choosing AHV Trucking Services. Your inquiry has been securely sent to our backend system. Our dispatchers will review your exact route and cargo details shortly.
            </p>
            <button 
              type="button" 
              onClick={() => {
                setShowSuccessModal(false);
                if (onViewMyInquiries) onViewMyInquiries();
              }}
              style={{ background: 'var(--ink)', color: '#fff', border: 'none', padding: '1rem 2rem', borderRadius: '12px', fontSize: '1.1rem', fontWeight: 'bold', width: '100%', cursor: 'pointer', transition: 'opacity 0.2s' }}
              onMouseOver={(e) => e.target.style.opacity = '0.9'}
              onMouseOut={(e) => e.target.style.opacity = '1'}
            >
              Go to My Requests
            </button>
          </section>
        </div>
      )}

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
