'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import AppLayout from '@/components/layout/AppLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import styles from './page.module.css';

export default function ProfilePage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [profileData, setProfileData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchProfile();
    }
  }, [isAuthenticated]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const response = await api.getCurrentUser();
      if (response.success && response.data) {
        setProfileData(response.data.user);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  if (isLoading || loading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.spinner} />
        <p>Loading profile...</p>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  const profile = profileData || user;

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
                    {(user?.firstName?.charAt(0) || 'C').toUpperCase()}
                    {(user?.lastName?.charAt(0) || '').toUpperCase()}
                  </span>
                </div>
              )}
            </div>
            <div className={styles.avatarInfo}>
              <h2 className={styles.avatarName}>{user?.firstName} {user?.lastName}</h2>
              <p className={styles.avatarEmail}>{user?.email}</p>
              <Badge variant="success" size="sm">Active Counsellor</Badge>
            </div>
          </Card>
        </div>

        {/* Info Cards */}
        <div className={styles.infoSection}>
          <Card padding="lg" className={styles.infoCard}>
            <div className={styles.cardHeader}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className={styles.cardIcon}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <h3 className={styles.cardTitle}>Personal Information</h3>
            </div>
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
          </Card>

          {profile?.counsellorProfile && (
            <Card padding="lg" className={styles.infoCard}>
              <div className={styles.cardHeader}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className={styles.cardIcon}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <h3 className={styles.cardTitle}>Professional Information</h3>
              </div>
              <div className={styles.infoGrid}>
                {profile.counsellorProfile.specialization && (
                  <div className={styles.infoItem}>
                    <p className={styles.infoLabel}>Specialization</p>
                    <p className={styles.infoValue}>{profile.counsellorProfile.specialization}</p>
                  </div>
                )}
                {profile.counsellorProfile.yearsOfExperience !== undefined && (
                  <div className={styles.infoItem}>
                    <p className={styles.infoLabel}>Years of Experience</p>
                    <p className={styles.infoValue}>{profile.counsellorProfile.yearsOfExperience} years</p>
                  </div>
                )}
                {profile.counsellorProfile.hourlyRate !== undefined && (
                  <div className={styles.infoItem}>
                    <p className={styles.infoLabel}>Hourly Rate</p>
                    <p className={styles.infoValue}>{profile.counsellorProfile.currency || 'AED'} {profile.counsellorProfile.hourlyRate}</p>
                  </div>
                )}
                {profile.counsellorProfile.licenseNumber && (
                  <div className={styles.infoItem}>
                    <p className={styles.infoLabel}>License Number</p>
                    <p className={styles.infoValue}>{profile.counsellorProfile.licenseNumber}</p>
                  </div>
                )}
              </div>
              {profile.counsellorProfile.bio && (
                <div className={styles.bioSection}>
                  <p className={styles.infoLabel}>Bio</p>
                  <p className={styles.bioText}>{profile.counsellorProfile.bio}</p>
                </div>
              )}
              {profile.counsellorProfile.languages && profile.counsellorProfile.languages.length > 0 && (
                <div className={styles.languagesSection}>
                  <p className={styles.infoLabel}>Languages</p>
                  <div className={styles.languageBadges}>
                    {profile.counsellorProfile.languages.map((lang: string, i: number) => (
                      <Badge key={i} variant="default" size="sm">{lang}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}

          <Card padding="lg" className={styles.infoCard}>
            <div className={styles.cardHeader}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className={styles.cardIcon}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <h3 className={styles.cardTitle}>Account Security</h3>
            </div>
            <p className={styles.securityText}>Manage your account security settings.</p>
            <div className={styles.securityActions}>
              <Button variant="outline" size="md">Change Password</Button>
            </div>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
