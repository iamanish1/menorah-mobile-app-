'use client';

import { useState, useMemo } from 'react';
import { Booking } from '@/types';
import { format, addDays, startOfToday, eachDayOfInterval, isSameDay, isToday } from 'date-fns';
import Button from '@/components/ui/Button';
import styles from './ScheduleModal.module.css';

interface ScheduleModalProps {
  booking: Booking;
  onSchedule: (scheduledAt: string) => Promise<void> | void;
  onClose: () => void;
  loading?: boolean;
  error?: string | null;
}

export default function ScheduleModal({ booking, onSchedule, onClose, loading, error }: ScheduleModalProps) {
  const today     = startOfToday();
  const initDate  = new Date(booking.scheduledAt) >= today ? new Date(booking.scheduledAt) : today;

  const [selectedDate, setSelectedDate] = useState<Date>(initDate);
  const [selectedTime, setSelectedTime] = useState<string>(
    format(new Date(booking.scheduledAt), 'HH:mm')
  );

  // Show 14 days starting from today
  const dates = eachDayOfInterval({ start: today, end: addDays(today, 13) });

  // Build time slots 07:00–21:30 in 30-min increments
  const allTimeSlots: string[] = [];
  for (let hour = 7; hour < 22; hour++) {
    allTimeSlots.push(`${String(hour).padStart(2, '0')}:00`);
    allTimeSlots.push(`${String(hour).padStart(2, '0')}:30`);
  }
  allTimeSlots.push('22:00');

  // For today, filter out slots that have already passed (with 15-min buffer)
  const now = new Date();
  const timeSlots = useMemo(() => {
    if (!isToday(selectedDate)) return allTimeSlots;
    const cutoff = `${String(now.getHours()).padStart(2, '0')}:${now.getMinutes() < 30 ? '30' : '00'}`;
    const cutoffHour = now.getMinutes() < 30 ? now.getHours() : now.getHours() + 1;
    const cutoffStr  = `${String(cutoffHour).padStart(2, '0')}:${now.getMinutes() < 30 ? '30' : '00'}`;
    return allTimeSlots.filter((t) => t >= cutoffStr);
  }, [selectedDate]);

  // Auto-select first available slot when switching to today
  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    if (isToday(date) && timeSlots.length > 0 && !timeSlots.includes(selectedTime)) {
      setSelectedTime(timeSlots[0]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const scheduledDateTime = new Date(selectedDate);
    const [hours, minutes]  = selectedTime.split(':').map(Number);
    scheduledDateTime.setHours(hours, minutes, 0, 0);
    onSchedule(scheduledDateTime.toISOString());
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Schedule / Reschedule Session</h3>
          <button className={styles.closeButton} onClick={onClose}>✕</button>
        </div>

        {error && (
          <div style={{
            margin: '0 0 16px',
            padding: '10px 14px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 10,
            color: '#dc2626',
            fontSize: 13,
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Select Date</label>
            <div className={styles.dateGrid}>
              {dates.map((date) => (
                <button
                  key={date.toISOString()}
                  type="button"
                  onClick={() => handleDateSelect(date)}
                  className={`${styles.dateButton} ${
                    isSameDay(date, selectedDate) ? styles.dateButtonActive : ''
                  }`}
                >
                  <div className={styles.dateDay}>{format(date, 'EEE')}</div>
                  <div className={styles.dateNumber}>{format(date, 'd')}</div>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Select Time</label>
            {timeSlots.length === 0 ? (
              <p style={{ fontSize: 13, color: '#6b7280', padding: '8px 0' }}>
                No available slots for today. Please select a future date.
              </p>
            ) : (
              <div className={styles.timeGrid}>
                {timeSlots.map((time) => (
                  <button
                    key={time}
                    type="button"
                    onClick={() => setSelectedTime(time)}
                    className={`${styles.timeButton} ${selectedTime === time ? styles.timeButtonActive : ''}`}
                  >
                    {format(new Date(`2000-01-01T${time}`), 'h:mm a')}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className={styles.selectedInfo}>
            <div className={styles.selectedLabel}>Selected Date &amp; Time:</div>
            <div className={styles.selectedValue}>
              {format(selectedDate, 'EEEE, MMMM d, yyyy')} at{' '}
              {format(new Date(`2000-01-01T${selectedTime}`), 'h:mm a')}
            </div>
          </div>

          <div className={styles.actions}>
            <Button type="button" onClick={onClose} variant="outline">
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || timeSlots.length === 0}
              isLoading={loading}
            >
              {loading ? 'Scheduling…' : 'Confirm Schedule'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
