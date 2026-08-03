'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Camera } from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar, Button, CountryPhoneInput, Input, Select } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';

const schema = z.object({
  firstName: z.string().trim().min(2, 'First name must be at least 2 characters'),
  lastName:  z.string().trim().min(2, 'Last name must be at least 2 characters'),
  dateOfBirth: z.string().optional().refine(
    (value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value),
    'Choose a valid date of birth'
  ),
  gender: z.union([
    z.enum(['male','female','other','prefer-not-to-say']),
    z.literal(''),
  ]).optional(),
  preferredLanguage: z.string().trim().optional(),
  // Emergency
  emergencyName: z.string().trim()
    .max(100, 'Emergency contact name must be 100 characters or fewer')
    .optional(),
  emergencyRelationship: z.string().trim()
    .max(100, 'Relationship must be 100 characters or fewer')
    .optional(),
  emergencyPhone:        z.string().trim().optional(),
}).superRefine((values, ctx) => {
  const hasEmergencyContact = Boolean(
    values.emergencyName || values.emergencyRelationship || values.emergencyPhone
  );
  if (!hasEmergencyContact) return;

  if (!values.emergencyName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['emergencyName'],
      message: 'Emergency contact name is required',
    });
  }
  if (!values.emergencyRelationship) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['emergencyRelationship'],
      message: 'Relationship is required',
    });
  }
  if (!values.emergencyPhone) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['emergencyPhone'],
      message: 'Phone number is required',
    });
  } else if (!/^\+[1-9]\d{1,14}$/.test(values.emergencyPhone)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['emergencyPhone'],
      message: 'Choose a country code and enter a valid phone number',
    });
  }
});
type FormValues = z.infer<typeof schema>;

const dateInputValue = (value?: string) => {
  const match = String(value || '').match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] || '';
};

const firstApiError = (
  response: {
    message?: string;
    errors?: Array<{ message?: string; msg?: string }>;
  },
  fallback: string
) => response.errors?.map((item) => item.message || item.msg).find(Boolean)
  || response.message
  || fallback;

export default function EditProfilePage() {
  const { user, updateUser } = useAuth();
  const router   = useRouter();
  const fileRef  = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [success, setSuccess] = useState(false);
  const [imageStatus, setImageStatus] = useState('');
  const [error, setError]   = useState('');

  const { control, register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (user) {
      reset({
        firstName: user.firstName,
        lastName:  user.lastName,
        dateOfBirth: dateInputValue(user.dateOfBirth),
        gender:    user.gender,
        preferredLanguage: user.preferredLanguage,
        emergencyName:         user.emergencyContact?.name,
        emergencyRelationship: user.emergencyContact?.relationship,
        emergencyPhone:        user.emergencyContact?.phone,
      });
    }
  }, [user, reset]);

  const onSubmit = async (data: FormValues) => {
    setSaving(true);
    setSuccess(false);
    setImageStatus('');
    setError('');
    try {
      const res = await api.updateProfile({
        firstName: data.firstName,
        lastName:  data.lastName,
        dateOfBirth: data.dateOfBirth || undefined,
        gender:    data.gender || undefined,
        preferredLanguage: data.preferredLanguage || undefined,
      });
      if (!res.success || !res.data?.user) {
        setError(firstApiError(res, 'Failed to update profile'));
        return;
      }

      let savedUser = res.data.user;
      const emergencyRes = await api.updateEmergencyContact({
        name: data.emergencyName || '',
        relationship: data.emergencyRelationship || '',
        phone: data.emergencyPhone || '',
      });
      if (!emergencyRes.success || !emergencyRes.data) {
        // The personal update has already committed. Reflect it locally and
        // be explicit that the second save failed instead of showing a false
        // all-fields success message.
        updateUser(savedUser);
        setError(
          `Personal information was saved, but the emergency contact was not: ${
            firstApiError(emergencyRes, 'Unable to save emergency contact')
          }`
        );
        return;
      }

      savedUser = {
        ...savedUser,
        emergencyContact: emergencyRes.data.emergencyContact,
      };
      updateUser(savedUser);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (!file.type.startsWith('image/')) {
      setImageStatus('');
      setError('Choose an image file for your profile photo.');
      input.value = '';
      return;
    }

    const fd = new FormData();
    fd.append('profileImage', file);
    fd.append('firstName', user.firstName);
    fd.append('lastName', user.lastName);
    setUploadingImage(true);
    setSuccess(false);
    setImageStatus('');
    setError('');
    try {
      const res = await api.updateProfileWithImage(fd);
      if (res.success && res.data?.user) {
        updateUser(res.data.user);
        setImageStatus('Profile photo updated.');
      } else {
        setError(firstApiError(res, 'Failed to upload profile photo'));
      }
    } finally {
      setUploadingImage(false);
      input.value = '';
    }
  };

  if (!user) return null;

  return (
    <div className="page-container max-w-xl">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit Profile</h1>

      {success && (
        <div role="status" className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 mb-4">
          Profile updated successfully!
        </div>
      )}
      {imageStatus && (
        <div role="status" className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 mb-4">
          {imageStatus}
        </div>
      )}
      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {/* Avatar upload */}
      <div className="flex justify-center mb-6">
        <div className="relative">
          <Avatar src={user.profileImage} name={`${user.firstName} ${user.lastName}`} size="xl" />
          <button
            type="button"
            aria-label="Change profile photo"
            aria-busy={uploadingImage}
            disabled={uploadingImage}
            onClick={() => fileRef.current?.click()}
            className="absolute bottom-0 right-0 w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center shadow-lg hover:bg-primary-700 transition-colors disabled:cursor-wait disabled:opacity-60"
          >
            <Camera className="w-4 h-4 text-white" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploadingImage}
            onChange={handleImageChange}
          />
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Personal Information</h2>
          <div className="grid grid-cols-2 gap-3">
            <Input label="First name" error={errors.firstName?.message} {...register('firstName')} />
            <Input label="Last name"  error={errors.lastName?.message}  {...register('lastName')} />
          </div>
          <Input label="Date of birth" type="date" error={errors.dateOfBirth?.message} {...register('dateOfBirth')} />
          <Select label="Gender" {...register('gender')}>
            <option value="">Select gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="prefer-not-to-say">Prefer not to say</option>
          </Select>
          <Input label="Preferred language" placeholder="English" {...register('preferredLanguage')} />
        </div>

        <div className="card p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-gray-900">Emergency Contact</h2>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">
              Only the counsellor assigned to your booking can view and use this contact information in an emergency.
            </p>
          </div>
          <Input
            label="Name"
            placeholder="Contact name"
            maxLength={100}
            error={errors.emergencyName?.message}
            {...register('emergencyName')}
          />
          <Input
            label="Relationship"
            placeholder="e.g. Parent, Sibling"
            maxLength={100}
            error={errors.emergencyRelationship?.message}
            {...register('emergencyRelationship')}
          />
          <Controller
            name="emergencyPhone"
            control={control}
            render={({ field }) => (
              <CountryPhoneInput
                label="Phone"
                value={field.value}
                onChange={field.onChange}
                error={errors.emergencyPhone?.message}
                hint="Choose a country code, then enter the local number."
              />
            )}
          />
        </div>

        <Button type="submit" fullWidth size="lg" loading={saving}>Save Changes</Button>
      </form>
    </div>
  );
}
