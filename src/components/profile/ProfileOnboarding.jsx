"use client";

import { useEffect, useMemo, useState } from 'react';
import { ImagePlus, Save, UserRound } from 'lucide-react';
import { isProfileComplete, saveProfile, uploadProfilePhoto } from '../../lib/profile/api.js';
import { getSupabaseBrowserClient } from '../../lib/supabase/client.js';

const INITIAL_PROFILE_FORM = {
  fullName: '',
  phone: '',
  location: '',
};

function ProfileOnboarding({ session, profile, setProfile, setSession }) {
  const [form, setForm] = useState(INITIAL_PROFILE_FORM);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [status, setStatus] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const completed = isProfileComplete(profile);

  const userId = session?.user?.id;
  const metadataName = session?.user?.user_metadata?.full_name;

  // Keyed on the user id, not the `session` object. `session` gets a new identity
  // on every onAuthStateChange event — including the hourly TOKEN_REFRESHED — and
  // this effect resets `form`, so a user halfway through typing their name and
  // phone had it silently wiped back to the persisted values.
  useEffect(() => {
    if (!userId) {
      setForm(INITIAL_PROFILE_FORM);
      setPhotoFile(null);
      setPhotoPreview('');
      return;
    }

    setStatus('');
    setForm({
      fullName: profile?.full_name || metadataName || '',
      phone: profile?.phone || '',
      location: profile?.location || '',
    });
    setPhotoPreview(profile?.profile_image_url || '');
  }, [userId, metadataName, profile?.full_name, profile?.phone, profile?.location, profile?.profile_image_url]);

  // URL.createObjectURL leaks until revoked.
  useEffect(() => {
    if (!photoPreview.startsWith('blob:')) return undefined;
    return () => URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  useEffect(() => {
    const shouldLockPage = Boolean(session && !completed);

    if (!shouldLockPage) {
      return undefined;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [completed, session]);

  const canSave = useMemo(
    () => Boolean(session?.access_token && form.fullName.trim() && form.phone.trim() && form.location.trim() && (photoFile || photoPreview)),
    [form.fullName, form.location, form.phone, photoFile, photoPreview, session],
  );

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    event.target.value = '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    // Without this guard a double tap uploads the photo twice.
    if (isSaving) return;

    setIsSaving(true);
    setStatus('Saving profile...');

    try {
      const supabase = getSupabaseBrowserClient();
      const refreshResult = supabase ? await supabase.auth.refreshSession() : null;
      const sessionResult = supabase && !refreshResult?.data?.session
        ? await supabase.auth.getSession()
        : null;
      const activeSession = refreshResult?.data?.session || sessionResult?.data?.session || session;
      const accessToken = activeSession?.access_token;
      const sessionError = refreshResult?.error || sessionResult?.error;

      if (sessionError || !accessToken) {
        throw new Error('Your login session expired. Please sign in again before saving your profile.');
      }

      setSession?.(activeSession);

      let uploadedPhoto = {
        key: profile?.profile_image_key || '',
        publicUrl: profile?.profile_image_url || '',
      };

      if (photoFile) {
        uploadedPhoto = await uploadProfilePhoto(accessToken, photoFile);
      }

      const savedProfile = await saveProfile(accessToken, {
        fullName: form.fullName,
        phone: form.phone,
        location: form.location,
        profileImageKey: uploadedPhoto.key,
        profileImageUrl: uploadedPhoto.publicUrl,
      });

      setProfile(savedProfile);
      setStatus('Profile completed. You can now submit inquiries.');
    } catch (saveError) {
      setStatus(saveError.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (!session) {
    return null;
  }

  if (profile === undefined) {
    return null;
  }

  if (completed) {
    return null;
  }

  return (
    <div className="profile-modal-backdrop">
      <section
        aria-labelledby="profile-onboarding-title"
        aria-modal="true"
        className="profile-panel onboarding-modal"
        id="profile"
        role="dialog"
      >
      <div className="profile-heading">
        <UserRound size={22} />
        <div>
          <span>Required onboarding</span>
          <h2 id="profile-onboarding-title">Complete your profile</h2>
          <p>Finish this first before using AHV trucking inquiry.</p>
        </div>
      </div>

      <form className="profile-form" onSubmit={handleSubmit}>
          <label className="profile-photo-upload">
            {photoPreview ? <img src={photoPreview} alt="Profile preview" /> : <ImagePlus size={30} />}
            <strong>{photoPreview ? 'Change profile photo' : 'Upload profile photo'}</strong>
            <span>Required for AHV admin verification.</span>
            <input type="file" accept="image/*" onChange={handlePhotoChange} required={!photoPreview} />
          </label>

          <label>
            Full name
            <input
              value={form.fullName}
              onChange={(event) => updateField('fullName', event.target.value)}
              placeholder="Your full name (e.g., Juan Dela Cruz)"
              minLength={4}
              maxLength={100}
              pattern=".*[a-zA-Z].*"
              title="Full name must contain at least one letter and be at least 4 characters long."
              required
            />
          </label>

          <label>
            Phone number
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

          <label>
            Location
            <input
              value={form.location}
              onChange={(event) => updateField('location', event.target.value)}
              placeholder="City / province"
              required
            />
          </label>

          <button className="profile-save-button" type="submit" disabled={!canSave || isSaving}>
            <Save size={17} />
            {isSaving ? 'Saving…' : 'Save Profile and Continue'}
          </button>
      </form>

      {status && <p className="profile-status">{status}</p>}
    </section>
    </div>
  );
}

export default ProfileOnboarding;
