import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap cols">
        <div>
          <h4>Axle &amp; Co.</h4>
          <p>Car parts matched to your make, model and year. Built as a full-stack internship project for UCT.</p>
        </div>
        <div>
          <h4>Shop</h4>
          <Link to="/shop?onSale=1">Deals</Link>
          <Link to="/shop?isNew=1">New arrivals</Link>
          <Link to="/shop?category=batteries">Batteries</Link>
          <Link to="/shop?category=brakes">Brakes</Link>
        </div>
        <div>
          <h4>Your account</h4>
          <Link to="/account/orders">Order history</Link>
          <Link to="/cart">Cart</Link>
          <Link to="/login">Sign in</Link>
        </div>
        <div>
          <h4>Good to know</h4>
          <p>Demo catalogue with invented brands. Payments run in sandbox mode unless Stripe keys are set.</p>
        </div>
      </div>
    </footer>
  );
}
