'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { api } from '@/lib/api';
import type {
  CounsellorApplicationStatus,
  CounsellorVerificationRequirements,
} from '@/lib/api';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import CountryPhoneInput from '@/components/ui/CountryPhoneInput';
import ThemeToggle from '@/components/theme/ThemeToggle';
import styles from './page.module.css';

const STORAGE_KEY = 'menorah_counsellor_application_status_ticket';
const REVERIFICATION_AUTHORIZATION_INVALID = 'REVERIFICATION_AUTHORIZATION_INVALID';
const KNOWN_APPLICATION_STATUSES = new Set<CounsellorApplicationStatus['status']>([
  'draft',
  'pending',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'suspended',
  'expired',
]);

const registerSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters').max(50),
  lastName: z.string().min(2, 'Last name must be at least 2 characters').max(50),
  email: z.string().email('Invalid email address'),
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Please provide a valid phone number with country code (e.g., +1234567890)'),
  dateOfBirth: z.string().refine((date) => !isNaN(Date.parse(date)), 'Invalid date'),
  gender: z.enum(['male', 'female', 'other', 'prefer-not-to-say']),
  licenseNumber: z.string().trim().min(1, 'License number is required'),
  specialization: z.string().min(1, 'Specialization is required'),
  experience: z.number().int().min(0, 'Experience must be non-negative'),
  bio: z.string().min(50, 'Bio must be at least 50 characters').max(1000, 'Bio cannot exceed 1000 characters'),
  languages: z.array(z.string()).min(1, 'At least one language is required'),
  hourlyRate: z.number().min(0, 'Hourly rate must be positive'),
  currency: z.string().optional(),
});

type RegisterForm = z.infer<typeof registerSchema>;

type AppStatus =
  | 'idle'
  | 'checking'
  | 'status_unknown'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'reverification_required';
type VerificationRequirementsState =
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: CounsellorVerificationRequirements }
  | { status: 'error'; data: null };

const isSafeNoticeUrl = (value: string) => {
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname
      .replace(/^\[|\]$/g, '')
      .replace(/\.+$/g, '')
      .toLowerCase();
    return parsed.protocol === 'https:'
      && !parsed.username
      && !parsed.password
      && hostname !== 'localhost'
      && !hostname.endsWith('.localhost')
      && !hostname.endsWith('.local');
  } catch {
    return false;
  }
};

const isValidVerificationRequirements = (
  value: CounsellorVerificationRequirements | undefined
): value is CounsellorVerificationRequirements =>
  typeof value?.consentVersion === 'string'
  && value.consentVersion.trim().length > 0
  && typeof value.noticeUrl === 'string'
  && isSafeNoticeUrl(value.noticeUrl);

const isValidApplicationStatus = (
  value: CounsellorApplicationStatus | undefined
): value is CounsellorApplicationStatus => Boolean(
  value
  && KNOWN_APPLICATION_STATUSES.has(value.status)
  && (
    value.rejectionReason === undefined
    || value.rejectionReason === null
    || typeof value.rejectionReason === 'string'
  )
  && (
    value.requiresFreshApplication === undefined
    || typeof value.requiresFreshApplication === 'boolean'
  )
);

const isCurrentConsentFailure = ({
  code,
  status,
}: {
  code?: string;
  status?: number;
}) => {
  const normalizedCode = code?.toUpperCase() || '';
  return status === 422 || (
    normalizedCode.includes('CONSENT')
    && (
      normalizedCode.includes('CURRENT')
      || normalizedCode.includes('MISMATCH')
      || normalizedCode.includes('STALE')
    )
  );
};

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [languages, setLanguages] = useState<string[]>(['English']);
  const [bioLength, setBioLength] = useState(0);
  const [appStatus, setAppStatus] = useState<AppStatus>('checking');
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [verificationRequirements, setVerificationRequirements] =
    useState<VerificationRequirementsState>({ status: 'loading', data: null });
  const [requirementsLoadAttempt, setRequirementsLoadAttempt] = useState(0);
  const [onboardingConsentAccepted, setOnboardingConsentAccepted] = useState(false);
  const [statusLookupAttempt, setStatusLookupAttempt] = useState(0);
  const [invitationChecked, setInvitationChecked] = useState(false);
  const [isReverificationApplication, setIsReverificationApplication] = useState(false);
  const [reverificationAuthorizationInvalid, setReverificationAuthorizationInvalid] =
    useState(false);
  const [reverificationToken, setReverificationToken] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    setVerificationRequirements(() => ({ status: 'loading', data: null }));
    setOnboardingConsentAccepted(() => false);

    const loadVerificationRequirements = async () => {
      try {
        const result = await api.getCounsellorVerificationRequirements(controller.signal);
        if (controller.signal.aborted) return;
        const requirements = result.data;

        if (!result.success || !isValidVerificationRequirements(requirements)) {
          setVerificationRequirements(() => ({ status: 'error', data: null }));
          return;
        }

        setVerificationRequirements(() => ({
          status: 'ready',
          data: requirements,
        }));
      } catch {
        if (!controller.signal.aborted) {
          setVerificationRequirements(() => ({ status: 'error', data: null }));
        }
      }
    };

    void loadVerificationRequirements();

    return () => controller.abort();
  }, [requirementsLoadAttempt]);

  // Consume a re-verification invitation from the URL fragment before status lookup.
  // The raw token is removed from browser history and is kept only in component memory.
  useEffect(() => {
    const invitationToken = new URLSearchParams(window.location.hash.slice(1))
      .get('reverificationToken');

    if (invitationToken === null) {
      setInvitationChecked(true);
      return;
    }

    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    setIsReverificationApplication(true);
    setAppStatus('idle');

    if (/^[a-f0-9]{64}$/i.test(invitationToken)) {
      setReverificationToken(invitationToken);
      setReverificationAuthorizationInvalid(false);
      sessionStorage.removeItem(STORAGE_KEY);
    } else {
      setReverificationToken(null);
      setReverificationAuthorizationInvalid(true);
      setError(
        'This secure re-verification link is invalid or incomplete. Ask an administrator to send a new link.'
      );
    }
    setInvitationChecked(true);
  }, []);

  // If an applicant status ticket is stored, resolve it through the shared API
  // client so the configured base URL and cancellation behavior stay consistent.
  useEffect(() => {
    if (!invitationChecked || isReverificationApplication) return;

    const statusTicket = sessionStorage.getItem(STORAGE_KEY);
    if (!statusTicket) {
      setAppStatus('idle');
      return;
    }

    const controller = new AbortController();

    setAppStatus('checking');

    const loadApplicationStatus = async () => {
      try {
        const result = await api.getCounsellorApplicationStatus(
          statusTicket,
          controller.signal
        );
        if (controller.signal.aborted) return;
        if (!result.success || !isValidApplicationStatus(result.data)) {
          setAppStatus('status_unknown');
          return;
        }

        const {
          status,
          rejectionReason: reason,
          requiresFreshApplication,
        } = result.data;
        setRejectionReason(null);

        if (requiresFreshApplication === true || status === 'suspended' || status === 'expired') {
          setAppStatus('reverification_required');
        } else if (status === 'approved') {
          setAppStatus('approved');
        } else if (status === 'rejected') {
          setAppStatus('rejected');
          setRejectionReason(reason || null);
        } else if (status === 'under_review') {
          setAppStatus('under_review');
        } else if (status === 'submitted' || status === 'pending') {
          setAppStatus('submitted');
        } else {
          setAppStatus('status_unknown');
        }
      } catch {
        if (!controller.signal.aborted) {
          setAppStatus('status_unknown');
        }
      }
    };

    void loadApplicationStatus();

    return () => controller.abort();
  }, [invitationChecked, isReverificationApplication, statusLookupAttempt]);

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
    setValue,
    watch,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      currency: 'INR',
      languages: ['English'],
    },
  });
  const phoneValue = watch('phone') || '';

  const addLanguage = () => {
    setLanguages(current => [...current, '']);
  };

  const removeLanguage = (index: number) => {
    setLanguages(current =>
      current.length > 1 ? current.filter((_, i) => i !== index) : current
    );
  };

  const updateLanguage = (index: number, value: string) => {
    setLanguages(current =>
      current.map((language, currentIndex) =>
        currentIndex === index ? value : language
      )
    );
  };

  const onSubmit = async (data: RegisterForm) => {
    if (
      isReverificationApplication
      && (reverificationAuthorizationInvalid || !reverificationToken)
    ) {
      setError(
        'A valid secure re-verification link is required. Ask an administrator to send a new link.'
      );
      return;
    }
    if (verificationRequirements.status !== 'ready') {
      setError('The onboarding consent notice is unavailable. Registration is temporarily disabled.');
      return;
    }
    if (!onboardingConsentAccepted) {
      setError('Please read and accept the counsellor onboarding and verification notice.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const registrationData = {
        ...data,
        languages: languages.filter(lang => lang.trim() !== ''),
        experience: Number(data.experience),
        hourlyRate: Number(data.hourlyRate),
        availability,
        onboardingConsentAccepted: true as const,
        onboardingConsentVersion: verificationRequirements.data.consentVersion,
        ...(reverificationToken ? { reverificationToken } : {}),
      };

      const result = await api.registerCounsellor(registrationData);

      if (result.success) {
        setError(null);
        setFieldErrors({});
        if (!result.data?.statusTicket) throw new Error('Application status ticket was not returned');
        sessionStorage.setItem(STORAGE_KEY, result.data.statusTicket);
        setReverificationToken(null);
        setIsReverificationApplication(false);
        setReverificationAuthorizationInvalid(false);
        setAppStatus(result.data.status === 'under_review' ? 'under_review' : 'submitted');
      } else {
        if (isCurrentConsentFailure(result)) {
          setOnboardingConsentAccepted(false);
          setFieldErrors({});
          setRequirementsLoadAttempt(current => current + 1);
          setError(
            'The onboarding notice changed before submission. We are loading the current notice; review it and accept the new version before retrying.'
          );
          return;
        }

        if (
          isReverificationApplication
          && result.code === REVERIFICATION_AUTHORIZATION_INVALID
        ) {
          setReverificationToken(null);
          setReverificationAuthorizationInvalid(true);
          setFieldErrors({});
          setError(
            'This secure re-verification link can no longer authorize a submission. Ask an administrator to send a new link.'
          );
          return;
        }

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
            <div className={styles.statusChecking}>
              <div className={styles.statusSpinner} />
              <p className={styles.statusCheckingText}>Checking your application status…</p>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (appStatus === 'status_unknown') {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.header}>
            <div className={styles.logoContainer}><span className={styles.logoText}>M</span></div>
            <h2 className={styles.title}>Application Status Unavailable</h2>
          </div>
          <Card padding="lg">
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <p style={{ color: '#6b7280', lineHeight: 1.6, maxWidth: 420, margin: '0 auto 24px' }}>
                We could not verify the current state of your application. Your application record
                has not been changed. Retry the secure status check before taking any other action.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => setStatusLookupAttempt(current => current + 1)}
                  style={{ width: '100%', maxWidth: 320 }}
                >
                  Retry status check
                </Button>
                <a href="mailto:support@menorah.me" style={{ color: '#2563eb', fontWeight: 600 }}>
                  Contact Menorah support
                </a>
              </div>
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
            <div className={styles.statusPanel}>
              <div className={`${styles.statusIcon} ${styles.statusIconApproved}`}>
                <svg width="32" height="32" fill="none" stroke="#16a34a" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className={`${styles.statusTitle} ${styles.statusTitleApproved}`}>Your Application Was Approved</h3>
              <p className={`${styles.statusDescription} ${styles.statusDescriptionWithAction}`}>
                Your professional review was approved. Use the one-time account setup link sent to your registered email before signing in.
              </p>
              <Button
                variant="primary"
                size="lg"
                onClick={() => { sessionStorage.removeItem(STORAGE_KEY); router.push('/login'); }}
                className={styles.statusAction}
              >
                Go to Login →
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (appStatus === 'reverification_required') {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.header}>
            <div className={styles.logoContainer}><span className={styles.logoText}>M</span></div>
            <h2 className={styles.title}>Fresh Verification Application Required</h2>
          </div>
          <Card padding="lg">
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <p style={{ color: '#6b7280', lineHeight: 1.6, maxWidth: 420, margin: '0 auto 24px' }}>
                Professional access remains disabled. Ask an administrator to send the secure,
                one-time re-verification link to your registered email. The link lets you submit a new
                retained application and personally accept the current onboarding notice.
              </p>
              <a href="mailto:support@menorah.me" style={{ color: '#2563eb', fontWeight: 600 }}>
                Contact Menorah support
              </a>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // Rejected
  if (appStatus === 'rejected') {
    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.header}>
            <div className={styles.logoContainer}><span className={styles.logoText}>M</span></div>
            <h2 className={styles.title}>Application Status</h2>
          </div>
          <Card padding="lg">
            <div className={styles.statusPanel}>
              <div className={`${styles.statusIcon} ${styles.statusIconRejected}`}>
                <svg width="32" height="32" fill="none" stroke="#dc2626" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 className={`${styles.statusTitle} ${styles.statusTitleRejected}`}>Application Not Approved</h3>
              <p className={styles.statusDescription}>
                Unfortunately, your application was not approved by our admin team.
              </p>
              {rejectionReason && (
                <div className={styles.rejectionReason}>
                  <p className={styles.rejectionReasonText}>
                    <strong>Reason:</strong> {rejectionReason}
                  </p>
                </div>
              )}
              <div className={styles.statusActions}>
                <p className={styles.statusHelp}>
                  Reapplication or appeal is not automatic. Contact{' '}
                  <a href="mailto:support@menorah.me" className={styles.supportLink}>support@menorah.me</a>
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (appStatus === 'submitted' || appStatus === 'under_review') {
    const isUnderReview = appStatus === 'under_review';

    return (
      <div className={styles.container}>
        <div className={styles.content}>
          <div className={styles.header}>
            <div className={styles.logoContainer}><span className={styles.logoText}>M</span></div>
            <h2 className={styles.title}>
              {isUnderReview ? 'Application Under Review' : 'Application Submitted'}
            </h2>
          </div>
          <Card padding="lg">
            <div className={styles.statusPanel}>
              <div className={`${styles.statusIcon} ${styles.statusIconPending}`}>
                <svg width="32" height="32" fill="none" stroke="#2563eb" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className={styles.statusTitle}>
                {isUnderReview ? 'Review In Progress' : 'Application Received'}
              </h3>
              <p className={styles.statusDescription}>
                {isUnderReview
                  ? 'Your applicant-declared professional details and supporting evidence are under review before an approval decision.'
                  : 'Your application was received. Applicant-declared professional details and supporting evidence must be reviewed before approval.'}
              </p>
              <p className={styles.statusHint}>
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
      <div className={styles.themeToggle}>
        <ThemeToggle />
      </div>
      <div className={styles.content}>
        <div className={styles.header}>
          <div className={styles.logoContainer}>
            <span className={styles.logoText}>M</span>
          </div>
          <h2 className={styles.title}>Counsellor Application</h2>
          <p className={styles.subtitle}>Submit your details for onboarding and professional verification review.</p>
        </div>

        {isReverificationApplication ? (
          <div
            role={reverificationAuthorizationInvalid ? 'alert' : 'status'}
            style={{
              border: reverificationAuthorizationInvalid
                ? '1px solid rgba(239, 68, 68, 0.35)'
                : '1px solid rgba(59, 130, 246, 0.3)',
              background: reverificationAuthorizationInvalid
                ? 'var(--color-danger-light)'
                : 'var(--color-info-light)',
              borderRadius: 14,
              padding: '14px 16px',
              marginBottom: 20,
            }}
          >
            <p
              style={{
                margin: 0,
                color: reverificationAuthorizationInvalid ? '#991b1b' : '#1d4ed8',
                fontWeight: 700,
              }}
            >
              Secure re-verification application
            </p>
            <p
              style={{
                margin: '6px 0 0',
                color: reverificationAuthorizationInvalid ? '#991b1b' : '#1e40af',
                fontSize: '0.875rem',
                lineHeight: 1.55,
              }}
            >
              {reverificationAuthorizationInvalid
                ? 'This one-time link can no longer authorize a submission. It may be invalid, expired, already used, or tied to an older onboarding notice.'
                : 'The one-time link was accepted for this browser session. Enter the same email, phone, and license number as your existing account, then review and accept the current onboarding notice.'}
            </p>
            {reverificationAuthorizationInvalid ? (
              <a
                href="mailto:support@menorah.me"
                style={{
                  display: 'inline-block',
                  marginTop: 10,
                  color: '#b91c1c',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                }}
              >
                Ask for a new secure link
              </a>
            ) : null}
          </div>
        ) : null}

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
          <form onSubmit={handleSubmit(onSubmit)} className={styles.registrationForm}>
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
              <div className={styles.stepPanel}>
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
                  <input type="hidden" {...register('phone')} />
                  <CountryPhoneInput
                    label="Phone"
                    value={phoneValue}
                    onChange={(nextPhone) => {
                      setValue('phone', nextPhone, { shouldDirty: true, shouldValidate: true });
                      if (fieldErrors.phone) setFieldErrors((current) => ({ ...current, phone: '' }));
                    }}
                    error={errors.phone?.message || fieldErrors.phone}
                    hint="Choose a country code, then enter the local number."
                    required
                  />
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

                <div className={`${styles.formGroup} ${styles.infoNotice}`}>
                  <p className={styles.infoNoticeText}>
                    <strong>Note:</strong> You do not need to set a password. Once your profile is approved by our admin team, your login credentials will be provided to you.
                  </p>
                </div>

                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  onClick={() => setCurrentStep(2)}
                  className={styles.fullWidthButton}
                >
                  Next: Professional Information →
                </Button>
              </div>
            )}

            {currentStep === 2 && (
              <div className={styles.stepPanel}>
                <div className={styles.formGroup}>
                  <h3 className={styles.sectionTitle}>Professional Information</h3>
                  <p className={styles.sectionSubtitle}>
                    Provide applicant-declared professional information for review.
                  </p>
                </div>

                <div className={styles.formGroup} style={{ background: 'var(--color-info-light)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: 14, padding: '12px 16px' }}>
                  <p style={{ margin: 0, fontSize: '0.875rem', color: '#1d4ed8', lineHeight: 1.5 }}>
                    Professional details below are applicant-declared and do not by themselves establish verification. Supporting evidence will be reviewed before approval.
                  </p>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>RCI License Number (applicant-declared)</label>
                  <input
                    {...register('licenseNumber')}
                    type="text"
                    placeholder="Enter the license number exactly as issued"
                    className={`${styles.input} ${(fieldErrors.licenseNumber || errors.licenseNumber) ? styles.inputError : ''}`}
                  />
                  <p className={styles.helpText}>
                    Include any letters, numbers, spaces, hyphens, or other punctuation shown on the record.
                  </p>
                  {(errors.licenseNumber || fieldErrors.licenseNumber) && (
                    <p className={styles.errorMessage}>{errors.licenseNumber?.message || fieldErrors.licenseNumber}</p>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Specialization (applicant-declared)</label>
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
                    <label className={styles.label}>Years of Experience (applicant-declared)</label>
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
                    Bio (applicant-declared)
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
                    <p className={`${styles.errorMessage} ${styles.warningMessage}`}>
                      Bio must be at least 50 characters ({50 - bioLength} more needed)
                    </p>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Languages (applicant-declared)</label>
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
                    className={styles.addLanguageButton}
                  >
                    + Add Language
                  </Button>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.label}>Weekly Availability</label>
                  <p className={styles.helpText}>Set which days and hours you are available for sessions</p>
                  <div className={styles.availabilityList}>
                    {(Object.keys(availability) as DayKey[]).map((day) => (
                      <div key={day} className={styles.availabilityDay}>
                        <label className={styles.availabilityLabel}>
                          <input
                            type="checkbox"
                            checked={availability[day].isAvailable}
                            onChange={() => toggleDay(day)}
                            className={styles.availabilityCheckbox}
                          />
                          <span className={`${styles.availabilityDayName} ${availability[day].isAvailable ? styles.availabilityDayAvailable : styles.availabilityDayUnavailable}`}>
                            {day}
                          </span>
                        </label>
                        {availability[day].isAvailable && (
                          <div className={styles.timeFields}>
                            <input
                              type="time"
                              value={availability[day].start}
                              onChange={(e) => setDayTime(day, 'start', e.target.value)}
                              className={`${styles.input} ${styles.timeInput}`}
                            />
                            <span className={styles.timeSeparator}>to</span>
                            <input
                              type="time"
                              value={availability[day].end}
                              min={availability[day].start}
                              onChange={(e) => setDayTime(day, 'end', e.target.value)}
                              className={`${styles.input} ${styles.timeInput}`}
                            />
                          </div>
                        )}
                        {!availability[day].isAvailable && (
                          <span className={styles.unavailableText}>Not available</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div
                  className={styles.formGroup}
                  aria-live="polite"
                  style={{
                    border: '1px solid var(--color-border)',
                    borderRadius: 14,
                    padding: '14px 16px',
                  }}
                >
                  <h4 style={{ margin: '0 0 8px', fontSize: '0.95rem' }}>
                    Onboarding and verification consent
                  </h4>

                  {verificationRequirements.status === 'loading' ? (
                    <p className={styles.helpText} style={{ margin: 0 }}>
                      Loading the onboarding notice…
                    </p>
                  ) : verificationRequirements.status === 'error' ? (
                    <div>
                      <p className={styles.errorMessage} style={{ margin: '0 0 10px' }}>
                        The onboarding consent notice is unavailable. Registration is temporarily disabled.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setRequirementsLoadAttempt(current => current + 1)}
                        disabled={isSubmitting}
                      >
                        Retry loading notice
                      </Button>
                    </div>
                  ) : (
                    <label
                      htmlFor="onboarding-consent"
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 10,
                        cursor: isSubmitting ? 'default' : 'pointer',
                      }}
                    >
                      <input
                        id="onboarding-consent"
                        type="checkbox"
                        checked={onboardingConsentAccepted}
                        required
                        onChange={(event) => {
                          const accepted = event.target.checked;
                          setOnboardingConsentAccepted(() => accepted);
                        }}
                        disabled={isSubmitting}
                        style={{ width: 18, height: 18, marginTop: 2 }}
                      />
                      <span style={{ fontSize: '0.875rem', lineHeight: 1.5 }}>
                        I have read and accept the{' '}
                        <a
                          href={verificationRequirements.data.noticeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}
                        >
                          counsellor onboarding and verification notice
                        </a>{' '}
                        (version {verificationRequirements.data.consentVersion}).
                      </span>
                    </label>
                  )}
                </div>

                <div className={styles.actionsRow}>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={() => setCurrentStep(1)}
                    className={styles.actionButton}
                  >
                    ← Back
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    isLoading={isSubmitting}
                    disabled={
                      verificationRequirements.status !== 'ready'
                      || !onboardingConsentAccepted
                      || (
                        isReverificationApplication
                        && (reverificationAuthorizationInvalid || !reverificationToken)
                      )
                    }
                    className={styles.actionButton}
                  >
                    Submit application
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
