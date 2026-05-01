'use client';

import { useState } from 'react';
import { Booking } from '@/types';
import { format, addDays, startOfWeek, eachDayOfInterval, isSameDay } from 'date-fns';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import styles from './ScheduleModal.module.css';

interface ScheduleModalProps {
  booking: Booking;
  onSchedule: (scheduledAt: string) => void;
  onClose: () => void;
  loading?: boolean;
}

export default function ScheduleModal({ booking, onSchedule, onClose, loading }: ScheduleModalProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date(booking.scheduledAt));
  const [selectedTime, setSelectedTime] = useState<string>(
    format(new Date(booking.scheduledAt), 'HH:mm')
  );

  const today = new Date();
  const startDate = startOfWeek(today);
  const endDate = addDays(startDate, 13);
  const dates = eachDayOfInterval({ start: startDate, end: endDate });

  const timeSlots = [];
  for (let hour = 9; hour < 17; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      timeSlots.push(timeString);
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const scheduledDateTime = new Date(selectedDate);
    const [hours, minutes] = selectedTime.split(':').map(Number);
    scheduledDateTime.setHours(hours, minutes, 0, 0);
    onSchedule(scheduledDateTime.toISOString());
  };

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <Card className={styles.modal} padding="lg" onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Schedule Session</h3>
          <button
            className={styles.closeButton}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label className={styles.label}>
              Select Date
            </label>
            <div className={styles.dateGrid}>
              {dates.map((date) => (
                <button
                  key={date.toISOString()}
                  type="button"
                  onClick={() => setSelectedDate(date)}
                  disabled={date < today}
                  className={`${styles.dateButton} ${
                    isSameDay(date, selectedDate)
                      ? styles.dateButtonActive
                      : date < today
                      ? styles.dateButtonDisabled
                      : ''
                  }`}
                >
                  <div className={styles.dateDay}>{format(date, 'EEE')}</div>
                  <div className={styles.dateNumber}>{format(date, 'd')}</div>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>
              Select Time
            </label>
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
          </div>

          <div className={styles.selectedInfo}>
            <div className={styles.selectedLabel}>Selected Date & Time:</div>
            <div className={styles.selectedValue}>
              {format(selectedDate, 'EEEE, MMMM d, yyyy')} at{' '}
              {format(new Date(`2000-01-01T${selectedTime}`), 'h:mm a')}
            </div>
          </div>

          <div className={styles.actions}>
            <Button
              type="button"
              onClick={onClose}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              isLoading={loading}
            >
              {loading ? 'Scheduling...' : 'Schedule Session'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
