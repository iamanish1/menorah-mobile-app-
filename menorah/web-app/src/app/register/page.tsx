'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { api } from '@/lib/api';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import ThemeToggle from '@/components/theme/ThemeToggle';
import styles from './page.module.css';

const STORAGE_KEY = 'menorah_counsellor_application_email';

const registerSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters').max(50),
  lastName: z.string().min(2, 'Last name must be at least 2 characters').max(50),
  email: z.string().email('Invalid email address'),
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Please provide a valid phone number with country code (e.g., +1234567890)'),
  dateOfBirth: z.string().refine((date) => !isNaN(Date.parse(date)), 'Invalid date'),
  gender: z.enum(['male', 'female', 'other', 'prefer-not-to-say']),
  licenseNumber: z.string()
    .regex(/^[a-zA-Z0-9]{10,14}$/, 'RCI License Number must be 10–14 alphanumeric characters'),
  specialization: z.string().min(1, 'Specialization is required'),
  experience: z.number().int().min(0, 'Experience must be non-negative'),
  bio: z.string().min(50, 'Bio must be at least 50 characters').max(1000, 'Bio cannot exceed 1000 characters'),
  languages: z.array(z.string()).min(1, 'At least one language is required'),
  hourlyRate: z.number().min(0, 'Hourly rate must be positive'),
  currency: z.string().optional(),
});

type RegisterForm = z.infer<typeof registerSchema>;

type AppStatus = 'idle' | 'checking' | 'pending' | 'approved' | 'rejected';

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [languages, setLanguages] = useState<string[]>(['English']);
  const [bioLength, setBioLength] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [appStatus, setAppStatus] = useState<AppStatus>('idle');
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);

  // On mount: if a pending application email is stored, check its status
  useEffect(() => {
    const savedEmail = sessionStorage.getItem(STORAGE_KEY);
    if (!savedEmail) return;

    setAppStatus('checking');
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/counsellors/application-status?email=${encodeURIComponent(savedEmail)}`)
      .then(r => r.json())
      .then(data => {
        if (!data.success) {
          // API may not be deployed yet or email not found — keep showing pending screen
          setAppStatus('pending');
          setSubmitted(true);
          return;
        }
        const { status, rejectionReason: reason } = data.data;
        if (status === 'approved') {
          setAppStatus('approved');
        } else if (status === 'rejected') {
          setAppStatus('rejected');
          setRejectionReason(reason);
          localStorage.removeItem(STORAGE_KEY);
        } else {
          // pending
          setAppStatus('pending');
          setSubmitted(true);
        }
      })
      .catch(() => {
        // Network error — keep showing pending screen, never clear localStorage
        setAppStatus('pending');
        setSubmitted(true);
      });
  }, []);

  type DayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  type DaySchedule = { start: string; end: string; isAvailable: boolean };
  const [availability, setAvailability] = useState<Record<DayKey, DaySchedule>>({
    monday:    { start: '09:00', end: '17:00', isAvailable: true },
    tuesday:   { start: '09:00', end: '17:00', isAvailable: true },
    wednesday: { start: '09:00', end: '17:00', isAvailable: true },
    thursday:  { start: '09:00', end: '17:00', isAvailable: true },
    friday:    { start: '09:00', end: '17:00', isAvailable: true },
    saturday:  { start: '09:00', end: '17:00', isAvailable: false },
    sunday:    { start: '09:00', end: '17:00', isAvailable: false },
  });

  const toggleDay = (day: DayKey) =>
    setAvailability(prev => ({ ...prev, [day]: { ...prev[day], isAvailable: !prev[day].isAvailable } }));

  const setDayTime = (day: DayKey, field: 'start' | 'end', value: string) =>
    setAvailability(prev => ({ ...prev, [day]: { ...prev[day], [field]: value } }));

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      currency: 'INR',
      languages: ['English'],
    },
  });

  const addLanguage = () => {
    setLanguages([...languages, '']);
  };

  const removeLanguage = (index: number) => {
    if (languages.length > 1) {
      setLanguages(languages.filter((_, i) => i !== index));
    }
  };

  const updateLanguage = (index: number, value: string) => {
    const updated = [...languages];
    updated[index] = value;
    setLanguages(updated);
  };

  const onSubmit = async (data: RegisterForm) => {
    try {
      setIsSubmitting(true);
      setError(null);

      const registrationData = {
        ...data,
        languages: languages.filter(lang => lang.trim() !== ''),
        experience: Number(data.experience),
        hourlyRate: Number(data.hourlyRate),
        availability,
      };

      const result = await api.registerCounsellor(registrationData);

      if (result.success) {
        setError(null);
        setFieldErrors({});
        sessionStorage.setItem(STORAGE_KEY, registrationData.email);
        setSubmitted(true);
        setAppStatus('pending');
      } else {
        if (result.errors && result.errors.length > 0) {
          const newFieldErrors: Record<string, string> = {};
          result.errors.forEach((err: { field?: string; param?: string; message?: string; msg?: string }) => {
            const fieldName = err.field || err.param || '';
            if (fieldName) {
              newFieldErrors[fieldName] = err.message || err.msg || '';
            }
          });
          setFieldErrors(newFieldErrors);
          
          const errorMessages = result.errors.map((err: { field?: string; param?: string; message?: string; msg?: string }) => {
            const fieldName = err.field || err.param || 'field';
            return `${fieldName}: ${err.message || err.msg || 'Validation error'}`;
          }).join('\n');
          setError(errorMessages);
        } else {
          setError(result.message || 'Registration failed');
          setFieldErrors({});
        }
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Registration failed';
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Checking stored status…
  if (appStatus === 'checking') {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.header}>
            <div className={styles.logoContainer}><span className={styles.logoText}>M</span></div>
          </div>
          <Card padding="lg">
            <div style={{ textAlign: 'center', padding: '32px 0', color: '#6b7280' }}>
              <div style={{ width: 40, height: 40, border: '3px solid #e5e7eb', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
              <p style={{ fontSize: '0.95rem' }}>Checking your application status…</p>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // Approved — redirect to login
  if (appStatus === 'approved') {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.header}>
            <div className={styles.logoContainer}><span className={styles.logoText}>M</span></div>
            <h2 className={styles.title}>Application Approved!</h2>
          </div>
          <Card padding="lg">
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <svg width="32" height="32" fill="none" stroke="#16a34a" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 12, color: '#15803d' }}>Your Application Was Approved</h3>
              <p style={{ color: '#6b7280', lineHeight: 1.6, maxWidth: 380, margin: '0 auto 24px' }}>
                Congratulations! Your profile has been approved by our admin team. Please use the login credentials that were shared with you to sign in.
              </p>
              <Button
                variant="primary"
                size="lg"
                onClick={() => { localStorage.removeItem(STORAGE_KEY); router.push('/login'); }}
                style={{ width: '100%', maxWidth: 320 }}
              >
                Go to Login →
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // Rejected
  if (appStatus === 'rejected') {
    const handleReapply = () => {
      localStorage.removeItem(STORAGE_KEY);
      setAppStatus('idle');
      setRejectionReason(null);
      setCurrentStep(1);
    };

    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.header}>
            <div className={styles.logoContainer}><span className={styles.logoText}>M</span></div>
            <h2 className={styles.title}>Application Status</h2>
          </div>
          <Card padding="lg">
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <svg width="32" height="32" fill="none" stroke="#dc2626" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 12, color: '#dc2626' }}>Application Not Approved</h3>
              <p style={{ color: '#6b7280', lineHeight: 1.6, maxWidth: 380, margin: '0 auto' }}>
                Unfortunately, your application was not approved by our admin team.
              </p>
              {rejectionReason && (
                <div style={{ margin: '16px auto 0', maxWidth: 380, background: 'var(--color-danger-light)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 14, padding: '12px 16px', textAlign: 'left' }}>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: '#991b1b' }}>
                    <strong>Reason:</strong> {rejectionReason}
                  </p>
                </div>
              )}
              <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleReapply}
                  style={{ width: '100%', maxWidth: 320 }}
                >
                  Apply Again →
                </Button>
                <p style={{ color: '#9ca3af', fontSize: '0.8rem', margin: 0 }}>
                  Questions? Contact{' '}
                  <a href="mailto:support@menorah.me" style={{ color: '#2563eb' }}>support@menorah.me</a>
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // Pending (submitted and awaiting review)
  if (submitted) {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.header}>
            <div className={styles.logoContainer}><span className={styles.logoText}>M</span></div>
            <h2 className={styles.title}>Application Submitted</h2>
          </div>
          <Card padding="lg">
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <svg width="32" height="32" fill="none" stroke="#2563eb" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: 12 }}>Registration Under Review</h3>
              <p style={{ color: '#6b7280', lineHeight: 1.6, maxWidth: 380, margin: '0 auto' }}>
                Your application has been submitted successfully. Our admin team will review your profile and credentials. Once approved, you will receive your login credentials.
              </p>
              <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginTop: 16 }}>
                This page will automatically show your approval or rejection status when you return.
              </p>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 20 }}>
        <ThemeToggle />
      </div>
      <div className={styles.content}>
        <div className={styles.header}>
          <div className={styles.logoContainer}>
            <span className={styles.logoText}>M</span>
          </div>
          <h2 className={styles.title}>Counselor Registration</h2>
          <p className={styles.subtitle}>Create your counselor account to start managing bookings</p>
        </div>

        <div className={styles.progressContainer}>
          <div className={`${styles.progressStep} ${currentStep >= 1 ? styles.progressStepActive : styles.progressStepInactive}`}>
            <div className={`${styles.progressCircle} ${currentStep >= 1 ? styles.progressCircleActive : styles.progressCircleInactive}`}>
              {currentStep > 1 ? (
                <svg width="24" height="24" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                '1'
              )}
            </div>
            <span className={styles.progressStepLabel}>Personal Info</span>
          </div>
          <div className={`${styles.progressLine} ${currentStep >= 2 ? styles.progressLineActive : styles.progressLineInactive}`}></div>
          <div className={`${styles.progressStep} ${currentStep >= 2 ? styles.progressStepActive : styles.progressStepInactive}`}>
            <div className={`${styles.progressCircle} ${currentStep >= 2 ? styles.progressCircleActive : styles.progressCircleInactive}`}>
              2
            </div>
            <span className={styles.progressStepLabel}>Professional Info</span>
          </div>
        </div>

        <Card padding="lg">
          <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {error && (
              <div className={styles.errorAlert}>
                <div className={styles.errorContent}>
                  <svg className={styles.errorIcon} fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <p className={styles.errorText}>{error}</p>
                </div>
              </div>
            )}

            {currentStep === 1 && (
              <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                <div className={styles.formGroup}>
                  <h3 className={styles.sectionTitle}>Personal Information</h3>
                  <p className={styles.sectionSubtitle}>Tell us about yourself</p>
                </div>
                
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>First Name</label>
                    <input
                      {...register('firstName')}
                      type="text"
                      className={`${styles.input} ${(fieldErrors.firstName || errors.firstName) ? styles.inputError : ''}`}
                    />
                    {(errors.firstName || fieldErrors.firstName) && (
                      <p className={styles.errorMessage}>
                        <svg className={styles.errorIconSmall} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        {errors.firstName?.message || fieldErrors.firstName}
                      </p>
                    )}
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Last Name</label>
                    <input
                      {...register('lastName')}
                      type="text"
                      className={`${styles.input} ${(fieldErrors.lastName || errors.lastName) ? styles.inputError : ''}`}
                    />
                    {(errors.lastName || fieldErrors.lastName) && (
                      <p className={styles.errorMessage}>
                        <svg className={styles.errorIconSmall} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        {errors.lastName?.message || fieldErrors.lastName}
                      </p>
                    )}
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Email</label>
                  <input
                    {...register('email')}
                    type="email"
                    className={`${styles.input} ${(fieldErrors.email || errors.email) ? styles.inputError : ''}`}
                  />
                  {(errors.email || fieldErrors.email) && (
                    <p className={styles.errorMessage}>
                      <svg className={styles.errorIconSmall} fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      {errors.email?.message || fieldErrors.email}
                    </p>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Phone (with country code)</label>
                  <input
                    {...register('phone')}
                    type="tel"
                    placeholder="+1234567890"
                    className={`${styles.input} ${(fieldErrors.phone || errors.phone) ? styles.inputError : ''}`}
                  />
                  <p className={styles.helpText}>Format: +[country code][number], e.g., +911234567890</p>
                  {(errors.phone || fieldErrors.phone) && (
                    <p className={styles.errorMessage}>
                      <svg className={styles.errorIconSmall} fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      {errors.phone?.message || fieldErrors.phone}
                    </p>
                  )}
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Date of Birth</label>
                    <input
                      {...register('dateOfBirth')}
                      type="date"
                      max={new Date(new Date().setFullYear(new Date().getFullYear() - 18)).toISOString().split('T')[0]}
                      className={styles.input}
                    />
                    <p className={styles.helpText}>Must be 18 years or older</p>
                    {errors.dateOfBirth && (
                      <p className={styles.errorMessage}>{errors.dateOfBirth.message}</p>
                    )}
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Gender</label>
                    <select
                      {...register('gender')}
                      className={styles.select}
                    >
                      <option value="">Select</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                      <option value="prefer-not-to-say">Prefer not to say</option>
                    </select>
                    {errors.gender && (
                      <p className={styles.errorMessage}>{errors.gender.message}</p>
                    )}
                  </div>
                </div>

                <div className={styles.formGroup} style={{ background: 'var(--color-info-light)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: 14, padding: '12px 16px' }}>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: '#1d4ed8', lineHeight: 1.5 }}>
                    <strong>Note:</strong> You do not need to set a password. Once your profile is approved by our admin team, your login credentials will be provided to you.
                  </p>
                </div>

                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  onClick={() => setCurrentStep(2)}
                  style={{ width: '100%' }}
                >
                  Next: Professional Information →
                </Button>
              </div>
            )}

            {currentStep === 2 && (
              <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                <div className={styles.formGroup}>
                  <h3 className={styles.sectionTitle}>Professional Information</h3>
                  <p className={styles.sectionSubtitle}>Tell us about your professional background</p>
                </div>
                
                <div className={styles.formGroup}>
                  <label className={styles.label}>RCI License Number</label>
                  <input
                    {...register('licenseNumber')}
                    type="text"
                    placeholder="e.g., RCI1234567890"
                    maxLength={14}
                    className={`${styles.input} ${(fieldErrors.licenseNumber || errors.licenseNumber) ? styles.inputError : ''}`}
                  />
                  <p className={styles.helpText}>10–14 alphanumeric characters (no spaces or symbols)</p>
                  {(errors.licenseNumber || fieldErrors.licenseNumber) && (
                    <p className={styles.errorMessage}>{errors.licenseNumber?.message || fieldErrors.licenseNumber}</p>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Specialization</label>
                  <input
                    {...register('specialization')}
                    type="text"
                    placeholder="e.g., Clinical Psychology"
                    className={`${styles.input} ${(fieldErrors.specialization || errors.specialization) ? styles.inputError : ''}`}
                  />
                  {(errors.specialization || fieldErrors.specialization) && (
                    <p className={styles.errorMessage}>{errors.specialization?.message || fieldErrors.specialization}</p>
                  )}
                </div>

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Years of Experience</label>
                    <input
                      {...register('experience', { valueAsNumber: true })}
                      type="number"
                      min="0"
                      className={`${styles.input} ${(fieldErrors.experience || errors.experience) ? styles.inputError : ''}`}
                    />
                    {(errors.experience || fieldErrors.experience) && (
                      <p className={styles.errorMessage}>{errors.experience?.message || fieldErrors.experience}</p>
                    )}
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Hourly Rate</label>
                    <div className={styles.currencyWrapper}>
                      <select
                        {...register('currency')}
                        className={styles.currencySelect}
                      >
                        <option value="INR">INR</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                      </select>
                      <input
                        {...register('hourlyRate', { valueAsNumber: true })}
                        type="number"
                        min="0"
                        step="0.01"
                        className={styles.currencyInput}
                      />
                    </div>
                    {(errors.hourlyRate || fieldErrors.hourlyRate) && (
                      <p className={styles.errorMessage}>{errors.hourlyRate?.message || fieldErrors.hourlyRate}</p>
                    )}
                  </div>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>
                    Bio
                    <span className={`${styles.bioCounter} ${bioLength >= 50 && bioLength <= 1000 ? styles.bioCounterValid : styles.bioCounterInvalid}`}>
                      {bioLength}/1000
                    </span>
                  </label>
                  <textarea
                    {...register('bio')}
                    rows={4}
                    className={`${styles.textarea} ${(fieldErrors.bio || errors.bio) ? styles.inputError : ''}`}
                    onChange={(e) => {
                      setBioLength(e.target.value.length);
                      register('bio').onChange(e);
                    }}
                    placeholder="Tell us about your professional background and approach..."
                  />
                  {errors.bio && (
                    <p className={styles.errorMessage}>{errors.bio.message}</p>
                  )}
                  {fieldErrors.bio && (
                    <p className={styles.errorMessage}>{fieldErrors.bio}</p>
                  )}
                  {bioLength > 0 && bioLength < 50 && (
                    <p className={styles.errorMessage} style={{ color: 'var(--color-warning)' }}>
                      Bio must be at least 50 characters ({50 - bioLength} more needed)
                    </p>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Languages</label>
                  {languages.map((lang, index) => (
                    <div key={index} className={styles.languageRow}>
                      <input
                        type="text"
                        value={lang}
                        onChange={(e) => updateLanguage(index, e.target.value)}
                        placeholder="e.g., English, Hindi"
                        className={`${styles.languageInput} ${styles.input}`}
                      />
                      {languages.length > 1 && (
                        <Button
                          type="button"
                          variant="danger"
                          size="md"
                          onClick={() => removeLanguage(index)}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={addLanguage}
                    style={{ marginTop: '8px' }}
                  >
                    + Add Language
                  </Button>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Weekly Availability</label>
                  <p className={styles.helpText}>Set which days and hours you are available for sessions</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
                    {(Object.keys(availability) as DayKey[]).map((day) => (
                      <div key={day} style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '110px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={availability[day].isAvailable}
                            onChange={() => toggleDay(day)}
                            style={{ width: '16px', height: '16px', accentColor: 'var(--color-primary, #16a34a)', cursor: 'pointer' }}
                          />
                          <span style={{ textTransform: 'capitalize', fontWeight: availability[day].isAvailable ? 600 : 400, color: availability[day].isAvailable ? 'inherit' : '#9ca3af' }}>
                            {day}
                          </span>
                        </label>
                        {availability[day].isAvailable && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                              type="time"
                              value={availability[day].start}
                              onChange={(e) => setDayTime(day, 'start', e.target.value)}
                              className={styles.input}
                              style={{ width: '130px', padding: '6px 10px' }}
                            />
                            <span style={{ color: '#6b7280', fontSize: '14px' }}>to</span>
                            <input
                              type="time"
                              value={availability[day].end}
                              min={availability[day].start}
                              onChange={(e) => setDayTime(day, 'end', e.target.value)}
                              className={styles.input}
                              style={{ width: '130px', padding: '6px 10px' }}
                            />
                          </div>
                        )}
                        {!availability[day].isAvailable && (
                          <span style={{ fontSize: '13px', color: '#9ca3af' }}>Not available</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className={styles.actionsRow}>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={() => setCurrentStep(1)}
                    style={{ flex: 1 }}
                  >
                    ← Back
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    isLoading={isSubmitting}
                    style={{ flex: 1 }}
                  >
                    Register
                  </Button>
                </div>
              </div>
            )}
          </form>
        </Card>

        <div className={styles.footer}>
          <p className={styles.footerText}>
            Already have an account?{' '}
            <Link href="/login" className={styles.footerLink}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
