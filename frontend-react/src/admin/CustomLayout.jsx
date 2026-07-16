import { Layout } from 'react-admin';
import CustomMenu from './CustomMenu';

// Swaps the sidebar menu only - react-admin's documented customization
// point for this (app bar, notifications, error boundary all stay default).
export default function CustomLayout(props) {
  return <Layout {...props} menu={CustomMenu} />;
}
