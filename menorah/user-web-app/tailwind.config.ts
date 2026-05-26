import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // App design system (green scale)
        primary: {
          DEFAULT: 'hsl(var(--primary-token))',
          foreground: 'hsl(var(--primary-foreground))',
          50:  '#f0f9f4',
          100: '#dcf1e5',
          200: '#bbe3ce',
          300: '#8fcdb0',
          400: '#5fb08e',
          500: '#3d9470',
          600: '#2d7a5c',
          700: '#25624a',
          800: '#204f3c',
          900: '#1c4133',
          950: '#0e241c',
        },
        accent: {
          50:  '#fff8ed',
          100: '#ffefd4',
          200: '#ffdba8',
          300: '#ffc070',
          400: '#ff9b37',
          500: '#ff7d10',
          600: '#f06106',
          700: '#c74807',
          800: '#9e390e',
          900: '#7f300f',
        },
        surface: {
          DEFAULT: '#ffffff',
          50:  '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          card:  '#ffffff',
          muted: '#f9fafb',
        },
        // Landing page semantic tokens
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        border: 'hsl(var(--border))',
        ring: 'hsl(var(--ring))',
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        // Menorah brand colors
        menorah: {
          green: 'hsl(var(--menorah-green))',
          olive: 'hsl(var(--menorah-olive))',
          'olive-light': 'hsl(var(--menorah-olive-light))',
          'olive-muted': 'hsl(var(--menorah-olive-muted))',
          cream: 'hsl(var(--menorah-cream))',
          page: 'hsl(var(--menorah-page))',
        },
        social: {
          facebook: 'hsl(var(--social-facebook))',
          instagram: 'hsl(var(--social-instagram))',
          linkedin: 'hsl(var(--social-linkedin))',
          x: 'hsl(var(--social-x))',
          youtube: 'hsl(var(--social-youtube))',
        },
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)'],
        body:    ['var(--font-body)'],
        brand:   ['var(--font-brand)'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        card:      '0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.08)',
        modal:     '0 20px 60px -10px rgb(0 0 0 / 0.2)',
        dashboard: 'var(--shadow-dashboard)',
        play:      '0 2px 12px rgba(0,0,0,0.08)',
      },
      animation: {
        'fade-in':   'fadeIn 0.2s ease-in-out',
        'slide-up':  'slideUp 0.3s ease-out',
        'pulse-dot': 'pulseDot 1.4s infinite ease-in-out both',
      },
      keyframes: {
        fadeIn:   { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp:  { from: { transform: 'translateY(10px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
        pulseDot: { '0%, 80%, 100%': { transform: 'scale(0)' }, '40%': { transform: 'scale(1)' } },
      },
    },
  },
  plugins: [animate],
};

export default config;
