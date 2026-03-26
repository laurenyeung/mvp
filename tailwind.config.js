/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Standard light gray scale (normal scale, not inverted)
        gray: {
          50:  '#F7F7F7',
          100: '#F0F0F0',
          200: '#E8E8E8',
          300: '#D0D0D0',
          400: '#737373',  // 4.5:1 on white ✓  4.25:1 on gray-50 ✓
          500: '#595959',  // 7.0:1 on white ✓
          600: '#3D3D3D',
          700: '#2B2B2B',
          800: '#1F1F1F',
          900: '#1A1A1A',  // near black
        },
        // Temu-inspired orange system
        pixel: {
          bg:      '#F7F7F7',  // page background
          surface: '#FFFFFF',  // card surface
          border:  '#E8E8E8',  // default border
          line:    '#D0D0D0',  // stronger border
          accent:  '#FF6200',  // brand orange — use as BG only; text on it must be dark
          dim:     '#D44500',  // dark orange — 4.5:1 on white ✓ safe as text
          yellow:  '#F59E0B',
          blue:    '#2563EB',
          text:    '#1A1A1A',
          muted:   '#737373',
          danger:  '#DC2626',
        },
        // Brand aliases → orange
        brand: {
          50:  '#FFF3EC',
          100: '#FFE4D1',
          200: '#FFBA8C',
          400: '#FF7A30',
          500: '#FF6200',
          600: '#FF6200',
          700: '#D44500',
          900: '#1A1A1A',
        },
        // Standard red — passes ADA on white
        red: {
          50:  '#FEF2F2',
          100: '#FEE2E2',
          200: '#FECACA',
          300: '#FCA5A5',
          400: '#DC2626',  // 4.8:1 on white ✓
          500: '#DC2626',  // 4.8:1 on white ✓
          600: '#B91C1C',  // 6.3:1 ✓
          700: '#991B1B',  // 7.9:1 ✓
          800: '#7F1D1D',
          900: '#450A0A',
        },
        // Green — dark enough for text on white
        green: {
          50:  '#F0FDF4',
          200: '#BBF7D0',
          500: '#15803D',  // 4.5:1 on white ✓
          600: '#166534',  // 5.5:1 ✓
          700: '#14532D',
        },
        // Blue — for status badges
        blue: {
          50:  '#EFF6FF',
          500: '#1D4ED8',  // 5.9:1 on white ✓
          600: '#1E40AF',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0.5rem',
      },
      boxShadow: {
        card: '0 1px 4px rgba(0,0,0,0.08)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.12)',
        'orange': '0 2px 8px rgba(255,98,0,0.30)',
      },
      screens: {
        xs: '375px',
      },
    },
  },
  plugins: [],
}
