import { Link, NavLink, Outlet } from 'react-router-dom';
import { useStore } from '../../store.jsx';
import { useSeo } from '../../seo.js';
import { Empty } from '../../components/ui.jsx';

export default function AdminLayout() {
  useSeo({ title: 'Admin' });
  const { user, ready } = useStore();
  if (!ready) return null;
  if (!user || user.role !== 'admin') {
    return <div className="wrap section"><Empty title="Admin area"><p>Sign in with an admin account to manage the store.</p><Link className="btn primary" to="/login?next=/admin">Sign in</Link></Empty></div>;
  }
  return (
    <div className="wrap admin">
      <nav className="admin-tabs" aria-label="Admin sections">
        <NavLink to="/admin" end>Dashboard</NavLink>
        <NavLink to="/admin/orders">Orders</NavLink>
        <NavLink to="/admin/products">Products</NavLink>
        <NavLink to="/admin/inventory">Inventory &amp; suppliers</NavLink>
        <NavLink to="/admin/promotions">Promotions</NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
