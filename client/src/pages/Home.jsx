import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { vehicleLabel } from '../format.js';
import { useStore } from '../store.jsx';
import { useSeo } from '../seo.js';
import FitmentPicker from '../components/FitmentPicker.jsx';
import ProductCard from '../components/ProductCard.jsx';

function Row({ title, to, products, showFit }) {
  if (!products.length) return null;
  return (
    <section className="wrap section">
      <div className="section-head"><h2>{title}</h2><Link to={to}>See all</Link></div>
      <div className="grid">{products.map((p) => <ProductCard key={p.id} product={p} showFit={showFit} />)}</div>
    </section>
  );
}

export default function Home() {
  useSeo({ title: null, description: 'Buy brake pads, batteries, tyres, filters, lights, dash cams and tools matched to your car. Pick your make, model and year and see only parts that fit.' });
  const nav = useNavigate();
  const { garage, setGarage } = useStore();
  const [cats, setCats] = useState([]);
  const [deals, setDeals] = useState([]);
  const [fresh, setFresh] = useState([]);
  const [forCar, setForCar] = useState([]);

  useEffect(() => {
    api('/categories').then((r) => setCats(r.categories));
    api('/products', { params: { onSale: 1, inStock: 1, limit: 4 } }).then((r) => setDeals(r.products));
    api('/products', { params: { isNew: 1, inStock: 1, limit: 4, sort: 'newest' } }).then((r) => setFresh(r.products));
  }, []);

  useEffect(() => {
    if (!garage) { setForCar([]); return; }
    api('/products', { params: { make: garage.make, model: garage.model, year: garage.year, category: 'filters-fluids', inStock: 1, limit: 4 } })
      .then((r) => setForCar(r.products)).catch(() => {});
  }, [garage]);

  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <h1>Pick your car. See only the parts that fit.</h1>
            <p>Every brake pad, battery and tyre in our catalogue is checked against make, model and year, so the part in your cart is the part that goes on.</p>
          </div>
          <div className="plate" aria-labelledby="plate-title">
            <h2 id="plate-title">{garage ? 'Your car' : 'Find parts for your car'}</h2>
            {garage ? (
              <div className="plate-set">
                <p className="plate-car">{vehicleLabel(garage)}</p>
                <div className="row">
                  <button className="btn primary" onClick={() => nav('/shop?fit=1')}>Shop parts that fit</button>
                  <button className="btn ghost" onClick={() => setGarage(null)}>Change car</button>
                </div>
              </div>
            ) : (
              <FitmentPicker onDone={() => nav('/shop?fit=1')} />
            )}
            <p className="plate-note">Not sure? The year is on your registration certificate.</p>
          </div>
        </div>
      </section>

      <section className="wrap section">
        <div className="section-head"><h2>Shop by category</h2></div>
        <ul className="cat-grid">
          {cats.map((c) => (
            <li key={c.id}>
              <Link to={`/shop?category=${c.slug}${garage ? '&fit=1' : ''}`}>
                <img src={c.image} alt="" width="160" height="120" loading="lazy" />
                <span className="cat-name">{c.name}</span>
                <span className="cat-count">{c.productCount} parts</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {garage && <Row title={`Service parts for your ${garage.model}`} to="/shop?category=filters-fluids&fit=1" products={forCar} showFit />}
      <Row title="Deals" to="/shop?onSale=1" products={deals} />
      <Row title="New arrivals" to="/shop?isNew=1&sort=newest" products={fresh} />
    </>
  );
}
