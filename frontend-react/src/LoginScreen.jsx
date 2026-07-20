import { Box, Typography } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import LoginForm from './LoginForm';

// The one login screen for the whole app - shown at the root ("/") before
// a consultant is recognized, and reused verbatim as react-admin's own
// loginPage (admin/Login.jsx). Nothing here announces "admin" or
// "consultant"; LoginForm's own dual probe (admin then consultant) decides
// which of onAdminSuccess/onConsultantSuccess fires and where that caller
// redirects to. The point of sharing this one component in both places is
// that an admin never needs to know /admin exists just to sign in - both
// https://ops.bestissolutions.dz/ and /admin render the identical screen.
export default function LoginScreen({ onAdminSuccess, onConsultantSuccess }) {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          width: '100%',
          maxWidth: 760,
          minHeight: 460,
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 4,
          overflow: 'hidden',
          boxShadow: '0 24px 64px -24px rgba(15, 30, 40, 0.35)',
        }}
      >
        <Box
          sx={{
            flex: 1.1,
            display: { xs: 'none', sm: 'flex' },
            position: 'relative',
            overflow: 'hidden',
            p: 3.5,
            flexDirection: 'column',
            justifyContent: 'space-between',
            background: 'linear-gradient(115deg, #131A3A 0%, #0E4A52 38%, #0B7A68 68%, #0E5E56 100%)',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              top: -90,
              right: -40,
              width: 300,
              height: 300,
              borderRadius: '50%',
              background:
                'radial-gradient(circle, rgba(0,255,196,0.7) 0%, rgba(0,255,196,0.22) 45%, transparent 70%)',
            }}
          />

          <Typography sx={{ position: 'relative', fontSize: 13, color: '#CFEFE6', fontWeight: 500 }}>
            Bi2S Ops
          </Typography>

          <Box sx={{ position: 'relative' }}>
            <Typography sx={{ fontSize: 21, fontWeight: 500, color: '#fff', lineHeight: 1.35, mb: 1 }}>
              Plateforme d&rsquo;opérations internes
            </Typography>
            <Typography sx={{ fontSize: 13, color: '#D6F2EA', lineHeight: 1.6 }}>
              CVthèque, staffing, projets et appels d&rsquo;offres SAP. Votre espace s&rsquo;ouvre
              selon votre profil — consultant ou administrateur.
            </Typography>
          </Box>

          <Typography
            sx={{
              position: 'relative',
              fontSize: 11,
              color: '#9ED4C6',
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
            }}
          >
            <LockOutlinedIcon sx={{ fontSize: 12 }} />
            Accès réservé aux collaborateurs Bi2S · ops.bestissolutions.dz
          </Typography>
        </Box>

        <Box
          sx={{
            flex: 1,
            bgcolor: 'background.paper',
            p: 3.5,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <Box sx={{ mb: 2.5 }}>
            <Box component="img" src="/logo_bi2s.webp" alt="Bi2S — Best IS Solutions" sx={{ width: 140, display: 'block' }} />
          </Box>

          <Typography sx={{ fontSize: 16, fontWeight: 500, mb: 0.25 }}>Connexion</Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary', mb: 2 }}>
            Une seule entrée pour tous les profils
          </Typography>

          <LoginForm onAdminSuccess={onAdminSuccess} onConsultantSuccess={onConsultantSuccess} />
        </Box>
      </Box>
    </Box>
  );
}
