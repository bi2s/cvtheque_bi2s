import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: {
      main: '#5b3fd6',
      dark: '#4c2fc9',
      light: '#f1edfc',
      contrastText: '#ffffff',
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
