'use client';

import { useState, useMemo } from 'react';
import { Booking } from '@/types';
import { format, addDays, startOfToday, eachDayOfInterval, isSameDay, isToday } from 'date-fns';
import { CalendarDays, Clock, X, AlertCircle } from 'lucide-react';
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
  const today    = startOfToday();
  const initDate = new Date(booking.scheduledAt) >= today ? new Date(booking.scheduledAt) : today;

  const [selectedDate, setSelectedDate] = useState<Date>(initDate);
  const [selectedTime, setSelectedTime] = useState<string>(
    format(new Date(booking.scheduledAt), 'HH:mm')
  );

  const dates = eachDayOfInterval({ start: today, end: addDays(today, 13) });

  const allTimeSlots: string[] = [];
  for (let hour = 7; hour < 22; hour++) {
    allTimeSlots.push(`${String(hour).padStart(2, '0')}:00`);
    allTimeSlots.push(`${String(hour).padStart(2, '0')}:30`);
  }
  allTimeSlots.push('22:00');

  const now = new Date();
  const timeSlots = useMemo(() => {
    if (!isToday(selectedDate)) return allTimeSlots;
    const cutoffHour = now.getMinutes() < 30 ? now.getHours() : now.getHours() + 1;
    const cutoffMin  = now.getMinutes() < 30 ? '30' : '00';
    const cutoffStr  = `${String(cutoffHour).padStart(2, '0')}:${cutoffMin}`;
    return allTimeSlots.filter((t) => t >= cutoffStr);
  }, [selectedDate]);

  const amSlots = timeSlots.filter(t => parseInt(t.split(':')[0]) < 12);
  const pmSlots = timeSlots.filter(t => parseInt(t.split(':')[0]) >= 12);

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

        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.modalTitleGroup}>
            <div className={styles.modalTitleIcon}>
              <CalendarDays size={16} />
            </div>
            <div>
              <h3 className={styles.modalTitle}>Schedule Session</h3>
              <p className={styles.modalSubtitle}>Pick a date and time for this session</p>
            </div>
          </div>
          <button className={styles.closeButton} onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className={styles.errorBanner}>
            <AlertCircle size={14} className={styles.errorBannerIcon} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>

          {/* Date section */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>
              <CalendarDays size={13} />
              Select Date
            </div>
            <div className={styles.dateGrid}>
              {dates.map((date) => {
                const active  = isSameDay(date, selectedDate);
                const todayDt = isToday(date);
                return (
                  <button
                    key={date.toISOString()}
                    type="button"
                    onClick={() => handleDateSelect(date)}
                    className={`${styles.dateButton} ${active ? styles.dateButtonActive : ''} ${todayDt && !active ? styles.dateButtonToday : ''}`}
                  >
                    <span className={styles.dateDay}>{format(date, 'EEE')}</span>
                    <span className={styles.dateNumber}>{format(date, 'd')}</span>
                    {todayDt && <span className={styles.todayDot} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time section */}
          <div className={styles.section}>
            <div className={styles.sectionLabel}>
              <Clock size={13} />
              Select Time
            </div>

            {timeSlots.length === 0 ? (
              <p className={styles.noSlots}>No slots available today — please select a future date.</p>
            ) : (
              <div className={styles.timeSection}>
                {amSlots.length > 0 && (
                  <div className={styles.timePeriod}>
                    <span className={styles.timePeriodLabel}>Morning</span>
                    <div className={styles.timeGrid}>
                      {amSlots.map((time) => (
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
                )}
                {pmSlots.length > 0 && (
                  <div className={styles.timePeriod}>
                    <span className={styles.timePeriodLabel}>Afternoon &amp; Evening</span>
                    <div className={styles.timeGrid}>
                      {pmSlots.map((time) => (
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
                )}
              </div>
            )}
          </div>

          {/* Selected summary */}
          <div className={styles.selectedInfo}>
            <div className={styles.selectedInfoIcon}>
              <CalendarDays size={15} />
            </div>
            <div>
              <p className={styles.selectedLabel}>Scheduled for</p>
              <p className={styles.selectedValue}>
                {format(selectedDate, 'EEEE, MMMM d, yyyy')}
                <span className={styles.selectedTimeDot}>·</span>
                {format(new Date(`2000-01-01T${selectedTime}`), 'h:mm a')}
              </p>
            </div>
          </div>

          {/* Actions */}
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
