'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Camera } from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar, Button, Input } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';

const schema = z.object({
  firstName: z.string().min(1),
  lastName:  z.string().min(1),
  dateOfBirth: z.string().optional(),
  gender: z.enum(['male','female','other','prefer-not-to-say']).optional(),
  preferredLanguage: z.string().optional(),
  // Address
  street:  z.string().optional(),
  city:    z.string().optional(),
  state:   z.string().optional(),
  country: z.string().optional(),
  zipCode: z.string().optional(),
  // Emergency
  emergencyName:         z.string().optional(),
  emergencyRelationship: z.string().optional(),
  emergencyPhone:        z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function EditProfilePage() {
  const { user, updateUser } = useAuth();
  const router   = useRouter();
  const fileRef  = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError]   = useState('');

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (user) {
      reset({
        firstName: user.firstName,
        lastName:  user.lastName,
        dateOfBirth: user.dateOfBirth,
        gender:    user.gender,
        preferredLanguage: user.preferredLanguage,
        street:    user.address?.street,
        city:      user.address?.city,
        state:     user.address?.state,
        country:   user.address?.country,
        zipCode:   user.address?.zipCode,
        emergencyName:         user.emergencyContact?.name,
        emergencyRelationship: user.emergencyContact?.relationship,
        emergencyPhone:        user.emergencyContact?.phone,
      });
    }
  }, [user, reset]);

  const onSubmit = async (data: FormValues) => {
    setSaving(true);
    setError('');
    const res = await api.updateProfile({
      firstName: data.firstName,
      lastName:  data.lastName,
      dateOfBirth: data.dateOfBirth,
      gender:    data.gender,
      preferredLanguage: data.preferredLanguage,
    });
    if (res.success && res.data?.user) {
      // Also update address & emergency contact
      await Promise.all([
        api.updateAddress({ street: data.street, city: data.city, state: data.state, country: data.country, zipCode: data.zipCode }),
        api.updateEmergencyContact({ name: data.emergencyName, relationship: data.emergencyRelationship, phone: data.emergencyPhone }),
      ]);
      updateUser(res.data.user);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } else {
      setError(res.message || 'Failed to update profile');
    }
    setSaving(false);
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const fd = new FormData();
    fd.append('profileImage', file);
    fd.append('firstName', user.firstName);
    fd.append('lastName', user.lastName);
    const res = await api.updateProfileWithImage(fd);
    if (res.success && res.data?.user) updateUser(res.data.user);
  };

  if (!user) return null;

  return (
    <div className="page-container max-w-xl">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Edit Profile</h1>

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700 mb-4">
          Profile updated successfully!
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-4">
          {error}
        </div>
      )}

      {/* Avatar upload */}
      <div className="flex justify-center mb-6">
        <div className="relative">
          <Avatar src={user.profileImage} name={`${user.firstName} ${user.lastName}`} size="xl" />
          <button
            onClick={() => fileRef.current?.click()}
            className="absolute bottom-0 right-0 w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center shadow-lg hover:bg-primary-700 transition-colors"
          >
            <Camera className="w-4 h-4 text-white" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Personal Information</h2>
          <div className="grid grid-cols-2 gap-3">
            <Input label="First name" error={errors.firstName?.message} {...register('firstName')} />
            <Input label="Last name"  error={errors.lastName?.message}  {...register('lastName')} />
          </div>
          <Input label="Date of birth" type="date" {...register('dateOfBirth')} />
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">Gender</label>
            <select className="input-field" {...register('gender')}>
              <option value="">Select gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
              <option value="prefer-not-to-say">Prefer not to say</option>
            </select>
          </div>
          <Input label="Preferred language" placeholder="English" {...register('preferredLanguage')} />
        </div>

        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Address</h2>
          <Input label="Street" placeholder="123 Main St" {...register('street')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="City"  placeholder="Dubai" {...register('city')} />
            <Input label="State" placeholder="Dubai"  {...register('state')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Country"  placeholder="UAE" {...register('country')} />
            <Input label="ZIP code" placeholder="00000" {...register('zipCode')} />
          </div>
        </div>

        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-gray-900">Emergency Contact</h2>
          <Input label="Name"         placeholder="Contact name" {...register('emergencyName')} />
          <Input label="Relationship" placeholder="e.g. Parent, Sibling" {...register('emergencyRelationship')} />
          <Input label="Phone"        type="tel" placeholder="+971 50 000 0000" {...register('emergencyPhone')} />
        </div>

        <Button type="submit" fullWidth size="lg" loading={saving}>Save Changes</Button>
      </form>
    </div>
  );
}
