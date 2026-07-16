import { AppBar, TitlePortal } from 'react-admin';
import { Box } from '@mui/material';
import PushSubscribeButton from './PushSubscribeButton';

export default function CustomAppBar(props) {
  return (
    <AppBar {...props}>
      <TitlePortal />
      <Box sx={{ flex: 1 }} />
      <PushSubscribeButton />
    </AppBar>
  );
}
