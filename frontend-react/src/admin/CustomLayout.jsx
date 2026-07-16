import { Layout } from 'react-admin';
import CustomMenu from './CustomMenu';
import CustomAppBar from './CustomAppBar';

// Swaps the sidebar menu and app bar (the latter adds PushSubscribeButton) -
// react-admin's documented customization points for this; notifications and
// error boundary stay default.
export default function CustomLayout(props) {
  return <Layout {...props} menu={CustomMenu} appBar={CustomAppBar} />;
}
