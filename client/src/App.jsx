import { Link, Route, Routes } from 'react-router-dom';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import { Empty, Spinner } from './components/ui.jsx';
import { useStore } from './store.jsx';
import Home from './pages/Home.jsx';
import Shop from './pages/Shop.jsx';
import Product from './pages/Product.jsx';
import Cart from './pages/Cart.jsx';
import Checkout from './pages/Checkout.jsx';
import Auth from './pages/Auth.jsx';
import { OrderDetail, OrderList } from './pages/Orders.jsx';
import AdminLayout from './pages/admin/AdminLayout.jsx';
import Dashboard from './pages/admin/Dashboard.jsx';
import AdminOrders from './pages/admin/AdminOrders.jsx';
import AdminProducts from './pages/admin/AdminProducts.jsx';
import AdminInventory from './pages/admin/AdminInventory.jsx';
import AdminPromotions from './pages/admin/AdminPromotions.jsx';

function Toast() {
  const { toast } = useStore();
  return <div className="toast-region" aria-live="polite">{toast && <p key={toast.id} className={`toast ${toast.kind}`}>{toast.message}</p>}</div>;
}

function NotFound() {
  return <div className="wrap section"><Empty title="Page not found"><p>That page does not exist.</p><Link className="btn primary" to="/">Back to the store</Link></Empty></div>;
}

export default function App() {
  const { ready } = useStore();
  return (
    <>
      <Header />
      <main id="main">
        {!ready ? <div className="wrap section"><Spinner /></div> : (
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/shop" element={<Shop />} />
            <Route path="/parts/:sku" element={<Product />} />
            <Route path="/cart" element={<Cart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/order/:number" element={<OrderDetail />} />
            <Route path="/account/orders" element={<OrderList />} />
            <Route path="/login" element={<Auth mode="login" />} />
            <Route path="/register" element={<Auth mode="register" />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="orders" element={<AdminOrders />} />
              <Route path="products" element={<AdminProducts />} />
              <Route path="inventory" element={<AdminInventory />} />
              <Route path="promotions" element={<AdminPromotions />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        )}
      </main>
      <Footer />
      <Toast />
    </>
  );
}
