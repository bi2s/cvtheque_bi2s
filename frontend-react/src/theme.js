import { createTheme } from '@mui/material/styles';

// Official Bi2S brand colors, confirmed from the company logo's own SVG
// gradient stops (navy #12455E, teal #06DAC2) - used across the admin UI
// (palette below) and reused by dashboard charts (chartPalette) so both stay
// visually consistent.
export const BRAND_NAVY = '#12455E';
export const BRAND_TEAL = '#06DAC2';

// A small categorical palette derived from the two brand colors, for chart
// series that need more than two colors (bar/pie breakdowns).
export const chartPalette = ['#12455E', '#06DAC2', '#2E86AB', '#4FD1C5', '#1B3A4B', '#7FE0D3', '#5A8CA8', '#0FA895'];

const theme = createTheme({
  palette: {
    primary: {
      main: BRAND_NAVY,
      dark: '#0C2E3F',
      light: '#E6EEF1',
      contrastText: '#ffffff',
    },
    secondary: {
      main: BRAND_TEAL,
      dark: '#04A895',
      light: '#E1FBF7',
      contrastText: '#0C2E3F',
    },
    background: {
      default: '#f7f7fb',
      paper: '#ffffff',
    },
    text: {
      primary: '#17171f',
      secondary: '#6c6c7d',
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
          color: '#17171f',
          boxShadow: 'none',
          borderBottom: '1px solid #e9e9f0',
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
