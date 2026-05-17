'use client';

import { useState, useEffect, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import AppLayout from '@/components/layout/AppLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import styles from './page.module.css';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;

type Day = typeof DAYS[number];

interface AvailabilityDay {
  start: string;
  end: string;
  isAvailable: boolean;
}

interface ProfileData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  gender?: string;
  dateOfBirth?: string;
  profileImage?: string;
  counsellorProfile?: {
    specialization?: string;
    specializations?: string[];
    yearsOfExperience?: number;
    hourlyRate?: number;
    currency?: string;
    bio?: string;
    languages?: string[];
    licenseNumber?: string;
    availability?: Record<Day, AvailabilityDay>;
  };
}

// ── TagInput ─────────────────────────────────────────────────────────────────
function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [input, setInput] = useState('');

  const addTag = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput('');
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <div className={styles.tagInput}>
      {tags.map((tag) => (
        <span key={tag} className={styles.tag}>
          {tag}
          <button type="button" className={styles.tagRemove} onClick={() => removeTag(tag)}>×</button>
        </span>
      ))}
      <input
        className={styles.tagTextInput}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => addTag(input)}
        placeholder="Type and press Enter…"
      />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();

  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Personal edit state
  const [editingPersonal, setEditingPersonal] = useState(false);
  const [personalForm, setPersonalForm] = useState({ firstName: '', lastName: '', gender: '', dateOfBirth: '' });
  const [savingPersonal, setSavingPersonal] = useState(false);

  // Professional edit state
  const [editingProfessional, setEditingProfessional] = useState(false);
  const [profForm, setProfForm] = useState({
    specialization: '',
    experience: 0,
    hourlyRate: 0,
    bio: '',
    licenseNumber: '',
    languages: [] as string[],
    availability: {} as Record<Day, AvailabilityDay>,
  });
  const [savingProf, setSavingProf] = useState(false);

  // Password state
  const [editingPassword, setEditingPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push('/login');
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (isAuthenticated) fetchProfile();
  }, [isAuthenticated]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const response = await api.getCurrentUser();
      if (response.success && response.data) {
        setProfileData(response.data.user as ProfileData);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  // ── Personal edit ──────────────────────────────────────────────────────────
  const startEditPersonal = () => {
    const p = profileData;
    setPersonalForm({
      firstName: p?.firstName ?? '',
      lastName: p?.lastName ?? '',
      gender: p?.gender ?? '',
      dateOfBirth: p?.dateOfBirth ? p.dateOfBirth.slice(0, 10) : '',
    });
    setEditingPersonal(true);
  };

  const savePersonal = async () => {
    setSavingPersonal(true);
    setError(null);
    const res = await api.updateUserProfile({
      firstName: personalForm.firstName,
      lastName: personalForm.lastName,
      gender: personalForm.gender || undefined,
      dateOfBirth: personalForm.dateOfBirth || undefined,
    });
    setSavingPersonal(false);
    if (res.success) {
      await fetchProfile();
      setEditingPersonal(false);
      showSuccess('Personal info updated.');
    } else {
      setError(res.message || 'Update failed');
    }
  };

  // ── Professional edit ──────────────────────────────────────────────────────
  const startEditProfessional = () => {
    const cp = profileData?.counsellorProfile;
    const defaultDay: AvailabilityDay = { start: '09:00', end: '17:00', isAvailable: false };
    const avail: Record<Day, AvailabilityDay> = {} as Record<Day, AvailabilityDay>;
    DAYS.forEach((d) => {
      avail[d] = cp?.availability?.[d]
        ? { ...(cp.availability as Record<Day, AvailabilityDay>)[d] }
        : { ...defaultDay, isAvailable: d !== 'saturday' && d !== 'sunday' };
    });
    setProfForm({
      specialization: cp?.specialization ?? '',
      experience: cp?.yearsOfExperience ?? 0,
      hourlyRate: cp?.hourlyRate ?? 0,
      bio: cp?.bio ?? '',
      licenseNumber: cp?.licenseNumber ?? '',
      languages: cp?.languages ? [...cp.languages] : [],
      availability: avail,
    });
    setEditingProfessional(true);
  };

  const saveProfessional = async () => {
    setSavingProf(true);
    setError(null);
    const res = await api.updateCounsellorProfile({
      specialization: profForm.specialization,
      experience: profForm.experience,
      hourlyRate: profForm.hourlyRate,
      bio: profForm.bio,
      licenseNumber: profForm.licenseNumber,
      languages: profForm.languages,
      availability: profForm.availability,
    });
    setSavingProf(false);
    if (res.success) {
      await fetchProfile();
      setEditingProfessional(false);
      showSuccess('Professional info updated.');
    } else {
      setError(res.message || 'Update failed');
    }
  };

  const updateDay = (day: Day, field: keyof AvailabilityDay, value: string | boolean) => {
    setProfForm((prev) => ({
      ...prev,
      availability: {
        ...prev.availability,
        [day]: { ...prev.availability[day], [field]: value },
      },
    }));
  };

  // ── Password ───────────────────────────────────────────────────────────────
  const savePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }
    setSavingPassword(true);
    setError(null);
    const res = await api.changePassword({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    });
    setSavingPassword(false);
    if (res.success) {
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setEditingPassword(false);
      showSuccess('Password changed successfully.');
    } else {
      setError(res.message || 'Password change failed');
    }
  };

  if (isLoading || loading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.spinner} />
        <p>Loading profile…</p>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const profile = profileData || (user as ProfileData | null);
  const cp = profile?.counsellorProfile;

  return (
    <AppLayout>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>My Profile</h1>
          <p className={styles.pageSubtitle}>Manage your professional information</p>
        </div>
      </div>

      {error && (
        <div className={styles.errorAlert}>
          <svg fill="currentColor" viewBox="0 0 20 20" width="18" height="18">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      {successMsg && (
        <div className={styles.successAlert}>
          <svg fill="currentColor" viewBox="0 0 20 20" width="18" height="18">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          {successMsg}
        </div>
      )}

      <div className={styles.profileLayout}>
        {/* Avatar Card */}
        <div className={styles.avatarSection}>
          <Card padding="lg" className={styles.avatarCard}>
            <div className={styles.avatarBox}>
              {profile?.profileImage ? (
                <img src={profile.profileImage} alt="Profile" className={styles.avatarImg} />
              ) : (
                <div className={styles.avatarPlaceholder}>
                  <span className={styles.avatarInitials}>
                    {(profile?.firstName?.charAt(0) || 'C').toUpperCase()}
                    {(profile?.lastName?.charAt(0) || '').toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            <div className={styles.avatarInfo}>
              <h2 className={styles.avatarName}>{profile?.firstName} {profile?.lastName}</h2>
              <p className={styles.avatarEmail}>{profile?.email}</p>
              <Badge variant="success" size="sm">Active Counsellor</Badge>
            </div>
          </Card>
        </div>

        {/* Info Cards */}
        <div className={styles.infoSection}>

          {/* ── Personal Information ── */}
          <Card padding="lg" className={styles.infoCard}>
            <div className={styles.cardHeaderRow}>
              <div className={styles.cardHeaderLeft}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className={styles.cardIcon}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <h3 className={styles.cardTitle}>Personal Information</h3>
              </div>
              {!editingPersonal && (
                <button className={styles.editBtn} onClick={startEditPersonal}>Edit</button>
              )}
            </div>

            {editingPersonal ? (
              <>
                <div className={styles.infoGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.infoLabel}>First Name</label>
                    <input
                      className={styles.formInput}
                      value={personalForm.firstName}
                      onChange={(e) => setPersonalForm((p) => ({ ...p, firstName: e.target.value }))}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.infoLabel}>Last Name</label>
                    <input
                      className={styles.formInput}
                      value={personalForm.lastName}
                      onChange={(e) => setPersonalForm((p) => ({ ...p, lastName: e.target.value }))}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.infoLabel}>Gender</label>
                    <select
                      className={`${styles.formInput} ${styles.formSelect}`}
                      value={personalForm.gender}
                      onChange={(e) => setPersonalForm((p) => ({ ...p, gender: e.target.value }))}
                    >
                      <option value="">Select gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                      <option value="prefer-not-to-say">Prefer not to say</option>
                    </select>
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.infoLabel}>Date of Birth</label>
                    <input
                      type="date"
                      className={styles.formInput}
                      value={personalForm.dateOfBirth}
                      onChange={(e) => setPersonalForm((p) => ({ ...p, dateOfBirth: e.target.value }))}
                    />
                  </div>
                </div>
                <div className={styles.formActions}>
                  <Button variant="primary" size="sm" onClick={savePersonal} disabled={savingPersonal}>
                    {savingPersonal ? 'Saving…' : 'Save'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditingPersonal(false)} disabled={savingPersonal}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <div className={styles.infoGrid}>
                <div className={styles.infoItem}>
                  <p className={styles.infoLabel}>First Name</p>
                  <p className={styles.infoValue}>{profile?.firstName || '—'}</p>
                </div>
                <div className={styles.infoItem}>
                  <p className={styles.infoLabel}>Last Name</p>
                  <p className={styles.infoValue}>{profile?.lastName || '—'}</p>
                </div>
                <div className={styles.infoItem}>
                  <p className={styles.infoLabel}>Email</p>
                  <p className={styles.infoValue}>{profile?.email || '—'}</p>
                </div>
                <div className={styles.infoItem}>
                  <p className={styles.infoLabel}>Phone</p>
                  <p className={styles.infoValue}>{profile?.phone || '—'}</p>
                </div>
                {profile?.gender && (
                  <div className={styles.infoItem}>
                    <p className={styles.infoLabel}>Gender</p>
                    <p className={styles.infoValue} style={{ textTransform: 'capitalize' }}>{profile.gender}</p>
                  </div>
                )}
                {profile?.dateOfBirth && (
                  <div className={styles.infoItem}>
                    <p className={styles.infoLabel}>Date of Birth</p>
                    <p className={styles.infoValue}>{new Date(profile.dateOfBirth).toLocaleDateString()}</p>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* ── Professional Information ── */}
          <Card padding="lg" className={styles.infoCard}>
            <div className={styles.cardHeaderRow}>
              <div className={styles.cardHeaderLeft}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className={styles.cardIcon}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <h3 className={styles.cardTitle}>Professional Information</h3>
              </div>
              {!editingProfessional && (
                <button className={styles.editBtn} onClick={startEditProfessional}>Edit</button>
              )}
            </div>

            {editingProfessional ? (
              <>
                <div className={styles.infoGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.infoLabel}>Specialization</label>
                    <input
                      className={styles.formInput}
                      value={profForm.specialization}
                      onChange={(e) => setProfForm((p) => ({ ...p, specialization: e.target.value }))}
                      placeholder="e.g. Anxiety, Depression"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.infoLabel}>Years of Experience</label>
                    <input
                      type="number"
                      min={0}
                      className={styles.formInput}
                      value={profForm.experience}
                      onChange={(e) => setProfForm((p) => ({ ...p, experience: Number(e.target.value) }))}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.infoLabel}>Hourly Rate (INR)</label>
                    <input
                      type="number"
                      min={0}
                      className={styles.formInput}
                      value={profForm.hourlyRate}
                      onChange={(e) => setProfForm((p) => ({ ...p, hourlyRate: Number(e.target.value) }))}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.infoLabel}>License Number</label>
                    <input
                      className={styles.formInput}
                      value={profForm.licenseNumber}
                      onChange={(e) => setProfForm((p) => ({ ...p, licenseNumber: e.target.value }))}
                    />
                  </div>
                </div>

                <div className={styles.formGroup} style={{ marginTop: 'var(--spacing-lg)' }}>
                  <label className={styles.infoLabel}>Languages</label>
                  <TagInput
                    tags={profForm.languages}
                    onChange={(tags) => setProfForm((p) => ({ ...p, languages: tags }))}
                  />
                  <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: 4 }}>
                    Type a language and press Enter to add
                  </p>
                </div>

                <div className={styles.formGroup} style={{ marginTop: 'var(--spacing-lg)' }}>
                  <label className={styles.infoLabel}>Bio</label>
                  <textarea
                    className={`${styles.formInput} ${styles.formTextarea}`}
                    value={profForm.bio}
                    onChange={(e) => setProfForm((p) => ({ ...p, bio: e.target.value }))}
                    maxLength={1000}
                    placeholder="Tell users about your background, approach, and what to expect from sessions…"
                  />
                  <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: 4 }}>
                    {profForm.bio.length}/1000 characters
                  </p>
                </div>

                <div style={{ marginTop: 'var(--spacing-lg)' }}>
                  <p className={styles.infoLabel} style={{ marginBottom: 'var(--spacing-sm)' }}>Weekly Availability</p>
                  {DAYS.map((day) => (
                    <div key={day} className={styles.dayRow}>
                      <span className={styles.dayLabel}>{day.charAt(0).toUpperCase() + day.slice(1)}</span>
                      <label className={styles.dayToggle}>
                        <input
                          type="checkbox"
                          checked={profForm.availability[day]?.isAvailable ?? false}
                          onChange={(e) => updateDay(day, 'isAvailable', e.target.checked)}
                        />
                        Available
                      </label>
                      {profForm.availability[day]?.isAvailable && (
                        <div className={styles.timeInputs}>
                          <input
                            type="time"
                            className={styles.timeInput}
                            value={profForm.availability[day]?.start ?? '09:00'}
                            onChange={(e) => updateDay(day, 'start', e.target.value)}
                          />
                          <span>to</span>
                          <input
                            type="time"
                            className={styles.timeInput}
                            value={profForm.availability[day]?.end ?? '17:00'}
                            onChange={(e) => updateDay(day, 'end', e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className={styles.formActions}>
                  <Button variant="primary" size="sm" onClick={saveProfessional} disabled={savingProf}>
                    {savingProf ? 'Saving…' : 'Save'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditingProfessional(false)} disabled={savingProf}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className={styles.infoGrid}>
                  {cp?.specialization && (
                    <div className={styles.infoItem}>
                      <p className={styles.infoLabel}>Specialization</p>
                      <p className={styles.infoValue}>{cp.specialization}</p>
                    </div>
                  )}
                  {cp?.yearsOfExperience !== undefined && (
                    <div className={styles.infoItem}>
                      <p className={styles.infoLabel}>Years of Experience</p>
                      <p className={styles.infoValue}>{cp.yearsOfExperience} years</p>
                    </div>
                  )}
                  {cp?.hourlyRate !== undefined && (
                    <div className={styles.infoItem}>
                      <p className={styles.infoLabel}>Hourly Rate</p>
                      <p className={styles.infoValue}>{cp.currency || 'INR'} {cp.hourlyRate}</p>
                    </div>
                  )}
                  {cp?.licenseNumber && (
                    <div className={styles.infoItem}>
                      <p className={styles.infoLabel}>License Number</p>
                      <p className={styles.infoValue}>{cp.licenseNumber}</p>
                    </div>
                  )}
                </div>
                {cp?.bio && (
                  <div className={styles.bioSection}>
                    <p className={styles.infoLabel}>Bio</p>
                    <p className={styles.bioText}>{cp.bio}</p>
                  </div>
                )}
                {cp?.languages && cp.languages.length > 0 && (
                  <div className={styles.languagesSection}>
                    <p className={styles.infoLabel}>Languages</p>
                    <div className={styles.languageBadges}>
                      {cp.languages.map((lang: string, i: number) => (
                        <Badge key={i} variant="default" size="sm">{lang}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {cp?.availability && (
                  <div className={styles.languagesSection}>
                    <p className={styles.infoLabel}>Availability</p>
                    <div style={{ marginTop: 'var(--spacing-sm)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {DAYS.filter((d) => (cp.availability as Record<Day, AvailabilityDay>)[d]?.isAvailable).map((d) => {
                        const slot = (cp.availability as Record<Day, AvailabilityDay>)[d];
                        return (
                          <p key={d} className={styles.infoValue} style={{ fontSize: 'var(--font-size-sm)' }}>
                            <span style={{ textTransform: 'capitalize', fontWeight: 600, marginRight: 8 }}>{d}</span>
                            {slot.start} – {slot.end}
                          </p>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>

          {/* ── Account Security ── */}
          <Card padding="lg" className={styles.infoCard}>
            <div className={styles.cardHeaderRow}>
              <div className={styles.cardHeaderLeft}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className={styles.cardIcon}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <h3 className={styles.cardTitle}>Account Security</h3>
              </div>
              {!editingPassword && (
                <button className={styles.editBtn} onClick={() => setEditingPassword(true)}>Change Password</button>
              )}
            </div>

            {editingPassword ? (
              <>
                <div className={styles.passwordSection}>
                  <div className={styles.formGroup}>
                    <label className={styles.infoLabel}>Current Password</label>
                    <input
                      type="password"
                      className={styles.formInput}
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm((p) => ({ ...p, currentPassword: e.target.value }))}
                      placeholder="Enter your current password"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.infoLabel}>New Password</label>
                    <input
                      type="password"
                      className={styles.formInput}
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))}
                      placeholder="At least 8 characters"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.infoLabel}>Confirm New Password</label>
                    <input
                      type="password"
                      className={styles.formInput}
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm((p) => ({ ...p, confirmPassword: e.target.value }))}
                      placeholder="Re-enter new password"
                    />
                  </div>
                </div>
                <div className={styles.formActions}>
                  <Button variant="primary" size="sm" onClick={savePassword} disabled={savingPassword}>
                    {savingPassword ? 'Saving…' : 'Update Password'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setEditingPassword(false); setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' }); }} disabled={savingPassword}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <p className={styles.securityText}>Update your password to keep your account secure.</p>
            )}
          </Card>

        </div>
      </div>
    </AppLayout>
  );
}
