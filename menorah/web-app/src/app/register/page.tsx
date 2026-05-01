'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { api } from '@/lib/api';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import styles from './page.module.css';

const registerSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters').max(50),
  lastName: z.string().min(2, 'Last name must be at least 2 characters').max(50),
  email: z.string().email('Invalid email address'),
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Please provide a valid phone number with country code (e.g., +1234567890)'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  dateOfBirth: z.string().refine((date) => !isNaN(Date.parse(date)), 'Invalid date'),
  gender: z.enum(['male', 'female', 'other', 'prefer-not-to-say']),
  licenseNumber: z.string().min(1, 'License number is required'),
  specialization: z.string().min(1, 'Specialization is required'),
  experience: z.number().int().min(0, 'Experience must be non-negative'),
  bio: z.string().min(50, 'Bio must be at least 50 characters').max(1000, 'Bio cannot exceed 1000 characters'),
  languages: z.array(z.string()).min(1, 'At least one language is required'),
  hourlyRate: z.number().min(0, 'Hourly rate must be positive'),
  currency: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [languages, setLanguages] = useState<string[]>(['English']);
  const [bioLength, setBioLength] = useState(0);
  const [passwordStrength, setPasswordStrength] = useState(0);

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
      };

      const result = await api.registerCounsellor(registrationData);

      if (result.success) {
        setError(null);
        setFieldErrors({});
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('registrationSuccess', 'true');
          sessionStorage.setItem('registrationMessage', result.message || 'Registration successful! Please verify your email and phone. Your profile will be reviewed by admin.');
        }
        router.push('/dashboard');
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

  return (
    <div className={styles.container}>
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

                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Password</label>
                    <input
                      {...register('password')}
                      type="password"
                      className={styles.input}
                      onChange={(e) => {
                        const password = e.target.value;
                        let strength = 0;
                        if (password.length >= 8) strength++;
                        if (password.length >= 12) strength++;
                        if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
                        if (/\d/.test(password)) strength++;
                        if (/[^a-zA-Z\d]/.test(password)) strength++;
                        setPasswordStrength(strength);
                        register('password').onChange(e);
                      }}
                    />
                    {passwordStrength > 0 && (
                      <div className={styles.passwordStrength}>
                        <div className={styles.strengthBars}>
                          {[1, 2, 3, 4, 5].map((level) => (
                            <div
                              key={level}
                              className={`${styles.strengthBar} ${
                                level <= passwordStrength
                                  ? passwordStrength <= 2
                                    ? styles.strengthBarWeak
                                    : passwordStrength <= 3
                                    ? styles.strengthBarMedium
                                    : styles.strengthBarStrong
                                  : styles.strengthBarEmpty
                              }`}
                            />
                          ))}
                        </div>
                        <p className={styles.strengthText}>
                          {passwordStrength <= 2
                            ? 'Weak password'
                            : passwordStrength <= 3
                            ? 'Medium strength'
                            : 'Strong password'}
                        </p>
                      </div>
                    )}
                    {errors.password && (
                      <p className={styles.errorMessage}>{errors.password.message}</p>
                    )}
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Confirm Password</label>
                    <input
                      {...register('confirmPassword')}
                      type="password"
                      className={styles.input}
                    />
                    {errors.confirmPassword && (
                      <p className={styles.errorMessage}>{errors.confirmPassword.message}</p>
                    )}
                  </div>
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
                  <label className={styles.label}>License Number</label>
                  <input
                    {...register('licenseNumber')}
                    type="text"
                    className={`${styles.input} ${(fieldErrors.licenseNumber || errors.licenseNumber) ? styles.inputError : ''}`}
                  />
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
