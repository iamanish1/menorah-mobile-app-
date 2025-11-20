import React from 'react';
import styles from './Badge.module.css';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'default';
  size?: 'sm' | 'md';
}

export default function Badge({ 
  children, 
  variant = 'default',
  size = 'md'
}: BadgeProps) {
  const variantClass = {
    success: styles.variantSuccess,
    warning: styles.variantWarning,
    danger: styles.variantDanger,
    info: styles.variantInfo,
    default: styles.variantDefault,
  }[variant];

  const sizeClass = {
    sm: styles.sizeSm,
    md: styles.sizeMd,
  }[size];

  const classNames = [
    styles.badge,
    variantClass,
    sizeClass,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classNames}>
      {children}
    </span>
  );
}
