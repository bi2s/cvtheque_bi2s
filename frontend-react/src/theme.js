import { createTheme } from '@mui/material/styles';

// Official Bi2S brand colors, taken from the petrol/turquoise design system
// derived from the company logo (petrol #1C4B5F/#153A4B, turquoise gradient
// #2EE5C0->#188E93) - used across the admin UI (palette below) and reused by
// dashboard charts (chartPalette) so both stay visually consistent.
export const BRAND_PETROL = '#1C4B5F';
export const BRAND_TEAL = '#1FB5A3';

// A small categorical palette derived from the two brand colors, for chart
// series that need more than two colors (bar/pie breakdowns).
export const chartPalette = ['#1C4B5F', '#1FB5A3', '#2E7284', '#2ACCB4', '#153A4B', '#6FE6D0', '#5A94A3', '#188E93'];

// Semantic status quartet (load/occupancy badges, approval states, deadline
// urgency, RFP/candidate stages, etc.) - the single source of truth for any
// bg+text color pair meaning "this record is ok/needs attention/is
// overdue-or-wrong/is informational", reused across the admin app instead of
// each page hardcoding its own hex pair (several had each independently
// converged on near-identical but not-quite-matching shades).
export const STATUS_OK = { main: '#085041', bg: '#E1F5EE' };
export const STATUS_WARN = { main: '#633806', bg: '#FAEEDA' };
export const STATUS_DANGER = { main: '#712B13', bg: '#FAECE7' };
export const STATUS_INFO = { main: '#0C447C', bg: '#E6F1FB' };

const theme = createTheme({
  palette: {
    primary: {
      main: BRAND_PETROL,
      dark: '#153A4B',
      light: '#E3ECEE',
      contrastText: '#ffffff',
    },
    secondary: {
      main: BRAND_TEAL,
      dark: '#188E93',
      light: '#DCF9F1',
      contrastText: '#153A4B',
    },
    background: {
      default: '#F5F8F9',
      paper: '#ffffff',
    },
    text: {
      primary: '#132226',
      secondary: '#5E7278',
    },
    success: {
      main: STATUS_OK.main,
      light: STATUS_OK.bg,
    },
    warning: {
      main: STATUS_WARN.main,
      light: STATUS_WARN.bg,
    },
    error: {
      main: STATUS_DANGER.main,
      light: STATUS_DANGER.bg,
    },
  },
  shape: {
    borderRadius: 10,
  },
  typography: {
    fontFamily: '-apple-system, "Segoe UI", system-ui, sans-serif',
    button: {
      textTransform: 'none',
      fontWeight: 600,
    },
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#ffffff',
          color: '#132226',
          boxShadow: 'none',
          borderBottom: '1px solid #E3EAEC',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
        },
      },
    },
  },
});

export default theme;
