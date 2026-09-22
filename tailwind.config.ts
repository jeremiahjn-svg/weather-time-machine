import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {

    extend: {
      colors: {
        space: {
          950: '#020204',
          900: '#05050A',
          800: '#0B0F19',
          700: '#131A2A',
          600: '#1C2438',
        },
        brass: {
          300: '#F0DFA0',
          400: '#E5C158',
          500: '#CBA03C',
          600: '#A67F2E',
        },
        starlight: {
          100: '#F8FAFC',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
        }
      },
      fontFamily: {
        sans: ['var(--font-inter)'],
        serif: ['var(--font-playfair)'],
      },
      backgroundImage: {
        'cosmic-gradient': [
          'radial-gradient(circle at top right, #131A2A 0%, #05050A 60%)',
          'radial-gradient(1.5px 1.5px at 20% 25%, rgba(226,232,240,0.55) 50%, transparent 100%)',
          'radial-gradient(1px 1px at 75% 15%, rgba(226,232,240,0.4) 50%, transparent 100%)',
          'radial-gradient(1.5px 1.5px at 60% 75%, rgba(226,232,240,0.4) 50%, transparent 100%)',
          'radial-gradient(1px 1px at 10% 65%, rgba(226,232,240,0.35) 50%, transparent 100%)',
          'radial-gradient(1px 1px at 90% 85%, rgba(226,232,240,0.45) 50%, transparent 100%)',
          'radial-gradient(1px 1px at 40% 45%, rgba(226,232,240,0.3) 50%, transparent 100%)',
        ].join(', '),
      }
    },
  },
  plugins: [],
};
export default config;
