"use client";

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { AlertTriangle, CheckCircle2, ClipboardCopy, ImagePlus, LockKeyhole, MapPin, Package, Send, Trash2, UserRound, Loader2, Camera } from 'lucide-react';
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

const STEP_META = [
  { step: 1, label: 'Contact', icon: UserRound },
  { step: 2, label: 'Locations', icon: MapPin },
  { step: 3, label: 'Cargo', icon: Package },
  { step: 4, label: 'Photos', icon: Camera },
  { step: 5, label: 'Review', icon: CheckCircle2 },
];

function InquiryForm({ onInquirySubmit, submittedInquiry, session, setSession, profile, onViewMyInquiries, onTrackInquiry }) {
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [copiedReference, setCopiedReference] = useState(false);
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
  const distanceTooClose = routeDistance !== null && routeDistance < 1;

  // Pre-fill contact from profile when user signs in
  useEffect(() => {
    if (profile?.full_name || profile?.phone) {
      setForm((prev) => ({
        ...prev,
        name: prev.name || profile.full_name || '',
        phone: prev.phone || profile.phone || '',
      }));
    }
  }, [profile?.full_name, profile?.phone]);

  const canProceedToStep2 = form.name.trim() !== '' && form.phone.trim() !== '';
  const canProceedToStep3 = form.pickupAddress.trim() !== '' && form.deliveryAddress.trim() !== '' && pickup && delivery && !distanceTooClose;
  const canProceedToStep4 = form.cargoType !== '' && form.quantity !== '';

  const nextStep = () => {
    setCurrentStep((prev) => Math.min(prev + 1, 5));
    setTimeout(() => {
      document.getElementById('inquiry')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };
  
  const prevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
    setTimeout(() => {
      document.getElementById('inquiry')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

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

  const copySubmittedReference = async () => {
    if (!submittedInquiry?.reference) return;
    try {
      await navigator.clipboard.writeText(submittedInquiry.reference);
      setCopiedReference(true);
      window.setTimeout(() => setCopiedReference(false), 1800);
    } catch {
      setSubmitStatus('Unable to copy reference. Please copy it manually.');
    }
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
        <div className="step-indicator-v2">
          {STEP_META.map(({ step, label, icon: Icon }, idx) => (
            <div key={step} className={`step-pip ${currentStep >= step ? 'active' : ''} ${currentStep === step ? 'current' : ''}`}>
              {idx > 0 && (
                <div className="step-connector">
                  <div className="step-connector-fill" style={{ width: currentStep > step - 1 ? '100%' : '0%' }} />
                </div>
              )}
              <div className="step-pip-circle">
                <Icon size={14} />
                {step === 4 && images.length > 0 && (
                  <span className="step-pip-badge">{images.length}</span>
                )}
              </div>
              <span className="step-pip-label">{label}</span>
            </div>
          ))}
        </div>
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

            {distanceTooClose && pickup && delivery && (
              <div className="distance-warning">
                <AlertTriangle size={16} />
                <span>Pickup and delivery are too close (min. 1 km). Please set locations further apart.</span>
              </div>
            )}

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

            {(form.pickupAddress || form.deliveryAddress) && (
              <div className="address-confirm-grid">
                {form.pickupAddress && (
                  <div className="address-confirm-item pickup">
                    <span>Pickup</span>
                    <strong>{form.pickupAddress}</strong>
                  </div>
                )}
                {form.deliveryAddress && (
                  <div className="address-confirm-item delivery">
                    <span>Delivery</span>
                    <strong>{form.deliveryAddress}</strong>
                  </div>
                )}
              </div>
            )}
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

        {currentStep === 5 && (
          <section className="form-step">
            <div className="step-title">
              <CheckCircle2 size={20} />
              <div>
                <span>Step 5</span>
                <h3>Review your inquiry</h3>
              </div>
            </div>

            <div style={{ background: 'var(--soft)', padding: '1.5rem', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div>
                <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '0.25rem' }}>Contact</h4>
                <p style={{ margin: 0, fontWeight: 600 }}>{form.name} • {form.phone}</p>
              </div>
              
              <div>
                <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '0.25rem' }}>Route</h4>
                <p style={{ margin: 0, fontWeight: 600 }}>From: {form.pickupAddress}</p>
                <p style={{ margin: '0.25rem 0 0', fontWeight: 600 }}>To: {form.deliveryAddress}</p>
                <p style={{ margin: '0.25rem 0 0', color: 'var(--green)', fontSize: '0.85rem', fontWeight: 700 }}>Est. distance: {routeDistance ? `${routeDistance.toLocaleString()} km` : 'Calculating...'}</p>
              </div>

              <div>
                <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '0.25rem' }}>Cargo</h4>
                <p style={{ margin: 0, fontWeight: 600 }}>{form.quantity}x {form.cargoType} {form.weight ? `(${form.weight} kg)` : ''}</p>
                {form.notes && <p style={{ margin: '0.25rem 0 0', fontStyle: 'italic', fontSize: '0.9rem' }}>"{form.notes}"</p>}
              </div>

              <div>
                <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: '0.5rem' }}>Attached Photos</h4>
                <p style={{ margin: '0 0 0.75rem', fontWeight: 600 }}>{images.length} {images.length === 1 ? 'photo' : 'photos'} attached</p>
                {images.length > 0 && (
                  <div className="review-images-grid">
                    {images.map((image) => (
                      <div key={image.id} className="review-image-thumb">
                        <img src={image.url} alt={image.name} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        <div className="step-nav">
          {currentStep > 1 && (
            <button type="button" className="step-nav-button back" onClick={prevStep}>
              Back
            </button>
          )}
          {currentStep < 5 ? (
            <button 
              type="button" 
              className="step-nav-button next" 
              onClick={nextStep}
              disabled={
                (currentStep === 1 && !canProceedToStep2) ||
                (currentStep === 2 && (!canProceedToStep3 || distanceTooClose)) ||
                (currentStep === 3 && !canProceedToStep4) ||
                (currentStep === 4 && images.length === 0)
              }
              style={{ marginLeft: 'auto', padding: '0.85rem 2rem', fontSize: '1rem', borderRadius: '12px', background: 'var(--ink)', color: '#fff', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
            >
              Continue
            </button>
          ) : (
            <button type="submit" className="step-nav-button next submit-btn" disabled={!canSubmit || isSubmitting} style={{ marginLeft: 'auto', padding: '0.85rem 2.5rem', fontSize: '1.1rem', borderRadius: '12px', background: 'linear-gradient(135deg, #16a34a 0%, #15803d 100%)', color: '#fff', boxShadow: '0 8px 20px -8px rgba(22,163,74,0.6)', border: 'none', display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}>
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
        <div className="profile-modal-backdrop success-modal-backdrop">
          <section className="profile-panel onboarding-modal success-modal-card" role="dialog" aria-modal="true" aria-labelledby="inquiry-success-title">
            <div className="success-modal-icon">
              <CheckCircle2 size={40} />
            </div>
            <p className="success-modal-eyebrow">Saved to AHV dispatch</p>
            <h2 id="inquiry-success-title">Inquiry submitted</h2>
            <p>
              Your request is now in the AHV operations queue. Keep this reference so you can track quote, pickup, and delivery updates.
            </p>

            <div className="success-reference-card">
              <span>Tracking reference</span>
              <strong>{submittedInquiry?.reference || 'Generating...'}</strong>
              <button type="button" onClick={copySubmittedReference} disabled={!submittedInquiry?.reference}>
                <ClipboardCopy size={16} />
                {copiedReference ? 'Copied' : 'Copy'}
              </button>
            </div>

            <div className="success-modal-actions">
              <button
                type="button"
                className="success-primary-action"
                onClick={() => {
                  setShowSuccessModal(false);
                  onTrackInquiry?.(submittedInquiry?.reference);
                }}
                disabled={!submittedInquiry?.reference || !onTrackInquiry}
              >
                Track this inquiry
              </button>
              <button 
                type="button" 
                className="success-secondary-action"
                onClick={() => {
                  setShowSuccessModal(false);
                  onViewMyInquiries?.();
                }}
              >
                Go to My Requests
              </button>
            </div>
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
