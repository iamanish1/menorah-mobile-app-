import React from 'react';
import styles from './Button.module.css';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  children: React.ReactNode;
  className?: string;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const variantClass = {
    primary: styles.variantPrimary,
    secondary: styles.variantSecondary,
    outline: styles.variantOutline,
    ghost: styles.variantGhost,
    danger: styles.variantDanger,
  }[variant];

  const sizeClass = {
    sm: styles.sizeSm,
    md: styles.sizeMd,
    lg: styles.sizeLg,
  }[size];

  const classNames = [
    styles.button,
    variantClass,
    sizeClass,
    isLoading && styles.loading,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      className={classNames}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className={styles.spinner}></span>
          Loading...
        </span>
      ) : (
        children
      )}
    </button>
  );
}
