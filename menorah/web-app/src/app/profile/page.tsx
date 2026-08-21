'use client';

import { useState, useEffect, useMemo, useRef, useId, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { authStore } from '@/lib/auth';
import AppLayout from '@/components/layout/AppLayout';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import styles from './page.module.css';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const MAX_PROFILE_TAGS = 20;

type Day = typeof DAYS[number];

interface AvailabilityDay {
  start: string;
  end: string;
  isAvailable: boolean;
}

interface BankDetails {
  accountNumber?: string;
  ifscCode?: string;
  accountHolderName?: string;
  bankName?: string;
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
    profileImage?: string;
    voiceIntroUrl?: string;
    voiceIntroDurationSeconds?: number;
    profileMediaCompletedAt?: string;
    profileMediaComplete?: boolean;
    availability?: Record<Day, AvailabilityDay>;
    bankDetails?: BankDetails;
  };
}

// ── TagInput ─────────────────────────────────────────────────────────────────
const normalizeTag = (value: string) => value.trim().replace(/\s+/g, ' ');

const normalizeTags = (tags: string[]) => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const raw of tags) {
    const tag = normalizeTag(raw);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    normalized.push(tag);
    if (normalized.length >= MAX_PROFILE_TAGS) break;
  }

  return normalized;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function TagInput({
  tags,
  onChange,
  placeholder = 'Type and press Enter...',
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');

  const addTag = (value: string) => {
    const nextTags = normalizeTags([...tags, value]);
    if (nextTags.join('\n') !== tags.join('\n')) onChange(nextTags);
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
        placeholder={placeholder}
      />
    </div>
  );
}

// ── RateEditor ────────────────────────────────────────────────────────────────
function OptionTagPicker({
  tags,
  options,
  onChange,
  placeholder,
  loading = false,
  emptyMessage,
  allowCustomWhenEmpty = false,
}: {
  tags: string[];
  options: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
  loading?: boolean;
  emptyMessage: string;
  allowCustomWhenEmpty?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const normalizedOptions = useMemo(() => normalizeTags(options), [options]);
  const selectedKeys = useMemo(() => new Set(tags.map((tag) => tag.toLowerCase())), [tags]);
  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return normalizedOptions;
    return normalizedOptions.filter((option) => option.toLowerCase().includes(needle));
  }, [normalizedOptions, query]);

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  const toggleTag = (tag: string) => {
    if (selectedKeys.has(tag.toLowerCase())) {
      removeTag(tag);
      return;
    }

    if (tags.length >= MAX_PROFILE_TAGS) return;
    onChange(normalizeTags([...tags, tag]));
    setQuery('');
  };

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [open]);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const firstAvailable = filteredOptions.find((option) => !selectedKeys.has(option.toLowerCase()));
      if (firstAvailable) {
        toggleTag(firstAvailable);
      } else if (allowCustomWhenEmpty && normalizedOptions.length === 0 && query.trim()) {
        onChange(normalizeTags([...tags, query]));
        setQuery('');
      }
    } else if (e.key === 'Backspace' && !query && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const reachedLimit = tags.length >= MAX_PROFILE_TAGS;

  return (
    <div ref={rootRef} className={styles.optionPicker}>
      <div
        className={styles.tagInput}
        onClick={() => setOpen(true)}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
      >
        {tags.map((tag) => (
          <span key={tag} className={styles.tag}>
            {tag}
            <button
              type="button"
              className={styles.tagRemove}
              onClick={(event) => {
                event.stopPropagation();
                removeTag(tag);
              }}
              aria-label={`Remove ${tag}`}
            >
              x
            </button>
          </span>
        ))}
        <input
          className={styles.tagTextInput}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={tags.length ? 'Search more options...' : placeholder}
          disabled={loading || (!allowCustomWhenEmpty && normalizedOptions.length === 0) || reachedLimit}
        />
      </div>

      {open && (
        <div id={listboxId} className={styles.optionMenu} role="listbox">
          {loading ? (
            <div className={styles.optionEmpty}>Loading options...</div>
          ) : filteredOptions.length === 0 ? (
            <div className={styles.optionEmpty}>
              {allowCustomWhenEmpty && normalizedOptions.length === 0 && query.trim()
                ? `Press Enter to add "${query.trim()}"`
                : emptyMessage}
            </div>
          ) : (
            filteredOptions.map((option) => {
              const selected = selectedKeys.has(option.toLowerCase());
              const disabled = !selected && reachedLimit;

              return (
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={disabled}
                  className={`${styles.optionItem} ${selected ? styles.optionItemSelected : ''}`}
                  onClick={() => toggleTag(option)}
                >
                  <span>{option}</span>
                  <span className={styles.optionCheck}>{selected ? 'Selected' : 'Add'}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function RateEditor({ currentRate, currency, onSave }: {
  currentRate: number;
  currency: string;
  onSave: (rate: number) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [rate, setRate] = useState(currentRate);
  const [saving, setSaving] = useState(false);

  // Sync when parent data reloads
  useEffect(() => { setRate(currentRate); }, [currentRate]);

  const perSession = (mins: number) => ((rate / 60) * mins).toFixed(2);

  const handleSave = async () => {
    if (rate <= 0) return;
    setSaving(true);
    try {
      const saved = await onSave(rate);
      if (saved) setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {editing ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', flexWrap: 'wrap' }}>
            <div className={styles.formGroup} style={{ flex: '0 0 180px' }}>
              <label className={styles.infoLabel}>Per-Hour Rate ({currency})</label>
              <input
                type="number"
                min={0}
                step={1}
                className={styles.formInput}
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
                autoFocus
              />
            </div>
            {rate > 0 && (
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', lineHeight: 1.6, paddingTop: 18 }}>
                <strong style={{ color: 'var(--color-text-base)' }}>Session cost preview:</strong><br />
                30 min → {currency} {perSession(30)}<br />
                45 min → {currency} {perSession(45)}<br />
                60 min → {currency} {perSession(60)}
              </div>
            )}
          </div>
          <div className={styles.formActions}>
            <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || rate <= 0}>
              {saving ? 'Saving…' : 'Save Rate'}
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setEditing(false); setRate(currentRate); }} disabled={saving}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--spacing-md)' }}>
          <div>
            <p className={styles.infoLabel}>Per-Hour Rate</p>
            <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-primary)', margin: '4px 0 2px' }}>
              {currency} {currentRate}
              <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 400, color: 'var(--color-text-muted)', marginLeft: 6 }}>/hr</span>
            </p>
            {currentRate > 0 && (
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-muted)', margin: 0 }}>
                45-min session → {currency} {perSession(45)} &nbsp;·&nbsp; 60-min → {currency} {perSession(60)}
              </p>
            )}
          </div>
          <button className={styles.editBtn} onClick={() => setEditing(true)}>Change Rate</button>
        </div>
      )}
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, logoutAll } = useAuth();

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
    specializations: [] as string[],
    experience: 0,
    bio: '',
    languages: [] as string[],
    availability: {} as Record<Day, AvailabilityDay>,
  });
  const [savingProf, setSavingProf] = useState(false);
  const [lookupSpecializations, setLookupSpecializations] = useState<string[]>([]);
  const [lookupLanguages, setLookupLanguages] = useState<string[]>([]);
  const [loadingLookups, setLoadingLookups] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Mandatory profile media state
  const selfieInputRef = useRef<HTMLInputElement>(null);
  const voiceInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [voiceIntroFile, setVoiceIntroFile] = useState<File | null>(null);
  const [voiceIntroPreview, setVoiceIntroPreview] = useState<string | null>(null);
  const [voiceIntroDuration, setVoiceIntroDuration] = useState(0);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [savingMedia, setSavingMedia] = useState(false);

  // Bank details state
  const [editingBank, setEditingBank] = useState(false);
  const [bankForm, setBankForm] = useState({ accountNumber: '', ifscCode: '', accountHolderName: '', bankName: '' });
  const [savingBank, setSavingBank] = useState(false);

  // Password state
  const [editingPassword, setEditingPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push('/login');
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchProfile();
      fetchTagLookups();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
      if (selfiePreview) URL.revokeObjectURL(selfiePreview);
      if (voiceIntroPreview) URL.revokeObjectURL(voiceIntroPreview);
    };
  }, [selfiePreview, voiceIntroPreview]);

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

  const fetchTagLookups = async () => {
    try {
      setLoadingLookups(true);
      setLookupError(null);
      const [specializationsResponse, languagesResponse] = await Promise.all([
        api.getSpecializations(),
        api.getLanguages(),
      ]);

      if (specializationsResponse.success && specializationsResponse.data) {
        setLookupSpecializations(normalizeTags(specializationsResponse.data.specializations));
      } else {
        setLookupError(specializationsResponse.message || 'Failed to load specialization options');
      }

      if (languagesResponse.success && languagesResponse.data) {
        setLookupLanguages(normalizeTags(languagesResponse.data.languages));
      } else {
        setLookupError(languagesResponse.message || 'Failed to load language options');
      }
    } catch (err: any) {
      setLookupError(err.message || 'Failed to load tag options');
    } finally {
      setLoadingLookups(false);
    }
  };

  const handleSelfieChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Upload a valid image file for your profile selfie.');
      return;
    }

    if (selfiePreview) URL.revokeObjectURL(selfiePreview);
    setSelfieFile(file);
    setSelfiePreview(URL.createObjectURL(file));
  };

  const clearVoiceIntroPreview = () => {
    if (voiceIntroPreview) URL.revokeObjectURL(voiceIntroPreview);
    setVoiceIntroFile(null);
    setVoiceIntroPreview(null);
    setVoiceIntroDuration(0);
    if (voiceInputRef.current) voiceInputRef.current.value = '';
  };

  const setVoiceIntroFromBlob = (blob: Blob, fileName: string, durationSeconds?: number) => {
    const file = blob instanceof File
      ? blob
      : new File([blob], fileName, { type: blob.type || 'audio/webm' });
    const previewUrl = URL.createObjectURL(blob);

    if (voiceIntroPreview) URL.revokeObjectURL(voiceIntroPreview);
    setVoiceIntroFile(file);
    setVoiceIntroPreview(previewUrl);
    setVoiceIntroDuration(durationSeconds ? Math.round(durationSeconds * 10) / 10 : 0);

    return previewUrl;
  };

  const handleVoiceIntroFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const supportedByName = /\.(webm|ogg|mp3|m4a|wav)$/i.test(file.name);
    const supportedByMime = file.type.startsWith('audio/') || file.type === 'video/webm';

    if (!supportedByMime && !supportedByName) {
      setError('Upload a valid WebM, OGG, MP3, M4A, or WAV voice intro.');
      event.target.value = '';
      return;
    }

    setError(null);
    const previewUrl = setVoiceIntroFromBlob(file, file.name);
    const audio = new Audio(previewUrl);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      if (!Number.isFinite(duration)) return;

      setVoiceIntroDuration(Math.round(duration * 10) / 10);
    };
    audio.onerror = () => {
      setError('The selected audio file can be uploaded, but the browser could not preview its duration.');
    };
  };

  const stopVoiceRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }
  };

  const startVoiceRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Voice recording is not supported in this browser. Upload an audio file instead.');
      return;
    }

    try {
      setError(null);
      recordingChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const startedAt = Date.now();
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }

        stream.getTracks().forEach((track) => track.stop());
        const duration = Math.max(1, (Date.now() - startedAt) / 1000);
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setVoiceIntroFromBlob(blob, `menorah-voice-intro-${Date.now()}.webm`, duration);
        setVoiceIntroDuration(Math.round(duration * 10) / 10);
        setIsRecordingVoice(false);
        setRecordingSeconds(0);
      };

      recorder.start();
      setIsRecordingVoice(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        const elapsedSeconds = Math.ceil((Date.now() - startedAt) / 1000);
        setRecordingSeconds(elapsedSeconds);
      }, 1000);
    } catch (err: any) {
      const name = err?.name || '';
      const message =
        name === 'NotFoundError' || name === 'DevicesNotFoundError'
          ? 'No microphone was found on this device. Connect a microphone or upload an audio file instead.'
          : name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Microphone permission is blocked. Allow microphone access in the browser, or upload an audio file instead.'
          : name === 'NotReadableError'
          ? 'The microphone is unavailable or being used by another app. Close other apps or upload an audio file instead.'
          : err.message || 'Unable to access microphone. You can upload an audio file instead.';
      setError(message);
      setIsRecordingVoice(false);
    }
  };

  const saveProfileMedia = async () => {
    if (!selfieFile && !voiceIntroFile) {
      showSuccess('Profile media is already complete.');
      return;
    }

    const formData = new FormData();
    if (selfieFile) formData.append('profileImage', selfieFile);
    if (voiceIntroFile) formData.append('voiceIntro', voiceIntroFile);

    setSavingMedia(true);
    setError(null);
    const response = await api.updateCounsellorProfileMedia(formData);
    setSavingMedia(false);

    if (response.success) {
      setSelfieFile(null);
      if (selfiePreview) URL.revokeObjectURL(selfiePreview);
      setSelfiePreview(null);
      clearVoiceIntroPreview();
      await fetchProfile();
      showSuccess(response.message || 'Profile media updated.');
    } else {
      setError(response.message || 'Failed to save profile media.');
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
      // Keep the portal chrome in step with the saved User record. Without
      // this, the profile card changed immediately but the sidebar/topbar kept
      // the pre-edit name until a full page reload.
      if (res.data?.user) {
        const currentUser = authStore.getState().user;
        if (currentUser) {
          authStore.setState({ user: { ...currentUser, ...res.data.user } });
        }
      }
      await fetchProfile();
      setEditingPersonal(false);
      showSuccess('Personal info updated.');
    } else {
      setError(res.message || 'Update failed');
    }
  };

  // ── Professional edit ──────────────────────────────────────────────────────
  const startEditProfessional = () => {
    if (!loadingLookups && (lookupSpecializations.length === 0 || lookupLanguages.length === 0)) {
      fetchTagLookups();
    }

    const cp = profileData?.counsellorProfile;
    const defaultDay: AvailabilityDay = { start: '09:00', end: '17:00', isAvailable: false };
    const avail: Record<Day, AvailabilityDay> = {} as Record<Day, AvailabilityDay>;
    DAYS.forEach((d) => {
      avail[d] = cp?.availability?.[d]
        ? { ...(cp.availability as Record<Day, AvailabilityDay>)[d] }
        : { ...defaultDay, isAvailable: d !== 'saturday' && d !== 'sunday' };
    });
    const specializations = normalizeTags(
      cp?.specializations?.length ? cp.specializations : cp?.specialization ? [cp.specialization] : []
    );
    setProfForm({
      specialization: specializations[0] ?? cp?.specialization ?? '',
      specializations,
      experience: cp?.yearsOfExperience ?? 0,
      bio: cp?.bio ?? '',
      languages: cp?.languages ? [...cp.languages] : [],
      availability: avail,
    });
    setEditingProfessional(true);
  };

  const saveProfessional = async () => {
    const specializations = normalizeTags(profForm.specializations);
    const languages = normalizeTags(profForm.languages);

    if (specializations.length === 0) {
      setError('Add at least one specialization before saving.');
      return;
    }

    if (languages.length === 0) {
      setError('Add at least one language before saving.');
      return;
    }

    setSavingProf(true);
    setError(null);
    const res = await api.updateCounsellorProfile({
      specialization: specializations[0],
      specializations,
      experience: profForm.experience,
      bio: profForm.bio,
      languages,
      availability: profForm.availability,
    });
    setSavingProf(false);
    if (res.success) {
      await fetchProfile();
      await fetchTagLookups();
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

  // ── Bank Details ───────────────────────────────────────────────────────────
  const startEditBank = () => {
    const bd = cp?.bankDetails;
    setBankForm({
      accountNumber: bd?.accountNumber ?? '',
      ifscCode: bd?.ifscCode ?? '',
      accountHolderName: bd?.accountHolderName ?? '',
      bankName: bd?.bankName ?? '',
    });
    setEditingBank(true);
  };

  const saveBank = async () => {
    if (!bankForm.accountNumber || !bankForm.ifscCode || !bankForm.accountHolderName || !bankForm.bankName) {
      setError('All bank detail fields are required');
      return;
    }
    setSavingBank(true);
    setError(null);
    const res = await api.updateBankDetails(bankForm);
    setSavingBank(false);
    if (res.success) {
      await fetchProfile();
      setEditingBank(false);
      showSuccess('Bank details updated. They will be used for your next payout.');
    } else {
      setError(res.message || 'Failed to update bank details');
    }
  };

  // ── Password ───────────────────────────────────────────────────────────────
  const savePassword = async () => {
    if (!passwordForm.currentPassword) {
      setPasswordError('Enter your current password');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    if (
      passwordForm.newPassword.length < 8
      || !/[a-z]/.test(passwordForm.newPassword)
      || !/[A-Z]/.test(passwordForm.newPassword)
      || !/\d/.test(passwordForm.newPassword)
    ) {
      setPasswordError('Password must be at least 8 characters and include uppercase, lowercase, and a number');
      return;
    }
    setSavingPassword(true);
    setPasswordError(null);
    const res = await api.changePassword({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    });
    setSavingPassword(false);
    if (res.success) {
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setEditingPassword(false);
      window.location.replace('/login?password=changed');
    } else {
      setPasswordError(res.message || 'Password change failed');
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
  const specializationTags = normalizeTags(
    cp?.specializations?.length ? cp.specializations : cp?.specialization ? [cp.specialization] : []
  );
  const currentProfileImage = selfiePreview || cp?.profileImage || null;
  const currentVoiceIntroUrl = voiceIntroPreview || cp?.voiceIntroUrl || null;
  const profileMediaComplete = Boolean(cp?.profileMediaComplete || (cp?.profileImage && cp?.voiceIntroUrl));
  const hasPendingProfileMediaChanges = Boolean(selfieFile || voiceIntroFile);
  const canSaveProfileMedia = hasPendingProfileMediaChanges;

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
          <div id="profile-media" className={styles.profileMediaAnchor}>
            <Card padding="lg" className={`${styles.infoCard} ${!profileMediaComplete ? styles.requiredMediaCard : ''}`}>
              <div className={styles.cardHeaderRow}>
                <div className={styles.cardHeaderLeft}>
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className={styles.cardIcon}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.55-2.28A1 1 0 0121 8.62v6.76a1 1 0 01-1.45.9L15 14M4 6h8a3 3 0 013 3v6a3 3 0 01-3 3H4a2 2 0 01-2-2V8a2 2 0 012-2z" />
                  </svg>
                  <div>
                    <h3 className={styles.cardTitle}>Required Profile Media</h3>
                    <p className={styles.mediaSubtitle}>Add a clear selfie and a short voice intro before your profile appears to users.</p>
                  </div>
                </div>
                <Badge variant={profileMediaComplete ? 'success' : 'warning'} size="sm">
                  {profileMediaComplete ? 'Complete' : 'Required'}
                </Badge>
              </div>

              {!profileMediaComplete && (
                <div className={styles.mediaNotice}>
                  Your account is approved, but your public profile stays hidden until both media items are saved.
                </div>
              )}

              <div className={styles.mediaGrid}>
                <div className={styles.mediaPanel}>
                  <div className={styles.mediaPanelHeader}>
                    <p className={styles.mediaPanelTitle}>Profile selfie</p>
                    <span className={currentProfileImage ? styles.mediaStatusDone : styles.mediaStatusMissing}>
                      {currentProfileImage ? 'Added' : 'Missing'}
                    </span>
                  </div>
                  <div className={styles.selfiePreviewBox}>
                    {currentProfileImage ? (
                      <img src={currentProfileImage} alt="Counsellor profile selfie preview" className={styles.selfiePreviewImage} />
                    ) : (
                      <div className={styles.selfiePreviewEmpty}>
                        <span>
                          {(profile?.firstName?.charAt(0) || 'C').toUpperCase()}
                          {(profile?.lastName?.charAt(0) || '').toUpperCase()}
                        </span>
                      </div>
                    )}
                  </div>
                  <p className={styles.mediaHelper}>Use a well-lit, front-facing photo. This becomes your public profile image.</p>
                  <input
                    ref={selfieInputRef}
                    type="file"
                    accept="image/*"
                    className={styles.hiddenFileInput}
                    onChange={handleSelfieChange}
                  />
                  <Button variant="outline" size="sm" onClick={() => selfieInputRef.current?.click()}>
                    {currentProfileImage ? 'Replace selfie' : 'Add selfie'}
                  </Button>
                  {selfieFile && (
                    <p className={styles.mediaHelper}>Background cleanup happens after you save.</p>
                  )}
                </div>

                <div className={styles.mediaPanel}>
                  <div className={styles.mediaPanelHeader}>
                    <p className={styles.mediaPanelTitle}>Voice intro</p>
                    <span className={currentVoiceIntroUrl ? styles.mediaStatusDone : styles.mediaStatusMissing}>
                      {currentVoiceIntroUrl ? 'Added' : 'Missing'}
                    </span>
                  </div>
                  <div className={styles.voiceRecorderBox}>
                    {currentVoiceIntroUrl ? (
                      <audio className={styles.voiceAudio} src={currentVoiceIntroUrl} controls />
                    ) : (
                      <div className={styles.voiceEmpty}>Introduce your approach in a calm, short message.</div>
                    )}
                    <div className={styles.recordingMeter} aria-hidden="true">
                      <span style={{ width: isRecordingVoice ? '100%' : '0%' }} />
                    </div>
                    <p className={styles.mediaHelper}>
                      {isRecordingVoice
                        ? `Recording ${recordingSeconds}s`
                        : voiceIntroDuration
                        ? `Recorded ${voiceIntroDuration.toFixed(1)}s`
                        : 'Record your intro, then stop when finished.'}
                    </p>
                  </div>
                  <input
                    ref={voiceInputRef}
                    type="file"
                    accept="audio/*,.webm,.ogg,.mp3,.m4a,.wav"
                    className={styles.hiddenFileInput}
                    onChange={handleVoiceIntroFileChange}
                  />
                  <div className={styles.voiceActions}>
                    <Button
                      variant={isRecordingVoice ? 'danger' : 'outline'}
                      size="sm"
                      onClick={isRecordingVoice ? stopVoiceRecording : startVoiceRecording}
                      disabled={savingMedia}
                    >
                      {isRecordingVoice ? 'Stop recording' : currentVoiceIntroUrl ? 'Record again' : 'Record intro'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => voiceInputRef.current?.click()}
                      disabled={savingMedia || isRecordingVoice}
                    >
                      Upload audio
                    </Button>
                  </div>
                </div>
              </div>

              <div className={styles.mediaActions}>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={saveProfileMedia}
                  disabled={!hasPendingProfileMediaChanges || !canSaveProfileMedia || isRecordingVoice}
                  isLoading={savingMedia}
                >
                  Save profile media
                </Button>
                <span className={styles.mediaSaveHint}>
                  {hasPendingProfileMediaChanges ? 'Save to update your public profile.' : 'No unsaved media changes.'}
                </span>
              </div>
            </Card>
          </div>

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
                <div className={styles.infoItem}>
                  <p className={styles.infoLabel}>Gender</p>
                  {profile?.gender ? (
                    <p className={styles.infoValue} style={{ textTransform: 'capitalize' }}>{profile.gender}</p>
                  ) : (
                    <p style={{ color: '#DC2626', fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                      ⚠ Not set — click Edit to add your gender. Female bookings will not reach you without this.
                    </p>
                  )}
                </div>
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
                {lookupError && (
                  <div className={styles.lookupWarning}>
                    {lookupError}. The current saved tags remain visible, but new choices need the Discover options to load.
                  </div>
                )}
                <div className={styles.infoGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.infoLabel}>Specializations</label>
                    <OptionTagPicker
                      tags={profForm.specializations}
                      options={lookupSpecializations}
                      onChange={(tags) => setProfForm((p) => ({
                        ...p,
                        specialization: tags[0] ?? '',
                        specializations: tags,
                      }))}
                      placeholder="Search specialization options"
                      loading={loadingLookups}
                      emptyMessage="No specialization options found"
                      allowCustomWhenEmpty
                    />
                    <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: 4 }}>
                      Choose up to {MAX_PROFILE_TAGS} support areas from the same Discover filter options users see.
                    </p>
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
                </div>

                <div className={styles.formGroup} style={{ marginTop: 'var(--spacing-lg)' }}>
                  <label className={styles.infoLabel}>Languages</label>
                  <OptionTagPicker
                    tags={profForm.languages}
                    options={lookupLanguages}
                    onChange={(tags) => setProfForm((p) => ({ ...p, languages: tags }))}
                    placeholder="Search language options"
                    loading={loadingLookups}
                    emptyMessage="No language options found"
                    allowCustomWhenEmpty
                  />
                  <p style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: 4 }}>
                    Choose up to {MAX_PROFILE_TAGS} languages from the same Discover filter options users see.
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
                  {specializationTags.length > 0 && (
                    <div className={styles.infoItem}>
                      <p className={styles.infoLabel}>Specializations</p>
                      <div className={styles.languageBadges}>
                        {specializationTags.map((specialization) => (
                          <Badge key={specialization} variant="default" size="sm">{specialization}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {cp?.yearsOfExperience !== undefined && (
                    <div className={styles.infoItem}>
                      <p className={styles.infoLabel}>Years of Experience</p>
                      <p className={styles.infoValue}>{cp.yearsOfExperience} years</p>
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

          {/* ── Rate Settings ── */}
          <Card padding="lg" className={styles.infoCard}>
            <div className={styles.cardHeaderRow}>
              <div className={styles.cardHeaderLeft}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className={styles.cardIcon}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className={styles.cardTitle}>Rate Settings</h3>
              </div>
            </div>

            <RateEditor
              currentRate={cp?.hourlyRate ?? 0}
              currency={cp?.currency ?? 'INR'}
              onSave={async (rate) => {
                setError(null);
                const res = await api.updateCounsellorProfile({ hourlyRate: rate });
                if (res.success) {
                  await fetchProfile();
                  showSuccess('Hourly rate updated.');
                  return true;
                } else {
                  setError(res.message || 'Failed to update rate');
                  return false;
                }
              }}
            />
          </Card>

          {/* ── Bank Details ── */}
          <Card padding="lg" className={styles.infoCard}>
            <div className={styles.cardHeaderRow}>
              <div className={styles.cardHeaderLeft}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className={styles.cardIcon}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                <h3 className={styles.cardTitle}>Bank Details</h3>
              </div>
              {!editingBank && (
                <button className={styles.editBtn} onClick={startEditBank}>
                  {cp?.bankDetails?.accountNumber ? 'Edit' : 'Add Bank Account'}
                </button>
              )}
            </div>

            {editingBank ? (
              <>
                <div style={{ background: 'var(--color-warning-light)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: 14, padding: '10px 14px', marginBottom: 'var(--spacing-lg)', fontSize: 'var(--font-size-sm)', color: 'var(--color-warning)' }}>
                  Your bank details are used by the admin to process your earnings payout via Razorpay. Make sure the details are accurate.
                </div>
                <div className={styles.infoGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.infoLabel}>Account Holder Name</label>
                    <input
                      className={styles.formInput}
                      value={bankForm.accountHolderName}
                      onChange={(e) => setBankForm((p) => ({ ...p, accountHolderName: e.target.value }))}
                      placeholder="Name as on bank account"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.infoLabel}>Bank Name</label>
                    <input
                      className={styles.formInput}
                      value={bankForm.bankName}
                      onChange={(e) => setBankForm((p) => ({ ...p, bankName: e.target.value }))}
                      placeholder="e.g. HDFC Bank, SBI"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.infoLabel}>Account Number</label>
                    <input
                      className={styles.formInput}
                      value={bankForm.accountNumber}
                      onChange={(e) => setBankForm((p) => ({ ...p, accountNumber: e.target.value.replace(/\D/g, '') }))}
                      placeholder="9–18 digit account number"
                      maxLength={18}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.infoLabel}>IFSC Code</label>
                    <input
                      className={styles.formInput}
                      value={bankForm.ifscCode}
                      onChange={(e) => setBankForm((p) => ({ ...p, ifscCode: e.target.value.toUpperCase() }))}
                      placeholder="e.g. HDFC0001234"
                      maxLength={11}
                    />
                  </div>
                </div>
                <div className={styles.formActions}>
                  <Button variant="primary" size="sm" onClick={saveBank} disabled={savingBank}>
                    {savingBank ? 'Saving…' : 'Save Bank Details'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditingBank(false)} disabled={savingBank}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : cp?.bankDetails?.accountNumber ? (
              <div className={styles.infoGrid}>
                <div className={styles.infoItem}>
                  <p className={styles.infoLabel}>Account Holder</p>
                  <p className={styles.infoValue}>{cp.bankDetails.accountHolderName || '—'}</p>
                </div>
                <div className={styles.infoItem}>
                  <p className={styles.infoLabel}>Bank</p>
                  <p className={styles.infoValue}>{cp.bankDetails.bankName || '—'}</p>
                </div>
                <div className={styles.infoItem}>
                  <p className={styles.infoLabel}>Account Number</p>
                  <p className={styles.infoValue}>···{cp.bankDetails.accountNumber.slice(-4)}</p>
                </div>
                <div className={styles.infoItem}>
                  <p className={styles.infoLabel}>IFSC</p>
                  <p className={styles.infoValue}>{cp.bankDetails.ifscCode || '—'}</p>
                </div>
              </div>
            ) : (
              <div style={{ padding: 'var(--spacing-lg) 0', color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>
                <p>No bank account added yet.</p>
                <p style={{ marginTop: 4 }}>Add your bank details so the admin can process your earnings payout.</p>
              </div>
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
                <button
                  type="button"
                  className={styles.editBtn}
                  onClick={() => {
                    setPasswordError(null);
                    setEditingPassword(true);
                  }}
                >
                  Change Password
                </button>
              )}
            </div>

            {editingPassword ? (
              <>
                {passwordError ? (
                  <div className={styles.errorAlert} role="alert">
                    <svg fill="currentColor" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    {passwordError}
                  </div>
                ) : null}
                <div className={styles.passwordSection}>
                  <div className={styles.formGroup}>
                    <label htmlFor="current-password" className={styles.infoLabel}>Current Password</label>
                    <input
                      id="current-password"
                      name="currentPassword"
                      type="password"
                      autoComplete="current-password"
                      className={styles.formInput}
                      value={passwordForm.currentPassword}
                      onChange={(e) => {
                        setPasswordError(null);
                        setPasswordForm((p) => ({ ...p, currentPassword: e.target.value }));
                      }}
                      placeholder="Enter your current password"
                      disabled={savingPassword}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="profile-new-password" className={styles.infoLabel}>New Password</label>
                    <input
                      id="profile-new-password"
                      name="newPassword"
                      type="password"
                      autoComplete="new-password"
                      className={styles.formInput}
                      value={passwordForm.newPassword}
                      onChange={(e) => {
                        setPasswordError(null);
                        setPasswordForm((p) => ({ ...p, newPassword: e.target.value }));
                      }}
                      placeholder="At least 8 characters"
                      disabled={savingPassword}
                      aria-describedby="profile-password-requirements"
                    />
                    <p id="profile-password-requirements" className={styles.securityText}>
                      Include uppercase, lowercase, and at least one number.
                    </p>
                  </div>
                  <div className={styles.formGroup}>
                    <label htmlFor="profile-confirm-password" className={styles.infoLabel}>Confirm New Password</label>
                    <input
                      id="profile-confirm-password"
                      name="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      className={styles.formInput}
                      value={passwordForm.confirmPassword}
                      onChange={(e) => {
                        setPasswordError(null);
                        setPasswordForm((p) => ({ ...p, confirmPassword: e.target.value }));
                      }}
                      placeholder="Re-enter new password"
                      disabled={savingPassword}
                    />
                  </div>
                </div>
                <div className={styles.formActions}>
                  <Button type="button" variant="primary" size="sm" onClick={savePassword} disabled={savingPassword}>
                    {savingPassword ? 'Saving…' : 'Update Password'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingPassword(false);
                      setPasswordError(null);
                      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                    }}
                    disabled={savingPassword}
                  >
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className={styles.securityText}>Update your password to keep your account secure.</p>
                <div className={styles.formActions}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (window.confirm('Sign out every browser and device connected to this account?')) {
                        void logoutAll();
                      }
                    }}
                  >
                    Sign Out All Devices
                  </Button>
                </div>
              </>
            )}
          </Card>

        </div>
      </div>
    </AppLayout>
  );
}
